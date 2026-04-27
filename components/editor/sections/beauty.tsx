"use client"

import { cn } from "@/lib/utils"

import { Slider } from "@/components/ui/slider"
import type { BeautyEffect } from "@/lib/api"

import { FieldRow, InspectorSection } from "./section"

type Props = {
  value: BeautyEffect
  onChange: (v: BeautyEffect) => void
}

const PRESETS: Record<string, Pick<BeautyEffect, "skin_smooth" | "teeth_whiten" | "eye_brighten">> = {
  Subtle: { skin_smooth: 0.3, teeth_whiten: 0.25, eye_brighten: 0.2 },
  Natural: { skin_smooth: 0.55, teeth_whiten: 0.5, eye_brighten: 0.4 },
  Strong: { skin_smooth: 0.85, teeth_whiten: 0.85, eye_brighten: 0.7 },
}

function activePreset(v: BeautyEffect): string | null {
  for (const [name, p] of Object.entries(PRESETS)) {
    if (
      Math.abs(p.skin_smooth - v.skin_smooth) < 0.02 &&
      Math.abs(p.teeth_whiten - v.teeth_whiten) < 0.02 &&
      Math.abs(p.eye_brighten - v.eye_brighten) < 0.02
    ) {
      return name
    }
  }
  return null
}

export function BeautySection({ value, onChange }: Props) {
  const current = activePreset(value)
  return (
    <InspectorSection
      title="Retouch"
      description="Skin, teeth, eyes"
      enabled={value.enabled}
      onEnabledChange={(enabled) => onChange({ ...value, enabled })}
    >
      <div className="mb-3 flex items-center gap-1">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange({ ...value, ...PRESETS[name] })}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-medium transition-colors",
              current === name
                ? "bg-foreground text-background"
                : "bg-foreground/5 text-foreground hover:bg-foreground/10"
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <FieldRow
        label="Skin smoothing"
        value={`${Math.round(value.skin_smooth * 100)}%`}
      >
        <Slider
          value={value.skin_smooth}
          onChange={(v) => onChange({ ...value, skin_smooth: v })}
          min={0}
          max={1}
          step={0.01}
        />
      </FieldRow>
      <FieldRow
        label="Teeth whitening"
        value={`${Math.round(value.teeth_whiten * 100)}%`}
      >
        <Slider
          value={value.teeth_whiten}
          onChange={(v) => onChange({ ...value, teeth_whiten: v })}
          min={0}
          max={1}
          step={0.01}
        />
      </FieldRow>
      <FieldRow
        label="Eye brightening"
        value={`${Math.round(value.eye_brighten * 100)}%`}
      >
        <Slider
          value={value.eye_brighten}
          onChange={(v) => onChange({ ...value, eye_brighten: v })}
          min={0}
          max={1}
          step={0.01}
        />
      </FieldRow>
    </InspectorSection>
  )
}
