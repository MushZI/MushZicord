// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, React, RestAPI, SelectedGuildStore, Constants } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

const VoiceStateStore = findStoreLazy("VoiceStateStore");
const UserStore = findStoreLazy("UserStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");

type TLeashedUserInfo = {
    userId: string;
    lastChannelId: string | null;
} | null;

let leashedUserInfo: TLeashedUserInfo = null;
let myLastChannelId: string | null = null;

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Activer le plugin laisse"
    },
    onlyWhenInVoice: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Ne déplacer l'utilisateur que quand vous êtes dans un canal vocal"
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Afficher les notifications lors des déplacements"
    }
});

// --- LOGIQUE DE DÉPLACEMENT ---

async function moveUserToVoiceChannel(userId: string, channelId: string): Promise<void> {
    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) throw new Error("Aucun serveur sélectionné");

    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
            body: { channel_id: channelId }
        });

        if (settings.store.showNotifications) {
            const user = UserStore.getUser(userId);
            showNotification({
                title: "laisse - Succès",
                body: `${user?.username || "L'utilisateur"} a été déplacé.`
            });
        }
    } catch (error) {
        console.error("laisse: Erreur API Discord:", error);
        throw error;
    }
}

// --- PATCH MENU CONTEXTUEL ---

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }) => {
    const myId = UserStore.getCurrentUser()?.id;
    if (!user || myId === user.id) return;

    const isLeashed = leashedUserInfo?.userId === user.id;

    children.push(
        <React.Fragment key="laisse-context-group">
            <Menu.MenuSeparator />
            <Menu.MenuCheckboxItem
                id="laisse-leash-user"
                label="laisse - Accrocher l'utilisateur"
                checked={isLeashed}
                action={() => {
                    if (leashedUserInfo?.userId === user.id) {
                        leashedUserInfo = null;
                        showNotification({
                            title: "laisse",
                            body: `L'utilisateur ${user.username} n'est plus accroché`
                        });
                    } else {
                        leashedUserInfo = {
                            userId: user.id,
                            lastChannelId: null
                        };
                        showNotification({
                            title: "laisse",
                            body: `L'utilisateur ${user.username} est maintenant accroché à vous`
                        });
                    }
                }}
            />
        </React.Fragment>
    );
};

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "laisse",
    description: "Accroche un utilisateur à vous en le déplaçant automatiquement dans le canal vocal où vous allez",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    settings,
    contextMenus: {
        "user-context": UserContextMenuPatch
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }) {
            if (!leashedUserInfo || !settings.store.enabled) return;

            const myId = UserStore.getCurrentUser()?.id;
            const myCurrentChannelId = SelectedChannelStore.getVoiceChannelId();

            if (settings.store.onlyWhenInVoice && !myCurrentChannelId) return;

            for (const voiceState of voiceStates) {
                // Détection de notre propre changement de canal
                if (voiceState.userId === myId && voiceState.channelId !== myLastChannelId) {
                    myLastChannelId = voiceState.channelId;

                    // Si on rejoint un nouveau canal (non nul)
                    if (voiceState.channelId && leashedUserInfo.userId) {
                        const leashedUserVoiceState = VoiceStateStore.getVoiceStateForUser(leashedUserInfo.userId);

                        // Si la cible est ailleurs, on la tire
                        if (leashedUserVoiceState && leashedUserVoiceState.channelId !== voiceState.channelId) {
                            try {
                                const user = UserStore.getUser(leashedUserInfo.userId);
                                if (settings.store.showNotifications) {
                                    showNotification({
                                        title: "laisse",
                                        body: `Déplacement de ${user?.username || "la cible"}...`
                                    });
                                }
                                await moveUserToVoiceChannel(leashedUserInfo.userId, voiceState.channelId);
                            } catch (error) {
                                if (settings.store.showNotifications) {
                                    showNotification({
                                        title: "laisse - Erreur",
                                        body: "Permissions insuffisantes pour déplacer l'utilisateur."
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    start() {
        myLastChannelId = SelectedChannelStore.getVoiceChannelId();
    },
    stop() {
        leashedUserInfo = null;
        myLastChannelId = null;
    }
});