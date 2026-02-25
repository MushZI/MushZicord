/**
 * @name TokenLoginManager
 * @description Suite Complète : Multitoken (Scan+Stop), MassJoin & TokenLogin.
 * @author mushzi
 * @version 4.0.0
 */

import "./styles.css";

import { DataStore } from "@api/index";
import { SafetyIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { EquicordDevs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import * as Modal from "@utils/modal";
import definePlugin from "@utils/types";
import { Flex } from "@components/Flex";
import { Button, React, Text, TextInput } from "@webpack/common";
import { findByProps } from "@webpack";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

// --- MODULES INTERNES (Code 2) ---
const Toasts = findByProps("show", "pop");
const ComponentDispatch = findByProps("ComponentDispatch")?.ComponentDispatch;

// --- CONFIGURATION (Code 2) ---
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

// ==========================================
// ====== UTILITAIRES & UI DU CODE 1 ========
// ==========================================

const loginWithToken = (token: string) => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const { contentWindow } = iframe;
    if (contentWindow) {
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);
        setTimeout(() => { location.reload(); }, 2500);
    } else {
        console.error("Failed to access iframe contentWindow");
    }
};

const joinServerWithToken = async (token: string, inviteCode: string) => {
    try {
        // Créer un iframe temporaire pour le token
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const { contentWindow } = iframe;

        if (!contentWindow) {
            throw new Error("Failed to create iframe");
        }

        // Appliquer le token
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        // Attendre que le token soit appliqué
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Joindre le serveur via l'iframe
        const response = await contentWindow.fetch(`https://discord.com/api/v9/invites/${inviteCode}`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "X-Super-Properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImZyLUZSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI0MDk5OSwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=",
                "X-Discord-Locale": "fr",
                "X-Debug-Options": "bugReporterEnabled",
                "Accept-Language": "fr-FR,fr;q=0.9",
                "Accept": "*/*",
                "Origin": "https://discord.com",
                "Referer": "https://discord.com/channels/@me",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "TE": "trailers"
            },
            body: JSON.stringify({
                session_id: crypto.randomUUID()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error(`Failed to join server: ${response.status} ${response.statusText}`, errorData);
            throw new Error(`Failed to join server: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Successfully joined server:", data);

        // Nettoyer l'iframe
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);

        return true;
    } catch (error) {
        console.error("Error joining server:", error);
        return false;
    }
};

interface Account {
    id: string;
    token: string;
    username: string;
}

const getAccountInfo = async (token: string) => {
    try {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const { contentWindow } = iframe;

        if (!contentWindow) {
            throw new Error("Failed to create iframe");
        }

        // Appliquer le token
        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        // Attendre que le token soit appliqué
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Récupérer les informations du compte
        const response = await contentWindow.fetch("https://discord.com/api/v9/users/@me", {
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Invalid token: ${response.status}`);
        }

        const data = await response.json();

        // Nettoyer l'iframe
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);

        return {
            username: data.username,
            discriminator: data.discriminator,
            valid: true
        };
    } catch (error) {
        console.error("Error fetching account info:", error);
        return { valid: false };
    }
};

class TokenLoginManager {
    public accounts: Record<string, Account> = {};

    async init() {
        const stored = await DataStore.get("tokenLoginManager.data");
        if (stored) {
            this.accounts = stored;
        }
    }

    async save() {
        await DataStore.set("tokenLoginManager.data", this.accounts);
    }

    async addAccount(account: Omit<Account, "id">) {
        const id = crypto.randomUUID();
        this.accounts[id] = { ...account, id };
        await this.save();
    }

    deleteAccount(id: string) {
        delete this.accounts[id];
        this.save();
    }

