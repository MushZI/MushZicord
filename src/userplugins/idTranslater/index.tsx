// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    translateUserIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs d'utilisateurs en mentions @ cliquables",
        default: true
    },
    translateChannelIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de canaux en références # cliquables",
        default: true
    },
    translateRoleIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de rôles en mentions @& cliquables",
        default: true
    },
    translateMessageIds: {
        type: OptionType.BOOLEAN,
        description: "Convertir les IDs de messages en liens cliquables",
        default: false
    },
    translateOwnMessages: {
        type: OptionType.BOOLEAN,
        description: "Traduire les IDs dans vos propres messages envoyés",
        default: false
    },
    minIdLength: {
        type: OptionType.NUMBER,
        description: "Longueur minimale des IDs à convertir (Discord: 17-19 chiffres)",
        default: 17
    },
    maxIdLength: {
        type: OptionType.NUMBER,
        description: "Longueur maximale des IDs à convertir",
        default: 19
    }
});

// --- LOGIQUE DE DÉTECTION ---

function createIdRegex(minLength: number, maxLength: number): RegExp {
    return new RegExp(`\\b\\d{${minLength},${maxLength}}\\b`, "g");
}

function isUserId(id: string): boolean {
    try {
        const user = UserStore.getUser(id);
        return user !== undefined && user !== null;
    } catch { return false; }
}

function isChannelId(id: string): boolean {
    try {
        const channel = ChannelStore.getChannel(id);
        return channel !== undefined && channel !== null;
    } catch { return false; }
}

function isRoleId(id: string, channelId?: string): boolean {
    if (!channelId) return false;
    try {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel?.guild_id) return false;
        const guild = GuildStore.getGuild(channel.guild_id);
        return guild?.roles?.[id] !== undefined;
    } catch { return false; }
}

function isIdInContext(content: string, id: string, index: number): boolean {
    const beforeStart = Math.max(0, index - 5);
    const before = content.substring(beforeStart, index);
    const afterEnd = Math.min(content.length, index + id.length + 5);
    const after = content.substring(index + id.length, afterEnd);

    if (before.includes("<@") || before.includes("<#") || before.includes("<@&")) return true;
    if (before.match(/[:\/\.]/) || after.match(/[:\/\.]/)) return true;
    if (before.endsWith("@") || before.endsWith("#") || after.startsWith("@") || after.startsWith("#")) return true;

    return false;
}

// --- CORE TRANSLATION ---

function translateIds(content: string, channelId?: string): string {
    if (!content) return content;
    const { translateUserIds, translateChannelIds, translateRoleIds, translateMessageIds, minIdLength, maxIdLength } = settings.store;
    if (!translateUserIds && !translateChannelIds && !translateRoleIds && !translateMessageIds) return content;

    const idRegex = createIdRegex(minIdLength, maxIdLength);
    let translatedContent = content;
    const processedIds = new Map<string, string>();
    let match;
    const idMatches: Array<{ id: string; index: number; }> = [];

    while ((match = idRegex.exec(content)) !== null) {
        const id = match[0];
        const index = match.index;
        if (isIdInContext(content, id, index) || processedIds.has(id)) continue;

        let replacement: string | null = null;
        if (translateUserIds && isUserId(id)) replacement = `<@${id}>`;
        else if (translateChannelIds && isChannelId(id)) replacement = `<#${id}>`;
        else if (translateRoleIds && channelId && isRoleId(id, channelId)) replacement = `<@&${id}>`;
        else if (translateMessageIds && channelId) {
            const channel = ChannelStore.getChannel(channelId);
            const guildId = channel?.guild_id ?? "@me";
            replacement = `https://discord.com/channels/${guildId}/${channelId}/${id}`;
        }

        if (replacement) {
            processedIds.set(id, replacement);
            idMatches.push({ id, index });
        }
    }

    idMatches.reverse().forEach(({ id, index }) => {
        const replacement = processedIds.get(id);
        if (replacement) {
            translatedContent = translatedContent.substring(0, index) + replacement + translatedContent.substring(index + id.length);
        }
    });

    return translatedContent;
}

// --- PLUGIN ACTIONS ---

function modifyIncomingMessage(message: Message): string {
    if (!message.content) return message.content || "";
    const currentUser = UserStore.getCurrentUser();
    const isOwnMessage = currentUser?.id === message.author?.id;

    if (isOwnMessage && !settings.store.translateOwnMessages) return message.content;
    if (message.content.includes("<@") || message.content.includes("<#")) return message.content;

    return translateIds(message.content, message.channel_id);
}

export default definePlugin({
    name: "ID Translater",
    description: "Traduit automatiquement les IDs Discord en mentions @ ou références # cliquables.",
    authors: [{ name: "Bash", id: 1327483363518582784n }],
    isModified: true,
    settings,
    modifyIncomingMessage,

    patches: [
        {
            find: "!1,hideSimpleEmbedContent",
            replacement: {
                match: /(?<=toAST:.{0,125}?)\(null!=\i\?\i:\i\).content/,
                replace: "$self.modifyIncomingMessage(arguments[2]?.contentMessage??arguments[1])"
            }
        }
    ],

    start() {
        console.log("[ID Translater] Plugin démarré - Conversion active.");
    },

    stop() {
        console.log("[ID Translater] Plugin arrêté.");
    }
});