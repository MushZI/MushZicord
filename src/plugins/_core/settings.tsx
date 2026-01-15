/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { BackupRestoreIcon, CloudIcon, LogIcon, MainSettingsIcon, PaintbrushIcon, PatchHelperIcon, PluginsIcon, UpdaterIcon } from "@components/Icons";
import {
    BackupAndRestoreTab,
    ChangelogTab,
    CloudTab,
    PatchHelperTab,
    PluginsTab,
    ThemesTab,
    UpdaterTab,
    VencordTab,
} from "@components/settings";
import { gitHashShort } from "@shared/vencordUserAgent";
import { Devs } from "@utils/constants";
import { getIntlMessage } from "@utils/discord";
import { isTruthy } from "@utils/guards";
import definePlugin, { IconProps, OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { React } from "@webpack/common";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

const enum LayoutType {
    ROOT = 0,
    SECTION = 1,
    SIDEBAR_ITEM = 2,
    PANEL = 3,
    SPLIT = 4,
    CATEGORY = 5,
    ACCORDION = 6,
    LIST = 7,
    RELATED = 8,
    FIELD_SET = 9,
    TAB_ITEM = 10,
    STATIC = 11,
    BUTTON = 12,
    TOGGLE = 13,
    SLIDER = 14,
    SELECT = 15,
    RADIO = 16,
    NAVIGATOR = 17,
    CUSTOM = 18
}

const LayoutTypes: typeof LayoutType = findByPropsLazy("SECTION", "SIDEBAR_ITEM", "PANEL");

const enum SectionType {
    HEADER = "HEADER",
    DIVIDER = "DIVIDER",
    CUSTOM = "CUSTOM"
}

type SettingsLocation =
    | "top"
    | "aboveNitro"
    | "belowNitro"
    | "aboveActivity"
    | "belowActivity"
    | "bottom";

interface SettingsLayoutNode {
    type: LayoutType;
    key?: string;
    legacySearchKey?: string;
    getLegacySearchKey?(): string;
    useLabel?(): string;
    useTitle?(): string;
    buildLayout?(): SettingsLayoutNode[];
    icon?(): ReactNode;
    render?(): ReactNode;
    StronglyDiscouragedCustomComponent?(): ReactNode;
}

interface EntryOptions {
    key: string;
    title: string;
    panelTitle?: string;
    Component: ComponentType<{}>;
    Icon: ComponentType<IconProps>;
}

interface SettingsLayoutBuilder {
    key?: string;
    buildLayout(): SettingsLayoutNode[];
}

const settings = definePluginSettings({
    settingsLocation: {
        type: OptionType.SELECT,
        description: "Where to put the Mushcord settings section",
        options: [
            { label: "At the very top", value: "top" },
            { label: "Above the Nitro section", value: "aboveNitro", default: true },
            { label: "Below the Nitro section", value: "belowNitro" },
            { label: "Above Activity Settings", value: "aboveActivity" },
            { label: "Below Activity Settings", value: "belowActivity" },
            { label: "At the very bottom", value: "bottom" },
        ] as { label: string; value: SettingsLocation; default?: boolean; }[]
    }
});

export default definePlugin({
    name: "Settings",
    description: "Adds Settings UI and debug info",
    authors: [Devs.Ven, Devs.Megu],
    required: true,

    settings,

    patches: [
        {
            find: ".versionHash",
            replacement: [
                {
                    match: /\.RELEASE_CHANNEL/,
                    replace: "$&.replace(/^./, c => c.toUpperCase())"
                },
                {
                    match: /\.compactInfo.+?(?=null!=(\i)&&(.{0,20}\i\.Text.{0,200}?,children:).{0,15}?("span"),({className:\i\.versionHash,children:\["Build Override: ",\1\.id\]\})\)\}\))/,
                    replace: (m, _buildOverride, makeRow, component, props) => {
                        props = props.replace(/children:\[.+\]/, "");
                        return `${m},$self.makeInfoElements(${component},${props}).map(e=>${makeRow}e})),`;
                    }
                },
                {
                    match: /\.info.+?\[\(0,\i\.jsxs?\)\((.{1,10}),(\{[^{}}]+\{.{0,20}.versionHash,.+?\})\)," "/,
                    replace: (m, component, props) => {
                        props = props.replace(/children:\[.+\]/, "");
                        return `${m},$self.makeInfoElements(${component},${props})`;
                    }
                },
                {
                    match: /copyValue:\i\.join\(" "\)/g,
                    replace: "$& + $self.getInfoString()"
                }
            ]
        },
        {
            find: ".SEARCH_NO_RESULTS&&0===",
            replacement: [
                {
                    match: /(?<=section:(.{0,50})\.DIVIDER\}\))([,;])(?=.{0,200}(\i)\.push.{0,100}label:(\i)\.header)/,
                    replace: (_, sectionTypes, commaOrSemi, elements, element) =>
                        `${commaOrSemi} $self.addSettings(${elements}, ${element}, ${sectionTypes}) ${commaOrSemi}`,
                },
                {
                    match: /({(?=.+?function (\i).{0,160}(\i)=\i\.useMemo.{0,140}return \i\.useMemo\(\(\)=>\i\(\3).+?\(\)=>)\2/,
                    replace: (_, rest, settingsHook) =>
                        `${rest}$self.wrapSettingsHook(${settingsHook})`,
                },
            ],
        },
        {
            find: "#{intl::USER_SETTINGS_ACTIONS_MENU_LABEL}",
            replacement: {
                match: /(?<=function\((\i),(\i),\i\)\{)(?=let \i=Object\.values\(\i\.\i\).+?(\(0,\i\.openUserSettings\))\()/,
                replace: (_, settingsPanel, section, openUserSettings) => `${openUserSettings}(${settingsPanel},{section:${section}});return;`
            }
        },
        {
            find: ".buildLayout().map",
            replacement: {
                match: /(\i)\.buildLayout\(\)(?=\.map)/,
                replace: "$self.buildLayout($1)"
            }
        },
        {
            find: "getWebUserSettingFromSection",
            replacement: {
                match: /new Map\(\[(?=\[.{0,10}\.ACCOUNT,.{0,10}\.ACCOUNT_PANEL)/,
                replace: "new Map([...$self.getSettingsSectionMappings(),"
            }
        }
    ],

    buildEntry(options: EntryOptions): SettingsLayoutNode {
        const { key, title, panelTitle = title, Component, Icon } = options;

        const panel: SettingsLayoutNode = {
            key: key + "_panel",
            type: LayoutTypes.PANEL,
            useTitle: () => panelTitle,
            buildLayout: () => [],
            StronglyDiscouragedCustomComponent: () => <Component />,
            render: () => <Component />,
        };

        return {
            key,
            type: LayoutTypes.SIDEBAR_ITEM,
            legacySearchKey: title.toUpperCase(),
            getLegacySearchKey: () => title.toUpperCase(),
            useTitle: () => title,
            icon: () => <Icon width={20} height={20} />,
            buildLayout: () => [panel]
        };
    },

    getSettingsSectionMappings() {
        return [
            ["MushcordSettings", "mushcord_main_panel"],
            ["MushcordPlugins", "mushcord_plugins_panel"],
            ["MushcordThemes", "mushcord_themes_panel"],
            ["MushcordUpdater", "mushcord_updater_panel"],
            ["MushcordChangelog", "mushcord_changelog_panel"],
            ["MushcordCloud", "mushcord_cloud_panel"],
            ["MushcordBackupAndRestore", "mushcord_backup_restore_panel"],
            ["MushcordPatchHelper", "mushcord_patch_helper_panel"],
            ["EquibopSettings", "mushcord_equibop_settings_panel"],
            ["MushcordDiscordIcons", "mushcord_icon_viewer"],
            ["MushcordThemeLibrary", "mushcord_theme_library"],
            ["MushcordIRememberYou", "mushcord_i_remember_you"],
        ];
    },

    buildLayout(originalLayoutBuilder: SettingsLayoutBuilder) {
        const layout = originalLayoutBuilder.buildLayout();
        if (originalLayoutBuilder.key !== "$Root") return layout;
        if (!Array.isArray(layout)) return layout;
        if (layout.some(s => s?.key === "mushcord_section")) return layout;

        const { buildEntry } = this;

        const mushcordEntries: SettingsLayoutNode[] = [
            buildEntry({
                key: "mushcord_main",
                title: "Mushcord",
                panelTitle: "Mushcord Settings",
                Component: VencordTab,
                Icon: MainSettingsIcon
            }),
            buildEntry({
                key: "mushcord_plugins",
                title: "Plugins",
                Component: PluginsTab,
                Icon: PluginsIcon
            }),
            buildEntry({
                key: "mushcord_themes",
                title: "Themes",
                Component: ThemesTab,
                Icon: PaintbrushIcon
            }),
            !IS_UPDATER_DISABLED && UpdaterTab && buildEntry({
                key: "mushcord_updater",
                title: "Updater",
                panelTitle: "Mushcord Updater",
                Component: UpdaterTab,
                Icon: UpdaterIcon
            }),
            buildEntry({
                key: "mushcord_changelog",
                title: "Changelog",
                Component: ChangelogTab,
                Icon: LogIcon,
            }),
            buildEntry({
                key: "mushcord_cloud",
                title: "Cloud",
                panelTitle: "Mushcord Cloud",
                Component: CloudTab,
                Icon: CloudIcon
            }),
            buildEntry({
                key: "mushcord_backup_restore",
                title: "Backup & Restore",
                Component: BackupAndRestoreTab,
                Icon: BackupRestoreIcon
            }),
            IS_DEV && PatchHelperTab && buildEntry({
                key: "mushcord_patch_helper",
                title: "Patch Helper",
                Component: PatchHelperTab,
                Icon: PatchHelperIcon
            }),
            ...this.customEntries.map(buildEntry)
        ].filter(isTruthy);

        const mushcordSection: SettingsLayoutNode = {
            key: "mushcord_section",
            type: LayoutTypes.SECTION,
            useTitle: () => "Mushcord Settings",
            buildLayout: () => mushcordEntries
        };

        const { settingsLocation } = settings.store;

        const places: Record<SettingsLocation, string> = {
            top: "user_section",
            aboveNitro: "billing_section",
            belowNitro: "billing_section",
            aboveActivity: "activity_section",
            belowActivity: "activity_section",
            bottom: "logout_section"
        };

        const key = places[settingsLocation] ?? places.top;
        let idx = layout.findIndex(s => typeof s?.key === "string" && s.key === key);

        if (idx === -1) {
            idx = 2;
        } else if (settingsLocation.startsWith("below")) {
            idx += 1;
        }

        layout.splice(idx, 0, mushcordSection);

        return layout;
    },

    customSections: [] as ((SectionTypes: Record<string, string>) => { section: string; element: ComponentType; label: string; id?: string; })[],
    customEntries: [] as EntryOptions[],

    makeSettingsCategories(SectionTypes: Record<string, string>) {
        return [
            {
                section: SectionTypes.HEADER,
                label: "Mushcord",
                className: "vc-settings-header",
            },
            {
                section: "MushcordSettings",
                label: "Mushcord",
                element: VencordTab,
                className: "vc-settings",
            },
            {
                section: "MushcordPlugins",
                label: "Plugins",
                searchableTitles: ["Plugins"],
                element: PluginsTab,
                className: "vc-plugins",
            },
            {
                section: "MushcordThemes",
                label: "Themes",
                searchableTitles: ["Themes"],
                element: ThemesTab,
                className: "vc-themes",
            },
            !IS_UPDATER_DISABLED && {
                section: "MushcordUpdater",
                label: "Updater",
                searchableTitles: ["Updater"],
                element: UpdaterTab,
                className: "vc-updater",
            },
            {
                section: "MushcordChangelog",
                label: "Changelog",
                searchableTitles: ["Changelog"],
                element: ChangelogTab,
                className: "vc-changelog",
            },
            {
                section: "MushcordCloud",
                label: "Cloud",
                searchableTitles: ["Cloud"],
                element: CloudTab,
                className: "vc-cloud",
            },
            {
                section: "MushcordBackupAndRestore",
                label: "Backup & Restore",
                searchableTitles: ["Backup & Restore"],
                element: BackupAndRestoreTab,
                className: "vc-backup-restore",
            },
            IS_DEV && {
                section: "MushcordPatchHelper",
                label: "Patch Helper",
                searchableTitles: ["Patch Helper"],
                element: PatchHelperTab,
                className: "vc-patch-helper",
            },
            ...this.customSections.map(func => func(SectionTypes)),
            {
                section: SectionTypes.DIVIDER,
            },
        ].filter(Boolean);
    },

    isRightSpot({ header, settings: s }: { header?: string; settings?: string[]; }) {
        const firstChild = s?.[0];
        if (firstChild === "LOGOUT" || firstChild === "SOCIAL_LINKS") return true;

        const { settingsLocation } = settings.store;

        if (settingsLocation === "bottom") return firstChild === "LOGOUT";
        if (settingsLocation === "belowActivity") return firstChild === "CHANGELOG";

        if (!header) return;

        try {
            const names: Record<Exclude<SettingsLocation, "bottom" | "belowActivity">, string> = {
                top: getIntlMessage("USER_SETTINGS"),
                aboveNitro: getIntlMessage("BILLING_SETTINGS"),
                belowNitro: getIntlMessage("APP_SETTINGS"),
                aboveActivity: getIntlMessage("ACTIVITY_SETTINGS"),
            };

            if (!names[settingsLocation] || names[settingsLocation].endsWith("_SETTINGS"))
                return firstChild === "PREMIUM";

            return header === names[settingsLocation];
        } catch {
            return firstChild === "PREMIUM";
        }
    },

    patchedSettings: new WeakSet(),

    addSettings(
        elements: any[],
        element: { header?: string; settings: string[]; },
        SectionTypes: Record<string, string>,
    ) {
        if (this.patchedSettings.has(elements) || !this.isRightSpot(element)) return;

        this.patchedSettings.add(elements);
        elements.push(...this.makeSettingsCategories(SectionTypes));
    },

    wrapSettingsHook(originalHook: (...args: any[]) => Record<string, unknown>[]) {
        return (...args: any[]) => {
            const elements = originalHook(...args);
            if (!this.patchedSettings.has(elements))
                elements.unshift(...this.makeSettingsCategories({ HEADER: SectionType.HEADER, DIVIDER: SectionType.DIVIDER, CUSTOM: SectionType.CUSTOM }) as Record<string, unknown>[]);

            return elements;
        };
    },

    get electronVersion() {
        return VencordNative.native.getVersions().electron ?? window.legcord?.electron ?? null;
    },

    get chromiumVersion() {
        try {
            return (
                VencordNative.native.getVersions().chrome ??
                // @ts-expect-error userAgentData types
                navigator.userAgentData?.brands?.find(
                    (b: { brand: string; }) => b.brand === "Chromium" || b.brand === "Google Chrome",
                )?.version ??
                null
            );
        } catch {
            return null;
        }
    },

    getVersionInfo(support = true) {
        let version = "";

        if (IS_DEV) version = "Dev";
        if (IS_WEB) version = "Web";
        if (IS_VESKTOP) version = `Vesktop v${VesktopNative.app.getVersion()}`;
        if (IS_EQUIBOP) version = `Mushbop v${VesktopNative.app.getVersion()}`;
        if (IS_STANDALONE) version = "Standalone";

        return support && version ? ` (${version})` : version;
    },

    getInfoRows() {
        const { electronVersion, chromiumVersion, getVersionInfo } = this;

        const rows = [`Mushcord ${gitHashShort}${getVersionInfo()}`];

        if (electronVersion) rows.push(`Electron ${electronVersion}`);
        if (chromiumVersion) rows.push(`Chromium ${chromiumVersion}`);

        return rows;
    },

    getInfoString() {
        return "\n" + this.getInfoRows().join("\n");
    },

    makeInfoElements(
        Component: ComponentType<React.PropsWithChildren>,
        props: PropsWithChildren,
    ) {
        return this.getInfoRows().map((text, i) => (
            <Component key={i} {...props}>
                {text}
            </Component>
        ));
    },
});