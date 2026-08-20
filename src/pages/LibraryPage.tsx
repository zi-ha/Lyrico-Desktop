import { memo } from "react";
import type { AudioTrack, LibraryFolder } from "../app/types";
import { SongsPage } from "./SongsPage";

export const LibraryPage = memo(function LibraryPage({
  tracks,
  selectedPath,
  selectedPaths,
  onSelectTrack,
  onChangeSelectedPaths,
  onOpenDetails,
  folders,
  onRescanFolder,
  onRefreshTrack,
}: {
  tracks: AudioTrack[];
  selectedPath?: string;
  selectedPaths: string[];
  onSelectTrack: (path?: string) => void;
  onChangeSelectedPaths: (paths: string[]) => void;
  onOpenDetails: (path?: string) => void;
  folders: LibraryFolder[];
  onRescanFolder: (path: string) => void;
  onRefreshTrack: (path: string) => Promise<void>;
}) {
  return (
    <SongsPage
      tracks={tracks}
      selectedPath={selectedPath}
      selectedPaths={selectedPaths}
      onSelectTrack={onSelectTrack}
      onChangeSelectedPaths={onChangeSelectedPaths}
      onOpenDetails={onOpenDetails}
      folders={folders}
      onRescanFolder={onRescanFolder}
      onRefreshTrack={onRefreshTrack}
    />
  );
});
