import { memo } from "react";
import type { AudioTrack, DesktopSettings, SourcePlugin } from "../app/types";
import { TasksPage } from "./TasksPage";

export const ToolsPage = memo(function ToolsPage({
  tracks,
  plugins,
  selectedPaths,
  settings,
  artistSeparator,
  onChangeSettings,
}: {
  tracks: AudioTrack[];
  plugins: SourcePlugin[];
  selectedPaths: string[];
  settings: DesktopSettings;
  artistSeparator: string;
  onChangeSettings: (settings: DesktopSettings) => void;
}) {
  return (
    <TasksPage
      tracks={tracks}
      plugins={plugins}
      selectedPaths={selectedPaths}
      settings={settings}
      artistSeparator={artistSeparator}
      onChangeSettings={onChangeSettings}
    />
  );
});
