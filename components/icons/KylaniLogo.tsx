export default function KylaniLogo({ size = 28, color = "var(--ember)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill={color}>
        <path d="M46 62 C 42 74, 40 86, 35 96 C 39 90, 43 82, 47 72 Z" />
        <path d="M50 64 C 47 77, 46 88, 42 98 C 47 91, 51 82, 53 73 Z" />
        <path d="M54 65 C 53 78, 53 89, 51 99 C 55 91, 58 82, 58 73 Z" />
        <path d="M58 52 C 46 46, 32 38, 22 24 C 33 30, 46 36, 57 44 Z" />
        <path d="M60 48 C 47 40, 32 30, 20 14 C 32 21, 47 30, 60 40 Z" />
        <path d="M63 45 C 49 35, 34 23, 24 6 C 36 14, 51 26, 64 37 Z" />
        <path
          d="M96 26
             C 88 28, 78 30, 70 34
             C 62 38, 55 44, 52 52
             C 49 60, 47 66, 44 72
             C 50 68, 56 62, 60 56
             C 64 50, 68 44, 72 40
             C 74 38, 76 36, 78 33
             Z"
        />
      </g>
      <path d="M68 38 C 70 36, 73 36, 74 39 C 72 38, 70 38, 68 38 Z" fill="var(--card)" />
    </svg>
  );
}
