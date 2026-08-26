import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { unlockAudio, playSlide, playLift, playDrop, playShuffle, playSolved, playBlocked } from "./sounds.js";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "Ñ", "O"];
const SLOTS = LETTERS.length;
const BLOCK_LEN = 10;
const MAX_INDEX = SLOTS - BLOCK_LEN;
const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const snapToIndex = (v) => clamp(Math.round(v), 0, MAX_INDEX);
const computeInternalStart = (startGlobal) => 6 - startGlobal;
const overlapLen = (aStart, bStart) => {
  if (aStart == null || bStart == null) return 0;
  const a0 = aStart, a1 = aStart + 2, b0 = bStart, b1 = bStart + 2;
  const left = Math.max(a0, b0), right = Math.min(a1, b1);
  return Math.max(0, right - left + 1);
};

function isSolvedWithBlocks(values, swapped, blockedSet) {
  if (swapped) return false;
  if (!Array.isArray(values) || values.length < 9) return false;
  for (let i = 0; i < 9; i++) {
    if (blockedSet.has(i)) continue;
    if (values[i] !== i + 1) return false;
  }
  return true;
}

const isPermutation19 = (vals) => {
  if (!Array.isArray(vals) || vals.length !== 9) return false;
  let sum = 0;
  const seen = new Set();
  for (const v of vals) {
    if (!Number.isInteger(v) || v < 1 || v > 9) return false;
    if (seen.has(v)) return false;
    seen.add(v);
    sum += v;
  }
  return sum === 45;
};

const springLift = { type: "spring", stiffness: 170, damping: 18, mass: 0.45 };
const springSlide = { type: "spring", stiffness: 200, damping: 22, mass: 0.5 };
const fadeQuick = { duration: 0.16 };

const variantsTop = {
  enterUp: { y: 24, opacity: 0 },
  center: { y: 0, opacity: 1, transition: springLift },
  exitUp: { y: -20, opacity: 0, transition: fadeQuick },
  enterDown: { y: -24, opacity: 0 },
  exitDown: { y: 20, opacity: 0, transition: fadeQuick },
};

const variantsBottom = {
  enterUp: { y: -24, opacity: 0 },
  center: { y: 0, opacity: 1, transition: springLift },
  exitUp: { y: 16, opacity: 0, transition: fadeQuick },
  enterDown: { y: 24, opacity: 0 },
  exitDown: { y: -16, opacity: 0, transition: fadeQuick },
};

