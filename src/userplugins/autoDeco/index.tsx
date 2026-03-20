// @ts-nocheck
/*
 * AutoDeco - Plugin pour Equicord
 * Se déconnecte automatiquement lorsqu'un utilisateur spécifique rejoint.
 */

import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { findStoreLazy } from "@webpack";
import { Menu, React, FluxDispatcher } from "@webpack/common";

const UserStore = findStoreLazy("UserStore");
const SelectedChannelStore = findStoreLazy("SelectedChannelStore");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Activer AutoDeco"
    }
});

let targetUserId: string | null = null;
let lastProcessedStates: Map<string, string | null> = new Map();

// --- PATCH MENU CONTEXTUEL ---
function UserContextMenuPatch(children: any[], { user }: { user: any }) {
    const currentUser = UserStore.getCurrentUser();
    if (!user || user.id === currentUser?.id) return;

    const isActive = targetUserId === user.id;

    children.push(
        <Menu.MenuGroup key="autodeco-group">
            <Menu.MenuSeparator />
            <Menu.MenuCheckboxItem
                id="autodeco-context"
                label="Cibler pour AutoDeco"
                checked={isActive}
                action={() => {
                    if (isActive) {
                        targetUserId = null;
                        showNotification({ 
                            title: "AutoDeco", 
                            body: `AutoDeco désactivé pour ${user.username}` 
                        });
                    } else {
                        targetUserId = user.id;
                        showNotification({ 
                            title: "AutoDeco", 
                            body: `AutoDeco activé pour ${user.username}` 
                        });
                    }
                }}
            />
        </Menu.MenuGroup>
    );
}

export default definePlugin({
    name: "AutoDeco",
    description: "Se déconnecte automatiquement du canal vocal lorsqu'un utilisateur spécifique rejoint.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    settings,
    
    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }) {
            if (!targetUserId || !settings.store.enabled) return;

            const currentChannelId = SelectedChannelStore.getVoiceChannelId();
            if (!currentChannelId) return;

            for (const state of voiceStates) {
                if (state.userId === targetUserId) {
                    const previousChannelId = lastProcessedStates.get(state.userId);

                    // Si l'utilisateur rejoint notre salon actuel
                    if (
                        state.channelId === currentChannelId &&
                        previousChannelId !== currentChannelId
                    ) {
                        console.log("[AutoDeco] Cible détectée, déconnexion...");

                        // Déconnexion via le Dispatcher
                        FluxDispatcher.dispatch({
                            type: "VOICE_CHANNEL_SELECT",
                            channelId: null,
                            guildId: null
                        });

                        showNotification({
                            title: "AutoDeco",
                            body: `Déconnexion : la cible a rejoint votre salon.`
                        });
                    }

                    // Mise à jour du cache d'état
                    lastProcessedStates.set(state.userId, state.channelId);
                }
            }
        }
    },

    start() {
        console.log("[AutoDeco] Plugin démarré");
    },

    stop() {
        targetUserId = null;
        lastProcessedStates.clear();
    }
});