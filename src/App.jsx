import React, { useEffect, useState } from "react";
import { translations, LANGS } from "./i18n";
import PuzzleBoard from "./PuzzleBoard.jsx";
import {
  isMusicMuted,
  isSfxMuted,
  toggleMusicMuted,
  toggleSfxMuted,
  unlockAudio,
  startBgm,
  pauseAudioForBackground,
  resumeAudioIfNeeded,
} from "./sounds.js";

const LANG_KEY = "tritrick.lang";

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && translations[saved]) return saved;
  const nav = (navigator.language || "es").slice(0, 2).toLowerCase();
  return translations[nav] ? nav : "es";
}

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const [howOpen, setHowOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [musicMuted, setMusicMutedUi] = useState(isMusicMuted);
  const [sfxMuted, setSfxMutedUi] = useState(isSfxMuted);
  const t = translations[lang];

  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = lang;
    document.body.classList.add("is-play");
    document.body.classList.remove("is-home");
  }, [lang, t.title]);

  useEffect(() => {
    const kickMusic = () => {
      if (document.visibilityState === "hidden") return;
      unlockAudio();
      if (!isMusicMuted()) startBgm();
    };
    const silence = () => {
      pauseAudioForBackground();
    };
    window.TriTrickStartMusic = kickMusic;
    window.TriTrickStopMusic = silence;
    kickMusic();
    const timers = [120, 400, 900, 1600].map((ms) => window.setTimeout(kickMusic, ms));
    const onFirst = () => kickMusic();
    window.addEventListener("pointerdown", onFirst, true);
    window.addEventListener("touchstart", onFirst, true);
    window.addEventListener("keydown", onFirst, true);
    const onVis = () => {
      if (document.visibilityState === "hidden") silence();
      else resumeAudioIfNeeded();
    };
    const onPageHide = () => silence();
    const onBlur = () => {
      // Android WebView often keeps audio on blur/home; silence immediately.
      if (document.visibilityState !== "visible") silence();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("pointerdown", onFirst, true);
      window.removeEventListener("touchstart", onFirst, true);
      window.removeEventListener("keydown", onFirst, true);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
      silence();
      delete window.TriTrickStartMusic;
      delete window.TriTrickStopMusic;
    };
  }, []);

  useEffect(() => {
    window.TriTrickConsumeBack = () => {
      if (howOpen) {
        setHowOpen(false);
        return true;
      }
      if (langOpen) {
        setLangOpen(false);
        return true;
      }
      return false;
    };
    return () => {
      delete window.TriTrickConsumeBack;
    };
  }, [howOpen, langOpen]);

  const closeHow = () => setHowOpen(false);

  const onMusicToggle = () => {
    unlockAudio();
    const next = toggleMusicMuted();
    setMusicMutedUi(next);
    if (!next) startBgm();
  };

  const onSfxToggle = () => {
    unlockAudio();
    setSfxMutedUi(toggleSfxMuted());
  };

  return (
    <>
      <div className="felt" />

      <section id="screen-play" className="screen page">
        <header className="page-top">
          <div className="lang-wrap">
            <button
              type="button"
              className="icon-btn"
              aria-label={t.langAria}
              onClick={() => setLangOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3 12h18M12 3c2.8 3.2 2.8 14.8 0 18M12 3c-2.8 3.2-2.8 14.8 0 18" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
            {langOpen && (
              <div className="lang-menu">
                {LANGS.map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    className={code === lang ? "active" : ""}
                    onClick={() => {
                      setLang(code);
                      localStorage.setItem(LANG_KEY, code);
                      setLangOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="page-title-btn"
            aria-label="Reload"
            onClick={() => window.location.reload()}
          >
            {t.title}
          </button>
          <div className="header-actions">
            <button
              type="button"
              className={`icon-btn sound-btn ${musicMuted ? "is-muted" : ""}`}
              aria-label={musicMuted ? t.musicOnAria : t.musicOffAria}
              onClick={onMusicToggle}
            >
              {musicMuted ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="7" cy="18" r="2.2" fill="currentColor" />
                  <circle cx="17" cy="16" r="2.2" fill="currentColor" />
                  <path d="M4 5l16 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="7" cy="18" r="2.2" fill="currentColor" />
                  <circle cx="17" cy="16" r="2.2" fill="currentColor" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className={`icon-btn sound-btn ${sfxMuted ? "is-muted" : ""}`}
              aria-label={sfxMuted ? t.sfxOnAria : t.sfxOffAria}
              onClick={onSfxToggle}
            >
              {sfxMuted ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h3l5 4V5L7 9H4z" fill="currentColor" />
                  <path d="M16 9l5 5M21 9l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h3l5 4V5L7 9H4z" fill="currentColor" />
                  <path d="M16 8.5c1.2 1.1 1.9 2.6 1.9 4.2s-.7 3.1-1.9 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M18.4 6.2C20.5 8 21.7 10.4 21.7 13s-1.2 5-3.3 6.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <PuzzleBoard strings={t} />

        <div className="page-bottom">
          <button type="button" className="mode-card teal guide-banner" onClick={() => setHowOpen(true)}>
            <span className="mode-ico guide-mark">?</span>
            <span className="mode-name">{t.modoGuide}</span>
            <span className="mode-sub">{t.modoGuideSub}</span>
          </button>
          <p className="home-foot">{t.credit}</p>
        </div>
      </section>

      {howOpen && (
        <div className="sheet" onClick={closeHow}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-x" onClick={closeHow}>
              ×
            </button>
            <h2>{t.howTitle}</h2>
            <article className="how-hero">
              <h3>{t.howProblemTitle}</h3>
              <p>{t.howProblemText}</p>
            </article>
            <div className="how-modes">
              <article className="how-mode">
                <h4>{t.howNormalName}</h4>
                <p>{t.howNormalText}</p>
              </article>
              <article className="how-mode gold">
                <h4>{t.howCoverName}</h4>
                <p>{t.howCoverText}</p>
              </article>
            </div>
            <a
              className="how-link"
              href="https://www.jaapsch.net/puzzles/tritrick.htm"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.howLink}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
