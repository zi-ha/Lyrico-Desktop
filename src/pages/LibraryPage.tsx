import { memo } from "react";
import type { AudioTrack } from "../app/types";
import { SongsPage } from "./SongsPage";

export const LibraryPage = memo(function LibraryPage({
  tracks,
  selectedPath,
  selectedPaths,
  onSelectTrack,
  onChangeSelectedPaths,
  onOpenDetails,
}: {
  tracks: AudioTrack[];
  selectedPath?: string;
  selectedPaths: string[];
  onSelectTrack: (path?: string) => void;
  onChangeSelectedPaths: (paths: string[]) => void;
  onOpenDetails: (path?: string) => void;
}) {
  return (
    <SongsPage
      tracks={tracks}
      selectedPath={selectedPath}
      selectedPaths={selectedPaths}
      onSelectTrack={onSelectTrack}
      onChangeSelectedPaths={onChangeSelectedPaths}
      onOpenDetails={onOpenDetails}
    />
  );
});
