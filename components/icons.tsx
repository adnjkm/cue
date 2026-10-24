type IconProps = { size?: number; strokeWidth?: number };

const svg = ({ size = 16, strokeWidth = 1.5 }: IconProps) =>
  ({
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  }) as const;

export const ChevronLeft = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M10 3 5 8l5 5" />
  </svg>
);

export const ChevronRight = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="m6 3 5 5-5 5" />
  </svg>
);
