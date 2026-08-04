// The gallery brands, as wordmarks rather than app tiles.
//
// These replaced twelve rounded icon tiles, which had themselves replaced twelve wordmark PNGs. The
// tiles were legible but they all shared one silhouette, so twelve different companies read as one
// company's app suite — the exact failure the icon colours were chosen to avoid, reintroduced by the
// shape instead of by the palette. A wordmark is how a brand is actually recognised, and twenty-five
// of them set in different faces, weights and colours read as twenty-five separate businesses.
//
// EVERY BRAND HERE IS INVENTED. None imitates a real company's identity; they stand in for "products
// a founder might be selling". That is also why the colours are literal hex rather than design
// tokens: pointing twenty-five brands at --ember would render them as one company's product line.
//
// The marks are DRAWN, never images. Same three reasons as the tiles they replace — crisp at any
// size, no network request, and no dark-mode hack. Each card is an opaque light plate carrying its
// own colours, so the page behind it never changes how a logo reads and there is no dark-mode rule
// for any of this.

/** Optional glyph beside or above the word. Drawn in `BrandLogo`. */
export type BrandMark =
  | "peak"
  | "flame"
  | "leaf"
  | "glyph"
  | "dot"
  | "spiral"
  | "sun"
  | "cloud"
  | "stack"
  | "hex"
  | "strata"
  | "halo"
  | "blocks"
  | "arch"
  | "chevron"
  | "willow";

export interface Brand {
  /** The word, set as real text — so it is selectable, searchable and read aloud correctly. */
  word: string;
  /** What the business is. The caption under the mark. */
  caption: string;
  ink: string;
  /** Second colour, used by the mark and by any highlighted character. */
  accent?: string;
  face: "serif" | "sans";
  weight: 300 | 400 | 500 | 600 | 700 | 800;
  italic?: boolean;
  caps?: boolean;
  /** Letter-spacing, in em. The wide-tracked caps marks depend on it. */
  tracking?: number;
  /** Relative size, 1 being the default 27px. */
  scale?: number;
  mark?: BrandMark;
  markPlacement?: "left" | "above";
  /**
   * Per-brand multiplier on the mark, for the few whose glyph carries the identity rather than
   * accompanying it. A willow that is not obviously a willow is just a shrub.
   */
  markScale?: number;
  /**
   * One character rendered in `accent` instead of `ink`, given as the index into `word`.
   *
   * This is how "brooklyn." gets its coloured full stop and "oxide" its red x without either being
   * turned into artwork — the word stays one string of real text.
   */
  accentCharAt?: number;
  /** A hand-drawn rule under the word, in `accent`. */
  underline?: "wave";
}

export const BRANDS: Brand[] = [
  { word: "Altura", caption: "Trail apparel", ink: "#16324A", accent: "#2E6B4F", face: "serif", weight: 500, mark: "peak", markPlacement: "left" },
  { word: "brooklyn.", caption: "Neighbourhood guide", ink: "#0B0B0B", accent: "#E8522E", face: "serif", weight: 700, accentCharAt: 8 },
  { word: "CAVO", caption: "Wine importer", ink: "#14243A", accent: "#D8452A", face: "sans", weight: 800, caps: true, tracking: -0.01 },
  { word: "drift", caption: "Sailing charters", ink: "#16243B", accent: "#2E7FD4", face: "serif", weight: 700, italic: true, underline: "wave" },
  { word: "EMBER", caption: "Outdoor cookware", ink: "#111111", accent: "#F0592B", face: "sans", weight: 700, caps: true, tracking: 0.1, mark: "flame", markPlacement: "above" },

  { word: "ferna", caption: "Houseplant delivery", ink: "#2C4A32", accent: "#4C7A4F", face: "serif", weight: 500, mark: "leaf", markPlacement: "above" },
  { word: "Glyph", caption: "Type foundry", ink: "#0A0A0A", face: "sans", weight: 500, mark: "glyph", markPlacement: "above" },
  { word: "HARLOW", caption: "Interior studio", ink: "#111111", face: "sans", weight: 400, caps: true, tracking: 0.22, scale: 0.86 },
  { word: "iris", caption: "Eyewear", ink: "#0D0D0D", accent: "#8B5CF6", face: "serif", weight: 500, mark: "dot", markPlacement: "above" },
  { word: "Juno", caption: "Fertility clinic", ink: "#1F6470", face: "serif", weight: 500, italic: true, scale: 1.18 },

  { word: "KORU", caption: "Yoga retreats", ink: "#3A5A45", accent: "#5C7F5E", face: "sans", weight: 400, caps: true, tracking: 0.18, scale: 0.9, mark: "spiral", markPlacement: "left", markScale: 1.15 },
  { word: "Lucent", caption: "Solar installer", ink: "#111111", accent: "#DFA43A", face: "sans", weight: 500, mark: "sun", markPlacement: "left" },
  { word: "maevo", caption: "Skincare", ink: "#1F3D33", face: "serif", weight: 600 },
  { word: "NIMBUS", caption: "Backup hosting", ink: "#2D6FE0", accent: "#2D6FE0", face: "sans", weight: 500, caps: true, tracking: 0.14, scale: 0.88, mark: "cloud", markPlacement: "above" },
  { word: "oxide", caption: "Bike components", ink: "#0A0A0A", accent: "#E23E1E", face: "sans", weight: 700, accentCharAt: 1 },

  { word: "PALETTE", caption: "Paint mixing", ink: "#1A2740", accent: "#E8705A", face: "sans", weight: 400, caps: true, tracking: 0.24, scale: 0.78, mark: "stack", markPlacement: "above" },
  { word: "QUANTA", caption: "Lab software", ink: "#5B2D8E", accent: "#5B2D8E", face: "sans", weight: 700, caps: true, tracking: 0.08, scale: 0.82, mark: "hex", markPlacement: "above" },
  { word: "rift", caption: "Climbing gear", ink: "#111111", face: "sans", weight: 800, mark: "strata", markPlacement: "left" },
  { word: "SOLA", caption: "Sun protection", ink: "#111111", face: "sans", weight: 400, caps: true, tracking: 0.24, scale: 0.82, mark: "halo", markPlacement: "above" },
  { word: "tempo", caption: "Payroll", ink: "#1A2233", accent: "#EEC544", face: "sans", weight: 600, mark: "blocks", markPlacement: "left" },

  { word: "UVYN", caption: "Modular furniture", ink: "#111111", face: "sans", weight: 400, caps: true, tracking: 0.18, scale: 0.86, mark: "arch", markPlacement: "left" },
  { word: "VORA", caption: "Freight booking", ink: "#0A0A0A", face: "sans", weight: 700, caps: true, tracking: 0.04, scale: 0.9, mark: "chevron", markPlacement: "left" },
  { word: "WILLOW", caption: "Garden design", ink: "#4A6B4A", accent: "#6E8F63", face: "serif", weight: 400, caps: true, tracking: 0.16, scale: 0.8, mark: "willow", markPlacement: "above", markScale: 1.5 },
  { word: "YXEL", caption: "Display panels", ink: "#111111", face: "sans", weight: 400, caps: true, tracking: 0.2, scale: 0.88 },
  { word: "ZEST", caption: "Cold press juice", ink: "#E8402A", face: "sans", weight: 800, caps: true, italic: true, tracking: 0.02 },
];
