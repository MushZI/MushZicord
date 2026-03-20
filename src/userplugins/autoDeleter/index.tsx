// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { DataStore } from "@api/index"; // Import corrigé pour 2026
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MessageStore, RestAPI, UserStore, Constants } from "@webpack/common";
import { findByPropsLazy } from "@webpack";

const MessageActions = findByPropsLazy("deleteMessage", "startEditMessage");

interface TrackedMessage {
    id: string;
    channelId: string;
    guildId?: string;
    timestamp: number;
    scheduledTime: number; 
    timeoutId?: any; // Changé pour éviter l'erreur NodeJS.Timeout
    content?: string;
    length?: number;
    hasEmbed?: boolean;
    hasAttachment?: boolean;
    hasReactions?: boolean;
    deletionMode?: string;
    priority?: number;
}

interface DeletionStats {
    messagesDeleted: number;
    messagesSaved: number;
    errors: number;
    restoredFromStorage: number;
    hourlyDeletions: number;
    lastHourReset: number;
    totalBytesSaved: number;
    averageMessageLength: number;
    deletionModes: Record<string, number>;
    channelStats: Record<string, number>;
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer la suppression automatique des messages",
        default: false
    },
    defaultDelay: {
        type: OptionType.NUMBER,
        description: "Délai avant suppression (en unité rentrée en bas)",
        default: 300,
        min: 5,
        max: 86400
    },
    delayUnit: {
        type: OptionType.SELECT,
        description: "Unité de temps",
        options: [
            { label: "Secondes", value: "seconds", default: true },
            { label: "Minutes", value: "minutes" },
            { label: "Heures", value: "hours" }
        ]
    },
    deletionMode: {
        type: OptionType.SELECT,
        description: "Mode de suppression",
        options: [
            { label: "Suppression normale", value: "normal", default: true },
            { label: "AntiLog (masque MessageLogger)", value: "antilog" },
            { label: "Suppression silencieuse", value: "silent" },
            { label: "Édition puis suppression", value: "edit_delete" }
        ]
    },
    channelMode: {
        type: OptionType.SELECT,
        description: "Mode de filtrage des canaux",
        options: [
            { label: "Tous les canaux", value: "all", default: true },
            { label: "Canaux spécifiques seulement", value: "whitelist" },
            { label: "Exclure certains canaux", value: "blacklist" },
            { label: "Serveurs spécifiques", value: "guilds" }
        ]
    },
    channelList: {
        type: OptionType.STRING,
        description: "IDs des canaux (séparés par des virgules)",
        default: ""
    },
    guildList: {
        type: OptionType.STRING,
        description: "IDs des serveurs (séparés par des virgules)",
        default: ""
    },
    preserveKeywords: {
        type: OptionType.STRING,
        description: "Mots-clés à préserver (séparés par des virgules)",
        default: ""
    },
    deleteKeywords: {
        type: OptionType.STRING,
        description: "Mots-clés pour suppression immédiate (séparés par des virgules)",
        default: ""
    },
    maxMessageLength: {
        type: OptionType.NUMBER,
        description: "Longueur maximale (0 = illimité)",
        default: 0,
        min: 0,
        max: 2000
    },
    minMessageLength: {
        type: OptionType.NUMBER,
        description: "Longueur minimale",
        default: 0,
        min: 0,
        max: 2000
    },
    preserveEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Préserver les messages avec des embeds",
        default: true
    },
    preserveAttachments: {
        type: OptionType.BOOLEAN,
        description: "Préserver les messages avec des fichiers joints",
        default: true
    },
    preserveReactions: {
        type: OptionType.BOOLEAN,
        description: "Préserver les messages avec des réactions",
        default: false
    },
    smartDelay: {
        type: OptionType.BOOLEAN,
        description: "Délai intelligent basé sur la longueur",
        default: false
    },
    notifications: {
        type: OptionType.BOOLEAN,
        description: "Afficher les notifications de suppression",
        default: false
    },
    notificationType: {
        type: OptionType.SELECT,
        description: "Type de notification",
        options: [
            { label: "Console seulement", value: "console", default: true },
            { label: "Toast notifications", value: "toast" },
            { label: "Les deux", value: "both" }
        ]
    },
    debug: {
        type: OptionType.BOOLEAN,
        description: "Mode debug (logs détaillés)",
        default: false
    },
    useAntiLogDeletion: {
        type: OptionType.BOOLEAN,
        description: "Utiliser la suppression AntiLog",
        default: true
    },
    blockMessage: {
        type: OptionType.STRING,
        description: "Texte de remplacement (AntiLog)",
        default: "x"
    },
    deleteInterval: {
        type: OptionType.NUMBER,
        description: "Intervalle AntiLog (ms)",
        default: 200
    },
    rateLimitHandling: {
        type: OptionType.BOOLEAN,
        description: "Gestion automatique des rate limits",
        default: true
    },
    maxRetries: {
        type: OptionType.NUMBER,
        description: "Nombre maximum de tentatives",
        default: 3
    },
    retryDelay: {
        type: OptionType.NUMBER,
        description: "Délai de base retry (ms)",
        default: 1000
    },
    adaptiveDelay: {
        type: OptionType.BOOLEAN,
        description: "Ajustement automatique des délais",
        default: true
    },
    aggressiveThrottling: {
        type: OptionType.BOOLEAN,
        description: "Throttling agressif",
        default: true
    },
    maxDeletionsPerMinute: {
        type: OptionType.NUMBER,
        description: "Max suppressions / minute",
        default: 8
    },
    minDelayBetweenDeletions: {
        type: OptionType.NUMBER,
        description: "Délai min entre suppressions (ms)",
        default: 2000
    },
    circuitBreakerThreshold: {
        type: OptionType.NUMBER,
        description: "Seuil Circuit Breaker",
        default: 5
    },
    circuitBreakerDuration: {
        type: OptionType.NUMBER,
        description: "Durée Circuit Breaker (min)",
        default: 5
    },
    editMessage: {
        type: OptionType.STRING,
        description: "Texte édition avant suppression",
        default: "Message supprimé automatiquement"
    },
    editDelay: {
        type: OptionType.NUMBER,
        description: "Délai après édition (ms)",
        default: 1000
    },
    batchDelete: {
        type: OptionType.BOOLEAN,
        description: "Suppression par lots",
        default: false
    },
    batchSize: {
        type: OptionType.NUMBER,
        description: "Taille des lots",
        default: 5
    },
    batchDelay: {
        type: OptionType.NUMBER,
        description: "Délai entre les lots (ms)",
        default: 200
    },
    emergencyStop: {
        type: OptionType.BOOLEAN,
        description: "Arrêt d'urgence",
        default: false
    },
    maxMessagesPerHour: {
        type: OptionType.NUMBER,
        description: "Max suppressions / heure (0 = illimité)",
        default: 0
    }
});

