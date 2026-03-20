// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { 
    UserStore, 
    PermissionStore, 
    PermissionsBits, 
    ChannelStore, 
    RestAPI, 
    Constants,
    VoiceStateStore 
} from "@webpack/common";

const VoiceActions = findByPropsLazy("toggleSelfMute");

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    guildId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}

// --- HELPERS API ---

async function unmuteUserViaAPI(userId: string, guildId: string): Promise<void> {
    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
            body: { mute: false }
        });
        console.log(`[AutoUnmute] Démute réussi pour ${userId}`);
    } catch (error) {
        console.error(`[AutoUnmute] Erreur démute API:`, error);
        throw error;
    }
}

async function undeafenUserViaAPI(userId: string, guildId: string): Promise<void> {
    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, userId),
            body: { deaf: false }
        });
        console.log(`[AutoUnmute] Désourdine réussi pour ${userId}`);
    } catch (error) {
        console.error(`[AutoUnmute] Erreur désourdine API:`, error);
        throw error;
    }
}

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "AutoUnmute",
    description: "Démute et désourdine automatiquement si on a les permissions nécessaires.",
    authors: [{ name: "Bash", id: 1327483363518582784n }],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) return;

            const currentUserId = currentUser.id;

            for (const state of voiceStates) {
                const { userId, channelId, guildId, mute, selfMute, deaf, selfDeaf } = state;

                // On ne surveille que nous-même
                if (userId !== currentUserId || !channelId || !guildId) continue;

                const channel = ChannelStore.getChannel(channelId);
                if (!channel) continue;

                // 1. GESTION DU MUTE SERVEUR
                if (mute && !selfMute) {
                    const hasMutePermission = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);

                    if (hasMutePermission) {
                        setTimeout(async () => {
                            try {
                                await unmuteUserViaAPI(currentUserId, guildId);
                            } catch (e) {
                                // Fallback local si l'API serveur échoue (conflit de session)
                                VoiceActions.toggleSelfMute();
                            }
                        }, 100);
                    }
                }

                // 2. GESTION DE LA SOURDINE SERVEUR
                if (deaf && !selfDeaf) {
                    const hasDeafenPermission = PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);

                    if (hasDeafenPermission) {
                        setTimeout(async () => {
                            try {
                                await undeafenUserViaAPI(currentUserId, guildId);
                            } catch (e) {
                                // Fallback local
                                VoiceActions.toggleSelfDeaf();
                            }
                        }, 100);
                    }
                }
            }
        }
    },

    start() {
        console.log("[AutoUnmute] Plugin actif.");
    },

    stop() {
        console.log("[AutoUnmute] Plugin arrêté.");
    }
});