    async importFromFile(file: File) {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        let counter = 1;
        let successCount = 0;
        let failCount = 0;
        let invalidCount = 0;

        for (const line of lines) {
            const token = line.trim();
            if (token) {
                try {
                    const accountInfo = await getAccountInfo(token);
                    if (accountInfo.valid) {
                        await this.addAccount({
                            username: `${accountInfo.username}#${accountInfo.discriminator}`,
                            token
                        });
                        successCount++;
                        console.log(`Successfully imported account: ${accountInfo.username}#${accountInfo.discriminator}`);
                    } else {
                        console.log(`Skipping invalid token at line ${counter}`);
                        invalidCount++;
                    }
                } catch (error) {
                    console.error(`Failed to import token ${counter}:`, error);
                    failCount++;
                }
                counter++;
                // Attendre un peu entre chaque token pour éviter le rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`Import completed. Success: ${successCount}, Invalid: ${invalidCount}, Failed: ${failCount}`);
        return { successCount, invalidCount, failCount };
    }

    async joinAllToServer(inviteCode: string) {
        let successCount = 0;
        let failCount = 0;

        for (const account of Object.values(this.accounts)) {
            console.log(`Attempting to join with account: ${account.username}`);
            const success = await joinServerWithToken(account.token, inviteCode);

            if (success) {
                successCount++;
                console.log(`Successfully joined with ${account.username}`);
            } else {
                failCount++;
                console.log(`Failed to join with ${account.username}`);
            }

            // Attendre un peu entre chaque token pour éviter le rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`Join process completed. Success: ${successCount}, Failed: ${failCount}`);
        return { successCount, failCount };
    }
}

const AddAccountModal = ({ manager, onClose, ...props }: Modal.ModalProps & {
    manager: TokenLoginManager;
    onClose: () => void;
}) => {
    const [token, setToken] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const handleAddAccount = async () => {
        if (!token) return;

        setIsLoading(true);
        setError("");

        const accountInfo = await getAccountInfo(token);
        if (accountInfo.valid) {
            await manager.addAccount({
                username: `${accountInfo.username}#${accountInfo.discriminator}`,
                token
            });
            onClose();
        } else {
            setError("Token invalide");
        }
        setIsLoading(false);
    };

    return (
        <Modal.ModalRoot {...props}>
            <Modal.ModalHeader separator={false}>
                <Text variant="heading-lg/semibold">Add Account</Text>
            </Modal.ModalHeader>
            <Modal.ModalContent className="token-login-modal-content">
                <div className="token-login-section">
                    <Text variant="heading-sm/medium" style={{ marginBottom: "8px" }}>Token</Text>
                    <TextInput
                        placeholder="User Token"
                        value={token}
                        onChange={e => setToken(e)}
                    />
                    {error && (
                        <Text style={{ color: "var(--text-danger)", marginTop: "8px" }}>
                            {error}
                        </Text>
                    )}
                </div>
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justifyContent="flex-end" gap={10}>
                    <Button
                        color={Button.Colors.BRAND}
                        disabled={!token || isLoading}
                        onClick={handleAddAccount}
                    >
                        {isLoading ? "Loading..." : "Save"}
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                </Flex>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
};

const AccountEntryComponent = ({ account, manager, onDelete }: {
    account: Account;
    manager: TokenLoginManager;
    onDelete: () => void;
}) => {
    const [showToken, setShowToken] = React.useState(false);

    return (
        <div className="account-entry" key={account.id}>
            <div>
                <Text variant="heading-sm/medium">{account.username}</Text>
                <Text className="token-field">{showToken ? account.token : "••••••••••••••••"}</Text>
            </div>
            <div className="account-actions">
                <Button
                    size={Button.Sizes.SMALL}
                    onClick={() => setShowToken(!showToken)}
                >
                    {showToken ? "Hide Token" : "Show Token"}
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.BRAND}
                    onClick={() => loginWithToken(account.token)}
                >
                    Login
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    onClick={() => {
                        manager.deleteAccount(account.id);
                        onDelete();
                    }}
                >
                    Delete
                </Button>
            </div>
        </div>
    );
};

const JoinServerModal = ({ manager, onClose, ...props }: Modal.ModalProps & {
    manager: TokenLoginManager;
    onClose: () => void;
}) => {
    const [inviteCode, setInviteCode] = React.useState("");
    const [isJoining, setIsJoining] = React.useState(false);
    const [status, setStatus] = React.useState("");

    return (
        <Modal.ModalRoot {...props}>
            <Modal.ModalHeader separator={false}>
                <Text variant="heading-lg/semibold">Join Server</Text>
            </Modal.ModalHeader>
            <Modal.ModalContent className="token-login-modal-content">
                <div className="token-login-section">
                    <Text variant="heading-sm/medium" style={{ marginBottom: "8px" }}>Code d'invitation</Text>
                    <TextInput
                        placeholder="Entrez le code d'invitation (sans discord.gg/)"
                        value={inviteCode}
                        onChange={e => setInviteCode(e)}
                    />
                </div>
                {status && (
                    <div className="token-login-section">
                        <Text variant="text-sm/medium" style={{ color: status.includes("Failed") ? "var(--text-danger)" : "var(--text-positive)" }}>
                            {status}
                        </Text>
                    </div>
                )}
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justifyContent="flex-end" gap={10}>
                    <Button
                        color={Button.Colors.BRAND}
                        disabled={!inviteCode || isJoining}
                        onClick={async () => {
                            setIsJoining(true);
                            setStatus("Joining servers...");
                            const result = await manager.joinAllToServer(inviteCode);
                            setStatus(`Completed: ${result.successCount} succeeded, ${result.failCount} failed`);
                            setIsJoining(false);
                            setTimeout(() => onClose(), 2000);
                        }}
                    >
                        {isJoining ? "Joining..." : "Join Server"}
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                </Flex>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
};

class TokenLoginManagerUI {
    private manager: TokenLoginManager;
    private forceUpdate: () => void;

    constructor(manager: TokenLoginManager) {
        this.manager = manager;
        this.forceUpdate = () => { };
    }

    render = () => {
        const [, setUpdateKey] = React.useState({});
        this.forceUpdate = () => setUpdateKey({});

        const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                const result = await this.manager.importFromFile(file);
                console.log(`Import completed. Success: ${result.successCount}, Invalid: ${result.invalidCount}, Failed: ${result.failCount}`);
                this.forceUpdate();
            }
        };

        return (
            <div className="token-login-container">
                <Flex justifyContent="space-between" alignItems="center">
                    <Text variant="heading-lg/semibold">Token Login Manager</Text>
                    <Flex gap={10}>
                        <Button
                            onClick={() => {
                                Modal.openModal(props => (
                                    <JoinServerModal
                                        {...props}
                                        manager={this.manager}
                                        onClose={() => {
                                            props.onClose();
                                            this.forceUpdate();
                                        }}
                                    />
                                ));
                            }}
                        >
                            Join All to Server
                        </Button>
                        <Button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.txt';
                                input.onchange = (e) => handleFileUpload(e as any);
                                input.click();
                            }}
                        >
                            Import Tokens
                        </Button>
                        <Button
                            onClick={() => {
                                Modal.openModal(props => (
                                    <AddAccountModal
                                        {...props}
                                        manager={this.manager}
                                        onClose={() => {
                                            props.onClose();
                                            this.forceUpdate();
                                        }}
                                    />
                                ));
                            }}
                        >
                            Add Account
                        </Button>
                    </Flex>
                </Flex>
                {Object.values(this.manager.accounts).map(account => (
                    <AccountEntryComponent
                        key={account.id}
                        account={account}
                        manager={this.manager}
                        onDelete={this.forceUpdate}
                    />
                ))}
            </div>
        );
    };
}

