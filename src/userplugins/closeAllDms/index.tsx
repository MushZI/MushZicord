// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { findByProps, findStore } from "@webpack";
import { ChannelStore, FluxDispatcher, Toasts, Menu, React } from "@webpack/common";

// API 2026 - Accès direct aux actions de fermeture
const ChannelActionCreators = findByProps("openPrivateChannel", "closePrivateChannel");
const PrivateChannelSortStore = findStore("PrivateChannelSortStore");

// Fonction pour fermer un DM avec rate limite (Logique intacte)
async function closeDMWithDelay(channelId: string, delay: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            try {
                const channel = ChannelStore.getChannel(channelId);

                // Type 1 = DM Privé (on ignore le type 3 = Groupe)
                if (channel?.type === 1) {
                    if (ChannelActionCreators?.closePrivateChannel) {
                        ChannelActionCreators.closePrivateChannel(channelId);
                    } else {
                        // Fallback Flux
                        FluxDispatcher.dispatch({
                            type: "CHANNEL_DELETE",
                            channel: { id: channelId, type: 1 }
                        });
                    }
                }
            } catch (err) {
                console.error(`[CloseAllDms] Erreur DM ${channelId}:`, err);
            }
            resolve();
        }, delay);
    });
}

async function closeAllDMs() {
    try {
        const privateChannelIds = PrivateChannelSortStore?.getPrivateChannelIds?.() || [];
        const dmsToClose = privateChannelIds.filter(id => {
            const chan = ChannelStore.getChannel(id);
            return chan?.type === 1;
        });

        if (dmsToClose.length === 0) {
            Toasts.show({ message: "ℹ️ Aucun DM privé à fermer", type: Toasts.Type.MESSAGE });
            return;
        }

        // Exécution avec le délai de 50ms par DM défini dans ton code original
        for (let i = 0; i < dmsToClose.length; i++) {
            await closeDMWithDelay(dmsToClose[i], i * 50);
        }

        Toasts.show({ 
            message: `✅ ${dmsToClose.length} DM(s) fermés (50ms rate-limit)`, 
            type: Toasts.Type.SUCCESS 
        });

    } catch (error) {
        Toasts.show({ message: "❌ Erreur lors de la fermeture", type: Toasts.Type.FAILURE });
    }
}

// --- PATCHES DES MENUS CONTEXTUELS ---

const CommonMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    // On cherche un point d'insertion logique selon le menu (fermer ou quitter)
    const container = findGroupChildrenByChildId("leave-channel", children) 
                   || findGroupChildrenByChildId("close-dm", children)
                   || findGroupChildrenByChildId("privacy", children);

    if (container) {
        container.push(
            <Menu.MenuSeparator />,
            <Menu.MenuItem
                id="vc-close-all-dms-action"
                label="Fermer tous les DMs"
                color="danger"
                action={closeAllDMs}
            />
        );
    }
};

export default definePlugin({
    name: "CloseAllDms",
    description: "Ferme tous les DMs privés d'un seul clic avec rate limite de 50ms (préserve les groupes).",
    authors: [{ name: "mushzi", id: 449282863582412850n }],

    contextMenus: {
        "gdm-context": CommonMenuPatch,
        "user-context": CommonMenuPatch,
        "guild-context": CommonMenuPatch
    }
});