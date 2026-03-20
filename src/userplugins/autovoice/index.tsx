// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps, findComponentByCodeLazy } from "@webpack";
import {
    ChannelStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    Toasts,
    UserStore
} from "@webpack/common";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_TOP:", '.iconBadge,"top"');
const Auth = findByProps("getToken");

// --- ICONS ---
function Icon({ height = 24, width = 24, className, children, viewBox, ...svgProps }) {
    return (
        <svg className={classes(className, "vc-icon")} role="img" width={width} height={height} viewBox={viewBox} {...svgProps}>
            {children}
        </svg>
    );
}

const FollowIcon = (props) => (
    <Icon {...props} viewBox="0 -960 960 960">
        <path fill="currentColor" d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z" />
    </Icon>
);

const UnfollowIcon = (props) => (
    <Icon {...props} viewBox="0 -960 960 960">
        <path fill="currentColor" d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z" />
    </Icon>
);

export const settings = definePluginSettings({
    disconnectUserId: {
        type: OptionType.STRING,
        description: "Target user ID to auto-disconnect",
        default: "",
        hidden: true,
    },
});

async function disconnectGuildMember(guildId: string, userId: string) {
    const token = Auth?.getToken?.();
    if (!token) return;

    try {
        await fetch(`/api/v9/guilds/${guildId}/members/${userId}`, {
            method: "PATCH",
            headers: { "Authorization": token, "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: null })
        });
    } catch (error) {
        console.error("Disconnect Error:", error);
    }
}

export default definePlugin({
    name: "DisconnectUser",
    description: "Adds a context menu entry to auto-disconnect a user when they join voice",
    authors: [{ id: 1242811215110082584n, name: "Jeasus" }, { name: "mushzi", id: 449282863582412850n }],
    settings,

    // Fusion des patches dans un seul tableau pour éviter que l'un n'écrase l'autre
    patches: [
        {
            find: "\"avatarContainerClass\",\"userNameClassName\"",
            replacement: {
                match: /(\((\i),\i\){.+?\.flipped])(:\i}\),children:\[)/,
                replace: "$1$3$self.renderButtons($2?.user),"
            }
        },
        {
            find: "toolbar:function",
            replacement: {
                match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/,
                replace: "$1$self.addIconToToolBar(arguments[0]);$2"
            }
        }
    ],

    contextMenus: {
        "user-context": (children, { user }) => {
            if (!user || user.id === UserStore.getCurrentUser()?.id) return;
            const isActive = settings.store.disconnectUserId === user.id;

            children.push(
                <Menu.MenuGroup key="disconnect-user-group">
                    <Menu.MenuItem
                        id="disconnect-user"
                        label="Disconnect user"
                        action={() => {
                            settings.store.disconnectUserId = isActive ? "" : user.id;
                        }}
                        icon={isActive ? UnfollowIcon : FollowIcon}
                    />
                </Menu.MenuGroup>
            );
        }
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }) {
            const targetUserId = settings.store.disconnectUserId;
            if (!targetUserId) return;

            for (const { userId, channelId, oldChannelId } of voiceStates) {
                if (userId !== targetUserId) continue;
                if (channelId && channelId !== oldChannelId) {
                    const channel = ChannelStore.getChannel(channelId);
                    if (!channel) continue;
                    const guildId = channel.guild_id ?? channel.guildId;
                    if (!guildId) continue;

                    if (PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
                        void disconnectGuildMember(guildId, userId);
                    }
                }
            }
        },
    },

    FollowIndicator() {
        const { disconnectUserId } = useSettings(settings);
        if (!disconnectUserId) return null;

        const current = UserStore.getUser(disconnectUserId);
        return (
            <HeaderBarIcon
                tooltip={`Disconnect user: ${current?.username ?? disconnectUserId}`}
                icon={UnfollowIcon}
                onClick={() => {}}
                onContextMenu={(e) => {
                    e.preventDefault();
                    settings.store.disconnectUserId = "";
                }}
            />
        );
    },

    addIconToToolBar(e) {
        const icon = (
            <ErrorBoundary noop={true} key="disconnect-indicator">
                <this.FollowIndicator />
            </ErrorBoundary>
        );

        if (Array.isArray(e.toolbar)) {
            e.toolbar.push(icon);
        } else {
            e.toolbar = [icon, e.toolbar];
        }
    },

    // Méthode appelée par le patch avatarContainerClass
    renderButtons(user) {
        // Tu peux retourner des boutons supplémentaires ici si nécessaire
        return null;
    }
});