let tokenLoginManager: TokenLoginManager | null = null;

const TokenLoginManagerPage: React.ComponentType = () => {
    const [manager] = React.useState(() => {
        if (!tokenLoginManager) {
            tokenLoginManager = new TokenLoginManager();
            tokenLoginManager.init();
        }
        return tokenLoginManager;
    });

    const ui = React.useMemo(() => new TokenLoginManagerUI(manager), [manager]);

    return ui.render();
};

// ==========================================
// ====== UTILITAIRES DU CODE 2 =============
// ==========================================

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

// --- LOGIQUE MULTITOKEN (Code 2) ---

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

// ==========================================
// ====== DÉFINITION DU PLUGIN (FUSION) =====
// ==========================================

export default definePlugin({
    // Les métadonnées sont celles du deuxième code comme demandé
    name: "Token Login Manager",
    description: "Complete Suite: Multitoken, MassJoin, TokenLogin",
    authors: [{ name: "mushzi", id: 0n }],
    dependencies: ["CommandsAPI"], 

    async start() {
        // ---- INITIALISATION DU CODE 1 (UI Settings) ----
        if (!tokenLoginManager) {
            tokenLoginManager = new TokenLoginManager();
            await tokenLoginManager.init();
        }

        SettingsPlugin.customEntries.push({
            key: "token_login_manager",
            title: "Token Login Manager",
            Component: TokenLoginManagerPage,
            Icon: SafetyIcon
        });

        // ---- INITIALISATION DU CODE 2 (Commandes et Rotation) ----
        if (ComponentDispatch) {
            this.onInteraction = (e: any) => {
                if (e.data && e.data.custom_id === "mushzi_stop_btn") {
                    stopRotation("Bouton Chat");
                    try { e.respond({ type: 6 }); } catch {} 
                }
            };
            ComponentDispatch.subscribe("COMPONENT_INTERACTION_CREATE", this.onInteraction);
        }

        // Reprise automatique après reload (Code 2)
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
        // ---- ARRÊT DU CODE 1 ----
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "token_login_manager");
        tokenLoginManager = null;

        // ---- ARRÊT DU CODE 2 ----
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