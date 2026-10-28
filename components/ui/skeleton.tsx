import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-breathe rounded-xs bg-fill", className)}
      {...props}
    />
  )
}

export { Skeleton }
