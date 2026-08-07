import { open, save } from "@tauri-apps/plugin-dialog";
import { Form } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioTrack, TagForm } from "../app/types";
import {
  analyzeReplayGain,
  cancelBatchTask,
  cancelReplayGain,
  loadLibraryTrack,
  readAudioFile,
  readImageFile,
  readTextFile,
  saveAudioTags,
  writeImageFile,
  writeTextFile,
} from "../backend/audioApi";
import { detectLyricsFormat } from "../backend/lyricsApi";
import { completeTagForm, splitGenreValues } from "../domain/tagForm";
import { normalizePath } from "../domain/libraryPath";
import { getReplayGainProgress, publishReplayGainProgress } from "./useReplayGainProgress";

type SongEditorDeps = {
  tracks: AudioTrack[];
  selectedPath?: string;
  setSelectedPath: (path?: string) => void;
  replaceTrack: (track: AudioTrack) => void;
  message: MessageInstance;
  t: TFunction;
};

export function useSongEditor({ tracks, selectedPath, setSelectedPath, replaceTrack, message, t }: SongEditorDeps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTrack, setDetailTrack] = useState<AudioTrack>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<TagForm>();
  const detailRequest = useRef(0);
  const selectedTrack = detailTrack?.path === selectedPath ? detailTrack : tracks.find((track) => track.path === selectedPath);

  useEffect(() => {
    setDetailTrack((current) => (current && current.path !== selectedPath ? undefined : current));
  }, [selectedPath]);

  useEffect(() => {
    if (!detailsOpen || !selectedTrack) return;
    form.resetFields();
    form.setFieldsValue({
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      album: selectedTrack.album,
      albumArtist: selectedTrack.albumArtist,
      trackNumber: selectedTrack.trackNumber,
      discNumber: selectedTrack.discNumber,
      year: selectedTrack.year,
      genre: splitGenreValues(selectedTrack.genre),
      language: selectedTrack.language,
      composer: selectedTrack.composer,
      lyricist: selectedTrack.lyricist,
      copyright: selectedTrack.copyright,
      rating: selectedTrack.rating,
      comment: selectedTrack.comment,
      lyrics: selectedTrack.lyrics,
      replayGainTrackGain: selectedTrack.replayGainTrackGain,
      replayGainTrackPeak: selectedTrack.replayGainTrackPeak,
      replayGainAlbumGain: selectedTrack.replayGainAlbumGain,
      replayGainAlbumPeak: selectedTrack.replayGainAlbumPeak,
      replayGainReferenceLoudness: selectedTrack.replayGainReferenceLoudness,
      coverDataUrl: undefined,
      removeCover: false,
    });
  }, [detailsOpen, form, selectedTrack]);

  const openTrackDetails = useCallback(async (path = selectedPath) => {
    if (!path) return;
    setSelectedPath(path);
    setDetailsOpen(true);
    if (detailTrack?.path === path) return;

    const requestId = ++detailRequest.current;
    setDetailTrack(undefined);
    setDetailsLoading(true);
    try {
      const fullTrack = await loadLibraryTrack(path);
      if (requestId === detailRequest.current) setDetailTrack(fullTrack);
    } catch (error) {
      if (requestId === detailRequest.current) message.error(String(error));
    } finally {
      if (requestId === detailRequest.current) setDetailsLoading(false);
    }
  }, [detailTrack, message, selectedPath, setSelectedPath]);

  const closeSongDetails = useCallback(() => setDetailsOpen(false), []);

  const refreshSelected = useCallback(async () => {
    if (!selectedTrack) return;
    try {
      const refreshed = await readAudioFile(selectedTrack.path);
      replaceTrack(refreshed);
      setDetailTrack(refreshed);
      message.success(t("messages.reloaded"));
    } catch (error) {
      message.error(String(error));
    }
  }, [message, replaceTrack, selectedTrack, t]);

  const saveSelected = useCallback(async () => {
    if (!selectedTrack) {
      message.warning(t("messages.selectSong"));
      return;
    }
    setSaving(true);
    try {
      await form.validateFields();
      const values = completeTagForm(form.getFieldsValue(true), selectedTrack);
      const saved = await saveAudioTags(selectedTrack.path, values);
      replaceTrack(saved);
      setDetailTrack(saved);
      setSelectedPath(saved.path);
      message.success(t("messages.saved"));
    } catch (error) {
      message.error(String(error));
    } finally {
      setSaving(false);
    }
  }, [form, message, replaceTrack, selectedTrack, setSelectedPath, t]);

  const calculateSelectedReplayGain = useCallback(async () => {
    if (!selectedTrack || getReplayGainProgress()?.status === "running") return;
    const jobId = crypto.randomUUID();
    publishReplayGainProgress({ jobId, path: selectedTrack.path, percent: 0, status: "running" });
    try {
      const result = await analyzeReplayGain(selectedTrack.path, jobId);
      form.setFieldsValue({
        replayGainTrackGain: result.trackGain,
        replayGainTrackPeak: result.trackPeak,
        replayGainReferenceLoudness: result.referenceLoudness,
      });
      message.success(t("messages.replayGainCalculated"));
    } catch (error) {
      if (!String(error).toLocaleLowerCase().includes("cancelled")) message.error(String(error));
    }
  }, [form, message, selectedTrack, t]);

  const cancelActiveReplayGain = useCallback(async () => {
    const progress = getReplayGainProgress();
    if (progress?.status !== "running") return;
    const batchTaskId = progress.jobId.includes(":") ? progress.jobId.split(":", 1)[0] : undefined;
    const request = batchTaskId?.startsWith("batch-") ? cancelBatchTask(batchTaskId) : cancelReplayGain(progress.jobId);
    await request.catch((error) => message.error(String(error)));
  }, [message]);

  const chooseLocalCover = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t("cover.choose"),
      filters: [{ name: t("cover.images"), extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof selected !== "string") return;
    try {
      const coverDataUrl = await readImageFile(selected);
      form.setFieldsValue({ coverDataUrl, removeCover: false });
    } catch (error) {
      message.error(String(error));
    }
  }, [form, message, t]);

  const useSameAlbumCover = useCallback(async () => {
    if (!selectedTrack?.album) return;
    const candidate = tracks.find((track) =>
      track.path !== selectedTrack.path && track.hasCover && track.album === selectedTrack.album,
    );
    if (!candidate) {
      message.warning(t("cover.noAlbumCover"));
      return;
    }
    try {
      const source = await loadLibraryTrack(candidate.path);
      if (!source.coverDataUrl) throw new Error(t("cover.noAlbumCover"));
      form.setFieldsValue({ coverDataUrl: source.coverDataUrl, removeCover: false });
    } catch (error) {
      message.error(String(error));
    }
  }, [form, message, selectedTrack, t, tracks]);

  const removeSelectedCover = useCallback(() => {
    form.setFieldsValue({ coverDataUrl: undefined, removeCover: true });
  }, [form]);

  const revertSelectedCover = useCallback(() => {
    form.setFieldsValue({ coverDataUrl: undefined, removeCover: false });
  }, [form]);

  const exportSelectedCover = useCallback(async () => {
    if (!selectedTrack || form.getFieldValue("removeCover")) {
      message.warning(t("cover.empty"));
      return;
    }
    const dataUrl = String(form.getFieldValue("coverDataUrl") ?? selectedTrack.coverDataUrl ?? "");
    if (!dataUrl) {
      message.warning(t("cover.empty"));
      return;
    }
    const extension = dataUrl.startsWith("data:image/png") ? "png" : dataUrl.startsWith("data:image/webp") ? "webp" : dataUrl.startsWith("data:image/gif") ? "gif" : "jpg";
    const baseName = selectedTrack.fileName.replace(/\.[^.]+$/, "");
    const destination = await save({
      title: t("cover.export"),
      defaultPath: `${baseName}-cover.${extension}`,
      filters: [{ name: t("cover.images"), extensions: [extension] }],
    });
    if (!destination) return;
    try {
      await writeImageFile(destination, dataUrl);
      message.success(t("messages.coverExported"));
    } catch (error) {
      message.error(String(error));
    }
  }, [form, message, selectedTrack, t]);

  const importLyricsFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t("lyrics.import"),
      filters: [{ name: t("lyrics.files"), extensions: ["lrc", "ttml", "txt"] }],
    });
    if (typeof selected !== "string") return;
    try {
      form.setFieldValue("lyrics", await readTextFile(selected));
      message.success(t("messages.lyricsImported"));
    } catch (error) {
      message.error(String(error));
    }
  }, [form, message, t]);

  const exportLyricsFile = useCallback(async () => {
    const lyrics = String(form.getFieldValue("lyrics") ?? "");
    if (!lyrics.trim() || !selectedTrack) {
      message.warning(t("lyrics.empty"));
      return;
    }
    try {
      const extension = await detectLyricsFormat(lyrics) === "ttml" ? "ttml" : "lrc";
      const baseName = selectedTrack.fileName.replace(/\.[^.]+$/, "");
      const destination = await save({
        title: t("lyrics.export"),
        defaultPath: `${baseName}.${extension}`,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (!destination) return;
      await writeTextFile(destination, lyrics);
      message.success(t("messages.lyricsExported"));
    } catch (error) {
      message.error(String(error));
    }
  }, [form, message, selectedTrack, t]);

  const clearRenamedTrack = useCallback((renamedPaths: Map<string, string>) => {
    setDetailTrack((current) => (current && renamedPaths.has(normalizePath(current.path)) ? undefined : current));
  }, []);

  return {
    detailsOpen,
    detailsLoading,
    detailTrack,
    selectedTrack,
    form,
    saving,
    openTrackDetails,
    closeSongDetails,
    refreshSelected,
    saveSelected,
    calculateSelectedReplayGain,
    cancelActiveReplayGain,
    chooseLocalCover,
    useSameAlbumCover,
    removeSelectedCover,
    revertSelectedCover,
    exportSelectedCover,
    importLyricsFile,
    exportLyricsFile,
    clearRenamedTrack,
  };
}
