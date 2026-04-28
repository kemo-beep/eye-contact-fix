"use client"

import * as React from "react"
import { Check } from "lucide-react"

import type { EffectsPayload, OutputFormat, RetouchAnalysis } from "@/lib/api"
import { cn } from "@/lib/utils"

import { BackgroundSection } from "./sections/background"
import { BeautySection } from "./sections/beauty"
import { EyeContactSection } from "./sections/eye-contact"

type Props = {
  effects: EffectsPayload
  onChange: (next: EffectsPayload) => void
  onOpenSubjectPicker: () => void
  selectedTool: ToolId
  renderPhase?: "idle" | "pending" | "rendering" | "done_flash"
  progress?: number
  samAvailable?: boolean
  retouchAnalysis?: RetouchAnalysis | null
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
  renderPhase = "idle",
  progress,
  samAvailable,
  retouchAnalysis,
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

  const activeToolEnabled =
    selectedTool === "background"
      ? effects.background.enabled
      : selectedTool === "beauty"
        ? effects.beauty.enabled
        : effects.eye_contact.enabled

  const sectionStatus =
    !activeToolEnabled ? null : renderPhase === "pending" ? (
      <span className="text-xs font-medium tabular-nums text-primary">...</span>
    ) : renderPhase === "rendering" ? (
      <span className="text-xs font-medium tabular-nums text-primary">
        {progress ?? 0}%
      </span>
    ) : renderPhase === "done_flash" ? (
      <span
        className="inline-flex items-center justify-center rounded-full bg-emerald-500/20 p-0.5 text-emerald-600 dark:text-emerald-400"
        aria-label="Render complete"
        title="Render complete"
      >
        <Check className="size-3" />
      </span>
    ) : (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted p-0.5 text-muted-foreground"
        aria-label="Up to date"
        title="Up to date"
      >
        <Check className="size-3" />
      </span>
    )

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/20 bg-card/60 backdrop-blur-md shadow-none">
      <div className="flex-1 overflow-y-auto">
        <div className="p-1">
          {selectedTool === "eye_contact" ? (
            <EyeContactSection
              value={effects.eye_contact}
              onChange={(v) => patch({ eye_contact: v })}
              status={sectionStatus}
            />
          ) : null}
          {selectedTool === "beauty" ? (
            <BeautySection
              value={effects.beauty}
              onChange={(v) => patch({ beauty: v })}
              analysis={retouchAnalysis}
              status={sectionStatus}
            />
          ) : null}
          {selectedTool === "background" ? (
            <BackgroundSection
              value={effects.background}
              onChange={(v) => patch({ background: v })}
              onOpenSubjectPicker={onOpenSubjectPicker}
              samAvailable={samAvailable}
              status={sectionStatus}
            />
          ) : null}
        </div>

        <section className="mt-2 border-t border-border/20 px-4 py-4 bg-muted/5">
          <span className="mb-3 block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Output Format
          </span>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => {
              const active = effects.output_format === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => patch({ output_format: f.id })}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg border text-xs font-medium transition-all duration-200",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-none"
                      : "border-border/40 bg-background hover:border-border hover:bg-secondary/30 text-muted-foreground hover:text-foreground"
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
