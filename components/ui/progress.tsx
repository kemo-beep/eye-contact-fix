import * as React from "react"

import { cn } from "@/lib/utils"

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number
  indeterminate?: boolean
}

function Progress({
  value = 0,
  indeterminate = false,
  className,
  ...props
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className={cn(
        "bg-secondary relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {indeterminate ? (
        <div className="bg-primary absolute inset-y-0 w-1/3 animate-[progress-indeterminate_1.4s_ease-in-out_infinite] rounded-full" />
      ) : (
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
      <style>{`@keyframes progress-indeterminate {0%{transform:translateX(-100%)}50%{transform:translateX(100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  )
}

export { Progress }
