import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Paper's mascot: a smiling sphere drawn in the grayscale tokens. Decorative.
 * With `wave` it plays cue-mascot-wave once on mount: rolls in, grows limbs, waves, and drops back to this pose.
 * The keyframes are the `mascot-*` rules in app/globals.css, whose resting styles are the final pose.
 * It is drawn in the animation's 240×220 space and the viewBox crops that to the 26px box. The limbs and the
 * standing pose overflow the box; the clip-path stops the roll from crossing the wordmark on its left.
 */
export function Mascot({ size = 26, wave = false, className }: { size?: number; wave?: boolean; className?: string }) {
  const gradient = `mascot-${useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="70 98 100 102"
      overflow="visible"
      aria-hidden="true"
      className={cn(wave && "mascot-waving", className)}
      style={{ flexShrink: 0, clipPath: "inset(-20px -20px -6px -8px)" }}
    >
      <defs>
        <radialGradient id={gradient} cx="38%" cy="32%" r="70%">
          <stop offset="0" style={{ stopColor: "var(--page)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--wash)" }} />
          <stop offset="1" style={{ stopColor: "var(--line)" }} />
        </radialGradient>
      </defs>
      <g className="mascot-mover">
        <ellipse cx="120" cy="197" rx="30" ry="3" style={{ fill: "var(--ink)", fillOpacity: 0.08 }} />
        <g className="mascot-body">
          {/* Limbs sit behind the ball so they look attached. */}
          <path className="mascot-limb mascot-leg-l" d="M110 150 L103 194 L94 194" />
          <path className="mascot-limb mascot-leg-r" d="M130 150 L137 194 L146 194" />
          <g className="mascot-arm-l">
            <path className="mascot-limb" d="M78 116 L57 136" />
            <circle className="mascot-hand" cx="57" cy="136" r="7" />
          </g>
          <g className="mascot-arm-r">
            <g className="mascot-hello">
              <path className="mascot-limb" d="M162 116 L190 88" />
              <circle className="mascot-hand" cx="190" cy="88" r="7" />
            </g>
          </g>
          <g className="mascot-squash">
            <circle cx="120" cy="110" r="48" fill={`url(#${gradient})`} />
            <circle className="mascot-mark" cx="120" cy="74" r="4" style={{ fill: "var(--line)" }} />
            <ellipse cx="102" cy="86" rx="10" ry="6" transform="rotate(-30 102 86)" style={{ fill: "var(--page)", fillOpacity: 0.9 }} />
            <g className="mascot-face">
              <ellipse cx="107" cy="106" rx="4.5" ry="6.5" style={{ fill: "var(--ink)" }} />
              <ellipse cx="133" cy="106" rx="4.5" ry="6.5" style={{ fill: "var(--ink)" }} />
              <path d="M107 118 A13 13 0 0 0 133 118" fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
