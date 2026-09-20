const MUSIC_KEY = "tritrick.musicMuted";
const SFX_KEY = "tritrick.sfxMuted";
let audioCtx = null;
let musicMuted = false;
let sfxMuted = false;
try { musicMuted = localStorage.getItem(MUSIC_KEY) === "1"; } catch {}
try { sfxMuted = localStorage.getItem(SFX_KEY) === "1"; } catch {}

let bgmGain = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmStarted = false;

const MELODY = [
  392.0, 440.0, 523.25, 440.0,
  349.23, 392.0, 440.0, 392.0,
  329.63, 349.23, 392.0, 349.23,
  293.66, 329.63, 349.23, 392.0,
];

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") {
    try { audioCtx.resume(); } catch {}
  }
  return audioCtx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    try { ctx.resume(); } catch {}
  }
  if (!musicMuted) startBgm();
  return ctx;
}

export function isMusicMuted() { return musicMuted; }
export function isSfxMuted() { return sfxMuted; }

export function setMusicMuted(next) {
  musicMuted = !!next;
  try { localStorage.setItem(MUSIC_KEY, musicMuted ? "1" : "0"); } catch {}
  if (musicMuted) stopBgm();
  else {
    unlockAudio();
    startBgm();
  }
  return musicMuted;
}

export function setSfxMuted(next) {
  sfxMuted = !!next;
  try { localStorage.setItem(SFX_KEY, sfxMuted ? "1" : "0"); } catch {}
  return sfxMuted;
}

export function toggleMusicMuted() { return setMusicMuted(!musicMuted); }
export function toggleSfxMuted() { return setSfxMuted(!sfxMuted); }

function buzz(ms) {
  if (sfxMuted) return;
  try { navigator.vibrate?.(ms); } catch {}
}

function env(ctx, start, peak, dur, peakGain) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  g.connect(ctx.destination);
  return g;
}

function blip(freq, dur, type, gain) {
  if (sfxMuted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
  osc.connect(env(ctx, t, gain, dur, gain));
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function wood(freq, dur, gain) {
  if (sfxMuted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = n.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
  }
  const src = ctx.createBufferSource();
  src.buffer = n;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  src.connect(bp);
  bp.connect(env(ctx, t, gain, dur, gain));
  src.start(t);
}

function playBgmNote(freq) {
  if (musicMuted) return;
  const ctx = getCtx();
  if (!ctx || !bgmGain) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  osc.connect(g);
  g.connect(bgmGain);
  osc.start(t);
  osc.stop(t + 0.42);
}

export function startBgm() {
  if (musicMuted || bgmStarted) return;
  const ctx = getCtx();
  if (!ctx) return;

  const begin = () => {
    if (musicMuted || bgmStarted) return;
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 1.0;
    bgmGain.connect(ctx.destination);
    bgmStarted = true;
    bgmStep = 0;
    playBgmNote(MELODY[0]);
    bgmTimer = window.setInterval(() => {
      if (musicMuted) return;
      bgmStep = (bgmStep + 1) % MELODY.length;
      playBgmNote(MELODY[bgmStep]);
    }, 420);
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(begin).catch(begin);
  } else {
    begin();
  }
}

export function stopBgm() {
  if (bgmTimer) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
  bgmStarted = false;
  if (bgmGain) {
    try { bgmGain.disconnect(); } catch {}
    bgmGain = null;
  }
}

/** Stop music and suspend Web Audio when the app leaves the foreground. */
export function pauseAudioForBackground() {
  stopBgm();
  if (audioCtx && audioCtx.state === "running") {
    try { audioCtx.suspend(); } catch {}
  }
}

export function resumeAudioIfNeeded() {
  if (musicMuted) return;
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    try { ctx.resume(); } catch {}
  }
  startBgm();
}

export function playSlide() {
  if (sfxMuted) return;
  wood(780, 0.07, 0.22);
  blip(210, 0.08, "triangle", 0.05);
  buzz(12);
}

export function playLift() {
  if (sfxMuted) return;
  wood(520, 0.09, 0.18);
  blip(280, 0.12, "sine", 0.07);
  buzz(16);
}

export function playDrop() {
  if (sfxMuted) return;
  wood(240, 0.11, 0.26);
  blip(140, 0.14, "triangle", 0.08);
  buzz(18);
}

export function playShuffle() {
  if (sfxMuted) return;
  const ctx = getCtx();
  if (!ctx) return;
  for (let i = 0; i < 5; i++) {
    window.setTimeout(() => wood(640 + i * 70, 0.05, 0.16), i * 42);
  }
  buzz(24);
}

export function playSolved() {
  if (sfxMuted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(env(ctx, t + i * 0.09, 0.12, 0.35, 0.1));
    osc.start(t + i * 0.09);
    osc.stop(t + i * 0.09 + 0.4);
  });
  buzz(30);
}

export function playBlocked() {
  if (sfxMuted) return;
  wood(140, 0.08, 0.12);
  blip(90, 0.1, "sine", 0.04);
}
