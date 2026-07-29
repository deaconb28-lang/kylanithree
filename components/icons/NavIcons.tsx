type IconProps = { color?: string; size?: number };

export function TodayIcon({ color = "#9C948A", size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: "block", flexShrink: 0 }} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.4" />
      <path d="M4.6 7.2l1.5 1.5 3.2-3.5" />
    </svg>
  );
}

export function QueueIcon({ color = "#9C948A", size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: "block", flexShrink: 0 }} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h9M2.5 7h9M2.5 9.5h5.5" />
    </svg>
  );
}

export function MapIcon({ color = "#9C948A", size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: "block", flexShrink: 0 }} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 12.3s4.3-3.8 4.3-7.1a4.3 4.3 0 10-8.6 0c0 3.3 4.3 7.1 4.3 7.1z" />
      <circle cx="7" cy="5.2" r="1.4" />
    </svg>
  );
}

export function FindingsIcon({ color = "#9C948A", size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: "block", flexShrink: 0 }} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 11.2h10M3.7 11.2V7.4M7 11.2V3.6M10.3 11.2V8.3" />
    </svg>
  );
}
