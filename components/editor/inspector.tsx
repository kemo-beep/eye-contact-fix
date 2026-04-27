"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EffectsPayload, OutputFormat } from "@/lib/api"
import { cn } from "@/lib/utils"

import { BackgroundSection } from "./sections/background"
import { BeautySection } from "./sections/beauty"
import { EyeContactSection } from "./sections/eye-contact"

type Props = {
  effects: EffectsPayload
  onChange: (next: EffectsPayload) => void
  onOpenSubjectPicker: () => void
  onRender: () => void
  rendering?: boolean
  samAvailable?: boolean
  /** Brief informational message shown above the render button when set. */
  hint?: string | null
}

const FORMATS: { id: OutputFormat; label: string; sub: string }[] = [
  { id: "mp4", label: "MP4", sub: "H.264 + AAC" },
  { id: "webm_alpha", label: "WebM", sub: "VP9 + alpha" },
]

export function Inspector({
  effects,
  onChange,
  onOpenSubjectPicker,
  onRender,
  rendering,
  samAvailable,
  hint,
}: Props) {
  function patch(p: Partial<EffectsPayload>) {
    onChange({ ...effects, ...p })
  }

  const alphaAvailable = effects.output_format === "webm_alpha"

  const enabledCount =
    Number(effects.eye_contact.enabled) +
    Number(effects.beauty.enabled) +
    Number(effects.background.enabled)

  return (
    <aside className="flex h-full max-h-[calc(100dvh-7rem)] min-h-[34rem] flex-col overflow-hidden rounded-lg border border-border/60 bg-card min-[900px]:sticky min-[900px]:top-4">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5" />
          <span className="text-sm font-semibold tracking-tight">Effects</span>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {enabledCount} active
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <EyeContactSection
          value={effects.eye_contact}
          onChange={(v) => patch({ eye_contact: v })}
        />
        <BeautySection
          value={effects.beauty}
          onChange={(v) => patch({ beauty: v })}
        />
        <BackgroundSection
          value={effects.background}
          onChange={(v) => patch({ background: v })}
          onOpenSubjectPicker={onOpenSubjectPicker}
          samAvailable={samAvailable}
          alphaAvailable={alphaAvailable}
        />

        <section className="border-border/60 px-5 py-4">
          <span className="mb-2 block text-[11px] tracking-wider text-muted-foreground uppercase">
            Output format
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.map((f) => {
              const active = effects.output_format === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => patch({ output_format: f.id })}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-all",
                    active
                      ? "border-foreground bg-foreground/5"
                      : "border-border/60 bg-background hover:border-border"
                  )}
                >
                  <span className="text-xs font-medium">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {f.sub}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-border/60 bg-card/95 p-4 backdrop-blur">
        {hint ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          onClick={onRender}
          disabled={rendering || enabledCount === 0}
          className="w-full"
        >
          {rendering ? (
            <>
              <Loader2 className="animate-spin" />
              Rendering
            </>
          ) : (
            <>
              <Sparkles />
              Render
            </>
          )}
        </Button>
      </footer>
    </aside>
  )
}
