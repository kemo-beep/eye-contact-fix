"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type SectionProps = {
  title: string
  description?: string
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  /** Accessible id for the toggle. */
  id?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function InspectorSection({
  title,
  description,
  enabled,
  onEnabledChange,
  id,
  defaultOpen = true,
  children,
}: SectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const headerId = id ?? `section-${title.replace(/\s+/g, "-").toLowerCase()}`

  return (
    <section className="flex flex-col border-b border-border/60 last:border-b-0">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium tracking-tight">{title}</span>
            {description ? (
              <span className="truncate text-xs text-muted-foreground">
                {description}
              </span>
            ) : null}
          </div>
        </button>
        <Switch
          id={headerId}
          checked={enabled}
          onChange={onEnabledChange}
          className="shrink-0"
        />
      </header>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "px-3 pb-3 transition-opacity",
              enabled ? "opacity-100" : "opacity-50"
            )}
          >
            <fieldset disabled={!enabled} className="contents">
              {children}
            </fieldset>
          </div>
        </div>
      </div>
    </section>
  )
}

export function FieldRow({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium">{label}</span>
        {value ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {value}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
