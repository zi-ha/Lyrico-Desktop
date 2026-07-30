import { ApiOutlined, CloudSyncOutlined } from "@ant-design/icons";
import { Tabs } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AudioTrack, DesktopSettings, SourcePlugin } from "../app/types";
import { PluginsPage } from "./PluginsPage";
import { TasksPage } from "./TasksPage";

type ToolsView = "plugins" | "tasks";

export function ToolsPage({
  tracks,
  plugins,
  selectedPaths,
  settings,
  artistSeparator,
  onChangeSettings,
  onInstallPlugin,
  onChangePluginEnabled,
  onSavePluginConfig,
  onUninstallPlugin,
}: {
  tracks: AudioTrack[];
  plugins: SourcePlugin[];
  selectedPaths: string[];
  settings: DesktopSettings;
  artistSeparator: string;
  onChangeSettings: (settings: DesktopSettings) => void;
  onInstallPlugin: () => Promise<void>;
  onChangePluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  onSavePluginConfig: (pluginId: string, config: Record<string, string>) => Promise<void>;
  onUninstallPlugin: (pluginId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ToolsView>("plugins");

  const tabItems = [
    {
      key: "plugins",
      label: t("common.sources"),
      icon: <ApiOutlined />,
      children: (
        <PluginsPage
          plugins={plugins}
          onInstall={onInstallPlugin}
          onChangeEnabled={onChangePluginEnabled}
          onSaveConfig={onSavePluginConfig}
          onUninstall={onUninstallPlugin}
        />
      ),
    },
    {
      key: "tasks",
      label: t("common.tasks"),
      icon: <CloudSyncOutlined />,
      children: (
        <TasksPage
          tracks={tracks}
          plugins={plugins}
          selectedPaths={selectedPaths}
          settings={settings}
          artistSeparator={artistSeparator}
          onChangeSettings={onChangeSettings}
        />
      ),
    },
  ];

  return (
    <div className="workspace page-stack">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ToolsView)}
        items={tabItems}
        className="tools-tabs"
      />
    </div>
  );
}