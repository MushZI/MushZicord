import definePlugin from "@utils/types";
import { findByProps } from "@webpack";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { React, ContextMenuApi, Menu } from "@webpack/common";

let originalVoiceStateUpdate: any;

// État initial au démarrage
let isGhostActive = false;
let configFakeMute = true;   // Par défaut : Activé
let configFakeDeafen = true; // Par défaut : Activé

const refreshVoiceState = () => {
    const SelectedChannelStore = findByProps("getVoiceChannelId");
    const VoiceStateActions = findByProps("toggleSelfMute");
    if (VoiceStateActions && SelectedChannelStore?.getVoiceChannelId()) {
        VoiceStateActions.toggleSelfMute();
        VoiceStateActions.toggleSelfMute();
    }
};

// --- ICÔNE : FANTÔME ARRONDI SANS BOUCHE ---
function FakeDeafenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C7.58 2 4 5.58 4 10V19C4 20.66 5.34 22 7 22C8.66 22 10 20.66 10 19C10 20.66 11.34 22 13 22C14.66 22 16 20.66 16 19C16 20.66 17.34 22 19 22C20.66 22 22 20.66 22 19V10C22 5.58 18.42 2 14 2H10H12Z" fill="currentColor" />
            <circle cx="8.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            <circle cx="15.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            {isGhostActive && (
                <path d="M2 2L22 22" stroke="#ed4245" strokeWidth="2.5" strokeLinecap="round" />
            )}
        </svg>
    );
}

// --- MENU CLIC DROIT ---
function GhostContextMenu() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    return (
        <Menu.Menu navId="fake-voice-menu" aria-label="Configuration Fake Voice">
            <Menu.MenuGroup label="Options du Fantôme">
                <Menu.MenuCheckboxItem
                    id="opt-both"
                    label="Fake Mute & Deafen"
                    checked={configFakeMute && configFakeDeafen}
                    action={() => {
                        const nextState = !(configFakeMute && configFakeDeafen);
                        configFakeMute = nextState;
                        configFakeDeafen = nextState;
                        if (isGhostActive) refreshVoiceState();
                        forceUpdate();
                    }}
                />
                <Menu.MenuSeparator />
                <Menu.MenuCheckboxItem
                    id="opt-mute"
                    label="Fake Mute"
                    checked={configFakeMute}
                    action={() => {
                        configFakeMute = !configFakeMute;
                        if (isGhostActive) refreshVoiceState();
                        forceUpdate();
                    }}
                />
                <Menu.MenuCheckboxItem
                    id="opt-deafen"
                    label="Fake Deafen"
                    checked={configFakeDeafen}
                    action={() => {
                        configFakeDeafen = !configFakeDeafen;
                        if (isGhostActive) refreshVoiceState();
                        forceUpdate();
                    }}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

// --- BOUTON INTERFACE ---
function FakeDeafenUserButton({ iconForeground, nameplate }: UserAreaRenderProps) {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    return (
        <UserAreaButton
            onClick={() => {
                isGhostActive = !isGhostActive;
                refreshVoiceState();
                forceUpdate();
            }}
            onContextMenu={(e) => ContextMenuApi.openContextMenu(e, () => <GhostContextMenu />)}
            tooltipText={isGhostActive ? "Désactiver Fake Voice" : "Activer Fake Voice (Droit: Config)"}
            icon={<FakeDeafenIcon className={iconForeground} />}
            plated={nameplate != null}
            style={{ color: isGhostActive ? "#ed4245" : "inherit" }}
        />
    );
}

export default definePlugin({
    name: "Fake Voice Option",
    description: "Apparaissez mute ou sourd tout en écoutant. Par mushzi.",
    authors: [{ name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI"],

    userAreaButton: {
        render: FakeDeafenUserButton
    },

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakemute",
            description: "Toggle Fake Mute",
            execute: async (_, ctx) => {
                configFakeMute = !configFakeMute;
                isGhostActive = configFakeMute;
                refreshVoiceState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Mute** est ${isGhostActive ? "activé" : "désactivé"}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen",
            description: "Toggle Fake Deafen",
            execute: async (_, ctx) => {
                configFakeDeafen = !configFakeDeafen;
                isGhostActive = configFakeDeafen;
                refreshVoiceState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen** est ${isGhostActive ? "activé" : "désactivé"}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen_mute",
            description: "Toggle Fake Deafen & Mute simultanément",
            execute: async (_, ctx) => {
                const next = !(configFakeMute && configFakeDeafen);
                configFakeMute = next;
                configFakeDeafen = next;
                isGhostActive = next;
                refreshVoiceState();
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen & Mute** sont ${isGhostActive ? "activés" : "désactivés"}.` });
            },
        },
    ],

    start() {
        const GatewayConnection = findByProps("voiceStateUpdate");
        if (GatewayConnection) {
            originalVoiceStateUpdate = GatewayConnection.voiceStateUpdate;
            GatewayConnection.voiceStateUpdate = function (args: any) {
                if (args && isGhostActive) {
                    if (configFakeMute) args.selfMute = true;
                    if (configFakeDeafen) args.selfDeaf = true;
                }
                return originalVoiceStateUpdate.apply(this, arguments);
            };
        }
    },

    stop() {
        const GatewayConnection = findByProps("voiceStateUpdate");
        if (GatewayConnection && originalVoiceStateUpdate) {
            GatewayConnection.voiceStateUpdate = originalVoiceStateUpdate;
        }
    }
});