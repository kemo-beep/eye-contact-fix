import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        default: "bg-secondary text-secondary-foreground border-transparent",
        info: "bg-primary/10 text-primary border-primary/20",
        success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
        warning: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
        danger: "bg-destructive/15 text-destructive border-destructive/30",
        muted: "bg-muted text-muted-foreground border-transparent",
      },
    },
    defaultVariants: { tone: "default" },
  }
)

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  )
}

export { Badge }
