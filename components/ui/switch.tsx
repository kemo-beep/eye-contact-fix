"use client"

import { Switch as Primitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

type SwitchProps = {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}

export function Switch({ checked, onChange, disabled, className, id }: SwitchProps) {
  return (
    <Primitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        "data-[checked]:bg-foreground data-[unchecked]:bg-foreground/15",
        "focus-visible:ring-ring/30 focus-visible:outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <Primitive.Thumb
        className={cn(
          "bg-background pointer-events-none block size-4 rounded-full shadow ring-0 transition-transform",
          "data-[checked]:translate-x-[18px] data-[unchecked]:translate-x-0.5"
        )}
      />
    </Primitive.Root>
  )
}
