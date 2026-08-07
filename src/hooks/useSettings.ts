import type { MessageInstance } from "antd/es/message/interface";
import type { i18n as I18n } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtistSplitConfig, DesktopSettings } from "../app/types";
import {
  loadArtistSplitConfig,
  loadDesktopSettings,
  saveArtistSplitConfig,
  saveDesktopSettings,
} from "../backend/audioApi";
import {
  getLanguagePreference,
  resolveLanguage,
  setLanguagePreference as persistLanguagePreference,
  type LanguagePreference,
} from "../i18n";
import { defaultArtistSplitConfig } from "../domain/library";

const defaultDesktopSettings: DesktopSettings = {
  searchPageSize: 10,
  lyricFormat: "verbatimLrc",
  lyricsConversionMode: "none",
  showTranslation: true,
  showRomanization: true,
  onlyTranslationIfAvailable: false,
  removeEmptyLyricLines: true,
  renameCharacterMappings: {
    "\\": "＼", "/": "／", ":": "：", "*": "＊", "?": "？", "\"": "＂", "<": "＜", ">": "＞", "|": "｜",
  },
};

export function useSettings(i18n: I18n, message: MessageInstance) {
  const [artistSplitConfig, setArtistSplitConfig] = useState<ArtistSplitConfig>(defaultArtistSplitConfig);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(defaultDesktopSettings);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(getLanguagePreference);
  const artistSplitSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let disposed = false;
    Promise.all([loadArtistSplitConfig(), loadDesktopSettings()])
      .then(([storedArtistSplitConfig, storedSettings]) => {
        if (disposed) return;
        setArtistSplitConfig(storedArtistSplitConfig);
        setDesktopSettings(storedSettings);
      })
      .catch(() => {
        if (disposed) return;
        setArtistSplitConfig(defaultArtistSplitConfig);
        setDesktopSettings(defaultDesktopSettings);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (languagePreference !== "system") return;
    const handleLanguageChange = () => void i18n.changeLanguage(resolveLanguage("system"));
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, [i18n, languagePreference]);

  const changeLanguage = useCallback((preference: LanguagePreference) => {
    setLanguagePreference(preference);
    void persistLanguagePreference(preference);
  }, []);

  const changeArtistSplitConfig = useCallback((config: ArtistSplitConfig) => {
    setArtistSplitConfig(config);
    artistSplitSaveQueue.current = artistSplitSaveQueue.current
      .then(() => saveArtistSplitConfig(config))
      .catch((error) => {
        message.error(String(error));
      });
  }, [message]);

  const changeDesktopSettings = useCallback((settings: DesktopSettings) => {
    setDesktopSettings(settings);
    settingsSaveQueue.current = settingsSaveQueue.current
      .then(() => saveDesktopSettings(settings))
      .catch((error) => {
        message.error(String(error));
      });
  }, [message]);

  return {
    artistSplitConfig,
    desktopSettings,
    languagePreference,
    changeLanguage,
    changeArtistSplitConfig,
    changeDesktopSettings,
  };
}
