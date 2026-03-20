// @ts-nocheck
/*
 * MessageCleaner - Plugin pour Equicord
 * Nettoie les messages avec gestion du rate limiting et statistiques.
 */

import { definePluginSettings } from "@api/Settings";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { ChannelStore, Menu, UserStore, React } from "@webpack/common";

// API 2026 - Accès direct aux modules de communication
const RestAPI = findByProps("get", "post", "del");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer le plugin MessageCleaner",
        default: true
    },
    targetChannelId: {
        type: OptionType.STRING,
        description: "ID du canal à nettoyer (laisser vide pour utiliser le menu)",
        default: ""
    },
    delayBetweenDeletes: {
        type: OptionType.SLIDER,
        description: "Délai entre chaque suppression (ms)",
        default: 1000,
        markers: [100, 500, 1000, 2000, 5000],
        minValue: 100,
        maxValue: 10000,
        stickToMarkers: false
    },
    batchSize: {
        type: OptionType.SLIDER,
        description: "Nombre de messages à traiter par batch",
        default: 50,
        markers: [10, 25, 50, 100],
        minValue: 1,
        maxValue: 100,
        stickToMarkers: false
    },
    showProgress: {
        type: OptionType.BOOLEAN,
        description: "Afficher la progression en temps réel",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage (logs détaillés)",
        default: true
    },
    skipSystemMessages: {
        type: OptionType.BOOLEAN,
        description: "Ignorer les messages système",
        default: true
    },
    skipReplies: {
        type: OptionType.BOOLEAN,
        description: "Ignorer les réponses aux messages",
        default: false
    },
    maxAge: {
        type: OptionType.SLIDER,
        description: "Age maximum des messages (jours, 0 = illimité)",
        default: 0,
        markers: [0, 1, 7, 30, 90],
        minValue: 0,
        maxValue: 365,
        stickToMarkers: false
    }
});

// --- ÉTAT GLOBAL ---
let isCleaningInProgress = false;
let shouldStopCleaning = false;
let cleaningStats = { total: 0, deleted: 0, failed: 0, skipped: 0, startTime: 0 };

function log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[MessageCleaner ${timestamp}]`;
    if (level === "warn") console.warn(prefix, message);
    else if (level === "error") console.error(prefix, message);
    else console.log(prefix, message);
}

function debugLog(message: string) {
    if (settings.store.debugMode) log(`🔍 ${message}`, "info");
}

// --- LOGIQUE DE VÉRIFICATION (INTACTE) ---
function canDeleteMessage(message: any, currentUserId: string): boolean {
    try {
        if (message.author?.id !== currentUserId) return false;
        if (settings.store.skipSystemMessages && message.type !== 0 && message.type !== 19) return false;
        
        const isReply = message.type === 19 || !!message.messageReference || !!message.message_reference;
        if (isReply && settings.store.skipReplies) return false;

        if (settings.store.maxAge > 0) {
            const messageTime = new Date(message.timestamp).getTime();
            const maxAgeMs = settings.store.maxAge * 24 * 60 * 60 * 1000;
            if (Date.now() - messageTime > maxAgeMs) return false;
        }
        return true;
    } catch (error) { return false; }
}

// --- ACTIONS API ---
async function deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    try {
        await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
        return true;
    } catch (error) { return false; }
}

async function getChannelMessages(channelId: string, before?: string): Promise<any[]> {
    try {
        const url = before
            ? `/channels/${channelId}/messages?limit=${settings.store.batchSize}&before=${before}`
            : `/channels/${channelId}/messages?limit=${settings.store.batchSize}`;
        const response = await RestAPI.get({ url });
        return Array.isArray(response.body) ? response.body : [];
    } catch (error) { return []; }
}

// --- BOUCLE DE NETTOYAGE (INTACTE) ---
async function cleanChannel(channelId: string) {
    if (isCleaningInProgress || !settings.store.enabled) return;

    const channel = ChannelStore.getChannel(channelId);
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!channel || !currentUserId) return;

    isCleaningInProgress = true;
    shouldStopCleaning = false;
    cleaningStats = { total: 0, deleted: 0, failed: 0, skipped: 0, startTime: Date.now() };

    log(`🧹 Début du nettoyage du canal : ${channel.name || channelId}`);

    let lastMessageId: string | undefined;

    while (!shouldStopCleaning) {
        const messages = await getChannelMessages(channelId, lastMessageId);
        if (messages.length === 0) break;

        const validMessages = messages.filter(msg => canDeleteMessage(msg, currentUserId));
        
        for (const message of validMessages) {
            if (shouldStopCleaning) break;
            const success = await deleteMessage(channelId, message.id);
            if (success) cleaningStats.deleted++; else cleaningStats.failed++;
            if (settings.store.delayBetweenDeletes > 0) {
                await new Promise(r => setTimeout(r, settings.store.delayBetweenDeletes));
            }
        }

        cleaningStats.skipped += (messages.length - validMessages.length);
        lastMessageId = messages[messages.length - 1].id;
        if (messages.length < settings.store.batchSize) break;
    }

    isCleaningInProgress = false;
    log(`✅ Terminé. Supprimés: ${cleaningStats.deleted}, Échecs: ${cleaningStats.failed}`);
}

function stopCleaning() {
    shouldStopCleaning = true;
    log("⏹️ Arrêt demandé");
}

// --- UI / CONTEXT MENU ---
const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel) return;

    // On cherche le groupe d'options pour insérer notre bouton
    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;

    if (group) {
        group.push(<Menu.MenuSeparator />);
        if (isCleaningInProgress) {
            group.push(
                <Menu.MenuItem
                    id="vc-cleaning-status"
                    label={`🔄 Suppression... (${cleaningStats.deleted})`}
                    color="brand"
                    disabled={true}
                />,
                <Menu.MenuItem
                    id="vc-stop-cleaning"
                    label="⏹️ Arrêter le nettoyage"
                    color="danger"
                    action={stopCleaning}
                />
            );
        } else {
            group.push(
                <Menu.MenuItem
                    id="vc-clean-messages"
                    label="🧹 Nettoyer les messages"
                    color="danger"
                    action={() => cleanChannel(channel.id)}
                />
            );
        }
    }
};

export default definePlugin({
    name: "MessageCleaner",
    description: "Supprime vos messages en masse avec gestion intelligente du rate limit.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "channel-context": ChannelContextMenuPatch,
        "gdm-context": ChannelContextMenuPatch,
        "user-context": ChannelContextMenuPatch
    },

    start() {
        log("🚀 MessageCleaner opérationnel");
    },

    stop() {
        if (isCleaningInProgress) shouldStopCleaning = true;
    }
});