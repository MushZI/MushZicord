/**
 * @name TokenLoginManager
 * @description Suite Complète : Multitoken (Scan+Stop), MassJoin & TokenLogin.
 * @author mushzi
 * @version 4.0.0
 */

import definePlugin from "@utils/types";
import { findByProps } from "@webpack";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

// --- MODULES INTERNES ---
const Toasts = findByProps("show", "pop");
const ComponentDispatch = findByProps("ComponentDispatch")?.ComponentDispatch;

// --- CONFIGURATION ---
const STORAGE_KEY = "Mushzi_CompleteSuite"; 
const DELAY_LOGIN_MS = 4000; // Délai avant connexion (Multitoken)
const DELAY_JOIN_MS = 1500;  // Délai entre chaque join (MassJoin)

interface QueueState {
    tokens: string[];
    totalValids: number;
    totalInvalids: number;
    current: number;
    channelId: string; 
}

// --- UTILITAIRES ---

const accessStorage = (action: "READ" | "WRITE" | "DELETE", payload: QueueState | null = null): QueueState | null => {
    try {
        if (typeof document === "undefined") return null;
        const frame = document.createElement("iframe");
        frame.style.display = "none";
        document.body.appendChild(frame);
        const storage = frame.contentWindow?.localStorage;
        let result: QueueState | null = null;
        if (storage) {
            switch (action) {
                case "WRITE": if (payload) storage.setItem(STORAGE_KEY, JSON.stringify(payload)); break;
                case "READ": const raw = storage.getItem(STORAGE_KEY); if (raw) result = JSON.parse(raw); break;
                case "DELETE": storage.removeItem(STORAGE_KEY); break;
            }
        }
        document.body.removeChild(frame);
        return result;
    } catch { return null; }
};