const STORAGE_KEY = "AutoDeleter_TrackedMessages";

// --- HELPERS (LOGIQUE ORIGINALE) ---

function messageSendWrapper(content: string, nonce: string, channelId: string) {
    return RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            content: content,
            flags: 0,
            mobile_network_type: "unknown",
            nonce: nonce,
            tts: false,
        }
    });
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- PLUGIN CORE ---

export default definePlugin({
    name: "AutoDeleter",
    description: "Supprime automatiquement vos messages après un délai configurable (persistant).",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    settings,

    trackedMessages: new Map<string, TrackedMessage>(),
    boundOnMessageCreate: null as any,

    stats: {
        messagesDeleted: 0,
        messagesSaved: 0,
        errors: 0,
        restoredFromStorage: 0,
        hourlyDeletions: 0,
        lastHourReset: Date.now(),
        totalBytesSaved: 0,
        averageMessageLength: 0,
        deletionModes: {} as Record<string, number>,
        channelStats: {} as Record<string, number>
    } as DeletionStats,

    deletionQueue: [] as Array<{messageId: string, channelId: string, mode: string}>,
    batchProcessor: null as any,
    retryQueue: [] as Array<{messageId: string, channelId: string, mode: string, attempts: number, nextRetry: number}>,
    retryProcessor: null as any,

    rateLimitInfo: {
        isRateLimited: false,
        retryAfter: 0,
        lastRateLimit: 0,
        consecutiveRateLimits: 0,
        backoffMultiplier: 1,
        globalCooldown: false,
        globalCooldownUntil: 0,
        circuitBreakerOpen: false,
        circuitBreakerUntil: 0,
        totalRateLimits: 0,
        lastSuccessfulDeletion: 0
    },

    throttlingInfo: {
        lastDeletionTime: 0,
        deletionCount: 0,
        windowStart: 0,
        maxDeletionsPerMinute: 10,
        minDelayBetweenDeletions: 2000
    },

    async start() {
        this.log("Plugin AutoDeleter démarré");
        this.boundOnMessageCreate = this.onMessageCreate.bind(this);
        FluxDispatcher.subscribe("MESSAGE_CREATE", this.boundOnMessageCreate);
        await this.restoreTrackedMessages();
    },

    stop() {
        if (this.boundOnMessageCreate) {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", this.boundOnMessageCreate);
        }
        this.trackedMessages.forEach(message => {
            if (message.timeoutId) clearTimeout(message.timeoutId);
        });
        this.saveTrackedMessages();
    },

    async saveTrackedMessages() {
        try {
            const messagesToSave = Array.from(this.trackedMessages.values()).map(msg => ({
                id: msg.id,
                channelId: msg.channelId,
                timestamp: msg.timestamp,
                scheduledTime: msg.scheduledTime
            }));
            await DataStore.set(STORAGE_KEY, messagesToSave);
        } catch (error) {
            this.error("Erreur sauvegarde:", error);
        }
    },

    async restoreTrackedMessages() {
        try {
            const savedMessages = await DataStore.get(STORAGE_KEY);
            if (!savedMessages || savedMessages.length === 0) return;

            const now = Date.now();
            for (const savedMsg of savedMessages) {
                const timeUntilDeletion = savedMsg.scheduledTime - now;
                if (timeUntilDeletion <= 0) {
                    await this.deleteMessage(savedMsg.id, savedMsg.channelId);
                } else {
                    this.scheduleMessageDeletionFromRestore(savedMsg, timeUntilDeletion);
                    this.stats.restoredFromStorage++;
                }
            }
        } catch (error) {
            this.error("Erreur restauration:", error);
        }
    },

    onMessageCreate(event: any) {
        if (!settings.store.enabled || settings.store.emergencyStop) return;
        const message = event?.message;
        if (!message || !message.author) return;

        const currentUser = UserStore.getCurrentUser();
        if (message.author.id !== currentUser?.id) return;

        // Filtres (Guilds, Channels, Keywords, Length, etc.)
        if (!this.shouldProcessChannel(message.channel_id)) return;
        if (!this.shouldProcessGuild(message.guild_id)) return;
        if (this.shouldPreserveMessage(message)) {
            this.stats.messagesSaved++;
            return;
        }

        const delay = this.calculateSmartDelay(message);
        this.scheduleMessageDeletion(message, delay);
    },

    shouldProcessChannel(channelId: string): boolean {
        const mode = settings.store.channelMode;
        if (mode === "all" || mode === "guilds") return true;
        const list = settings.store.channelList.split(',').map(id => id.trim());
        return mode === "whitelist" ? list.includes(channelId) : !list.includes(channelId);
    },

    shouldProcessGuild(guildId: string): boolean {
        if (settings.store.channelMode !== "guilds") return true;
        const list = settings.store.guildList.split(',').map(id => id.trim());
        return list.includes(guildId);
    },

    shouldPreserveMessage(message: any): boolean {
        const content = message.content || "";
        const keywords = settings.store.preserveKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
        if (keywords.some(k => content.toLowerCase().includes(k))) return true;
        
        if (settings.store.maxMessageLength > 0 && content.length > settings.store.maxMessageLength) return true;
        if (settings.store.preserveEmbeds && message.embeds?.length > 0) return true;
        if (settings.store.preserveAttachments && message.attachments?.length > 0) return true;

        return false;
    },

    calculateSmartDelay(message: any): number {
        const base = this.getDelayInMs();
        if (!settings.store.smartDelay) return base;
        const mult = Math.min(1 + ((message.content?.length || 0) / 1000), 3);
        return Math.floor(base * mult);
    },

    scheduleMessageDeletion(message: any, delay: number) {
        const scheduledTime = Date.now() + delay;
        const timeoutId = setTimeout(() => {
            this.deleteMessage(message.id, message.channel_id);
        }, delay);

        this.trackedMessages.set(message.id, {
            id: message.id,
            channelId: message.channel_id,
            timestamp: Date.now(),
            scheduledTime,
            timeoutId,
            length: (message.content || "").length
        });
        this.saveTrackedMessages();
    },

    scheduleMessageDeletionFromRestore(savedMsg: TrackedMessage, delay: number) {
        const timeoutId = setTimeout(() => {
            this.deleteMessage(savedMsg.id, savedMsg.channelId);
        }, delay);
        this.trackedMessages.set(savedMsg.id, { ...savedMsg, timeoutId });
    },

    async deleteMessage(messageId: string, channelId: string, attempt: number = 1) {
        try {
            const mode = settings.store.deletionMode;
            
            if (mode === "antilog") {
                const randomDelay = Math.random() * 500 + 1000;
                await sleep(randomDelay);
                const resp = await messageSendWrapper(settings.store.blockMessage, messageId, channelId);
                await sleep(3000);
                MessageActions.deleteMessage(channelId, messageId);
                await sleep(2000);
                MessageActions.deleteMessage(channelId, resp.body.id);
            } else if (mode === "edit_delete") {
                await RestAPI.patch({
                    url: `/channels/${channelId}/messages/${messageId}`,
                    body: { content: settings.store.editMessage }
                });
                await sleep(settings.store.editDelay);
                await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
            } else {
                await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
            }

            this.stats.messagesDeleted++;
            this.trackedMessages.delete(messageId);
        } catch (error) {
            this.error(`Erreur suppression ${messageId}:`, error);
            if (attempt < settings.store.maxRetries) {
                setTimeout(() => this.deleteMessage(messageId, channelId, attempt + 1), settings.store.retryDelay);
            }
        }
    },

    getDelayInMs(): number {
        const d = settings.store.defaultDelay;
        const u = settings.store.delayUnit;
        if (u === "minutes") return d * 60000;
        if (u === "hours") return d * 3600000;
        return d * 1000;
    },

    log(m: string, ...a: any[]) { console.log(`[AutoDeleter] ${m}`, ...a); },
    error(m: string, ...a: any[]) { console.error(`[AutoDeleter ERROR] ${m}`, ...a); }
});