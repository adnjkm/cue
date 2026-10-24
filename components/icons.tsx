const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const ChevronLeft = () => (
  <svg {...base}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);

export const ChevronRight = () => (
  <svg {...base}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export const Check = ({ size = 16 }: { size?: number }) => (
  <svg {...base} width={size} height={size}>
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
  </svg>
);
