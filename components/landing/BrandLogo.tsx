import type { Brand, BrandMark } from "../../lib/brands";

// One wordmark: an optional drawn mark, then the name set as real text.
//
// The word is TEXT, not a path. That is the whole reason this reads as twenty-five brands rather
// than twenty-five pictures — it is selectable, searchable, announced correctly by a screen reader,
// and it stays crisp at any size without shipping a single byte of artwork. The two faces already
// loaded (Fraunces and Public Sans) carry all of it; what separates one wordmark from the next is
// weight, tracking, case, slant and colour.
//
// The marks are drawn in a square viewBox and sized off the word, so a logo scales as one object.

const VIEW = 100;

export default function BrandLogo({ brand, size = 27 }: { brand: Brand; size?: number }) {
  const px = size * (brand.scale ?? 1);
  const accent = brand.accent ?? brand.ink;
  const above = brand.mark && brand.markPlacement === "above";
  // Sized off the BASE size, not the scaled word. `scale` exists to stop wide-tracked caps like
  // PALETTE running out of their card, and deriving the mark from it shrank the mark for exactly the
  // logos that were already set small — so a widely-tracked wordmark got a mark half the size of a
  // compact one, which is backwards. A mark's job is the same weight in every card.
  const markSize = size * (above ? 1.35 : 1.25) * (brand.markScale ?? 1);

  const word = (
    <span
      style={{
        fontFamily: brand.face === "serif" ? "var(--font-display), Georgia, serif" : "var(--font-public-sans), system-ui, sans-serif",
        fontWeight: brand.weight,
        fontStyle: brand.italic ? "italic" : "normal",
        fontSize: px,
        lineHeight: 1,
        letterSpacing: brand.tracking ? `${brand.tracking}em` : undefined,
        color: brand.ink,
        whiteSpace: "nowrap",
        // The tracked caps marks add a trailing space after the last letter, which pushes the word
        // visibly off-centre in its card. Pulling it back is the difference between a logo wall that
        // looks aligned and one that looks slightly wrong everywhere without it being obvious why.
        marginRight: brand.tracking ? `-${brand.tracking}em` : undefined,
      }}
    >
      {brand.accentCharAt === undefined ? (
        brand.word
      ) : (
        // One character in the accent colour — a coloured full stop, a red x — without turning the
        // word into artwork or splitting it into separate elements a screen reader would read apart.
        <>
          {brand.word.slice(0, brand.accentCharAt)}
          <span style={{ color: accent }}>{brand.word[brand.accentCharAt]}</span>
          {brand.word.slice(brand.accentCharAt + 1)}
        </>
      )}
    </span>
  );

  const wordBlock = brand.underline ? (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: px * 0.04 }}>
      {word}
      {/* Drawn, and stretched to the word rather than given a fixed width, so it stays a rule under
          the name at any size. */}
      <svg width="100%" height={px * 0.22} viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%" }}>
        <path d="M2 8c10-8 20 4 30 0s20-8 30-4 20 6 36 0" fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
      </svg>
    </span>
  ) : (
    word
  );

  if (!brand.mark) return wordBlock;

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: above ? "column" : "row",
        alignItems: "center",
        gap: above ? px * 0.28 : px * 0.34,
      }}
    >
      <Mark mark={brand.mark} ink={brand.ink} accent={accent} size={markSize} />
      {wordBlock}
    </span>
  );
}

function Mark({ mark, ink, accent, size }: { mark: BrandMark; ink: string; accent: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0 }}>
      {glyph(mark, ink, accent)}
    </svg>
  );
}

