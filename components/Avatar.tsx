// An initials disc for a found person.
//
// Borrowed from how Explee presents people — an avatar, then name, then role · company — because
// that row is scannable at a glance in a way a line of plain text is not. A list of twelve names
// with no visual anchor reads as a paragraph; the same twelve with a disc each reads as people.
//
// DELIBERATELY NEUTRAL, one colour for everyone. The obvious move is a colour hashed from the
// handle, and it is wrong twice: a palette of invented per-person colours implies a categorisation
// nobody made, and pointing them all at --ember would spend the screen's single accent twelve
// times over. The design system already has a rule about this — the marquee's app tiles use literal
// hex precisely so twelve brands do not read as one company's suite, and the inverse applies here.
//
// Initials only, never a photo. Every platform this product crawls exposes avatars, and fetching
// them would mean hotlinking a stranger's image into a founder's dashboard — a tracking surface and
// a licensing question for something that adds nothing a monogram does not.

/**
 * Two letters from whatever we honestly have.
 *
 * A display name gives its first two words' initials; a bare handle gives its first two characters.
 * Never invents a surname, and never renders empty — a person with a one-character handle gets one
 * letter rather than a blank disc.
 */
export function initialsFor(displayName: string | undefined, handle: string): string {
  const name = displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words[0]) return words[0].slice(0, 2).toUpperCase();
  }
  // Handles arrive qualified on the namespaced platforms ("host/name") and prefixed on Bluesky
  // ("@name"), so the bare identity is what follows the last slash with any @ stripped.
  const bare = handle.split("/").pop()?.replace(/^@+/, "") ?? handle;
  return bare.slice(0, 2).toUpperCase() || "?";
}

export default function Avatar({
  displayName,
  handle,
  size = 38,
}: {
  displayName?: string;
  handle: string;
  size?: number;
}) {
  const initials = initialsFor(displayName, handle);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: "var(--card-alt)",
        border: "1px solid var(--border)",
        color: "var(--muted-strong)",
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        letterSpacing: ".01em",
        userSelect: "none",
      }}
    >
      {initials}
    </span>
  );
}
