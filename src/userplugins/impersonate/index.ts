// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType, sendBotMessage, Argument, CommandContext } from "@api/Commands";
import { ApplicationCommandInputType } from "@api/Commands/types";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByProps } from "@webpack";
import { FluxDispatcher, UserStore, DraftType, MessageActions } from "@webpack/common";

const logger = new Logger("Impersonate");

// API 2026 - Accès stable aux uploads
const UploadStore = findByProps("getUpload", "getUploads");

async function resolveFile(options: Argument[], ctx: CommandContext): Promise<File | null> {
    const opt = options.find(o => o.name === "image");
    if (opt) {
        const upload = UploadStore.getUpload(ctx.channel.id, opt.name, DraftType.SlashCommand);
        return upload?.item?.file || null;
    }
    return null;
}

export default definePlugin({
    name: "Impersonate",
    description: "Impersonate a user locally and have them 'send' a message on your client.",
    authors: [Devs.BigDuck, { name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "impersonate",
            description: "Impersonate a user.",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    type: ApplicationCommandOptionType.USER,
                    name: "user",
                    description: "The user you wish to impersonate.",
                    required: true
                },
                {
                    type: ApplicationCommandOptionType.STRING,
                    name: "message",
                    description: "The message content.",
                    required: true
                },
                {
                    type: ApplicationCommandOptionType.CHANNEL,
                    name: "channel",
                    description: "Channel (optional).",
                    required: false
                },
                {
                    type: ApplicationCommandOptionType.INTEGER,
                    name: "delay",
                    description: "Delay in seconds.",
                    required: false
                },
                {
                    type: ApplicationCommandOptionType.ATTACHMENT,
                    name: "image",
                    description: "Image to attach.",
                    required: false
                }
            ],
            execute: async (args, ctx) => {
                try {
                    const channelId = args.find(x => x.name === "channel")?.value ?? ctx.channel.id;
                    const content = args.find(x => x.name === "message")?.value ?? "";
                    const delay = args.find(x => x.name === "delay")?.value ?? 0.5;
                    const targetUser = UserStore.getUser(args.find(x => x.name === "user")?.value);
                    const file = await resolveFile(args, ctx);

                    if (!targetUser) return sendBotMessage(ctx.channel.id, { content: "Utilisateur introuvable." });

                    // Simulation de l'écriture
                    FluxDispatcher.dispatch({
                        type: "TYPING_START",
                        channelId: channelId,
                        userId: targetUser.id,
                    });

                    setTimeout(async () => {
                        // Génération d'un ID de message "fake" (Snowflake local)
                        const fakeMessageId = (BigInt(Date.now() - 1420070400000) << 22n).toString();

                        const fakeMessage = {
                            id: fakeMessageId,
                            channel_id: channelId,
                            content: content,
                            type: 0, // Default message
                            timestamp: new Date().toISOString(),
                            state: "SENT",
                            author: {
                                id: targetUser.id,
                                username: targetUser.username,
                                avatar: targetUser.avatar,
                                discriminator: targetUser.discriminator,
                                public_flags: targetUser.publicFlags,
                                global_name: targetUser.globalName,
                                avatar_decoration_data: targetUser.avatarDecorationData ? { 
                                    asset: targetUser.avatarDecorationData.asset, 
                                    sku_id: targetUser.avatarDecorationData.skuId 
                                } : null
                            },
                            attachments: file ? [{
                                id: fakeMessageId,
                                filename: file.name,
                                size: file.size,
                                url: URL.createObjectURL(file),
                                proxy_url: URL.createObjectURL(file),
                                width: 400,
                                height: 300
                            }] : [],
                            embeds: [],
                            mentions: [],
                            mention_roles: [],
                            mention_everyone: false,
                            pinned: false,
                            tts: false
                        };

                        // Injection locale du message
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_CREATE",
                            channelId: channelId,
                            message: fakeMessage,
                            optimistic: false,
                            isPushNotification: false
                        });

                    }, Number(delay) * 1000);

                } catch (error) {
                    logger.error(error);
                    sendBotMessage(ctx.channel.id, { content: `Erreur: ${error.message}` });
                }
            }
        }
    ]
});