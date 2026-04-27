"use client"

import { cn } from "@/lib/utils"

import { Slider } from "@/components/ui/slider"
import type { BeautyEffect, RetouchAnalysis } from "@/lib/api"

import { FieldRow, InspectorSection } from "./section"

type Props = {
  value: BeautyEffect
  onChange: (v: BeautyEffect) => void
  analysis?: RetouchAnalysis | null
  status?: React.ReactNode
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

export function BeautySection({
  value,
  onChange,
  analysis,
  status,
}: Props) {
  const current = activePreset(value)
  const features = analysis?.features ?? { skin: true, eyes: true, teeth: true }

  function patch(p: Partial<BeautyEffect>) {
    onChange({
      ...value,
      ...p,
      skin_smooth: features.skin ? (p.skin_smooth ?? value.skin_smooth) : 0,
      teeth_whiten: features.teeth ? (p.teeth_whiten ?? value.teeth_whiten) : 0,
      eye_brighten: features.eyes ? (p.eye_brighten ?? value.eye_brighten) : 0,
    })
  }

  return (
    <InspectorSection
      title="Retouch"
      enabled={value.enabled}
      onEnabledChange={(enabled) => patch({ enabled })}
      status={status}
    >
      <div className="mb-3 flex items-center gap-1">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => patch(PRESETS[name])}
            className={cn(
              "h-7 rounded px-3 text-xs font-medium transition-colors",
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
        label="Smooth"
        value={`${Math.round((features.skin ? value.skin_smooth : 0) * 100)}%`}
      >
        <Slider
          value={features.skin ? value.skin_smooth : 0}
          onChange={(v) => patch({ skin_smooth: v })}
          min={0}
          max={1}
          step={0.01}
          disabled={!features.skin}
        />
      </FieldRow>
      <FieldRow
        label="White Teeth"
        value={`${Math.round((features.teeth ? value.teeth_whiten : 0) * 100)}%`}
      >
        <Slider
          value={features.teeth ? value.teeth_whiten : 0}
          onChange={(v) => patch({ teeth_whiten: v })}
          min={0}
          max={1}
          step={0.01}
          disabled={!features.teeth}
        />
      </FieldRow>
      <FieldRow
        label="Bright Eye"
        value={`${Math.round((features.eyes ? value.eye_brighten : 0) * 100)}%`}
      >
        <Slider
          value={features.eyes ? value.eye_brighten : 0}
          onChange={(v) => patch({ eye_brighten: v })}
          min={0}
          max={1}
          step={0.01}
          disabled={!features.eyes}
        />
      </FieldRow>
    </InspectorSection>
  )
}
