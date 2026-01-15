import definePlugin from "@utils/types";
import { findByProps } from "@webpack";
// On utilise les mêmes imports que ton plugin ChatGPT pour la compatibilité
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";

let originalVoiceStateUpdate: any;
let fakeDeafenEnabled = false;

export default definePlugin({
    name: "FakeDeafen",
    description: "Apparaissez sourd et muet tout en continuant d'écouter.",
    authors: [{ name: "hyyven", id: 449282863582412850n }],
    // Dépendance nécessaire pour utiliser @api/Commands comme dans ChatGPT
    dependencies: ["CommandsAPI"], 

    commands: [
        {
            // C'EST LA LIGNE MAGIQUE QUI EMPÊCHE L'ENVOI DANS LE CHAT
            inputType: ApplicationCommandInputType.BUILT_IN,
            
            name: "fakedeafen",
            description: "Activer/Désactiver le Fake Deafen",
            options: [],
            execute: async (_, ctx) => {
                try {
                    // 1. Récupération des modules internes
                    const SelectedChannelStore = findByProps("getVoiceChannelId");
                    const VoiceStateActions = findByProps("toggleSelfMute");

                    // 2. Vérification : Es-tu en vocal ?
                    const channelId = SelectedChannelStore?.getVoiceChannelId();
                    if (!channelId) {
                        sendBotMessage(ctx.channel.id, {
                            content: "❌ **Erreur :** Tu dois être dans un salon vocal !"
                        });
                        return;
                    }

                    // 3. Bascule du mode
                    fakeDeafenEnabled = !fakeDeafenEnabled;

                    // 4. Mise à jour fluide (Double mute pour rafraîchir le statut)
                    if (VoiceStateActions) {
                        VoiceStateActions.toggleSelfMute();
                        VoiceStateActions.toggleSelfMute();
                    }

                    // 5. Envoi du message Clyde (Local uniquement)
                    const messageContent = fakeDeafenEnabled 
                        ? "✅ **Fake Deafen activé.** Tes amis te voient sourd et muet (mais tu entends tout)." 
                        : "ℹ️ **Fake Deafen désactivé.** Retour à la normale.";

                    sendBotMessage(ctx.channel.id, {
                        content: messageContent
                    });

                } catch (err) {
                    console.error("[FakeDeafen] Erreur :", err);
                    sendBotMessage(ctx.channel.id, {
                        content: "❌ Une erreur interne est survenue."
                    });
                }
            },
        },
    ],

    // Le patch qui permet de mentir au serveur (reste identique car il fonctionnait)
    start() {
        const GatewayConnection = findByProps("voiceStateUpdate");
        if (GatewayConnection) {
            originalVoiceStateUpdate = GatewayConnection.voiceStateUpdate;
            GatewayConnection.voiceStateUpdate = function (args: any) {
                if (fakeDeafenEnabled && args) {
                    args.selfMute = true;
                    args.selfDeaf = true;
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