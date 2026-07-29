"use client";

import { useEffect, useState } from "react";
import { URLS } from "../../lib/data";

export function useUrlCycle() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % URLS.length), 5500);
    return () => clearInterval(id);
  }, []);
  return { url: URLS[idx], key: idx };
}
