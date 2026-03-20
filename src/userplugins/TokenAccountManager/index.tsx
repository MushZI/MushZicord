// @ts-nocheck
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
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import * as Modal from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Flex } from "@components/Flex";
import { Button, React, Text, TextInput } from "@webpack/common";
import { findByProps } from "@webpack";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

// --- MODULES INTERNES ---
const Toasts = findByProps("show", "pop");
const ComponentDispatch = findByProps("ComponentDispatch")?.ComponentDispatch;

// --- CONFIGURATION ---
const STORAGE_KEY = "Mushzi_CompleteSuite"; 
const DELAY_LOGIN_MS = 4000;
const DELAY_JOIN_MS = 1500;

interface QueueState {
    tokens: string[];
    totalValids: number;
    totalInvalids: number;
    current: number;
    channelId: string; 
}

// ==========================================
// ====== UTILITAIRES & UI ==================
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
    }
};

const joinServerWithToken = async (token: string, inviteCode: string) => {
    try {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const { contentWindow } = iframe;
        if (!contentWindow) throw new Error("Iframe error");

        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await contentWindow.fetch(`https://discord.com/api/v9/invites/${inviteCode}`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id: crypto.randomUUID() })
        });

        if (!response.ok) throw new Error("Join failed");

        setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        return true;
    } catch (error) {
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
        if (!contentWindow) throw new Error("Iframe error");

        setInterval(() => {
            contentWindow.localStorage.token = `"${token}"`;
        }, 50);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await contentWindow.fetch("https://discord.com/api/v9/users/@me", {
            headers: { "Authorization": token, "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error("Token error");
        const data = await response.json();

        setTimeout(() => { document.body.removeChild(iframe); }, 1000);

        return {
            username: data.username,
            discriminator: data.discriminator,
            valid: true
        };
    } catch (error) {
        return { valid: false };
    }
};

class TokenLoginManager {
    public accounts: Record<string, Account> = {};

    async init() {
        const stored = await DataStore.get("tokenLoginManager.data");
        if (stored) this.accounts = stored;
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
        let successCount = 0;

        for (const line of lines) {
            const token = line.trim();
            if (token) {
                const accountInfo = await getAccountInfo(token);
                if (accountInfo.valid) {
                    await this.addAccount({
                        username: `${accountInfo.username}#${accountInfo.discriminator}`,
                        token
                    });
                    successCount++;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return { successCount };
    }

    async joinAllToServer(inviteCode: string) {
        let successCount = 0;
        let failCount = 0;
        for (const account of Object.values(this.accounts)) {
            const success = await joinServerWithToken(account.token, inviteCode);
            if (success) successCount++; else failCount++;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
                        onChange={setToken}
                    />
                    {error && <Text style={{ color: "var(--text-danger)", marginTop: "8px" }}>{error}</Text>}
                </div>
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justifyContent="flex-end" gap={10}>
                    <Button color={Button.Colors.BRAND} disabled={!token || isLoading} onClick={handleAddAccount}>
                        {isLoading ? "Loading..." : "Save"}
                    </Button>
                    <Button color={Button.Colors.TRANSPARENT} onClick={onClose}>Cancel</Button>
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
                <Button size={Button.Sizes.SMALL} onClick={() => setShowToken(!showToken)}>
                    {showToken ? "Hide Token" : "Show Token"}
                </Button>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={() => loginWithToken(account.token)}>Login</Button>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => { manager.deleteAccount(account.id); onDelete(); }}>Delete</Button>
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
                    <TextInput placeholder="Entrez le code" value={inviteCode} onChange={setInviteCode} />
                </div>
                {status && <Text style={{ marginTop: "8px" }}>{status}</Text>}
            </Modal.ModalContent>
            <Modal.ModalFooter className="token-login-footer">
                <Flex justifyContent="flex-end" gap={10}>
                    <Button color={Button.Colors.BRAND} disabled={!inviteCode || isJoining} onClick={async () => {
                        setIsJoining(true);
                        const result = await manager.joinAllToServer(inviteCode);
                        setStatus(`Completed: ${result.successCount} ok`);
                        setIsJoining(false);
                        setTimeout(onClose, 2000);
                    }}>Join All</Button>
                    <Button color={Button.Colors.TRANSPARENT} onClick={onClose}>Cancel</Button>
                </Flex>
            </Modal.ModalFooter>
        </Modal.ModalRoot>
    );
};

class TokenLoginManagerUI {
    private manager: TokenLoginManager;
    private forceUpdate: () => void;
    constructor(manager: TokenLoginManager) { this.manager = manager; this.forceUpdate = () => { }; }

    render = () => {
        const [, setUpdateKey] = React.useState({});
        this.forceUpdate = () => setUpdateKey({});

        return (
            <div className="token-login-container">
                <Flex justifyContent="space-between" alignItems="center">
                    <Text variant="heading-lg/semibold">Token Login Manager</Text>
                    <Flex gap={10}>
                        <Button onClick={() => Modal.openModal(props => <JoinServerModal {...props} manager={this.manager} onClose={() => { props.onClose(); this.forceUpdate(); }} />)}>Join All</Button>
                        <Button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.onchange = (e: any) => this.manager.importFromFile(e.target.files[0]).then(() => this.forceUpdate()); input.click(); }}>Import</Button>
                        <Button onClick={() => Modal.openModal(props => <AddAccountModal {...props} manager={this.manager} onClose={() => { props.onClose(); this.forceUpdate(); }} />)}>Add Account</Button>
                    </Flex>
                </Flex>
                {Object.values(this.manager.accounts).map(account => <AccountEntryComponent key={account.id} account={account} manager={this.manager} onDelete={this.forceUpdate} />)}
            </div>
        );
    };
}

let tokenLoginManager: TokenLoginManager | null = null;
const TokenLoginManagerPage: React.ComponentType = () => {
    const [manager] = React.useState(() => {
        if (!tokenLoginManager) { tokenLoginManager = new TokenLoginManager(); tokenLoginManager.init(); }
        return tokenLoginManager;
    });
    const ui = React.useMemo(() => new TokenLoginManagerUI(manager), [manager]);
    return ui.render();
};

const accessStorage = (action: string, payload: any = null) => {
    try {
        const frame = document.createElement("iframe");
        frame.style.display = "none";
        document.body.appendChild(frame);
        const storage = frame.contentWindow?.localStorage;
        let result = null;
        if (storage) {
            if (action === "WRITE") storage.setItem(STORAGE_KEY, JSON.stringify(payload));
            else if (action === "READ") result = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
            else if (action === "DELETE") storage.removeItem(STORAGE_KEY);
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
        const interval = setInterval(() => { contentWindow.localStorage.setItem("token", `"${cleanToken}"`); }, 50);
        setTimeout(() => { clearInterval(interval); location.reload(); }, 1500);
    }
};

const getCheckTokenInfo = async (token: string) => {
    try {
        const req = await fetch("https://discord.com/api/v9/users/@me", { headers: { Authorization: token.trim().replace(/['"]/g, '') } });
        if (!req.ok) return null;
        return await req.json();
    } catch { return null; }
};

const stopRotation = (context: string) => {
    accessStorage("DELETE");
    if (Toasts) Toasts.show({ message: `Rotation stoppée!`, type: "error" });
};

const processNextRotation = async () => {
    const state = accessStorage("READ");
    if (!state || state.tokens.length === 0) { accessStorage("DELETE"); return; }
    const nextToken = state.tokens.shift();
    accessStorage("WRITE", { ...state, tokens: state.tokens, current: state.current + 1 });
    if (nextToken) injectTokenAndReload(nextToken);
};

export default definePlugin({
    name: "Token Login Manager",
    description: "Complete Suite: Multitoken, MassJoin, TokenLogin",
    authors: [{ name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI"], 

    async start() {
        if (!tokenLoginManager) { tokenLoginManager = new TokenLoginManager(); await tokenLoginManager.init(); }
        SettingsPlugin.customEntries.push({ key: "token_login_manager", title: "Token Login Manager", Component: TokenLoginManagerPage, Icon: SafetyIcon });
        
        setTimeout(() => { if (accessStorage("READ")) processNextRotation(); }, 5000); 
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "token_login_manager");
    },

    commands: [
        {
            name: "multitoken",
            description: "Rotate tokens",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{ name: "tokens", description: "Tokens", type: 3, required: true }],
            execute: async (args, ctx) => {
                const tokens = (args[0].value as string).split(/[\r\n\s,]+/).filter(t => t.length > 20);
                if (tokens.length === 0) return;
                accessStorage("WRITE", { tokens, current: 1, channelId: ctx.channel.id });
                processNextRotation();
            }
        }
    ],
});