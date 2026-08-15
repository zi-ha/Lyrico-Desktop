import { open } from "@tauri-apps/plugin-dialog";
import type { MessageInstance } from "antd/es/message/interface";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import type { SourcePlugin } from "../app/types";
import {
  installSourcePluginArchive,
  loadSourcePlugins,
  reorderSourcePlugins,
  saveSourcePluginSettings,
  setSourcePluginEnabled,
  uninstallSourcePlugin,
} from "../backend/audioApi";

export function usePlugins(message: MessageInstance, t: TFunction) {
  const [plugins, setPlugins] = useState<SourcePlugin[]>([]);

  useEffect(() => {
    let disposed = false;
    void loadSourcePlugins()
      .then((storedPlugins) => {
        if (!disposed) setPlugins(storedPlugins);
      })
      .catch(() => {
        if (!disposed) setPlugins([]);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const installPlugin = useCallback(async () => {
    const archivePath = await open({
      title: t("sources.install"),
      multiple: false,
      directory: false,
      filters: [{ name: "Lyrico plugin", extensions: ["zip"] }],
    });
    if (typeof archivePath !== "string") return;
    try {
      const result = await installSourcePluginArchive(archivePath);
      setPlugins(await loadSourcePlugins());
      if (result.installed.length) message.success(t("sources.installSuccess", { count: result.installed.length }));
      if (result.failed.length) {
        message.error(result.failed.map((failure) => failure.reason).join("; "));
      }
    } catch (error) {
      message.error(String(error));
    }
  }, [message, t]);

  const changePluginEnabled = useCallback(async (pluginId: string, enabled: boolean) => {
    try {
      setPlugins(await setSourcePluginEnabled(pluginId, enabled));
    } catch (error) {
      message.error(String(error));
    }
  }, [message]);

  const movePlugin = useCallback(async (pluginId: string, offset: -1 | 1) => {
    const index = plugins.findIndex((plugin) => plugin.id === pluginId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= plugins.length) return;
    const reordered = [...plugins];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    try {
      setPlugins(await reorderSourcePlugins(reordered.map((plugin) => plugin.id)));
    } catch (error) {
      message.error(String(error));
    }
  }, [plugins, message]);

  const savePluginConfig = useCallback(async (pluginId: string, config: Record<string, string>) => {
    try {
      setPlugins(await saveSourcePluginSettings(pluginId, config));
      message.success(t("sources.configSaved"));
    } catch (error) {
      message.error(String(error));
      throw error;
    }
  }, [message, t]);

  const uninstallPlugin = useCallback(async (pluginId: string) => {
    try {
      setPlugins(await uninstallSourcePlugin(pluginId));
      message.success(t("sources.uninstallSuccess"));
    } catch (error) {
      message.error(String(error));
      throw error;
    }
  }, [message, t]);

  return {
    plugins,
    installPlugin,
    changePluginEnabled,
    movePlugin,
    savePluginConfig,
    uninstallPlugin,
  };
}
