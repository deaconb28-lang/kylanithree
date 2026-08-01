// The places Kylani actually looks, as marks.
//
// Drawn rather than pulled from an icon font: the hero loads three typefaces already, and a whole
// icon library for five glyphs would be the heaviest thing on the page. All of them inherit
// currentColor so the row recolours with the theme without a second set for dark mode.

type Props = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "currentColor" as const,
  "aria-hidden": true as const,
  focusable: "false" as const,
  style: { flexShrink: 0 },
});

export function RedditIcon({ size = 15 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M8 1.4a.9.9 0 0 1 .88-.9l2.5-.5.72 2.36a1.9 1.9 0 1 1-1.06.36l-.4-1.3-1.7.34A.9.9 0 0 1 8 1.4Zm6.9 6.13a1.6 1.6 0 0 0-2.7-1.15A7.9 7.9 0 0 0 8 5.28a7.9 7.9 0 0 0-4.2 1.1 1.6 1.6 0 1 0-1.87 2.56A3 3 0 0 0 1.9 9.5c0 2.35 2.73 4.26 6.1 4.26s6.1-1.91 6.1-4.26a3 3 0 0 0-.03-.42 1.6 1.6 0 0 0 .83-1.55ZM5.4 9.05a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm5.1 2.6c-.63.63-1.83.68-2.5.68s-1.87-.05-2.5-.68a.28.28 0 0 1 .4-.39c.4.4 1.26.54 2.1.54s1.7-.14 2.1-.54a.28.28 0 0 1 .4.4Zm-.4-1.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  );
}

export function XIcon({ size = 14 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M12.23 1.5h2.16l-4.72 5.4 5.55 7.6h-4.34l-3.4-4.45-3.9 4.45H1.42l5.05-5.77L1.15 1.5H5.6l3.07 4.06L12.23 1.5Zm-.76 11.7h1.2L5.1 2.72H3.81l7.66 10.48Z" />
    </svg>
  );
}

export function DiscordIcon({ size = 16 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M13.06 3.42a11.7 11.7 0 0 0-2.9-.9l-.15.3a8.9 8.9 0 0 1 2.58 1.3 9.1 9.1 0 0 0-7.19 0 8.9 8.9 0 0 1 2.58-1.3l-.15-.3a11.7 11.7 0 0 0-2.9.9C2.66 6.1 2.16 8.7 2.4 11.26a11.8 11.8 0 0 0 3.6 1.82l.72-1.24c-.4-.15-.78-.33-1.14-.55l.28-.22a8.4 8.4 0 0 0 7.18 0l.28.22c-.36.22-.74.4-1.14.55l.72 1.24a11.8 11.8 0 0 0 3.6-1.82c.28-2.97-.5-5.55-2.44-7.84ZM6.1 9.74c-.7 0-1.28-.64-1.28-1.43 0-.79.56-1.44 1.28-1.44s1.3.65 1.29 1.44c0 .79-.57 1.43-1.29 1.43Zm3.8 0c-.7 0-1.28-.64-1.28-1.43 0-.79.57-1.44 1.29-1.44.71 0 1.29.65 1.28 1.44 0 .79-.57 1.43-1.28 1.43Z" />
    </svg>
  );
}

export function SlackIcon({ size = 14 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M3.86 9.9a1.43 1.43 0 1 1-1.43-1.44h1.43V9.9Zm.72 0a1.43 1.43 0 0 1 2.86 0v3.58a1.43 1.43 0 0 1-2.86 0V9.9ZM6.01 4.15a1.43 1.43 0 1 1 1.43-1.44v1.44H6.01Zm0 .73a1.43 1.43 0 0 1 0 2.86H2.43a1.43 1.43 0 1 1 0-2.86h3.58ZM11.74 6.31a1.43 1.43 0 1 1 1.43 1.43h-1.43V6.31Zm-.72 0a1.43 1.43 0 0 1-2.86 0V2.71a1.43 1.43 0 0 1 2.86 0v3.6ZM9.59 12.05a1.43 1.43 0 1 1-1.43 1.44v-1.44h1.43Zm0-.72a1.43 1.43 0 0 1 0-2.86h3.58a1.43 1.43 0 0 1 0 2.86H9.59Z" />
    </svg>
  );
}

export function ForumsIcon({ size = 15 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M2 3.2c0-.66.54-1.2 1.2-1.2h7.1c.66 0 1.2.54 1.2 1.2v4.3c0 .66-.54 1.2-1.2 1.2H6.02L3.4 10.8a.4.4 0 0 1-.65-.32V8.7H3.2A1.2 1.2 0 0 1 2 7.5V3.2Zm10.3 1.9h.5c.66 0 1.2.54 1.2 1.2v4.3c0 .66-.54 1.2-1.2 1.2h-.45v1.78a.4.4 0 0 1-.65.32L9.08 12H6.3a1.2 1.2 0 0 1-1.1-.72h5.11a2 2 0 0 0 2-2V5.1Z" />
    </svg>
  );
}
