"use client";

import { useEffect, useRef, useState } from "react";
import { FEED } from "../../lib/data";

type Beat = { p: number; x: string; y: string; label: string; click?: boolean; target?: string };

const BEATS: Record<number, Beat[]> = {
  1: [
    { p: 0, x: "58%", y: "18%", label: "opening dockside.app" },
    { p: 0.4, x: "28%", y: "38%", label: "reading the pricing page" },
    { p: 0.75, x: "46%", y: "58%", label: "reading the changelog" },
  ],
  2: [
    { p: 0, x: "72%", y: "18%", label: "proposing a buyer" },
    { p: 0.26, x: "55%", y: "28%", label: "confirming operations manager", click: true, target: "profileOps" },
    { p: 0.56, x: "52%", y: "48%", label: "comparing warehouse manager", click: true, target: "profileWarehouse" },
    { p: 0.84, x: "48%", y: "66%", label: "weighing logistics director", click: true, target: "profileLogistics" },
  ],
  3: [
    { p: 0, x: "70%", y: "18%", label: "counting buyers found" },
    { p: 0.35, x: "38%", y: "42%", label: "matching r/supplychain" },
    { p: 0.65, x: "38%", y: "58%", label: "matching Ops Nerds Slack" },
    { p: 0.9, x: "38%", y: "74%", label: "flagging a live signal" },
  ],
  4: [
    { p: 0, x: "32%", y: "30%", label: "opening the first draft" },
    { p: 0.5, x: "30%", y: "52%", label: "reading the anchor line" },
    { p: 0.82, x: "22%", y: "87%", label: "approving · send today", click: true, target: "approve" },
  ],
};

const DUR: Record<number, number> = { 1: 3000, 2: 3600, 3: 4400, 4: 4000 };

export const CONFETTI = Array.from({ length: 22 }).map((_, i) => ({
  left: ((i * 43 + 7) % 100) + "%",
  color: ["#E4572E", "#2F7A56", "#DBD3E4", "#CFE0D8", "#14120F"][i % 5],
  shape: i % 3 === 0 ? "999px" : "2px",
  delay: ((i * 71) % 900) + "ms",
}));

export function useHeroDemo() {
  const [stage, setStage] = useState(1);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [confetti, setConfetti] = useState(false);

  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const loopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startStageFn = useRef<(s: number) => void>(() => {});

  useEffect(() => {
    function startStage(s: number) {
      setStage(s);
      setDemoElapsed(0);
      clearTimeout(loopTimer.current);
      loopTimer.current = setTimeout(() => {
        if (!playingRef.current) return;
        if (s === 4) {
          setConfetti(true);
          loopTimer.current = setTimeout(() => {
            setConfetti(false);
            startStage(1);
          }, 1200);
        } else {
          startStage(s + 1);
        }
      }, DUR[s]);
    }
    startStageFn.current = startStage;
    startStage(1);

    const elapsedTimer = setInterval(() => {
      if (playingRef.current) setDemoElapsed((e) => e + 120);
    }, 120);

    return () => {
      clearTimeout(loopTimer.current);
      clearInterval(elapsedTimer);
    };
  }, []);

  const runDemo = () => {
    clearTimeout(loopTimer.current);
    setPlaying(true);
    playingRef.current = true;
    startStageFn.current(1);
  };

  const togglePlay = () => {
    if (!playingRef.current) {
      runDemo();
      return;
    }
    clearTimeout(loopTimer.current);
    setPlaying(false);
    playingRef.current = false;
  };

  const stageDur = DUR[stage] || 1;
  const stageFrac = Math.min(1, demoElapsed / stageDur);
  const beats = BEATS[stage] || BEATS[1];
  let beat = beats[0];
  for (const b of beats) {
    if (stageFrac >= b.p) beat = b;
  }
  const clickWindow = 0.14;
  const activeClickBeat = beats.find((b) => b.click && stageFrac >= b.p && stageFrac < b.p + clickWindow);
  const clickTarget = activeClickBeat ? activeClickBeat.target : null;

  const searchFrac = stage === 3 ? stageFrac : stage > 3 ? 1 : 0;
  const demoFound = stage === 3 ? Math.max(8, Math.round(8 + searchFrac * 96)) : stage >= 4 ? 104 : 0;
  const demoShown = stage === 3 ? Math.max(1, Math.ceil(searchFrac * FEED.length)) : FEED.length;

  return {
    stage,
    playing,
    confetti,
    confettiParticles: CONFETTI,
    demoFound,
    demoFeed: FEED.slice(0, demoShown).slice().reverse(),
    curX: beat.x,
    curY: beat.y,
    curLabel: beat.label,
    cursorClicking: !!clickTarget,
    cursorScale: clickTarget ? "scale(.8)" : "scale(1)",
    clickTarget,
    runDemo,
    togglePlay,
    playLabel: playing ? "Pause" : "Play",
    dots: [1, 2, 3, 4].map((n) => (stage === n ? "var(--ember)" : "var(--border-strong)")),
  };
}
