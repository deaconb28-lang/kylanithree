import type { GalleryMark } from "../../lib/data";

// App icons for the gallery, drawn rather than shipped as images.
//
// These replaced twelve wide wordmark PNGs. Drawing them buys three things the images could not:
// they stay crisp at any size, they cost no network request, and — the one that actually mattered —
// they need no dark-mode hack. The plates used `filter: invert(1) hue-rotate(180deg)` to survive a
// dark background, which works on flat wordmarks and mangles anything with real colour in it. A
// coloured tile is legible on cream and on near-black without being touched, so nothing is touched.
//
// The brands are invented, and deliberately readable as such: no mark here imitates a real
// company's identity. They are placeholders standing in for "products a founder might be selling".

const VIEW = 100;
/** Proportional to the tile, so the corner keeps its shape at every rendered size. */
const RADIUS = 23;

/**
 * One tile.
 *
 * `aria-hidden` throughout: the product name is rendered as real text beside the icon, so alt text
 * here would have a screen reader announce the same brand twice.
 */
export default function AppIcon({
  mark,
  bg,
  fg,
  accent,
  size = 88,
}: {
  mark: GalleryMark;
  bg: string;
  fg: string;
  accent?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width={VIEW} height={VIEW} rx={RADIUS} fill={bg} />
      {/* A hairline inside the tile, not around it: keeps a near-black icon from dissolving into a
          dark page without adding a ring that reads as a border on a light one. */}
      <rect
        x={0.75}
        y={0.75}
        width={VIEW - 1.5}
        height={VIEW - 1.5}
        rx={RADIUS - 0.75}
        fill="none"
        stroke="rgba(255,255,255,.14)"
        strokeWidth={1.5}
      />
      <Mark mark={mark} fg={fg} accent={accent ?? fg} />
    </svg>
  );
}

function Mark({ mark, fg, accent }: { mark: GalleryMark; fg: string; accent: string }) {
  const stroke = { stroke: fg, strokeWidth: 7, strokeLinecap: "round" as const, fill: "none" };

  switch (mark) {
    // Analytics — three columns, the tallest last, reading as a rising measure.
    case "bars":
      return (
        <g>
          <rect x={28} y={56} width={8} height={18} rx={4} fill={fg} />
          <rect x={46} y={44} width={8} height={30} rx={4} fill={fg} />
          <rect x={64} y={30} width={8} height={44} rx={4} fill={accent} />
        </g>
      );

    // Scheduling — a calendar block with its binding rings.
    case "calendar":
      return (
        <g>
          <rect x={26} y={32} width={48} height={42} rx={8} fill="none" stroke={fg} strokeWidth={6} />
          <line x1={26} y1={46} x2={74} y2={46} stroke={fg} strokeWidth={6} />
          <rect x={38} y={24} width={6} height={14} rx={3} fill={fg} />
          <rect x={56} y={24} width={6} height={14} rx={3} fill={fg} />
          <circle cx={50} cy={61} r={5} fill={accent} />
        </g>
      );

    // Developer CLI — a shell prompt, with the caret in the accent.
    case "prompt":
      return (
        <g>
          <polyline points="32,38 46,50 32,62" {...stroke} />
          <line x1={54} y1={64} x2={72} y2={64} stroke={accent} strokeWidth={7} strokeLinecap="round" />
        </g>
      );

    // Finance — stacked coins seen edge-on.
    case "coins":
      return (
        <g>
          <ellipse cx={50} cy={36} rx={22} ry={8} fill="none" stroke={fg} strokeWidth={6} />
          <path d="M28 36v14c0 4.4 9.8 8 22 8s22-3.6 22-8V36" fill="none" stroke={fg} strokeWidth={6} />
          <path d="M28 50v14c0 4.4 9.8 8 22 8s22-3.6 22-8V50" fill="none" stroke={accent} strokeWidth={6} />
        </g>
      );

    // Ceramics — a thrown vessel.
    case "vessel":
      return (
        <g>
          <path d="M36 30h28l-5 12c6 5 9 12 9 19 0 8.8-8.5 15-18 15s-18-6.2-18-15c0-7 3-14 9-19z" fill="none" stroke={fg} strokeWidth={6} strokeLinejoin="round" />
          <line x1={40} y1={30} x2={60} y2={30} stroke={accent} strokeWidth={6} strokeLinecap="round" />
        </g>
      );

    // Coffee, northbound — a compass needle pointing north.
    case "north":
      return (
        <g>
          <circle cx={50} cy={50} r={26} fill="none" stroke={fg} strokeWidth={6} />
          <path d="M50 28l10 24-10-6-10 6z" fill={accent} />
        </g>
      );

    // Apparel — a hanging tag.
    case "tag":
      return (
        <g>
          <path d="M52 26h20v20L46 72 26 52z" fill="none" stroke={fg} strokeWidth={6} strokeLinejoin="round" />
          <circle cx={62} cy={38} r={5} fill={accent} />
        </g>
      );

    // Hardware, "loop" — a ring with a gap, so it is a loop and not a circle.
    case "ring":
      return <path d="M50 26a24 24 0 1 1-17 41" fill="none" stroke={fg} strokeWidth={9} strokeLinecap="round" />;

    // Design studio — a wing, two strokes that share an origin.
    case "wing":
      return (
        <g>
          <path d="M26 62c14-2 26-10 34-24" {...stroke} />
          <path d="M38 72c14-2 26-10 34-24" stroke={accent} strokeWidth={7} strokeLinecap="round" fill="none" />
        </g>
      );

    // Brand consultancy — the ampersand the old wordmark was built around.
    case "amp":
      return (
        <text
          x={50}
          y={50}
          textAnchor="middle"
          dominantBaseline="central"
          fill={accent}
          style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 62, fontWeight: 600 }}
        >
          &amp;
        </text>
      );

    // Creative agency — a pennant on its halyard.
    case "flag":
      return (
        <g>
          <line x1={34} y1={24} x2={34} y2={76} stroke={fg} strokeWidth={6} strokeLinecap="round" />
          <path d="M34 30h34l-9 12 9 12H34z" fill={accent} />
        </g>
      );

    // Advisory — two columns and a lintel, the shape every firm of this kind uses.
    case "columns":
      return (
        <g>
          <line x1={26} y1={72} x2={74} y2={72} stroke={fg} strokeWidth={6} strokeLinecap="round" />
          <line x1={38} y1={44} x2={38} y2={68} stroke={fg} strokeWidth={6} strokeLinecap="round" />
          <line x1={62} y1={44} x2={62} y2={68} stroke={fg} strokeWidth={6} strokeLinecap="round" />
          <path d="M50 24l24 14H26z" fill={accent} />
        </g>
      );
  }
}