const injectTokenAndReload = (token: string) => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const { contentWindow } = frame;
    if (contentWindow) {
        const cleanToken = token.replace(/['"]/g, '');
        console.log("%c[TokenManager] Injection...", "color: blue");
        const interval = setInterval(() => {
            contentWindow.localStorage.setItem("token", `"${cleanToken}"`);
        }, 50);
        setTimeout(() => { clearInterval(interval); location.reload(); }, 1500);
    }
};

const getCheckTokenInfo = async (token: string): Promise<{ id: string, username: string } | null> => {
    try {
        const cleanToken = token.trim().replace(/['"]/g, '');
        const req = await fetch("https://discord.com/api/v9/users/@me", {
            headers: { Authorization: cleanToken }
        });
        if (!req.ok) return null;
        const data = await req.json();
        return { id: data.id, username: data.username };
    } catch { return null; }
};

const parseInviteCode = (input: string): string | null => {
    const match = input.match(/(?:discord\.gg\/|discord\.com\/invite\/|invites\/)?([a-zA-Z0-9-]+)$/);
    return match ? match[1] : null;
};

const executeJoin = async (token: string, code: string): Promise<"SUCCESS" | "CAPTCHA" | "FAILED"> => {
    try {
        const req = await fetch(`https://discord.com/api/v9/invites/${code}`, {
            method: "POST",
            headers: { "Authorization": token, "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        if (req.ok) return "SUCCESS";
        const res = await req.json();
        if (res.captcha_key) return "CAPTCHA";
        return "FAILED";
    } catch { return "FAILED"; }
};

const stopRotation = (context: string) => {
    accessStorage("DELETE");
    if (Toasts) Toasts.show({ message: `🚫 Rotation stoppée (${context}) !`, type: "error" });
    console.log(`[TokenManager] Stoppé via ${context}.`);
};

// --- LOGIQUE MULTITOKEN ---

const processNextRotation = async () => {
    const state = accessStorage("READ");
    
    if (!state || state.tokens.length === 0) {
        accessStorage("DELETE");
        if (state && state.channelId) {
            sendBotMessage(state.channelId, { 
                embeds: [{
                    title: "✅ Rotation Terminée",
                    description: `**${state.totalValids}** comptes connectés.`,
                    color: 0x00FF00
                }]
            });
        }
        return;
    }

    const progressIndex = state.current; 
    const channelId = state.channelId;
    const nextToken = state.tokens.shift(); 

    accessStorage("WRITE", { 
        tokens: state.tokens, 
        totalValids: state.totalValids,
        totalInvalids: state.totalInvalids,
        current: progressIndex + 1,
        channelId: channelId 
    });

    if (!nextToken) return;

    const userInfo = await getCheckTokenInfo(nextToken);
    const displayName = userInfo ? userInfo.username : "Utilisateur";

    // Message Chat avec bouton visuel
    try {
        sendBotMessage(channelId, {
            embeds: [{
                title: `🔄 Compte ${progressIndex} / ${state.totalValids}`,
                description: `Cible : **${displayName}**\nInjection dans **${DELAY_LOGIN_MS / 1000}s**.\nPour annuler, utilisez le bouton ci-dessous ou la notification.`,
                color: 0xFF0000,
                fields: [{ name: "Commande", value: "`/stoplogin`", inline: true }]
            }],
            components: [{
                type: 1,
                components: [{
                    type: 2, style: 4, label: "⛔ STOPPER LA ROTATION", custom_id: "mushzi_stop_btn", disabled: false
                }]
            }]
        });
    } catch (err) {}

    // Notification Toast (Le vrai bouton fonctionnel)
    if (Toasts) {
        Toasts.show({
            message: `Connexion à ${displayName}...`,
            id: "token-rotation-toast",
            type: "success",
            options: {
                duration: DELAY_LOGIN_MS, 
                buttons: [{
                    text: "🛑 ARRÊTER", color: "red",
                    onClick: () => stopRotation("Bouton Notification")
                }]
            }
        });
    }

    setTimeout(() => {
        if (!accessStorage("READ")) return;
        console.log(`%c[TokenManager] GO -> ${displayName}`, "color: orange");
        injectTokenAndReload(nextToken);
    }, DELAY_LOGIN_MS);
};

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "Token Login Manager",
    description: "Complete Suite: Multitoken, MassJoin, TokenLogin",
    authors: [{ name: "mushzi", id: 0n }],
    dependencies: ["CommandsAPI"], 

    start() {
        // Listener pour le bouton chat (expérimental)
        if (ComponentDispatch) {
            this.onInteraction = (e: any) => {
                if (e.data && e.data.custom_id === "mushzi_stop_btn") {
                    stopRotation("Bouton Chat");
                    try { e.respond({ type: 6 }); } catch {} 
                }
            };
            ComponentDispatch.subscribe("COMPONENT_INTERACTION_CREATE", this.onInteraction);
        }

        // Reprise automatique après reload
        setTimeout(() => {
            try {
                const stored = accessStorage("READ");
                if (stored) {
                    console.log("%c[TokenManager] Reprise...", "color: green");
                    processNextRotation();
                }
            } catch (e) { console.error(e); }
        }, 5000); 
    },

    stop() {
        if (ComponentDispatch && this.onInteraction) {
            ComponentDispatch.unsubscribe("COMPONENT_INTERACTION_CREATE", this.onInteraction);
        }
    },

    commands: [
        // 1. MULTITOKEN (Rotation)
        {
            name: "multitoken",
            description: "Scan + Stats + Rotate (Queue)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{ name: "tokens", description: "List of tokens", type: 3, required: true }],
            execute: async (args, ctx) => {
                const input = args[0].value as string;
                const rawTokens = input.split(/[\r\n\s,]+/).filter(t => t.length > 20);

                if (rawTokens.length === 0) {
                    sendBotMessage(ctx.channel.id, { content: "❌ Aucun token." });
                    return;
                }
                sendBotMessage(ctx.channel.id, { content: `🕵️ **Analyse de ${rawTokens.length} tokens...**` });

                const validTokens: string[] = [];
                let failedCount = 0;
                for (const token of rawTokens) {
                    const cleanToken = token.trim().replace(/^"|"$/g, '');
                    const info = await getCheckTokenInfo(cleanToken);
                    if (info) validTokens.push(cleanToken);
                    else failedCount++;
                    await new Promise(r => setTimeout(r, 200)); 
                }

                if (validTokens.length === 0) {
                    sendBotMessage(ctx.channel.id, { content: `❌ 0 Token valide.` });
                    return;
                }

                const initialState: QueueState = {
                    tokens: validTokens,
                    totalValids: validTokens.length,
                    totalInvalids: failedCount,
                    current: 1,
                    channelId: ctx.channel.id 
                };
                accessStorage("WRITE", initialState);
                
                sendBotMessage(ctx.channel.id, {
                    embeds: [{
                        title: "🚀 Rapport & Lancement",
                        description: "La rotation automatique commence.",
                        color: 0x00FF00,
                        fields: [
                            { name: "✅ Valides", value: `${validTokens.length}`, inline: true },
                            { name: "❌ Invalides", value: `${failedCount}`, inline: true }
                        ]
                    }]
                });
                setTimeout(() => { processNextRotation(); }, 2000);
            }
        },

        // 2. MASS JOIN (Rejoint le code mass join)
        {
            name: "massjoin",
            description: "Join server with multiple tokens",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                { name: "invite", description: "Invite link/code", type: 3, required: true },
                { name: "tokens", description: "List of tokens", type: 3, required: true }
            ],
            execute: async (args, ctx) => {
                const code = parseInviteCode(args[0].value as string);
                const tokens = (args[1].value as string).split(/[\r\n\s,]+/).filter(t => t.length > 20);

                if (!code) { sendBotMessage(ctx.channel.id, { content: "❌ Code d'invitation invalide." }); return; }
                if (tokens.length === 0) { sendBotMessage(ctx.channel.id, { content: "❌ Aucun token." }); return; }

                sendBotMessage(ctx.channel.id, { content: `🚀 Mass Join sur **${code}** avec **${tokens.length}** tokens...` });

                let stats = { success: 0, captcha: 0, failed: 0 };
                for (const token of tokens) {
                    const result = await executeJoin(token, code);
                    if (result === "SUCCESS") { stats.success++; console.log("%c[+] Join OK", "color: green"); }
                    else if (result === "CAPTCHA") { stats.captcha++; console.log("%c[!] Captcha", "color: orange"); }
                    else { stats.failed++; console.log("%c[-] Fail", "color: red"); }
                    await new Promise(r => setTimeout(r, DELAY_JOIN_MS));
                }

                sendBotMessage(ctx.channel.id, {
                    embeds: [{
                        title: "📊 Mass Join Report",
                        description: `Invitation: ${code}`,
                        color: 0x5865F2,
                        fields: [
                            { name: "✅ Success", value: `${stats.success}`, inline: true },
                            { name: "⚠️ Captcha", value: `${stats.captcha}`, inline: true },
                            { name: "❌ Failed", value: `${stats.failed}`, inline: true }
                        ]
                    }]
                });
            }
        },

        // 3. TOKEN LOGIN (Login simple)
        {
            name: "tokenlogin",
            description: "Instant login with one token",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{ name: "token", description: "Token", type: 3, required: true }],
            execute: async (args, ctx) => {
                const token = (args[0].value as string).trim().replace(/['"]/g, '');
                
                sendBotMessage(ctx.channel.id, { content: "🔍 Vérification du token..." });
                const info = await getCheckTokenInfo(token);

                if (info) {
                    accessStorage("DELETE"); // On vide la queue si on force un login
                    sendBotMessage(ctx.channel.id, { content: `✅ **${info.username}** trouvé. Connexion...` });
                    injectTokenAndReload(token);
                } else {
                    sendBotMessage(ctx.channel.id, { content: "❌ Token invalide." });
                }
            }
        },

        // 4. STOP (Arrêt d'urgence)
        {
            name: "stoplogin",
            description: "🔴 STOP ROTATION",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: async (_, ctx) => {
                stopRotation("Commande");
                sendBotMessage(ctx.channel.id, { content: "🛑 Rotation stoppée." });
            }
        }
    ],
});