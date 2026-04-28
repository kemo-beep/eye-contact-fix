"use client"

import { Slider } from "@/components/ui/slider"
import type { EyeContactEffect } from "@/lib/api"

import { FieldRow, InspectorSection } from "./section"

type Props = {
  value: EyeContactEffect
  onChange: (v: EyeContactEffect) => void
  status?: React.ReactNode
}

export function EyeContactSection({
  value,
  onChange,
  status,
}: Props) {
  return (
    <InspectorSection
      title="Eye contact"
      enabled={value.enabled}
      onEnabledChange={(enabled) => onChange({ ...value, enabled })}
      status={status}
      collapsible={false}
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
    </InspectorSection>
  )
}
