import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { App as AntApp, ConfigProvider, theme } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadBatchTaskItems } from "../backend/audioApi";
import { Shell } from "../components/Shell";
import { SongDetails } from "../components/SongDetails";
import { normalizePath } from "../domain/libraryPath";
import { useLibrary } from "../hooks/useLibrary";
import { usePlugins } from "../hooks/usePlugins";
import { useSelection } from "../hooks/useSelection";
import { useSettings } from "../hooks/useSettings";
import { useSongEditor } from "../hooks/useSongEditor";
import { LibraryPage } from "../pages/LibraryPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ToolsPage } from "../pages/ToolsPage";
import type { BatchTask, BatchTaskItem, ViewKey } from "./types";
import "../App.css";

export default function App() {
  const { i18n } = useTranslation();
  const antLocale = i18n.resolvedLanguage?.startsWith("zh") ? zhCN : enUS;

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? "en-US";
  }, [i18n.resolvedLanguage]);

  useEffect(() => {
    const suppressContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", suppressContextMenu);
    return () => window.removeEventListener("contextmenu", suppressContextMenu);
  }, []);

  return (
    <ConfigProvider
      locale={antLocale}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        },
      }}
    >
      <AntApp>
        <LyricoDesktop />
      </AntApp>
    </ConfigProvider>
  );
}

function LyricoDesktop() {
  const { message } = AntApp.useApp();
  const { t, i18n } = useTranslation();
  const [activeView, setActiveView] = useState<ViewKey>("library");

  const selection = useSelection();
  const library = useLibrary(
    message,
    t,
    selection.setSelectedPath,
    selection.setSelectedFolderPath,
    selection.applyInitialSelection,
  );
  const editor = useSongEditor({
    tracks: library.tracks,
    selectedPath: selection.selectedPath,
    setSelectedPath: selection.setSelectedPath,
    replaceTrack: library.replaceTrack,
    message,
    t,
  });
  const plugins = usePlugins(message, t);
  const settings = useSettings(i18n, message);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<BatchTask>("batch-task-updated", ({ payload }) => {
      if (!disposed && ["succeeded", "failed", "cancelled"].includes(payload.status)) {
        void Promise.all([
          library.reloadTracks(),
          payload.taskType === "renameFiles" ? loadBatchTaskItems(payload.taskId) : Promise.resolve([]),
        ]).then(([, items]) => {
          if (disposed) return;
          const renamedPaths = renamePathMap(items);
          if (renamedPaths.size === 0) return;
          selection.applyRenamedPaths(renamedPaths);
          editor.clearRenamedTrack(renamedPaths);
        }).catch(() => undefined);
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [editor.clearRenamedTrack, library.reloadTracks, selection.applyRenamedPaths]);

  const handleRemoveFolder = useCallback((path: string) => {
    selection.clearUnderFolder(path);
    void library.removeFolderTracks(path);
  }, [library.removeFolderTracks, selection.clearUnderFolder]);

  function renderActivePage() {
    switch (activeView) {
      case "library":
        return (
          <LibraryPage
            tracks={library.tracks}
            selectedPath={selection.selectedPath}
            selectedPaths={selection.selectedPaths}
            onSelectTrack={selection.selectTrack}
            onChangeSelectedPaths={selection.setSelectedPaths}
            onOpenDetails={editor.openTrackDetails}
          />
        );
      case "tools":
        return (
          <ToolsPage
            tracks={library.tracks}
            plugins={plugins.plugins}
            selectedPaths={selection.selectedPaths}
            settings={settings.desktopSettings}
            artistSeparator={settings.artistSplitConfig.artistSeparator}
            onChangeSettings={settings.changeDesktopSettings}
          />
        );
      case "settings":
        return (
          <SettingsPage
            languagePreference={settings.languagePreference}
            artistSplitConfig={settings.artistSplitConfig}
            settings={settings.desktopSettings}
            plugins={plugins.plugins}
            folders={library.folders}
            loading={library.loading}
            onChangeLanguage={settings.changeLanguage}
            onChangeArtistSplitConfig={settings.changeArtistSplitConfig}
            onChangeSettings={settings.changeDesktopSettings}
            onInstallPlugin={plugins.installPlugin}
            onChangePluginEnabled={plugins.changePluginEnabled}
            onSavePluginConfig={plugins.savePluginConfig}
            onUninstallPlugin={plugins.uninstallPlugin}
            onAddFolders={library.addFolders}
            onRescanFolder={library.scanAndMergeFolder}
            onRemoveFolder={handleRemoveFolder}
          />
        );
      default:
        return null;
    }
  }

  return (
    <>
    <Shell
      activeView={activeView}
      folders={library.folders}
      trackCount={library.tracks.length}
      onChangeView={setActiveView}
      onCancelReplayGain={editor.cancelActiveReplayGain}
    >
      {renderActivePage()}
      <SongDetails
        open={editor.detailsOpen}
        loading={editor.detailsLoading}
        track={editor.selectedTrack}
        plugins={plugins.plugins}
        settings={settings.desktopSettings}
        form={editor.form}
        saving={editor.saving}
        onSave={editor.saveSelected}
        onReload={editor.refreshSelected}
        onCalculateReplayGain={editor.calculateSelectedReplayGain}
        onCancelReplayGain={editor.cancelActiveReplayGain}
        onChooseCover={editor.chooseLocalCover}
        onUseSameAlbumCover={editor.useSameAlbumCover}
        onRemoveCover={editor.removeSelectedCover}
        onRevertCover={editor.revertSelectedCover}
        onExportCover={editor.exportSelectedCover}
        onImportLyrics={editor.importLyricsFile}
        onExportLyrics={editor.exportLyricsFile}
        onClose={editor.closeSongDetails}
      />
    </Shell>
    </>
  );
}

function renamePathMap(items: BatchTaskItem[]) {
  const paths = new Map<string, string>();
  for (const item of items) {
    if (item.status !== "succeeded" || !item.resultJson) continue;
    try {
      const result = JSON.parse(item.resultJson) as { originalPath?: string; newPath?: string };
      if (result.originalPath && result.newPath) paths.set(normalizePath(result.originalPath), result.newPath);
    } catch {
      // Ignore malformed historical task results and keep the current selection unchanged.
    }
  }
  return paths;
}
