"use client"

import { Slider as Primitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  className,
}: SliderProps) {
  return (
    <Primitive.Root
      value={value}
      onValueChange={(v) => onChange(typeof v === "number" ? v : v[0])}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
    >
      <Primitive.Control className="relative w-full">
        <Primitive.Track className="bg-muted relative h-1 w-full grow overflow-hidden rounded-full">
          <Primitive.Indicator className="bg-foreground/85 absolute h-full" />
        </Primitive.Track>
        <Primitive.Thumb className="border-foreground bg-background ring-offset-background focus-visible:ring-ring/30 absolute top-1/2 size-4 -translate-y-1/2 rounded-full border shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95" />
      </Primitive.Control>
    </Primitive.Root>
  )
}
