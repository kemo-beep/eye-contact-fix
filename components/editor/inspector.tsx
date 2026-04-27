"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"

import type { EffectsPayload, OutputFormat } from "@/lib/api"
import { cn } from "@/lib/utils"

import { BackgroundSection } from "./sections/background"
import { BeautySection } from "./sections/beauty"
import { EyeContactSection } from "./sections/eye-contact"

type Props = {
  effects: EffectsPayload
  onChange: (next: EffectsPayload) => void
  onOpenSubjectPicker: () => void
  selectedTool: ToolId
  rendering?: boolean
  samAvailable?: boolean
}

export type ToolId = "background" | "beauty" | "eye_contact"

const FORMATS: { id: OutputFormat; label: string }[] = [
  { id: "mp4", label: "MP4" },
  { id: "webm_alpha", label: "WebM alpha" },
]

export function Inspector({
  effects,
  onChange,
  onOpenSubjectPicker,
  selectedTool,
  samAvailable,
}: Props) {
  function patch(p: Partial<EffectsPayload>) {
    const next = { ...effects, ...p }
    if (p.background?.output === "transparent") {
      next.output_format = "webm_alpha"
    }
    if (
      p.output_format === "mp4" &&
      next.background.enabled &&
      next.background.output === "transparent"
    ) {
      next.background = { ...next.background, output: "blur" }
    }
    onChange(next)
  }

  const enabledCount =
    Number(effects.eye_contact.enabled) +
    Number(effects.beauty.enabled) +
    Number(effects.background.enabled)

  const activeTitle =
    selectedTool === "background"
      ? "Remove background"
      : selectedTool === "beauty"
        ? "Retouch"
        : "Eye contact"

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">{activeTitle}</span>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {enabledCount} active
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {selectedTool === "eye_contact" ? (
          <EyeContactSection
            value={effects.eye_contact}
            onChange={(v) => patch({ eye_contact: v })}
          />
        ) : null}
        {selectedTool === "beauty" ? (
          <BeautySection
            value={effects.beauty}
            onChange={(v) => patch({ beauty: v })}
          />
        ) : null}
        {selectedTool === "background" ? (
          <BackgroundSection
            value={effects.background}
            onChange={(v) => patch({ background: v })}
            onOpenSubjectPicker={onOpenSubjectPicker}
            samAvailable={samAvailable}
          />
        ) : null}

        <section className="border-border/60 px-3 py-3">
          <span className="mb-2 block text-[11px] tracking-wider text-muted-foreground uppercase">
            Output format
          </span>
          <div className="grid grid-cols-2 gap-1">
            {FORMATS.map((f) => {
              const active = effects.output_format === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => patch({ output_format: f.id })}
                  className={cn(
                    "h-8 rounded border text-xs font-medium transition-colors",
                    active
                      ? "border-foreground bg-foreground/5"
                      : "border-border/60 bg-background hover:border-border"
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </aside>
  )
}