function glyph(mark: BrandMark, ink: string, accent: string) {
  switch (mark) {
    // Altura — a peak, the shape the A is built on.
    case "peak":
      return (
        <g>
          <path d="M50 18L84 82H16z" fill="none" stroke={ink} strokeWidth={8} strokeLinejoin="round" />
          <path d="M50 44l19 38H31z" fill={accent} />
        </g>
      );

    // Ember — a flame, drawn as one closed outline so it reads at 24px.
    case "flame":
      return (
        <path
          d="M50 12c14 16 26 26 26 42a26 26 0 1 1-52 0c0-11 6-18 12-25 2 7 6 11 10 13-4-12 0-22 4-30z"
          fill="none"
          stroke={accent}
          strokeWidth={8}
          strokeLinejoin="round"
        />
      );

    // ferna — a leaf with its midrib.
    case "leaf":
      return (
        <g>
          <path d="M78 20C44 20 22 40 22 66c0 6 1 11 3 15 30 2 55-20 53-61z" fill="none" stroke={accent} strokeWidth={7} strokeLinejoin="round" />
          <path d="M25 81C40 62 56 44 76 24" fill="none" stroke={accent} strokeWidth={7} strokeLinecap="round" />
        </g>
      );

    // Glyph — a counterform: a disc with a bite taken out and a tail, the way a display G resolves.
    case "glyph":
      return (
        <path
          d="M62 16a30 30 0 1 0 0 60h6V44H48"
          fill="none"
          stroke={ink}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    // iris — the tittle, lifted off the i and made the mark.
    case "dot":
      return <circle cx={50} cy={50} r={17} fill={accent} />;

    // Koru — the unfurling frond the brand is named for. An open spiral, never a closed circle.
    case "spiral":
      return (
        <path
          d="M55 78c-16 0-27-11-27-25s10-24 23-24 21 9 21 19-7 16-15 16-13-5-13-11 4-9 8-9"
          fill="none"
          stroke={accent}
          strokeWidth={8}
          strokeLinecap="round"
        />
      );

    // Lucent — a sun, its rays uneven so it does not read as a loading spinner.
    case "sun":
      return (
        <g stroke={accent} strokeWidth={7} strokeLinecap="round">
          <circle cx={50} cy={50} r={13} fill={accent} stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const r = (deg * Math.PI) / 180;
            const inner = 23;
            const outer = i % 2 === 0 ? 42 : 35;
            return (
              <line
                key={deg}
                x1={50 + Math.cos(r) * inner}
                y1={50 + Math.sin(r) * inner}
                x2={50 + Math.cos(r) * outer}
                y2={50 + Math.sin(r) * outer}
              />
            );
          })}
        </g>
      );

    // Nimbus — a cloud in outline.
    case "cloud":
      return (
        <path
          d="M28 70a17 17 0 0 1 2-34 24 24 0 0 1 45-3 16 16 0 0 1-3 37z"
          fill="none"
          stroke={accent}
          strokeWidth={8}
          strokeLinejoin="round"
        />
      );

    // Palette — three forms balanced on one another: pigment, vessel, block. The stack is the mark,
    // so the three have to read as separate shapes rather than one blob at 36px.
    case "stack":
      return (
        <g>
          <circle cx={50} cy={20} r={18} fill={accent} />
          <path d="M20 42h60c0 17-13 30-30 30S20 59 20 42z" fill={ink} />
          <rect x={34} y={78} width={32} height={20} fill="#C8A87C" />
        </g>
      );

    // Quanta — a hexagon holding a Q's tail.
    case "hex":
      return (
        <g>
          <path d="M50 12l33 19v38L50 88 17 69V31z" fill="none" stroke={accent} strokeWidth={9} strokeLinejoin="round" />
          <path d="M40 40h20v20H40z" fill="none" stroke={accent} strokeWidth={9} />
          <path d="M56 56l14 16" stroke={accent} strokeWidth={9} strokeLinecap="round" fill="none" />
        </g>
      );

    // rift — strata split by a fault, the two halves offset.
    case "strata":
      return (
        <g fill={ink}>
          <path d="M8 34c22-9 42-9 62 0-8 8-16 12-24 12-14 0-26-5-38-12z" />
          <path d="M20 56c22-9 44-9 66 0-8 8-17 12-26 12-15 0-27-5-40-12z" />
        </g>
      );

    // Sola — a corona of dots, densest at the rim.
    case "halo":
      return (
        <g fill={ink}>
          {Array.from({ length: 28 }, (_, i) => {
            const r = (i / 28) * Math.PI * 2;
            // Seeded from the index, never Math.random(): this renders on the server and on the
            // client, and a random radius would differ between the two and trip hydration.
            const radius = 34 + ((i * 7) % 6);
            const dot = 4 + ((i * 3) % 3);
            return <circle key={i} cx={50 + Math.cos(r) * radius} cy={50 + Math.sin(r) * radius} r={dot} />;
          })}
        </g>
      );

    // tempo — beats, offset like a syncopation.
    case "blocks":
      return (
        <g>
          <rect x={14} y={30} width={26} height={16} rx={3} fill={accent} />
          <rect x={46} y={30} width={16} height={16} rx={3} fill={ink} />
          <rect x={14} y={54} width={16} height={16} rx={3} fill={ink} />
          <rect x={36} y={54} width={26} height={16} rx={3} fill={accent} />
        </g>
      );

    // Uvyn — a U as an arch, drawn three times as nested rules.
    case "arch":
      return (
        <g fill="none" stroke={ink} strokeWidth={7}>
          <path d="M20 16v34a30 30 0 0 0 60 0V16" />
          <path d="M34 16v34a16 16 0 0 0 32 0V16" />
          <path d="M48 16v34a2 2 0 0 0 4 0V16" />
        </g>
      );

    // Vora — a V as a solid wedge with a notch, so it is a mark and not a letter repeated.
    case "chevron":
      return <path d="M10 22h30l10 26 10-26h30L50 88z" fill={ink} />;

    // Willow — a weeping willow, which is the whole point of the name: the fronds FALL. Two earlier
    // versions failed differently and both are worth not repeating — a rounded canopy read as a
    // mushroom, and short fronds on a flat branch read as a palm. What makes it a willow is that the
    // fronds are LONG relative to the crown and hang almost to the ground.
    case "willow":
      return (
        <g stroke={accent} fill="none" strokeLinecap="round">
          <path d="M50 98V52" strokeWidth={5} />
          {/* Frond lengths come from the index, never Math.random(): this renders on the server and
              on the client, and a random tree would differ between them and trip hydration. */}
          {[8, 18, 28, 38, 50, 62, 72, 82, 92].map((x, i) => {
            const lift = Math.sin((i / 8) * Math.PI);
            const top = 30 - Math.round(lift * 16);
            const drop = 40 + Math.round(lift * 22);
            // Fronds nearer the edge sweep further out; the middle ones fall almost straight.
            const sweep = Math.round((x - 50) * 0.16);
            return <path key={x} d={`M${x} ${top}q${sweep} ${drop * 0.55} ${sweep * 1.5} ${drop}`} strokeWidth={3.5} />;
          })}
          <path d="M10 30q40 -24 80 0" strokeWidth={5} />
          <path d="M50 12v12" strokeWidth={5} />
        </g>
      );
  }
}