function CompactRail({ children, heightPx }) {
  return (
    <div className="w-full chassis-row">
      <div className="relative w-full" style={{ height: heightPx }}>
        <div
          className="absolute overflow-hidden rail-bed hole"
          style={{ left: `${(6 / SLOTS) * 100}%`, width: `${(3 / SLOTS) * 100}%`, top: 0, bottom: 0 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function TileStrip({ values, fontVar, empty }) {
  const cells = empty ? [null, null, null] : values;
  return (
    <div className="h-full tile-strip" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
      {cells.map((val, i) => (
        <div
          key={i}
          className={`tile-num ${val == null ? "tile-empty" : ""}`}
          style={val != null ? { fontSize: `var(${fontVar})` } : undefined}
        >
          {val}
        </div>
      ))}
    </div>
  );
}

export default function PuzzleBoard({ strings }) {
  const [pos, setPos] = useState(5);
  const [isDragging, setIsDragging] = useState(false);
  const [coverMode, setCoverMode] = useState(null);
  const [swapped, setSwapped] = useState(false);
  const [whiteStart, setWhiteStart] = useState(null);
  const [topTriplet, setTopTriplet] = useState([]);
  const [topHasWhite, setTopHasWhite] = useState(false);
  const [bottomTriplet, setBottomTriplet] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [lastAction, setLastAction] = useState(null);

  const containerRef = useRef(null);
  const railBoxRef = useRef(null);
  const wrapRef = useRef(null);
  const dragState = useRef({ startX: 0, startPos: 0, slotW: 0 });

  const [railH, setRailH] = useState(100);

  const computeRailHeight = (w) => {
    if (!w) return 100;
    const base = w / 16;
    const native = document.documentElement.classList.contains("is-native");
    if (native) {
      if (w <= 360) return Math.round(base * 2.05);
      if (w <= 480) return Math.round(base * 1.9);
      return Math.round(base * 1.35);
    }
    if (w <= 360) return Math.round(base * 2.35);
    if (w <= 480) return Math.round(base * 2.2);
    if (w <= 768) return Math.round(base * 1.4);
    return Math.round(base * 1.0);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 0;
      setRailH(computeRailHeight(w));
    });
    ro.observe(el);
    const w0 = el.getBoundingClientRect().width;
    setRailH(computeRailHeight(w0));
    return () => ro.disconnect();
  }, []);

  const blockedArray = coverMode === 9 ? [8] : coverMode === 89 ? [7, 8] : [];
  const blockedSet = new Set(blockedArray);

  const valueAtIndex = (i) => overrides[i] ?? (i + 1);
  const moveBy = (delta) => {
    unlockAudio();
    setPos((p) => {
      const next = clamp(p + delta, 0, MAX_INDEX);
      if (next !== p) playSlide();
      else playBlocked();
      return next;
    });
  };
  const currentCenterValues = Array.from({ length: 9 }, (_, i) => valueAtIndex(i));
  const isSolved = isSolvedWithBlocks(currentCenterValues, swapped, blockedSet);
  const skipSolvedSound = useRef(true);
  useEffect(() => {
    if (skipSolvedSound.current) {
      skipSolvedSound.current = false;
      return;
    }
    if (isSolved) playSolved();
  }, [isSolved]);

  const setMode = (next) => {
    setCoverMode((m) => (m === next ? null : next));
  };

  const onPointerDown = (e) => {
    unlockAudio();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const slotW = rect.width / SLOTS;
    const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    dragState.current = { startX: clientX, startPos: pos, slotW };
    setIsDragging(true);
    try { e.target?.setPointerCapture?.(e.pointerId || 0); } catch {}
  };
  const onPointerMove = (e) => {
    if (!isDragging) return;
    const x = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    const { startX, startPos, slotW } = dragState.current;
    const deltaSlots = (x - startX) / slotW;
    setPos(clamp(startPos + deltaSlots, 0, MAX_INDEX));
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    setPos((p) => {
      const next = snapToIndex(p);
      if (Math.round(dragState.current.startPos) !== next) playSlide();
      return next;
    });
    setIsDragging(false);
  };

  const roundedPos = Math.round(pos);
  const targetStart = computeInternalStart(roundedPos);
  const overlap = swapped ? overlapLen(whiteStart, targetStart) : 0;

  const tripletIncludesBlocked = (start) => {
    if (start == null || start < 0 || start > 6) return false;
    for (let j = 0; j < 3; j++) if (blockedSet.has(start + j)) return true;
    return false;
  };
  const whiteRangeIncludesBlocked = (ws) => {
    if (ws == null) return false;
    for (let j = 0; j < 3; j++) if (blockedSet.has(ws + j)) return true;
    return false;
  };

  const upPhase = topTriplet.length === 0 && !topHasWhite;
  const canUpBase = upPhase && targetStart >= 0 && targetStart <= 6 && !tripletIncludesBlocked(targetStart);
  const canUpSpecialRotate = swapped && bottomTriplet.length === 3 && overlap === 3 && !whiteRangeIncludesBlocked(whiteStart);
  const canUp = canUpBase && ((!swapped) || overlap === 0 || canUpSpecialRotate);

  const canDownWhenTopWhite = topHasWhite && targetStart >= 0 && targetStart <= 6 && !tripletIncludesBlocked(targetStart);
  const canDownWhenSwapped = swapped && targetStart >= 0 && targetStart <= 6 && (
    (overlap === 0 && !tripletIncludesBlocked(targetStart)) ||
    (overlap === 3 && !whiteRangeIncludesBlocked(whiteStart))
  );
  const canDown = !upPhase && (canDownWhenTopWhite || canDownWhenSwapped);

  const valueTripletAt = (start) => [0, 1, 2].map((j) => valueAtIndex(start + j));

  const tryUp = () => {
    unlockAudio();
    if (!canUp) { playBlocked(); return; }
    playLift();
    setLastAction("up");
    const internalStart = computeInternalStart(Math.round(pos));
    const currentTriplet = valueTripletAt(internalStart);

    if (canUpSpecialRotate) {
      setOverrides((prev) => {
        const next = { ...prev };
        for (let j = 0; j < 3; j++) next[internalStart + j] = bottomTriplet[j];
        return next;
      });
      setTopTriplet([]); setTopHasWhite(true);
      setBottomTriplet([]); setWhiteStart(null); setSwapped(false);
      return;
    }

    if (swapped && bottomTriplet.length === 3 && overlap === 0) {
      setOverrides((prev) => {
        const next = { ...prev };
        for (let j = 0; j < 3; j++) next[internalStart + j] = bottomTriplet[j];
        return next;
      });
      setTopTriplet(currentTriplet); setTopHasWhite(false); setBottomTriplet([]);
      return;
    }

    if (!swapped) {
      setTopTriplet(currentTriplet); setTopHasWhite(false);
      setBottomTriplet([]); setWhiteStart(internalStart); setSwapped(true);
      return;
    }

    setTopTriplet(currentTriplet); setTopHasWhite(false);
  };

  const tryDown = () => {
    unlockAudio();
    if (!canDown) { playBlocked(); return; }
    playDrop();
    setLastAction("down");

    if (topHasWhite) {
      const internalStartTopWhite = targetStart;
      const currentTripletAtGHI = valueTripletAt(internalStartTopWhite);
      setWhiteStart(internalStartTopWhite); setSwapped(true);
      setBottomTriplet(currentTripletAtGHI); setTopHasWhite(false);
      return;
    }

    const internalStart = (overlap === 3) ? whiteStart : targetStart;
    const currentTriplet = valueTripletAt(internalStart);

    if (overlap === 3) {
      setOverrides((prev) => {
        const next = { ...prev };
        for (let j = 0; j < 3; j++) next[whiteStart + j] = topTriplet[j];
        return next;
      });
      setTopTriplet([]); setBottomTriplet([]); setWhiteStart(null); setSwapped(false);
      return;
    }

    setOverrides((prev) => {
      const next = { ...prev };
      for (let j = 0; j < 3; j++) next[internalStart + j] = topTriplet[j];
      return next;
    });
    setBottomTriplet(currentTriplet); setTopTriplet([]);
  };

  const onToggle = () => { if (upPhase) tryUp(); else tryDown(); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); moveBy(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); moveBy(1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); if (upPhase) tryUp(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); if (!upPhase) tryDown(); return; }
      if (e.code === "Space") { e.preventDefault(); onToggle(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upPhase, swapped, topTriplet, topHasWhite, bottomTriplet, pos, coverMode]);

  const makeFreshModel = () => ({
    pos: 5,
    swapped: false,
    whiteStart: null,
    topTriplet: [],
    topHasWhite: false,
    bottomTriplet: [],
    values: [...GOAL],
  });

  const applyModel = (m) => {
    if (!isPermutation19(m.values)) return;
    skipSolvedSound.current = true;
    setPos(m.pos);
    setSwapped(m.swapped);
    setWhiteStart(m.whiteStart ?? null);
    setTopTriplet([...m.topTriplet]);
    setTopHasWhite(!!m.topHasWhite);
    setBottomTriplet([...m.bottomTriplet]);
    setOverrides(() => {
      const next = {};
      for (let i = 0; i < 9; i++) next[i] = m.values[i];
      return next;
    });
    setLastAction(null);
  };

  useEffect(() => {
    applyModel(makeFreshModel());
  }, [coverMode]); // eslint-disable-line

  const tripletBlocked = (start, blocked = blockedSet) => {
    if (start == null || start < 0 || start > 6) return false;
    for (let j = 0; j < 3; j++) if (blocked.has(start + j)) return true;
    return false;
  };
  const whiteBlocked = (ws, blocked = blockedSet) => {
    if (ws == null) return false;
    for (let j = 0; j < 3; j++) if (blocked.has(ws + j)) return true;
    return false;
  };

  const canUpInModel = (m, blocked = blockedSet) => {
    const ts = computeInternalStart(m.pos);
    const ov = m.swapped ? overlapLen(m.whiteStart, ts) : 0;
    const upPh = m.topTriplet.length === 0 && !m.topHasWhite;
    const base = upPh && ts >= 0 && ts <= 6 && !tripletBlocked(ts, blocked);
    const special = m.swapped && m.bottomTriplet.length === 3 && ov === 3 && !whiteBlocked(m.whiteStart, blocked);
    return base && ((!m.swapped) || ov === 0 || special);
  };

  const canDownInModel = (m, blocked = blockedSet) => {
    const ts = computeInternalStart(m.pos);
    const ov = m.swapped ? overlapLen(m.whiteStart, ts) : 0;
    const upPh = m.topTriplet.length === 0 && !m.topHasWhite;
    if (upPh) return false;
    const whenTopWhite = m.topHasWhite && ts >= 0 && ts <= 6 && !tripletBlocked(ts, blocked);
    const whenSwapped = m.swapped && ts >= 0 && ts <= 6 && (
      (ov === 0 && !tripletBlocked(ts, blocked)) ||
      (ov === 3 && !whiteBlocked(m.whiteStart, blocked))
    );
    return whenTopWhite || whenSwapped;
  };

  const toggleInModel = (m, blocked = blockedSet) => {
    const ts = computeInternalStart(m.pos);
    const ov = m.swapped ? overlapLen(m.whiteStart, ts) : 0;
    const upPh = m.topTriplet.length === 0 && !m.topHasWhite;

    if (upPh) {
      const currentTriplet = [0, 1, 2].map((j) => m.values[ts + j]);
      const special = m.swapped && m.bottomTriplet.length === 3 && ov === 3 && !whiteBlocked(m.whiteStart, blocked);
      if (special) {
        for (let j = 0; j < 3; j++) m.values[ts + j] = m.bottomTriplet[j];
        m.topTriplet = []; m.topHasWhite = true; m.bottomTriplet = [];
        m.whiteStart = null; m.swapped = false; return m;
      }
      if (m.swapped && m.bottomTriplet.length === 3 && ov === 0) {
        for (let j = 0; j < 3; j++) m.values[ts + j] = m.bottomTriplet[j];
        m.topTriplet = currentTriplet; m.topHasWhite = false; m.bottomTriplet = [];
        return m;
      }
      if (!m.swapped) {
        m.topTriplet = currentTriplet; m.topHasWhite = false; m.bottomTriplet = [];
        m.whiteStart = ts; m.swapped = true; return m;
      }
      m.topTriplet = currentTriplet; m.topHasWhite = false; return m;
    } else {
      if (m.topHasWhite) {
        const currentTripletAtGHI = [0, 1, 2].map((j) => m.values[ts + j]);
        m.whiteStart = ts; m.swapped = true; m.bottomTriplet = currentTripletAtGHI; m.topHasWhite = false;
        return m;
      }
      const internalStart = (ov === 3) ? m.whiteStart : ts;
      const curr = [0, 1, 2].map((j) => m.values[internalStart + j]);
      if (ov === 3) {
        for (let j = 0; j < 3; j++) m.values[m.whiteStart + j] = m.topTriplet[j];
        m.topTriplet = []; m.bottomTriplet = []; m.whiteStart = null; m.swapped = false;
        return m;
      }
      for (let j = 0; j < 3; j++) m.values[internalStart + j] = m.topTriplet[j];
      m.bottomTriplet = curr; m.topTriplet = []; return m;
    }
  };

  const countInversions = (arr) => {
    const a = arr.filter((v) => Number.isInteger(v) && v >= 1 && v <= 9);
    let inv = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
    return inv;
  };
  const metricsFor = (m, blocked = blockedSet) => {
    const vals = m.values;
    let misplaced = 0;
    for (let i = 0; i < 9; i++) if (!blocked.has(i) && vals[i] !== i + 1) misplaced++;

    let breaks = 0;
    for (let i = 0; i < 8; i++) {
      if (blocked.has(i) || blocked.has(i + 1)) { breaks++; continue; }
      if (vals[i + 1] !== vals[i] + 1) breaks++;
    }

    let longestRun = 0, run = 0;
    for (let i = 0; i < 9; i++) {
      if (blocked.has(i)) { longestRun = Math.max(longestRun, run); run = 0; continue; }
      if (vals[i] === i + 1) { run++; longestRun = Math.max(longestRun, run); } else run = 0;
    }

    const seq = [];
    for (let i = 0; i < 9; i++) if (!blocked.has(i)) seq.push(vals[i]);
    const inversions = countInversions(seq);

    return { misplaced, breaks, longestRun, inversions };
  };
  const evaluateDifficulty = (m, blocked = blockedSet) => {
    const { misplaced, breaks, longestRun, inversions } = metricsFor(m, blocked);
    const hasWhite = m.swapped ? 1 : 0;
    const hasTop = (m.topTriplet?.length === 3) ? 1 : (m.topHasWhite ? 1 : 0);
    const hasBottom = (m.bottomTriplet?.length === 3) ? 1 : 0;
    const ts = computeInternalStart(m.pos);
    const touching = m.swapped && overlapLen(m.whiteStart, ts) > 0 ? 1 : 0;

    return (
      misplaced * 2.2 +
      breaks * 1.4 +
      inversions * 0.5 +
      hasWhite * 1.5 +
      hasTop * 0.8 +
      hasBottom * 0.8 -
      touching * 0.7 -
      Math.max(0, longestRun - 3) * 2.2
    );
  };

  const randomWalkReachable = (startModel, stepsMin = 120, stepsMax = 220) => {
    const steps = stepsMin + Math.floor(Math.random() * (stepsMax - stepsMin + 1));
    let m = JSON.parse(JSON.stringify(startModel));
    if (!m.values || m.values.length !== 9) m.values = [...GOAL];
    for (let k = 0; k < steps; k++) {
      const moves = [];
      if (m.pos > 0) moves.push("L");
      if (m.pos < MAX_INDEX) moves.push("R");
      if (canUpInModel(m) || canDownInModel(m)) moves.push("T");
      if (moves.length === 0) break;
      const pick = moves[Math.floor(Math.random() * moves.length)];
      if (pick === "L") m.pos -= 1;
      else if (pick === "R") m.pos += 1;
      else if (pick === "T") m = toggleInModel(m);
    }
    return m;
  };

  const forceNotSolved = (m) => {
    for (let tries = 0; tries < 60; tries++) {
      if (!isSolvedWithBlocks(m.values, m.swapped, blockedSet)) return m;
      const opts = [];
      if (m.pos > 0) opts.push("L");
      if (m.pos < MAX_INDEX) opts.push("R");
      if (canUpInModel(m) || canDownInModel(m)) opts.push("T");
      if (opts.length === 0) break;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      if (pick === "L") m.pos -= 1;
      else if (pick === "R") m.pos += 1;
      else if (pick === "T") m = toggleInModel(m);
    }
    return m;
  };

  const onShuffleReachable = () => {
    unlockAudio();
    playShuffle();
    const base = makeFreshModel();
    const CANDIDATES = 40;

    let best = null;
    let bestScore = -Infinity;

    for (let c = 0; c < CANDIDATES; c++) {
      let m = randomWalkReachable(base, 120, 220);
      m = forceNotSolved(m);

      if (!isPermutation19(m.values)) continue;

      if (m.swapped && whiteBlocked(m.whiteStart)) {
        if (m.pos < MAX_INDEX) m.pos += 1; else if (m.pos > 0) m.pos -= 1;
        if (canUpInModel(m) || canDownInModel(m)) m = toggleInModel(m);
      }

      if (canUpInModel(m) || canDownInModel(m)) {
        const m2 = JSON.parse(JSON.stringify(m));
        const t = toggleInModel(m2);
        if (isSolvedWithBlocks(t.values, t.swapped, blockedSet)) {
          continue;
        }
      }

      const { misplaced, breaks, longestRun } = metricsFor(m);
      const score = evaluateDifficulty(m);

      const hardEnough =
        misplaced >= 6 &&
        breaks >= 6 &&
        longestRun <= 3;

      if (hardEnough && score > bestScore) {
        bestScore = score;
        best = m;
      }
      if (!best && score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    if (best && isPermutation19(best.values)) {
      applyModel(best);
    } else {
      let m = randomWalkReachable(base, 140, 260);
      m = forceNotSolved(m);
      if (isPermutation19(m.values)) applyModel(m);
    }
    setLastAction(null);
  };

  const blockLeftPercent = (Math.round(pos) * 100) / SLOTS;
  const blockWidthPercent = (BLOCK_LEN / SLOTS) * 100;

  return (
    <div className="board-stage">
      <div className="puzzle-wrap select-none px-0 sm:px-4 md:px-8" ref={containerRef}>
        <div className="chassis-frame">
        <div className="chassis">
          <CompactRail heightPx={railH}>
            <AnimatePresence initial={false} mode="popLayout">
              {(topTriplet.length === 3 || topHasWhite) && (
                <motion.div
                  key={topHasWhite ? "top-white" : "top-triplet"}
                  className="absolute left-0 right-0 overflow-hidden tile-block"
                  style={{ top: "var(--rail-pad-thin)", bottom: "var(--rail-pad-thin)" }}
                  initial={lastAction === "up" ? "enterUp" : "enterDown"}
                  animate="center"
                  exit={lastAction === "up" ? "exitUp" : "exitDown"}
                  variants={variantsTop}
                >
                  {topHasWhite ? (
                    <TileStrip empty fontVar="--cell-font" />
                  ) : (
                    <TileStrip values={topTriplet} fontVar="--cell-font" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CompactRail>

          <div
            className="w-full touch-pan-y chassis-row"
            ref={wrapRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          >
            <div className="relative w-full" style={{ height: railH }}>
              <div
                ref={railBoxRef}
                className="w-full h-full flex items-center relative overflow-hidden rail-bed hole-wide"
              >
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${SLOTS}, 1fr)` }}>
                  {Array.from({ length: SLOTS }).map((_, i) => (
                    <div key={i} className="guide-line" />
                  ))}
                </div>

                <div
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={MAX_INDEX}
                  aria-valuenow={Math.round(pos)}
                  className={`absolute tile-block ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{ left: `${blockLeftPercent}%`, width: `${blockWidthPercent}%`, top: "var(--rail-pad)", bottom: "var(--rail-pad)" }}
                  onPointerDown={onPointerDown}
                  onTouchStart={onPointerDown}
                >
                  <div className="h-full tile-strip slider-strip">
                    {Array.from({ length: 9 }).map((_, i) => {
                      if (blockedSet.has(i)) {
                        return <div key={`blk-${i}`} className="tile-covered" />;
                      }
                      const isWhite = swapped && whiteStart !== null && i >= whiteStart && i < whiteStart + 3;
                      if (isWhite) return <div key={i} className="tile-ghost" />;
                      const val = valueAtIndex(i);
                      return (
                        <div
                          key={i}
                          className="tile-num"
                          style={{ fontSize: "var(--cell-font-md)" }}
                        >
                          {val}
                        </div>
                      );
                    })}
                    <div className="tile-cap" aria-hidden="true" />
                  </div>

                  <AnimatePresence initial={false}>
                    {swapped && whiteStart !== null && (
                      <motion.div
                        key={`white-${whiteStart}`}
                        className="absolute inset-y-0 piece-blank"
                        style={{
                          left: `${(whiteStart / BLOCK_LEN) * 100}%`,
                          width: `${(3 / BLOCK_LEN) * 100}%`,
                        }}
                        initial={{ y: lastAction === "up" ? 18 : lastAction === "down" ? -18 : 0, opacity: 0.8 }}
                        animate={{ y: 0, opacity: 1, transition: springLift }}
                        exit={{ y: lastAction === "down" ? 18 : -18, opacity: 0, transition: fadeQuick }}
                      >
                        <TileStrip empty fontVar="--cell-font" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <CompactRail heightPx={railH}>
            <AnimatePresence initial={false} mode="popLayout">
              {!swapped && bottomTriplet.length === 0 && !topHasWhite && (
                <motion.div
                  key="bottom-white-idle"
                  className="absolute left-0 right-0 tile-block"
                  style={{ top: "var(--rail-pad-thin)", bottom: "var(--rail-pad-thin)" }}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: fadeQuick }}
                >
                  <TileStrip empty fontVar="--cell-font" />
                </motion.div>
              )}
              {bottomTriplet.length === 3 && (
                <motion.div
                  key="bottom-triplet"
                  className="absolute left-0 right-0 overflow-hidden tile-block"
                  style={{ top: "var(--rail-pad-thin)", bottom: "var(--rail-pad-thin)" }}
                  initial={lastAction === "down" ? "enterDown" : "enterUp"}
                  animate="center"
                  exit={lastAction === "down" ? "exitDown" : "exitUp"}
                  variants={variantsBottom}
                >
                  <TileStrip values={bottomTriplet} fontVar="--cell-font" />
                </motion.div>
              )}
            </AnimatePresence>
          </CompactRail>
        </div>
        </div>

        <div className="controls-panel">
          <motion.button
            aria-label={upPhase ? strings.up : strings.down}
            className={`w-full rounded-xl font-extrabold btn-main btn-lift ${upPhase ? "" : "down"}`}
            onClick={onToggle}
            disabled={upPhase ? !canUp : !canDown}
            title={upPhase ? strings.up : strings.down}
            whileTap={{ scale: 1 }}
            transition={springSlide}
          >
            {upPhase ? "⬆" : "⬇"}
          </motion.button>

          <div className="arrow-pair">
            <motion.button
              className="flex-1 rounded-xl btn-main btn-side"
              onClick={() => moveBy(-1)}
              aria-label={strings.left}
              title={strings.left}
              whileTap={{ scale: 1 }}
              transition={springSlide}
            >
              ◀
            </motion.button>
            <motion.button
              className="flex-1 rounded-xl btn-main btn-side"
              onClick={() => moveBy(1)}
              aria-label={strings.right}
              title={strings.right}
              whileTap={{ scale: 1 }}
              transition={springSlide}
            >
              ▶
            </motion.button>
          </div>

          <div className="center-stack">
            <motion.button
              type="button"
              id="btn-shuffle"
              className="btn-shuffle"
              onClick={onShuffleReachable}
              whileTap={{ scale: 0.99 }}
              transition={springSlide}
            >
              {strings.shuffle}
            </motion.button>

            <div className="cover-row" role="group" aria-label={strings.cover}>
              <button
                type="button"
                className={`cover-chip ${coverMode === 9 ? "on" : ""}`}
                onClick={() => setMode(9)}
              >
                {strings.modo1}
              </button>
              <button
                type="button"
                className={`cover-chip ${coverMode === 89 ? "on" : ""}`}
                onClick={() => setMode(89)}
              >
                {strings.modo2}
              </button>
            </div>

            <div className="solved-slot" aria-live="polite">
              <AnimatePresence>
                {isSolved && (
                  <motion.div
                    key="solved-banner"
                    className="solved-banner"
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1, transition: springLift }}
                    exit={{ y: -10, opacity: 0, transition: fadeQuick }}
                  >
                    {strings.solved}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="pc-hint">
              {strings.pcHint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
