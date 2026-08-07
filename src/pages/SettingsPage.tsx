import { ApiOutlined, AppstoreOutlined, FolderOutlined, GlobalOutlined, ScissorOutlined, SoundOutlined } from "@ant-design/icons";
import { InputNumber, Select, Switch, Typography } from "antd";
import { memo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ArtistSplitConfig, DesktopSettings, LibraryFolder, SourcePlugin } from "../app/types";
import type { LanguagePreference } from "../i18n";
import { ArtistSplitSettings } from "../components/ArtistSplitSettings";
import { FoldersPage } from "./FoldersPage";
import { PluginsPage } from "./PluginsPage";

const { Title, Text } = Typography;

type SettingsTabKey = "interface" | "online" | "lyrics" | "sources" | "folders" | "library";
type SettingsGroupKey = "general" | "content" | "library";

export const SettingsPage = memo(function SettingsPage({
  languagePreference,
  artistSplitConfig,
  settings,
  plugins,
  folders,
  loading,
  onChangeLanguage,
  onChangeArtistSplitConfig,
  onChangeSettings,
  onInstallPlugin,
  onChangePluginEnabled,
  onSavePluginConfig,
  onUninstallPlugin,
  onAddFolders,
  onRescanFolder,
  onRemoveFolder,
}: {
  languagePreference: LanguagePreference;
  artistSplitConfig: ArtistSplitConfig;
  settings: DesktopSettings;
  plugins: SourcePlugin[];
  folders: LibraryFolder[];
  loading: boolean;
  onChangeLanguage: (language: LanguagePreference) => void;
  onChangeArtistSplitConfig: (config: ArtistSplitConfig) => void;
  onChangeSettings: (settings: DesktopSettings) => void;
  onInstallPlugin: () => Promise<void>;
  onChangePluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  onSavePluginConfig: (pluginId: string, config: Record<string, string>) => Promise<void>;
  onUninstallPlugin: (pluginId: string) => Promise<void>;
  onAddFolders: () => void;
  onRescanFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("interface");
  const update = <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => onChangeSettings({ ...settings, [key]: value });

  const navTabs: { key: SettingsTabKey; label: string; icon: ReactNode; group: SettingsGroupKey }[] = [
    { key: "interface", label: t("settings.interface"), icon: <GlobalOutlined />, group: "general" },
    { key: "online", label: t("settings.onlineSearch"), icon: <ApiOutlined />, group: "content" },
    { key: "lyrics", label: t("settings.lyricsSettings"), icon: <SoundOutlined />, group: "content" },
    { key: "sources", label: t("settings.sources"), icon: <AppstoreOutlined />, group: "content" },
    { key: "folders", label: t("settings.folders"), icon: <FolderOutlined />, group: "library" },
    { key: "library", label: t("settings.library"), icon: <ScissorOutlined />, group: "library" },
  ];
  const groups: { key: SettingsGroupKey; label: string }[] = [
    { key: "general", label: t("settings.groups.general") },
    { key: "content", label: t("settings.groups.content") },
    { key: "library", label: t("settings.groups.library") },
  ];

  return (
    <div className="workspace page-stack settings-view">
      <header className="settings-page-header">
        <div className="settings-page-title">
          <Title level={2}>{t("settings.title")}</Title>
          <Text type="secondary">{t("settings.descriptionEffective")}</Text>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("settings.title")}>
          {groups.map((group) => (
            <div key={group.key} className="settings-nav-group">
              <div className="settings-nav-group-label">{group.label}</div>
              {navTabs
                .filter((tab) => tab.group === group.key)
                .map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`settings-nav-item${activeTab === tab.key ? " is-active" : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <span className="settings-nav-icon">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <section className="settings-content">
          {activeTab === "interface" && (
            <SettingsSection title={t("settings.interface")}>
              <SettingRow title={t("settings.language")} description={t("settings.languageHint")}>
                <Select<LanguagePreference>
                  value={languagePreference}
                  onChange={onChangeLanguage}
                  options={[
                    { value: "system", label: t("settings.systemLanguage") },
                    { value: "en-US", label: t("settings.english") },
                    { value: "zh-CN", label: t("settings.chinese") },
                  ]}
                />
              </SettingRow>
            </SettingsSection>
          )}
          {activeTab === "online" && (
            <SettingsSection title={t("settings.onlineSearch")}>
              <SettingRow title={t("settings.searchPageSize")} description={t("settings.searchPageSizeHint")}>
                <InputNumber min={5} max={50} precision={0} value={settings.searchPageSize} onChange={(value) => update("searchPageSize", value ?? 10)} />
              </SettingRow>
            </SettingsSection>
          )}
          {activeTab === "lyrics" && (
            <SettingsSection title={t("settings.lyricsSettings")}>
              <SettingRow title={t("settings.defaultLyricFormat")} description={t("settings.defaultLyricFormatHint")}>
                <Select value={settings.lyricFormat} onChange={(value) => update("lyricFormat", value)} options={[
                  { value: "plainLrc", label: t("lyrics.formats.plainLrc") },
                  { value: "verbatimLrc", label: t("lyrics.formats.verbatimLrc") },
                  { value: "enhancedLrc", label: t("lyrics.formats.enhancedLrc") },
                  { value: "ttml", label: t("lyrics.formats.ttml") },
                ]} />
              </SettingRow>
              <SettingRow title={t("settings.lyricsConversionMode")} description={t("settings.lyricsConversionModeHint")}>
                <Select value={settings.lyricsConversionMode} onChange={(value) => update("lyricsConversionMode", value)} options={[
                  { value: "none", label: t("settings.conversionNone") },
                  { value: "traditionalToSimplified", label: t("settings.conversionTraditionalToSimplified") },
                  { value: "simplifiedToTraditional", label: t("settings.conversionSimplifiedToTraditional") },
                ]} />
              </SettingRow>
              <SettingRow title={t("settings.includeTranslation")} description={t("settings.includeTranslationHint")}><Switch checked={settings.showTranslation} onChange={(value) => onChangeSettings({ ...settings, showTranslation: value, onlyTranslationIfAvailable: value ? settings.onlyTranslationIfAvailable : false })} /></SettingRow>
              <SettingRow title={t("settings.onlyTranslation")} description={t("settings.onlyTranslationHint")}><Switch disabled={!settings.showTranslation} checked={settings.onlyTranslationIfAvailable} onChange={(value) => update("onlyTranslationIfAvailable", value)} /></SettingRow>
              <SettingRow title={t("settings.includeRomanization")} description={t("settings.includeRomanizationHint")}><Switch checked={settings.showRomanization} onChange={(value) => update("showRomanization", value)} /></SettingRow>
              <SettingRow title={t("settings.removeEmptyLyricLines")} description={t("settings.removeEmptyLyricLinesHint")}><Switch checked={settings.removeEmptyLyricLines} onChange={(value) => update("removeEmptyLyricLines", value)} /></SettingRow>
            </SettingsSection>
          )}
          {activeTab === "sources" && (
            <PluginsPage
              plugins={plugins}
              onInstall={onInstallPlugin}
              onChangeEnabled={onChangePluginEnabled}
              onSaveConfig={onSavePluginConfig}
              onUninstall={onUninstallPlugin}
            />
          )}
          {activeTab === "folders" && (
            <FoldersPage
              folders={folders}
              loading={loading}
              onAddFolders={onAddFolders}
              onRescanFolder={onRescanFolder}
              onRemoveFolder={onRemoveFolder}
            />
          )}
          {activeTab === "library" && (
            <SettingsSection title={t("artistSplit.title")}>
              <ArtistSplitSettings config={artistSplitConfig} onChange={onChangeArtistSplitConfig} />
            </SettingsSection>
          )}
        </section>
      </div>
    </div>
  );
});

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-section"><Typography.Title level={4}>{title}</Typography.Title>{children}</section>;
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row-copy"><Text strong>{title}</Text>{description ? <Text type="secondary">{description}</Text> : null}</div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
