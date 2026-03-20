// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

const UserStore = findByPropsLazy("getCurrentUser", "getUser");

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer la commande /mytoken",
        default: true
    },
    showInDMs: {
        type: OptionType.BOOLEAN,
        description: "Permettre l'utilisation de la commande dans les DMs",
        default: true
    }
});

// --- LOGIQUE DE RÉCUPÉRATION (INTACTE) ---

function getCurrentToken(): string | null {
    console.log("[Token Display] Début de la récupération du token");

    try {
        // Méthode 1: localStorage
        if (typeof window !== "undefined" && window.localStorage) {
            const token = window.localStorage.getItem("token");
            if (token) return token.replace(/^"(.*)"$/, "$1");
        }

        // Méthode 2: Webpack Modules
        if (typeof window !== "undefined" && window.webpackChunkdiscord_app) {
            const modules = window.webpackChunkdiscord_app;
            for (const chunk of modules) {
                if (chunk[1]) {
                    for (const moduleId in chunk[1]) {
                        const module = chunk[1][moduleId];
                        if (module?.exports?.getToken) {
                            const token = module.exports.getToken();
                            if (typeof token === "string") return token;
                        }
                        if (module?.exports?.default?.getToken) {
                            const token = module.exports.default.getToken();
                            if (typeof token === "string") return token;
                        }
                    }
                }
            }
        }

        // Méthode 3: findByProps
        const { getToken } = findByPropsLazy("getToken") || {};
        if (typeof getToken === "function") {
            const token = getToken();
            if (token) return token;
        }

        return null;
    } catch (error) {
        console.error("[Token Display] Erreur récupération:", error);
        return null;
    }
}

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "Token Display",
    description: "Affiche le token du compte en cours d'utilisation avec la commande /mytoken",
    authors: [Devs.Unknown, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI"],
    settings,

    start() {
        console.log("[Token Display] Plugin démarré");
    },

    stop() {
        console.log("[Token Display] Plugin arrêté");
    },

    commands: [
        {
            name: "mytoken",
            description: "Affiche le token du compte en cours d'utilisation",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: async (opts, ctx) => {
                if (!settings.store.enabled) {
                    sendBotMessage(ctx.channel.id, { content: "❌ Commande désactivée." });
                    return;
                }

                if (!ctx.guild && !settings.store.showInDMs) {
                    sendBotMessage(ctx.channel.id, { content: "❌ Non autorisé en DM." });
                    return;
                }

                const token = getCurrentToken();
                if (!token) {
                    sendBotMessage(ctx.channel.id, { content: "❌ Impossible de récupérer le token." });
                    return;
                }

                const currentUser = UserStore.getCurrentUser();
                const username = currentUser ? currentUser.username : "Utilisateur inconnu";

                sendBotMessage(ctx.channel.id, {
                    content: `🔑 **Token du compte ${username}:**\n\`\`\`\n${token}\n\`\`\`\n⚠️ **Attention:** Ne partagez jamais votre token !`
                });
            }
        }
    ]
});