// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { FluxDispatcher, React } from "@webpack/common";

// API 2026 - Accès direct aux stores pour une détection plus rapide au démarrage
const StreamStore = findByProps("getActiveStreamForUser", "getAllActiveStreams");
const UserStore = findByProps("getCurrentUser");
const RTCConnectionStore = findByProps("getMediaSessionId", "getState");

let styleElement: HTMLStyleElement | null = null;

const settings = definePluginSettings({
    hideEquicord: {
        type: OptionType.BOOLEAN,
        description: "Cacher automatiquement la section Equicord pendant le stream",
        default: true
    },
    hideSettingsButton: {
        type: OptionType.BOOLEAN,
        description: "Cacher aussi le bouton des paramètres Equicord",
        default: true
    },
    customSelectors: {
        type: OptionType.STRING,
        description: "Sélecteurs CSS personnalisés à cacher (séparés par des virgules)",
        default: ""
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Mode débogage - Affiche des logs détaillés dans la console",
        default: false
    }
});

function isStreaming(): boolean {
    try {
        const currentUser = UserStore?.getCurrentUser?.();
        if (!currentUser) return false;

        // Méthode 1: Stream spécifique
        if (StreamStore?.getActiveStreamForUser?.(currentUser.id)) return true;

        // Méthode 2: Liste globale
        const allStreams = StreamStore?.getAllActiveStreams?.();
        if (allStreams?.some((s: any) => s.ownerId === currentUser.id)) return true;

        // Méthode 3: État RTC
        if (RTCConnectionStore?.getState?.()?.context === "stream") return true;

        return false;
    } catch (e) {
        return false;
    }
}

function injectHideCSS() {
    if (styleElement || typeof document === "undefined") return;

    styleElement = document.createElement("style");
    styleElement.id = "streamproof-hide-css";

    let cssRules = "";

    if (settings.store.hideEquicord) {
        cssRules += `
            ul[class*="section"][aria-label*="Equicord" i],
            div[data-settings-sidebar-item*="equicord" i],
            [class*="item"][class*="themed"]:has([class*="Equicord" i]),
            div[id*="Equicord" i] {
                display: none !important;
            }
        `;
    }

    if (settings.store.hideSettingsButton) {
        cssRules += `
            [class*="toolbar"] button:has(.vc-icon),
            button[aria-label*="Equicord" i],
            div[class*="iconWrapper"]:has(svg.vc-icon) {
                display: none !important;
            }
        `;
    }

    if (settings.store.customSelectors?.trim()) {
        cssRules += `${settings.store.customSelectors} { display: none !important; }`;
    }

    styleElement.textContent = cssRules;
    document.head.appendChild(styleElement);
}

function removeHideCSS() {
    if (styleElement) {
        styleElement.remove();
        styleElement = null;
    }
}

function updateHideStatus() {
    if (isStreaming() && settings.store.hideEquicord) {
        injectHideCSS();
    } else {
        removeHideCSS();
    }
}

export default definePlugin({
    name: "StreamProof",
    description: "Cache la section Equicord pendant que vous streamez pour protéger votre vie privée.",
    authors: [{ name: "mushzi", id: 449282863582412850n }],
    settings,

    start() {
        updateHideStatus();

        // Écouteurs d'événements Flux (Stable en 2026)
        const events = ["STREAM_START", "STREAM_STOP", "STREAM_CREATE", "STREAM_DELETE", "RTC_CONNECTION_STATE"];
        events.forEach(event => FluxDispatcher.subscribe(event, updateHideStatus));

        // Intervalle de sécurité (fallback si Flux rate un événement)
        this.checkInterval = setInterval(updateHideStatus, 2000);
    },

    stop() {
        const events = ["STREAM_START", "STREAM_STOP", "STREAM_CREATE", "STREAM_DELETE", "RTC_CONNECTION_STATE"];
        events.forEach(event => FluxDispatcher.unsubscribe(event, updateHideStatus));

        if (this.checkInterval) clearInterval(this.checkInterval);
        removeHideCSS();
    }
});