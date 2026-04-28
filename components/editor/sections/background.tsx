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
  status?: React.ReactNode
  /** Called when the user clicks "Refine subject" — opens the picker modal. */
  onOpenSubjectPicker: () => void
  /** Whether SAM2 is available in this deployment. */
  samAvailable?: boolean
}

const MODES: {
  id: BackgroundMaskMode
  label: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: "auto", label: "Auto", Icon: Sparkles },
  { id: "sam", label: "Custom", Icon: MousePointerClick },
]

const OUTPUTS: { id: BackgroundOutputMode; label: string }[] = [
  { id: "blur", label: "Blur" },
  { id: "color", label: "Color" },
  { id: "transparent", label: "Transparent" },
]

export function BackgroundSection({
  value,
  onChange,
  status,
  onOpenSubjectPicker,
  samAvailable = true,
}: Props) {
  function patch(p: Partial<BackgroundEffect>) {
    onChange({ ...value, ...p })
  }

  return (
    <InspectorSection
      title="Background"
      enabled={value.enabled}
      onEnabledChange={(enabled) => patch({ enabled })}
      status={status}
      collapsible={false}
    >
      <FieldRow label="Mask">
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map(({ id, label, Icon }) => {
            const active = value.mode === id
            const disabled = id === "sam" && !samAvailable
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => patch({ mode: id })}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded border p-1.5 transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/40 bg-background text-muted-foreground hover:border-border",
                  disabled && "cursor-not-allowed opacity-40"
                )}
              >
                <Icon className="size-3.5" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            )
          })}
        </div>
        {value.mode === "sam" ? (
          <button
            type="button"
            onClick={onOpenSubjectPicker}
            disabled={!samAvailable}
            className="mt-1.5 flex h-7 w-full items-center justify-center gap-1.5 rounded border border-border/40 bg-secondary/50 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MousePointerClick className="size-3" />
            Pick Subject Points
          </button>
        ) : null}
      </FieldRow>

      <FieldRow label="Invert">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.invert_mask}
            onChange={(e) => patch({ invert_mask: e.target.checked })}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 text-primary focus:ring-primary/20"
          />
          <span className="text-[11px] font-medium text-muted-foreground select-none">
            Reverse mask
          </span>
        </label>
      </FieldRow>

      <FieldRow label="Output">
        <div className="grid grid-cols-3 gap-1">
          {OUTPUTS.map(({ id, label }) => {
            const active = value.output === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => patch({ output: id })}
                className={cn(
                  "h-7 rounded border text-[10px] font-medium tracking-wider uppercase transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/40 text-muted-foreground hover:border-border hover:bg-secondary/50"
                )}
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
