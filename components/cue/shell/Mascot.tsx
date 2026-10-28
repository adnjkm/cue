import { useId } from "react";

/** Paper's mascot: a smiling sphere drawn in the grayscale tokens. Decorative. */
export function Mascot({ size = 26, className }: { size?: number; className?: string }) {
  const gradient = `mascot-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="10 8 100 102" aria-hidden="true" className={className} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={gradient} cx="38%" cy="32%" r="70%">
          <stop offset="0" style={{ stopColor: "var(--page)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--wash)" }} />
          <stop offset="1" style={{ stopColor: "var(--line)" }} />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="107" rx="30" ry="3" style={{ fill: "var(--ink)", fillOpacity: 0.08 }} />
      <circle cx="60" cy="58" r="48" fill={`url(#${gradient})`} />
      <ellipse cx="42" cy="34" rx="10" ry="6" transform="rotate(-30 42 34)" style={{ fill: "var(--page)", fillOpacity: 0.9 }} />
      <ellipse cx="47" cy="54" rx="4.5" ry="6.5" style={{ fill: "var(--ink)" }} />
      <ellipse cx="73" cy="54" rx="4.5" ry="6.5" style={{ fill: "var(--ink)" }} />
      <path d="M47 66 A13 13 0 0 0 73 66" fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
    </svg>
  );
}
