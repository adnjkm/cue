import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Cue: 13/16 at 420, radius 6, no shadow, the global 2px ink focus outline. Primary is ink, secondary the control gray.
// The transparent border stays for forced-colors mode, so default padding is Paper's 15/13 minus that 1px.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent bg-clip-padding text-sm leading-4 font-normal whitespace-nowrap transition-colors duration-[120ms] ease-standard select-none disabled:pointer-events-none disabled:cursor-default disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: "bg-ink text-page hover:bg-ink-hover aria-expanded:bg-ink-hover",
        outline: "border-border bg-page text-ink hover:bg-wash aria-expanded:bg-wash",
        secondary: "bg-control text-ink hover:bg-border aria-expanded:bg-border aria-pressed:bg-border",
        ghost: "text-ink hover:bg-wash aria-expanded:bg-wash",
        destructive: "bg-ink text-page hover:bg-ink-hover",
        link: "text-graphite underline-offset-4 hover:text-ink hover:underline",
      },
      size: {
        default: "h-8 px-[14px] has-data-[icon=inline-end]:pr-[12px] has-data-[icon=inline-start]:pl-[12px]",
        xs: "h-6 gap-1 rounded-xs px-2 text-xs",
        sm: "h-7 gap-1.5 px-2.5",
        lg: "h-11 px-5",
        chip: "h-7 gap-1.5 rounded-xs px-2 leading-[18px]",
        icon: "size-8 rounded-full [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-9 rounded-full [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
