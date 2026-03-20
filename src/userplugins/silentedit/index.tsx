// @ts-nocheck
/**
 * @name SilentEdit
 * @description "Silently" edit a message without showing the edit tag and bypass Vencord's message logger.
 * @author Aurick
 * @version 1.0.1
 */

import { addMessagePopoverButton as addButton, removeMessagePopoverButton as removeButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { ChannelStore, UserStore, React } from "@webpack/common";

// API 2026 - Récupération sécurisée des modules de communication
const RestAPI = findByProps("post", "put", "del");
const Constants = findByProps("Endpoints", "Status");
const MessageActions = findByProps("editMessage", "startEditMessage");

const settings = definePluginSettings({
    deleteOriginalMessage: {
        type: OptionType.BOOLEAN,
        description: "Delete the original server-side message after silent edit.",
        default: true
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: "Delay (ms) before deleting the original message.",
        default: 500
    },
    suppressNotifications: {
        type: OptionType.BOOLEAN,
        description: "Recommended for DMs to prevent pinging.",
        default: false
    },
    accentColor: {
        type: OptionType.STRING,
        description: "Accent color for the icon (hex).",
        default: "#ed4245"
    }
});

const SilentEditIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={settings.store.accentColor || "#ed4245"}>
        <path d="M19.2929 9.8299L19.9409 9.18278C21.353 7.77064 21.353 5.47197 19.9409 4.05892C18.5287 2.64678 16.2292 2.64678 14.817 4.05892L14.1699 4.70694L19.2929 9.8299ZM12.8962 5.97688L5.18469 13.6906L10.3085 18.813L18.0201 11.0992L12.8962 5.97688ZM4.11851 20.9704L8.75906 19.8112L4.18692 15.239L3.02678 19.8796C2.95028 20.1856 3.04028 20.5105 3.26349 20.7337C3.48669 20.9569 3.8116 21.046 4.11851 20.9704Z" />
    </svg>
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sendMessage(content: string, nonce: string, channelId: string, suppressNotifications: boolean, messageReference?: any) {
    const body: any = {
        content,
        flags: suppressNotifications ? 4096 : 0,
        mobile_network_type: "unknown",
        nonce,
        tts: false,
    };

    if (messageReference) {
        body.message_reference = {
            channel_id: messageReference.channel_id,
            message_id: messageReference.message_id,
            guild_id: messageReference.guild_id
        };
    }

    return RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body
    });
}

function deleteMessage(channelId: string, messageId: string) {
    return RestAPI.del({
        url: Constants.Endpoints.MESSAGE(channelId, messageId)
    });
}

export default definePlugin({
    name: "SilentEdit",
    description: "Edit a message without the (edited) tag by sending a new one and deleting the old one.",
    authors: [{ name: "Aurick", id: 1348025017233047634n }, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["MessagePopoverAPI"],
    settings,

    start() {
        addButton("SilentEdit", msg => {
            // Uniquement nos propres messages
            if (msg.author.id !== UserStore.getCurrentUser()?.id) return null;

            const handleClick = async () => {
                // Ouvre l'interface de modification Discord
                MessageActions.startEditMessage(msg.channel_id, msg.id, msg.content);

                // Sauvegarde de la fonction originale
                const originalEditMessage = MessageActions.editMessage;

                // On "détourne" temporairement la fonction d'envoi de modification
                MessageActions.editMessage = async function(channelId: string, messageId: string, content: any) {
                    // On remet la fonction originale immédiatement après l'interception
                    MessageActions.editMessage = originalEditMessage;

                    // Si ce n'est pas le message qu'on veut éditer silencieusement, on laisse faire normalement
                    if (messageId !== msg.id) {
                        return originalEditMessage.apply(this, arguments);
                    }

                    try {
                        // On envoie le nouveau message à la place de l'édit
                        await sendMessage(
                            content.content,
                            msg.id,
                            channelId,
                            settings.store.suppressNotifications,
                            msg.messageReference
                        );

                        await sleep(settings.store.deleteDelay);

                        // On supprime l'original si l'option est active
                        if (settings.store.deleteOriginalMessage) {
                            await deleteMessage(channelId, messageId);
                        }
                    } catch (error) {
                        console.error("[SilentEdit] API Error:", error);
                    }
                };
            };

            return {
                label: "Silent Edit",
                icon: SilentEditIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: handleClick
            };
        });
    },

    stop() {
        removeButton("SilentEdit");
    }
});