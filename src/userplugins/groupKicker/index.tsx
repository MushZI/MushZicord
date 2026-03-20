// @ts-nocheck
/*
 * GroupKicker - Plugin pour Equicord
 * Permet au propriétaire d'un groupe de kicker tous les membres d'un clic.
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { showNotification } from "@api/Notifications";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { ChannelStore, Menu, UserStore, React } from "@webpack/common";

// API 2026 - Accès direct pour les requêtes de suppression
const RestAPI = findByProps("post", "put", "del");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin GroupKicker",
        default: true
    },
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications lors des actions",
        default: true
    },
    confirmBeforeKick: {
        type: OptionType.BOOLEAN,
        description: "Demander confirmation avant de kicker tous les membres",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: false
    }
});

function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[GroupKicker ${timestamp}]`;
    if (level === "warn") console.warn(prefix, message);
    else if (level === "error") console.error(prefix, message);
    else console.log(prefix, message);
}

function debugLog(message: string) {
    if (settings.store.debugMode) log(`🔍 ${message}`, "info");
}

function confirmKickAll(memberCount: number): boolean {
    if (!settings.store.confirmBeforeKick) return true;
    return confirm(
        `⚠️ Êtes-vous sûr de vouloir kicker tous les ${memberCount} membres de ce groupe ?\n\n` +
        "Cette action ne peut pas être annulée."
    );
}

// --- LOGIQUE API (MISE À JOUR) ---
async function kickUserFromGroup(channelId: string, userId: string): Promise<boolean> {
    try {
        await RestAPI.del({
            url: `/channels/${channelId}/recipients/${userId}`
        });
        return true;
    } catch (error) {
        return false;
    }
}

async function kickAllMembers(channelId: string) {
    if (!settings.store.enabled) return;

    try {
        const channel = ChannelStore.getChannel(channelId);
        const currentUserId = UserStore.getCurrentUser()?.id;

        if (!channel || channel.type !== 3 || !currentUserId) return;

        const recipients = channel.recipients || [];
        
        if (channel.ownerId !== currentUserId) {
            if (settings.store.showNotifications) {
                showNotification({ title: "❌ GroupKicker", body: "Seul le propriétaire peut faire ça" });
            }
            return;
        }

        if (recipients.length === 0) return;

        if (!confirmKickAll(recipients.length)) return;

        if (settings.store.showNotifications) {
            showNotification({ title: "🔄 GroupKicker", body: `Nettoyage de ${recipients.length} membres...` });
        }

        for (const recipientId of recipients) {
            if (recipientId === currentUserId) continue;
            await kickUserFromGroup(channelId, recipientId);
            // Délai de sécurité pour l'API
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        if (settings.store.showNotifications) {
            showNotification({ title: "✅ GroupKicker", body: "Le groupe a été vidé." });
        }
    } catch (error) {
        log(`Erreur: ${error}`, "error");
    }
}

// --- UI / CONTEXT MENU ---
const GroupContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    // 3 = GROUP_DM
    if (!channel || channel.type !== 3) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    const isOwner = channel.ownerId === currentUserId;
    const memberCount = (channel.recipients?.length || 0);

    if (!isOwner || memberCount === 0) return;

    const group = findGroupChildrenByChildId("leave-channel", children);

    if (group) {
        group.push(
            <Menu.MenuSeparator />,
            <Menu.MenuItem
                id="vc-kick-all-members"
                label={`🦶 Kicker tous les membres (${memberCount})`}
                color="danger"
                action={() => kickAllMembers(channel.id)}
                icon={() => (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 7V9C15 9.55 14.55 10 14 10S13 9.55 13 9V7H11V9C11 9.55 10.45 10 10 10S9 9.55 9 9V7L3 7V9H5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V9H21Z" />
                    </svg>
                )}
            />
        );
    }
};

export default definePlugin({
    name: "GroupKicker",
    description: "Permet au propriétaire d'un groupe de kicker tous les membres d'un clic.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "gdm-context": GroupContextMenuPatch
    },

    start() {
        log("🚀 GroupKicker prêt");
    },

    stop() {
        log("🛑 GroupKicker arrêté");
    }
});