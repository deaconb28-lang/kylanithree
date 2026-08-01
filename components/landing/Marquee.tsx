import Image from "next/image";
import { GALLERY_PRODUCTS } from "../../lib/data";

function Row({ direction, speed }: { direction: "left" | "right"; speed: number }) {
  const doubled = [...GALLERY_PRODUCTS, ...GALLERY_PRODUCTS];
  return (
    <div className="ky-marquee-mask" style={{ position: "relative", overflow: "hidden" }}>
      <div
        className={`ky-track-row ${direction === "left" ? "ky-track-a" : "ky-track-b"}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 36,
          width: "max-content",
          animation: `${direction === "left" ? "kyMarqueeLeft" : "kyMarqueeRight"} ${speed}s linear infinite`,
        }}
      >
        {doubled.map((p, i) => (
          <div key={p.name + i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div className="ky-logo-plate">
              <Image src={p.image} alt={p.alt} width={325} height={130} loading={i < 6 ? "eager" : "lazy"} style={{ height: 130, width: "auto", display: "block" }} />
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--green)", fontVariantNumeric: "tabular-nums", letterSpacing: ".02em" }}>
              <svg width="10" height="10" viewBox="0 0 11 11" style={{ flexShrink: 0 }}>
                <path d="M5.5 0L11 11H0Z" fill="var(--green)" />
              </svg>
              {p.mrr}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Marquee() {
  return (
    <div style={{ padding: "96px 0", display: "flex", flexDirection: "column", gap: 48, borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ padding: "0 5vw", display: "flex", flexDirection: "column", gap: 10, maxWidth: 620 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          Real founders use Kylani.
        </h2>
        <p style={{ margin: 0, fontSize: 17, color: "var(--muted)" }}>A hundred small bets, sent this week, by people building things.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Row direction="left" speed={45} />
        <Row direction="right" speed={60} />
      </div>
    </div>
  );
}
