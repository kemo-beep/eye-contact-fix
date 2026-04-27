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
                  "flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-all",
                  active
                    ? "border-foreground bg-foreground/5"
                    : "border-border/60 bg-background hover:border-border",
                  disabled && "cursor-not-allowed opacity-40"
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className="size-3.5" />
                  <span className="text-xs font-medium">{label}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {hint}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            if (value.mode !== "sam") patch({ mode: "sam" })
            onOpenSubjectPicker()
          }}
          disabled={!samAvailable}
          className="mt-2 flex h-9 items-center justify-center rounded-md border border-border/60 text-xs font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MousePointerClick className="mr-1.5 size-3.5" />
          {value.mode === "sam" ? "Refine subject" : "Pick subject"}
        </button>
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
                  "h-8 rounded-md border text-[11px] font-medium transition-all",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 hover:bg-foreground/5",
                  disabled && "cursor-not-allowed opacity-40"
                )}
                title={
                  disabled
                    ? "Switch output to WebM (alpha) to enable"
                    : undefined
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
              className="h-9 w-12 cursor-pointer rounded-md border border-border/60 bg-transparent p-1"
            />
            <input
              type="text"
              value={value.color}
              onChange={(e) => patch({ color: e.target.value })}
              spellCheck={false}
              className="h-9 w-full rounded-md border border-border/60 bg-background px-2 font-mono text-xs tracking-tight uppercase outline-none focus-visible:border-foreground"
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
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          WebM alpha output.
        </p>
      ) : null}
    </InspectorSection>
  )
}
