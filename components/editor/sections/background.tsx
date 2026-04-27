"use client"

import * as React from "react"
import { Sparkles, MousePointerClick } from "lucide-react"

import { Slider } from "@/components/ui/slider"
import type {
  BackgroundEffect,
  BackgroundMaskMode,
  BackgroundOutputMode,
} from "@/lib/api"
import { cn } from "@/lib/utils"

import { FieldRow, InspectorSection } from "./section"

type Props = {
  value: BackgroundEffect
  onChange: (v: BackgroundEffect) => void
  /** Called when the user clicks "Refine subject" — opens the picker modal. */
  onOpenSubjectPicker: () => void
  /** Whether SAM2 is available in this deployment. */
  samAvailable?: boolean
  /** True when output_format is webm_alpha (transparent allowed). */
  alphaAvailable: boolean
}

const MODES: {
  id: BackgroundMaskMode
  label: string
  hint: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    id: "auto",
    label: "Auto",
    hint: "Person detection",
    Icon: Sparkles,
  },
  {
    id: "sam",
    label: "Refine",
    hint: "Pick the subject",
    Icon: MousePointerClick,
  },
]

const OUTPUTS: { id: BackgroundOutputMode; label: string }[] = [
  { id: "blur", label: "Blur" },
  { id: "color", label: "Color" },
  { id: "transparent", label: "Transparent" },
]

export function BackgroundSection({
  value,
  onChange,
  onOpenSubjectPicker,
  samAvailable = true,
  alphaAvailable,
}: Props) {
  function patch(p: Partial<BackgroundEffect>) {
    onChange({ ...value, ...p })
  }

  // If user disables alpha output (mp4 selected), force transparent off.
  React.useEffect(() => {
    if (!alphaAvailable && value.output === "transparent") {
      onChange({ ...value, output: "blur" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alphaAvailable])

  return (
    <InspectorSection
      title="Remove background"
      description="Auto-detect or click the subject"
      enabled={value.enabled}
      onEnabledChange={(enabled) => patch({ enabled })}
    >
      <FieldRow label="Subject">
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map(({ id, label, hint, Icon }) => {
            const active = value.mode === id
            const disabled = id === "sam" && !samAvailable
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => patch({ mode: id })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all",
                  active
                    ? "border-foreground bg-foreground/5"
                    : "border-border/60 hover:border-border bg-background",
                  disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className="size-3.5" />
                  <span className="text-xs font-medium">{label}</span>
                </span>
                <span className="text-muted-foreground text-[11px]">{hint}</span>
              </button>
            )
          })}
        </div>
        {value.mode === "sam" ? (
          <button
            type="button"
            onClick={onOpenSubjectPicker}
            className="border-border/60 hover:bg-foreground/5 mt-2 flex h-9 items-center justify-center rounded-xl border text-xs font-medium transition-colors"
          >
            <MousePointerClick className="size-3.5 mr-1.5" />
            Refine subject
          </button>
        ) : null}
      </FieldRow>

      <FieldRow label="Output">
        <div className="grid grid-cols-3 gap-1">
          {OUTPUTS.map(({ id, label }) => {
            const active = value.output === id
            const disabled = id === "transparent" && !alphaAvailable
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => patch({ output: id })}
                className={cn(
                  "h-8 rounded-lg border text-[11px] font-medium transition-all",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 hover:bg-foreground/5",
                  disabled && "cursor-not-allowed opacity-40"
                )}
                title={
                  disabled ? "Switch output to WebM (alpha) to enable" : undefined
                }
              >
                {label}
              </button>
            )
          })}
        </div>
      </FieldRow>

      {value.output === "color" ? (
        <FieldRow label="Color" value={value.color}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.color}
              onChange={(e) => patch({ color: e.target.value })}
              className="border-border/60 h-9 w-12 cursor-pointer rounded-lg border bg-transparent p-1"
            />
            <input
              type="text"
              value={value.color}
              onChange={(e) => patch({ color: e.target.value })}
              spellCheck={false}
              className="border-border/60 bg-background h-9 w-full rounded-lg border px-2 text-xs font-mono uppercase tracking-tight outline-none focus-visible:border-foreground"
            />
          </div>
        </FieldRow>
      ) : null}

      {value.output === "blur" ? (
        <FieldRow label="Blur" value={String(value.blur_strength)}>
          <Slider
            value={value.blur_strength}
            onChange={(v) => patch({ blur_strength: Math.round(v) })}
            min={5}
            max={75}
            step={2}
          />
        </FieldRow>
      ) : null}

      {value.output === "transparent" ? (
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          Output will be a WebM with VP9 alpha — drop it into your editor and the
          subject will float on whatever you composite under it.
        </p>
      ) : null}
    </InspectorSection>
  )
}
