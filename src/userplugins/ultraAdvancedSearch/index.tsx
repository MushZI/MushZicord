// @ts-nocheck
/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

// On importe ton composant modal externe
import { SearchModal } from "./SearchModal";
import styles from "./styles.css?managed";

export const settings = definePluginSettings({
    maxResults: {
        type: OptionType.NUMBER,
        description: "Nombre maximum de résultats à afficher",
        default: 100
    },
    searchTimeout: {
        type: OptionType.NUMBER,
        description: "Délai avant la recherche (ms)",
        default: 300
    },
    minResultsForAPI: {
        type: OptionType.NUMBER,
        description: "Nombre minimum de résultats avant d'utiliser l'API",
        default: 5
    },
    apiRequestDelay: {
        type: OptionType.NUMBER,
        description: "Délai entre les requêtes API (ms)",
        default: 200
    }
});

// --- LOGIQUE D'OUVERTURE ---

function openSearchModal() {
    // Utilisation de la syntaxe JSX pour 2026
    openModal(props => <SearchModal modalProps={props} />);
}

// --- INTERCEPTEUR DOM (FILET DE SÉCURITÉ) ---

let observer: MutationObserver | null = null;

function setupButtonInterceptor() {
    if (observer) observer.disconnect();

    const interceptButton = () => {
        // Ciblage large pour attraper le bouton de recherche/QuickSwitcher
        const selectors = [
            'button[class*="button__"]',
            'button[class*="lookFilled"]',
            '[aria-label*="Rechercher" i]',
            '[aria-label*="conversation" i]'
        ];
        
        const buttons = document.querySelectorAll(selectors.join(","));
        
        buttons.forEach((button: HTMLButtonElement) => {
            const text = button.textContent?.toLowerCase() || "";
            const aria = button.getAttribute("aria-label")?.toLowerCase() || "";
            
            if (text.includes("rechercher") || aria.includes("rechercher") || text.includes("lancer une conversation")) {
                if (button.dataset.ultraSearchIntercepted === "true") return;
                
                button.dataset.ultraSearchIntercepted = "true";
                
                // Interception brutale du click
                button.addEventListener("click", (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openSearchModal();
                }, true);
            }
        });
    };

    interceptButton();

    observer = new MutationObserver(interceptButton);
    observer.observe(document.body, { childList: true, subtree: true });
}

// --- DÉFINITION DU PLUGIN ---

export default definePlugin({
    name: "Ultra Advanced Search",
    description: "Recherche avancée globale (DMs, images, fichiers) - Similaire à l'expérience mobile.",
    authors: [{ name: "Bash", id: 1327483363518582784n }, { name: "mushzi", id: 449282863582412850n }],
    settings,
    styles,

    // PATCHES REGEX (Maintien de ta logique d'interception Webpack)
    patches: [
        {
            find: "Rechercher/lancer une conversation",
            replacement: {
                match: /onClick:(\i[^,}]*),/,
                replace: "onClick: (e) => { if(e) { e.preventDefault?.(); e.stopPropagation?.(); } $self.openSearchModal(); },"
            }
        },
        {
            find: "button__201d5",
            replacement: {
                match: /(button__201d5[^}]*onClick:\s*)(\i[^,}]*)/,
                replace: "$1 (e) => { if(e) { e.preventDefault?.(); e.stopPropagation?.(); } $self.openSearchModal(); }"
            }
        }
    ],

    openSearchModal, // Nécessaire pour que $self fonctionne dans les patches

    start() {
        console.log("[Ultra Advanced Search] 🔍 Initialisation...");
        
        // On attend que le DOM soit chargé pour l'intercepteur
        if (document.readyState === "complete") {
            setupButtonInterceptor();
        } else {
            window.addEventListener("load", setupButtonInterceptor);
        }
    },

    stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        document.querySelectorAll('[data-ultra-search-intercepted="true"]').forEach(b => {
            delete b.dataset.ultraSearchIntercepted;
        });
    }
});