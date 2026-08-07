import { open } from "@tauri-apps/plugin-dialog";
import type { MessageInstance } from "antd/es/message/interface";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AudioTrack, LibraryFolder } from "../app/types";
import {
  loadLibraryFolders,
  loadLibraryTracks,
  removeLibraryFolder,
  scanFolder,
  upsertLibraryFolder,
} from "../backend/audioApi";
import { updateCachedCover } from "./useTrackCovers";
import { isTrackUnderFolder, samePath } from "../domain/libraryPath";

export function useLibrary(
  message: MessageInstance,
  t: TFunction,
  setSelectedPath: Dispatch<SetStateAction<string | undefined>>,
  setSelectedFolderPath: Dispatch<SetStateAction<string | undefined>>,
  applyInitialSelection: (folders: LibraryFolder[], tracks: AudioTrack[]) => void,
) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const startupScanStarted = useRef(false);

  useEffect(() => {
    let disposed = false;
    Promise.all([loadLibraryFolders(), loadLibraryTracks()])
      .then(([storedFolders, storedTracks]) => {
        if (disposed) return;
        setFolders(storedFolders);
        setTracks(storedTracks);
        applyInitialSelection(storedFolders, storedTracks);
        if (storedFolders.length > 0 && !startupScanStarted.current) {
          startupScanStarted.current = true;
          void scanFoldersOnStartup(storedFolders.map((folder) => folder.path));
        }
      })
      .catch(() => {
        if (disposed) return;
        setFolders([]);
        setTracks([]);
      });
    return () => {
      disposed = true;
    };
  }, [applyInitialSelection]);

  const reloadTracks = useCallback(async () => {
    setTracks(await loadLibraryTracks());
  }, []);

  const replaceTrack = useCallback((nextTrack: AudioTrack) => {
    setTracks((current) => current.map((track) => (samePath(track.path, nextTrack.path) ? nextTrack : track)));
    updateCachedCover(nextTrack.path, nextTrack.coverDataUrl);
  }, []);

  const scanAndMergeFolder = useCallback(async (path: string) => {
    setLoading(true);
    setFolders((current) => upsertFolder(current, { path, trackCount: 0, status: "scanning" }));
    try {
      const folderTracks = await scanFolder(path);
      const scannedAt = new Date().toISOString();
      setTracks((current) => mergeFolderTracks(current, folderTracks, path));
      setFolders((current) =>
        upsertFolder(current, { path, trackCount: folderTracks.length, status: "ready", lastScannedAt: scannedAt }),
      );
      setSelectedFolderPath(path);
      setSelectedPath((current) => current ?? folderTracks[0]?.path);
      message.success(t("messages.scanned", { count: folderTracks.length }));
    } catch (error) {
      const failedFolder = { path, trackCount: 0, status: "error" as const, error: String(error) };
      setFolders((current) => upsertFolder(current, failedFolder));
      await upsertLibraryFolder(failedFolder).catch(() => undefined);
      message.error(String(error));
    } finally {
      setLoading(false);
    }
  }, [message, setSelectedFolderPath, setSelectedPath, t]);

  const addFolders = useCallback(async () => {
    const selected = await open({ directory: true, multiple: true, title: t("folders.add") });
    const selectedPaths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    const newPaths = selectedPaths.filter((path) => !folders.some((folder) => samePath(folder.path, path)));
    if (newPaths.length === 0) return;
    for (const path of newPaths) await scanAndMergeFolder(path);
  }, [folders, scanAndMergeFolder, t]);

  const removeFolderTracks = useCallback(async (path: string) => {
    setFolders((current) => current.filter((folder) => !samePath(folder.path, path)));
    setTracks((current) => current.filter((track) => !isTrackUnderFolder(track.path, path)));
    await removeLibraryFolder(path).catch((error) => message.error(String(error)));
  }, [message]);

  async function scanFoldersOnStartup(paths: string[]) {
    for (const path of paths) {
      await scanFolderSilently(path);
    }
  }

  async function scanFolderSilently(path: string) {
    setFolders((current) => upsertFolder(current, { path, trackCount: 0, status: "scanning" }));
    try {
      const folderTracks = await scanFolder(path);
      const scannedAt = new Date().toISOString();
      setTracks((current) => mergeFolderTracks(current, folderTracks, path));
      setFolders((current) =>
        upsertFolder(current, { path, trackCount: folderTracks.length, status: "ready", lastScannedAt: scannedAt }),
      );
    } catch (error) {
      setFolders((current) => upsertFolder(current, { path, trackCount: 0, status: "error", error: String(error) }));
    }
  }

  return {
    tracks,
    folders,
    loading,
    reloadTracks,
    replaceTrack,
    scanAndMergeFolder,
    addFolders,
    removeFolderTracks,
  };
}

function upsertFolder(folders: LibraryFolder[], folder: LibraryFolder) {
  const rest = folders.filter((candidate) => !samePath(candidate.path, folder.path));
  return [...rest, folder].sort((left, right) => left.path.localeCompare(right.path));
}

function mergeFolderTracks(current: AudioTrack[], folderTracks: AudioTrack[], folderPath: string) {
  const remaining = current.filter((track) => !isTrackUnderFolder(track.path, folderPath));
  const seen = new Set<string>();
  return [...remaining, ...folderTracks].filter((track) => {
    const key = track.path.replace(/\\/g, "/").toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
