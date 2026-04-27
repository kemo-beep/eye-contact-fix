"use client"

import { Slider } from "@/components/ui/slider"
import type { EyeContactEffect } from "@/lib/api"

import { FieldRow, InspectorSection } from "./section"

type Props = {
  value: EyeContactEffect
  onChange: (v: EyeContactEffect) => void
}

export function EyeContactSection({ value, onChange }: Props) {
  return (
    <InspectorSection
      title="Eye contact"
      description="Warp the iris toward the camera"
      enabled={value.enabled}
      onEnabledChange={(enabled) => onChange({ ...value, enabled })}
    >
      <FieldRow label="Strength" value={`${Math.round(value.strength * 100)}%`}>
        <Slider
          value={value.strength}
          onChange={(v) => onChange({ ...value, strength: v })}
          min={0}
          max={1.2}
          step={0.05}
        />
      </FieldRow>
      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
        Try 80–100% for full correction. Above 110% can look uncanny on hard
        side glances.
      </p>
    </InspectorSection>
  )
}
