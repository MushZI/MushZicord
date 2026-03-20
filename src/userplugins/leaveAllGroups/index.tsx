// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, Menu, RestAPI, showToast, Toasts, UserStore, React } from "@webpack/common";
import { Channel } from "discord-types/general";

// Utiliser PrivateChannelSortStore comme dans les autres plugins
const PrivateChannelSortStore = findStoreLazy("PrivateChannelSortStore") as { getPrivateChannelIds: () => string[]; };

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin LeaveAllGroups",
        default: true
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    confirmBeforeLeave: {
        type: OptionType.BOOLEAN,
        description: "Demander confirmation avant de quitter tous les groupes",
        default: false
    },
    delayBetweenLeaves: {
        type: OptionType.NUMBER,
        description: "Délai en ms entre chaque sortie (évite le rate limiting)",
        default: 200,
        min: 50,
        max: 1000
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: false
    }
});

// --- UTILITAIRES DE LOG ---

function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[LeaveAllGroups ${timestamp}]`;
    if (level === "warn") console.warn(prefix, message);
    else if (level === "error") console.error(prefix, message);
    else console.log(prefix, message);
}

function debugLog(message: string) {
    if (settings.store.debugMode) log(`🔍 ${message}`, "info");
}

function confirmLeaveAll(groupCount: number): boolean {
    if (!settings.store.confirmBeforeLeave) return true;
    return confirm(
        `⚠️ Êtes-vous sûr de vouloir quitter tous les ${groupCount} groupes ?\n\n` +
        "Cette action est irréversible."
    );
}

// --- LOGIQUE CORE ---

async function leaveGroup(channelId: string): Promise<boolean> {
    try {
        debugLog(`Tentative de sortie du groupe ${channelId}`);
        await RestAPI.del({ url: `/channels/${channelId}` });
        debugLog(`✅ Groupe ${channelId} quitté`);
        return true;
    } catch (error) {
        log(`❌ Erreur sur le groupe ${channelId}: ${error}`, "error");
        return false;
    }
}

function getAllGroups(): Channel[] {
    const privateChannelIds = PrivateChannelSortStore.getPrivateChannelIds();
    const groups: Channel[] = [];
    privateChannelIds.forEach((channelId: string) => {
        const channel = ChannelStore.getChannel(channelId);
        // Type 3 = GROUP_DM
        if (channel && channel.type === 3) groups.push(channel);
    });
    return groups;
}

async function leaveAllGroups() {
    if (!settings.store.enabled) return;

    try {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId) return log("Utilisateur introuvable", "error");

        const groups = getAllGroups();
        if (groups.length === 0) {
            if (settings.store.showNotifications) {
                showNotification({ title: "ℹ️ LeaveAllGroups", body: "Aucun groupe trouvé." });
            }
            showToast(Toasts.Type.MESSAGE, "ℹ️ Aucun groupe à quitter");
            return;
        }

        if (!confirmLeaveAll(groups.length)) return;

        log(`🚀 Sortie de ${groups.length} groupe(s) lancée`);
        let successCount = 0;
        let failureCount = 0;

        showToast(Toasts.Type.MESSAGE, `🔄 Nettoyage de ${groups.length} groupes...`);

        for (const group of groups) {
            const success = await leaveGroup(group.id);
            if (success) successCount++;
            else failureCount++;

            if (settings.store.delayBetweenLeaves > 0) {
                await new Promise(resolve => setTimeout(resolve, settings.store.delayBetweenLeaves));
            }
        }

        if (settings.store.showNotifications) {
            showNotification({
                title: failureCount > 0 ? "⚠️ Terminé avec erreurs" : "✅ Nettoyage terminé",
                body: `${successCount} groupes quittés.`
            });
        }

        if (failureCount > 0) showToast(Toasts.Type.FAILURE, `⚠️ ${failureCount} échecs.`);
        else showToast(Toasts.Type.SUCCESS, `✅ Tous les groupes ont été quittés.`);

    } catch (error) {
        log(`❌ Erreur générale: ${error}`, "error");
    }
}

// --- PATCHES MENUS ---

const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!settings.store.enabled || channel?.type !== 3) return;
    const container = findGroupChildrenByChildId("leave-channel", children);
    if (container) {
        container.push(
            <Menu.MenuItem
                id="vc-leave-all-groups"
                label="🚪 Quitter tous les groupes"
                action={leaveAllGroups}
                color="danger"
            />
        );
    }
};

const ServerContextMenuPatch: NavContextMenuPatchCallback = (children) => {
    if (!settings.store.enabled) return;
    const group = findGroupChildrenByChildId("privacy", children);
    if (group) {
        group.push(
            <Menu.MenuItem
                id="vc-leave-all-groups-server"
                label="🚪 Quitter tous les groupes"
                action={leaveAllGroups}
                color="danger"
            />
        );
    }
};

const UserContextMenuPatch: NavContextMenuPatchCallback = (children) => {
    if (!settings.store.enabled) return;
    const container = findGroupChildrenByChildId("block", children) || findGroupChildrenByChildId("remove-friend", children);
    if (container) {
        container.push(
            <Menu.MenuItem
                id="vc-leave-all-groups-user"
                label="🚪 Quitter tous les groupes"
                action={leaveAllGroups}
                color="danger"
            />
        );
    }
};

export default definePlugin({
    name: "LeaveAllGroups",
    description: "Quitte tous les groupes Discord d'un seul clic avec rate-limiting.",
    authors: [Devs.BigDuck, { name: "mushzi", id: 449282863582412850n }],
    settings,

    contextMenus: {
        "gdm-context": GroupContextMenuPatch,
        "guild-context": ServerContextMenuPatch,
        "user-context": UserContextMenuPatch
    },

    start() {
        log("Plugin LeaveAllGroups démarré");
    },

    stop() {
        log("Plugin LeaveAllGroups arrêté");
    }
});