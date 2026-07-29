"use client";

import { useEffect, useState } from "react";

export function useRevenueTicker(base: number = 41200) {
  const [prevBase, setPrevBase] = useState(base);
  const [rev, setRev] = useState(base);
  if (base !== prevBase) {
    setPrevBase(base);
    setRev(base);
  }

  useEffect(() => {
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      if (tick % 4 === 0) setRev((r) => r + 150);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const revenue = "$" + rev.toLocaleString("en-US");
  const revenueMrr = "$" + (1180 + Math.floor((rev - base) / 40)).toLocaleString("en-US");
  return { revenue, revenueMrr };
}
