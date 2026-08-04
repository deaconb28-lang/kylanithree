import BrandLogo from "./BrandLogo";
import { BRANDS } from "../../lib/brands";

// The logo wall, replacing a two-tier scrolling marquee.
//
// The marquee's problem was that it never stood still. Two rows moving in opposite directions at
// different speeds meant no logo could be read without waiting for it, half of every row was under a
// fade mask at any moment, and the thing a logo wall is FOR — take it in at a glance, recognise the
// shape of the company keeping this company — was the one thing it prevented. A grid says the same
// thing in one look and costs no animation frame.
//
// Every card is an opaque light plate carrying its own colours, so it renders identically in light
// and dark mode with no dark-mode rule anywhere. That is the same decision the app tiles made and
// for the same reason: a logo recoloured to survive a background is no longer that logo, and
// `invert(1) hue-rotate(180deg)` — the trick the original wordmark PNGs used — mangles anything with
// real colour in it.
//
// The brands are invented. Nothing here imitates a real company's identity.

export default function Gallery() {
  return (
    <div style={{ padding: "96px 5vw", display: "flex", flexDirection: "column", gap: 44, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 620 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          Real founders use Kylani.
        </h2>
        <p style={{ margin: 0, fontSize: 17, color: "var(--muted)" }}>
          A hundred small bets, sent this week, by people building things.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          // auto-fill rather than auto-fit: a partly filled last row keeps the cards their intended
          // width instead of stretching two of them across the whole page.
          //
          // The track minimum is fluid rather than fixed, which is what decides the phone layout. A
          // flat 208px minimum could only fit ONE column at 390px, so twenty-five cards became a
          // twenty-five-card scroll — a logo wall that cannot be taken in at a glance is not doing
          // the job. The clamp lands 2-up on a phone, 4-up on a tablet and 5-up on a desktop with no
          // media query.
          gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 18vw, 208px), 1fr))",
          gap: 14,
        }}
      >
        {BRANDS.map((brand) => (
          <figure
            key={brand.word}
            style={{
              margin: 0,
              // Fixed, not tokenised. These plates are the same in both colour schemes on purpose —
              // see the note at the top of the file.
              background: "#F7F4EF",
              border: "1px solid rgba(20,16,12,.07)",
              borderRadius: 14,
              padding: "26px 18px 18px",
              minHeight: 132,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              overflow: "hidden",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minWidth: 0, width: "100%" }}>
              <BrandLogo brand={brand} />
            </span>
            {/* The caption, and the reason each card is a <figure>: it is a caption for the mark
                above it, not a second line of the logo. Set well below the wordmark's weight so it
                never competes with it, and in a fixed ink because the plate is fixed too. */}
            <figcaption
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: ".11em",
                textTransform: "uppercase",
                color: "#8A8177",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              {brand.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
