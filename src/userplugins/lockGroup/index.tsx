// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, RestAPI, UserStore, React } from "@webpack/common";
import { Channel } from "discord-types/general";

// État des groupes verrouillés
const lockedGroups = new Set<string>();

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: false
    }
});

// --- LOGIQUE DE LOGS ---

function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[LockGroup ${timestamp}]`;
    if (level === "warn") console.warn(prefix, message);
    else if (level === "error") console.error(prefix, message);
    else console.log(prefix, message);
}

function debugLog(message: string) {
    if (settings.store.debugMode) {
        log(`🔍 DEBUG: ${message}`);
    }
}

// --- INTERCEPTION API (LOGIQUE ORIGINALE) ---

function interceptAddMember(originalMethod: any) {
    return function (this: any, ...args: any[]) {
        const [requestData] = args;

        if (requestData?.url?.match(/^\/channels\/\d+\/recipients\/\d+$/)) {
            const urlParts = requestData.url.split('/');
            const channelId = urlParts[2];
            const targetUserId = urlParts[4];

            if (lockedGroups.has(channelId)) {
                const channel = ChannelStore.getChannel(channelId);
                const currentUserId = UserStore.getCurrentUser()?.id;

                if (channel && channel.type === 3 && channel.ownerId === currentUserId) {
                    debugLog(`✅ Propriétaire autorisé à ajouter dans "${channel.name || "Groupe"}"`);
                    return originalMethod.apply(this, args);
                }

                if (channel && channel.type === 3) {
                    log(`🚫 Ajout non autorisé détecté - Auto-kick programmé`);
                    setTimeout(async () => {
                        try {
                            await RestAPI.del({
                                url: `/channels/${channelId}/recipients/${targetUserId}`
                            });
                            log(`✅ Utilisateur ${targetUserId} automatiquement kické`);
                        } catch (error) {
                            log(`❌ Erreur kick: ${error}`, "error");
                        }
                    }, 100);
                }
            }
        }
        return originalMethod.apply(this, args);
    };
}

// --- ACTIONS DU PLUGIN ---

function toggleGroupLock(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;

    if (!channel || channel.type !== 3 || !currentUserId) return;

    if (channel.ownerId !== currentUserId) {
        if (settings.store.showNotifications) {
            showNotification({
                title: "❌ LockGroup",
                body: "Seul le propriétaire peut verrouiller ce groupe."
            });
        }
        return;
    }

    const isCurrentlyLocked = lockedGroups.has(channelId);
    if (isCurrentlyLocked) {
        lockedGroups.delete(channelId);
        if (settings.store.showNotifications) {
            showNotification({ title: "🔓 LockGroup", body: `Groupe "${channel.name || "GDM"}" déverrouillé` });
        }
    } else {
        lockedGroups.add(channelId);
        if (settings.store.showNotifications) {
            showNotification({ title: "🔒 LockGroup", body: `Groupe "${channel.name || "GDM"}" verrouillé` });
        }
    }
}

// --- UI CONTEXT MENU ---

const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel }) => {
    if (!channel || channel.type !== 3) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (channel.ownerId !== currentUserId) return;

    const isLocked = lockedGroups.has(channel.id);
    const group = findGroupChildrenByChildId("leave-channel", children);

    if (group) {
        group.push(
            <React.Fragment key="lock-group-wrapper">
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="vc-lock-group-toggle"
                    label={isLocked ? "🔓 Déverrouiller le groupe" : "🔒 Verrouiller le groupe"}
                    color={isLocked ? "brand" : "danger"}
                    action={() => toggleGroupLock(channel.id)}
                    icon={() => (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d={isLocked 
                                ? "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z" 
                                : "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"
                            } />
                        </svg>
                    )}
                />
            </React.Fragment>
        );
    }
};

let originalPutMethod: any = null;

export default definePlugin({
    name: "LockGroup",
    description: "Verrouille les groupes DM pour empêcher l'ajout de membres par des tiers.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "gdm-context": GroupContextMenuPatch
    },

    flux: {
        MESSAGE_CREATE({ message }) {
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (message?.type === 1 && lockedGroups.has(message.channel_id)) {
                const addedByUserId = message.author?.id;
                const addedUserId = message.mentions?.[0]?.id;

                if (addedUserId && addedByUserId !== currentUserId) {
                    setTimeout(async () => {
                        try {
                            await RestAPI.del({ url: `/channels/${message.channel_id}/recipients/${addedUserId}` });
                        } catch (e) { debugLog(`Erreur kick secu: ${e}`); }
                    }, 150);
                }
            }
        }
    },

    start() {
        log("🚀 LockGroup démarré");
        if (RestAPI && RestAPI.put) {
            originalPutMethod = RestAPI.put;
            RestAPI.put = interceptAddMember(originalPutMethod);
        }
    },

    stop() {
        if (originalPutMethod && RestAPI) {
            RestAPI.put = originalPutMethod;
        }
        lockedGroups.clear();
    }
});