import { useCallback, useState } from "react";
import { isTrackUnderFolder, samePath } from "../domain/libraryPath";

export function useSelection() {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>();

  const selectTrack = useCallback((path?: string) => {
    setSelectedPath(path);
  }, []);

  const changeSelectionMode = useCallback((enabled: boolean) => {
    setSelectedPaths([]);
    setSelectionMode(enabled);
  }, []);

  const applyInitialSelection = useCallback((folders: { path: string }[], tracks: { path: string }[]) => {
    setSelectedFolderPath(folders[0]?.path);
    setSelectedPath(tracks[0]?.path);
    setSelectedPaths([]);
  }, []);

  const clearUnderFolder = useCallback((path: string) => {
    setSelectedPaths((current) => current.filter((trackPath) => !isTrackUnderFolder(trackPath, path)));
    setSelectedFolderPath((current) => (samePath(current ?? "", path) ? undefined : current));
    setSelectedPath((current) => (current && isTrackUnderFolder(current, path) ? undefined : current));
  }, []);

  const applyRenamedPaths = useCallback((renamedPaths: Map<string, string>) => {
    setSelectedPath((current) => (current ? renamedPaths.get(normalizePath(current)) ?? current : current));
    setSelectedPaths((current) => current.map((path) => renamedPaths.get(normalizePath(path)) ?? path));
  }, []);

  return {
    selectedPath,
    selectedPaths,
    selectionMode,
    selectedFolderPath,
    setSelectedPath,
    setSelectedPaths,
    setSelectionMode,
    setSelectedFolderPath,
    selectTrack,
    changeSelectionMode,
    applyInitialSelection,
    clearUnderFolder,
    applyRenamedPaths,
  };
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLocaleLowerCase();
}
