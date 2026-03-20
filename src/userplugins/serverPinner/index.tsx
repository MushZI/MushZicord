// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy, findByPropsLazy } from "@webpack";
import { GuildStore, Menu, UserStore, React } from "@webpack/common";
import { Guild } from "discord-types/general";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin Server Pinner",
        default: true
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    pinnedServers: {
        type: OptionType.STRING,
        description: "Liste des serveurs épinglés (format JSON)",
        default: "[]"
    }
});

// --- UTILITAIRES DE LOG ---

function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[ServerPinner ${timestamp}]`;

    switch (level) {
        case "warn":
            console.warn(prefix, message);
            break;
        case "error":
            console.error(prefix, message);
            break;
        default:
            console.log(prefix, message);
    }
}

function getPinnedServers(): string[] {
    try {
        const pinned = JSON.parse(settings.store.pinnedServers);
        return Array.isArray(pinned) ? pinned : [];
    } catch (error) {
        log(`Erreur parsing: ${error}`, "error");
        return [];
    }
}

function savePinnedServers(pinnedServers: string[]) {
    try {
        settings.store.pinnedServers = JSON.stringify(pinnedServers);
        log(`Sauvegarde : ${pinnedServers.length} serveur(s)`);
    } catch (error) {
        log(`Erreur sauvegarde: ${error}`, "error");
    }
}

// --- LOGIQUE CORE ---

function isServerPinned(guildId: string): boolean {
    return getPinnedServers().includes(guildId);
}

function pinServer(guildId: string) {
    const pinnedServers = getPinnedServers();
    if (!pinnedServers.includes(guildId)) {
        pinnedServers.unshift(guildId);
        savePinnedServers(pinnedServers);
        if (settings.store.showNotifications) {
            showNotification({
                title: "📌 Serveur épinglé",
                body: "Le serveur a été ajouté à votre liste locale."
            });
        }
    }
}

function unpinServer(guildId: string) {
    const pinnedServers = getPinnedServers();
    const index = pinnedServers.indexOf(guildId);
    if (index !== -1) {
        pinnedServers.splice(index, 1);
        savePinnedServers(pinnedServers);
        if (settings.store.showNotifications) {
            showNotification({
                title: "📌 Serveur dépinglé",
                body: "Le serveur a été retiré de votre liste locale."
            });
        }
    }
}

// --- MENU CONTEXTUEL ---

const ServerContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (!settings.store.enabled || !guild) return;

    const isPinned = isServerPinned(guild.id);
    const group = findGroupChildrenByChildId("privacy", children);

    if (group) {
        group.push(
            <React.Fragment key="server-pinner-fragment">
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="vc-toggle-server-pin"
                    label={isPinned ? "📌 Dépingler ce serveur" : "📌 Épingler ce serveur"}
                    action={() => {
                        if (isPinned) unpinServer(guild.id);
                        else pinServer(guild.id);
                    }}
                />
            </React.Fragment>
        );
    }
};

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "Server Pinner",
    description: "Permet d'épingler des serveurs via le menu contextuel pour une organisation locale.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "guild-context": ServerContextMenuPatch
    },

    start() {
        log("🚀 Server Pinner prêt");
        const pinnedCount = getPinnedServers().length;
        if (pinnedCount > 0) log(`${pinnedCount} serveurs chargés.`);
    },

    stop() {
        log("🛑 Server Pinner arrêté");
    }
});