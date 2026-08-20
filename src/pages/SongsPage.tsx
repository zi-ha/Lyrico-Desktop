import { ReloadOutlined } from "@ant-design/icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { AudioTrack, LibraryFolder } from "../app/types";
import { TrackArtwork } from "../components/TrackArtwork";
import { isTrackUnderFolder } from "../domain/libraryPath";
import { formatDuration } from "../utils/format";

const { Text } = Typography;

export const SongsPage = memo(function SongsPage({
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
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ y: number; path: string } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const itemHeight = 48;
  const dragThreshold = 5;
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const getVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { start: 0, end: tracks.length };
    const scrollTop = container.scrollTop;
    const height = container.clientHeight;
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(tracks.length, start + Math.ceil(height / itemHeight) + 2);
    return { start, end };
  }, [tracks.length]);

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        forceUpdate((n) => n + 1);
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, path: string) => {
    if (e.button !== 0) return;
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    setDragStart({ y: e.clientY, path });
    setDragCurrent(e.clientY);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDownPos.current) return;
    const dx = Math.abs(e.clientX - mouseDownPos.current.x);
    const dy = Math.abs(e.clientY - mouseDownPos.current.y);
    if (!isDragging && (dx > dragThreshold || dy > dragThreshold)) {
      setIsDragging(true);
    }
    if (isDragging) {
      setDragCurrent((current) => (current == null || Math.abs(e.clientY - current) > 2 ? e.clientY : current));
    }
  }, [isDragging]);

  const getPathsInRange = useCallback((startIdx: number, endIdx: number) => {
    const min = Math.min(startIdx, endIdx);
    const max = Math.max(startIdx, endIdx);
    const paths: string[] = [];
    for (let i = min; i <= max; i++) {
      if (tracks[i]) paths.push(tracks[i].path);
    }
    return paths;
  }, [tracks]);

  const handleClick = useCallback((path: string) => {
    const set = new Set(selectedPaths);
    if (set.has(path)) {
      set.delete(path);
    } else {
      set.add(path);
    }
    onChangeSelectedPaths([...set]);
    onSelectTrack(path);
  }, [selectedPaths, onSelectTrack, onChangeSelectedPaths]);

  const handleMouseUp = useCallback((e: React.MouseEvent, path: string) => {
    if (e.button !== 0) return;
    if (isDragging && dragStart && dragCurrent !== null) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const startIdx = Math.floor((dragStart.y - rect.top + scrollTop) / itemHeight);
        const endIdx = Math.floor((dragCurrent - rect.top + scrollTop) / itemHeight);
        const paths = getPathsInRange(
          Math.max(0, Math.min(startIdx, tracks.length - 1)),
          Math.max(0, Math.min(endIdx, tracks.length - 1))
        );
        if (e.ctrlKey || e.metaKey) {
          const set = new Set(selectedPaths);
          for (const p of paths) {
            if (set.has(p)) set.delete(p); else set.add(p);
          }
          onChangeSelectedPaths([...set]);
        } else {
          onChangeSelectedPaths(paths);
        }
      }
    } else if (!isDragging) {
      if (e.shiftKey && selectedPath) {
        const startIdx = tracks.findIndex((t) => t.path === selectedPath);
        const endIdx = tracks.findIndex((t) => t.path === path);
        if (startIdx >= 0 && endIdx >= 0) {
          onChangeSelectedPaths(getPathsInRange(startIdx, endIdx));
        }
      } else {
        handleClick(path);
      }
    }
    mouseDownPos.current = null;
    setDragStart(null);
    setDragCurrent(null);
    setIsDragging(false);
  }, [isDragging, dragStart, dragCurrent, selectedPaths, selectedPath, tracks, onChangeSelectedPaths, getPathsInRange, handleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectTrack(path);
    // 右键默认重新读取一次文件，更新列表与数据库后再打开详情
    void onRefreshTrack(path).then(() => onOpenDetails(path));
  }, [onSelectTrack, onOpenDetails, onRefreshTrack]);

  const { start, end } = getVisibleRange();
  const totalHeight = tracks.length * itemHeight;
  const selectedSet = new Set(selectedPaths);

  let dragSelectRange: { min: number; max: number } | null = null;
  if (isDragging && dragStart && dragCurrent !== null) {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const startIdx = Math.floor((dragStart.y - rect.top + scrollTop) / itemHeight);
      const endIdx = Math.floor((dragCurrent - rect.top + scrollTop) / itemHeight);
      dragSelectRange = {
        min: Math.max(0, Math.min(startIdx, endIdx)),
        max: Math.min(tracks.length - 1, Math.max(startIdx, endIdx)),
      };
    }
  }
  const selectedFolder = selectedPath
    ? folders.find((folder) => isTrackUnderFolder(selectedPath, folder.path))
    : undefined;

  return (
    <div className="songs-page" onContextMenu={(e) => e.preventDefault()}>
      <div className="songs-header-row">
        <div className="songs-col-check" />
        <div className="songs-col-artwork" />
        <div className="songs-col-filename songs-header-filename">
          <span className="songs-col-filename-label">{t("table.fileName")}</span>
          <Tooltip title={t("folders.rescan")}>
            <Button
              type="text"
              size="small"
              className="songs-header-refresh"
              aria-label={t("folders.rescan")}
              icon={<ReloadOutlined />}
              disabled={!selectedFolder}
              onClick={(event) => {
                event.stopPropagation();
                if (selectedFolder) onRescanFolder(selectedFolder.path);
              }}
            />
          </Tooltip>
        </div>
        <div className="songs-col-format">{t("table.format")}</div>
        <div className="songs-col-title">{t("details.titleField")}</div>
        <div className="songs-col-artist">{t("details.artist")}</div>
        <div className="songs-col-album">{t("details.album")}</div>
        <div className="songs-col-albumartist">{t("details.albumArtist")}</div>
        <div className="songs-col-duration">{t("table.duration")}</div>
      </div>
      <div className="songs-list-container" ref={containerRef} onMouseMove={handleMouseMove}>
        <div className="songs-list-scroll" style={{ height: totalHeight, position: "relative" }}>
          {tracks.slice(start, end).map((track, i) => {
            const idx = start + i;
            const isActive = track.path === selectedPath;
            const isSelected = selectedSet.has(track.path);
            const isDragHighlighted = dragSelectRange !== null && idx >= dragSelectRange.min && idx <= dragSelectRange.max;
            return (
              <div
                key={track.path}
                className={`songs-list-row${isActive ? " row-active" : ""}${isSelected ? " row-selected" : ""}${isDragHighlighted ? " row-drag-highlight" : ""}`}
                style={{ position: "absolute", top: idx * itemHeight, left: 0, right: 0, height: itemHeight }}
                onMouseDown={(e) => handleMouseDown(e, track.path)}
                onMouseUp={(e) => handleMouseUp(e, track.path)}
                onContextMenu={(e) => handleContextMenu(e, track.path)}
              >
                <div
                  className="songs-col-check"
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleClick(track.path)}
                    aria-label={track.title || track.fileName}
                  />
                </div>
                <div className="songs-col-artwork">
                  <TrackArtwork track={track} size={32} />
                </div>
                <div className="songs-col-filename">
                  <Text ellipsis>{track.fileName}</Text>
                </div>
                <div className="songs-col-format">
                  <Text type="secondary">{track.format || "—"}</Text>
                </div>
                <div className="songs-col-title">
                  <Text ellipsis>{track.title || "—"}</Text>
                </div>
                <div className="songs-col-artist">
                  <Text ellipsis>{track.artist || "—"}</Text>
                </div>
                <div className="songs-col-album">
                  <Text type="secondary" ellipsis>{track.album || "—"}</Text>
                </div>
                <div className="songs-col-albumartist">
                  <Text type="secondary" ellipsis>{track.albumArtist || "—"}</Text>
                </div>
                <div className="songs-col-duration">
                  <Text type="secondary">{formatDuration(track.durationSeconds)}</Text>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
