"use client"

import * as React from "react"

import {
  ArrowLeftRight,
  ArrowUpDown,
  Circle,
  ChevronDown,
  Eye,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  ScanFace,
  Smile,
  StretchHorizontal,
  StretchVertical,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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

type BeautyPatch = Partial<BeautyEffect>
type BeautyKey = keyof BeautyEffect

const PRESETS: Record<string, Pick<BeautyEffect, "skin_smooth" | "teeth_whiten" | "eye_brighten">> = {
  Subtle: { skin_smooth: 0.3, teeth_whiten: 0.25, eye_brighten: 0.2 },
  Natural: { skin_smooth: 0.55, teeth_whiten: 0.5, eye_brighten: 0.4 },
  Strong: { skin_smooth: 0.85, teeth_whiten: 0.85, eye_brighten: 0.7 },
}

const EYE_CONTROLS: { key: BeautyKey; label: string }[] = [
  { key: "eye_size", label: "Size" },
  { key: "eye_distance", label: "Distance" },
  { key: "inner_eye", label: "Inner" },
  { key: "eye_position", label: "Position" },
]

const NOSE_CONTROLS: { key: BeautyKey; label: string }[] = [
  { key: "nose_width", label: "Width" },
  { key: "nose_bridge", label: "Bridge" },
  { key: "nose_height", label: "Height" },
  { key: "nose_root", label: "Root" },
  { key: "nose_size", label: "Size" },
]

const MOUTH_CONTROLS: { key: BeautyKey; label: string }[] = [
  { key: "mouth_position", label: "Position" },
  { key: "smile", label: "Smile" },
  { key: "mouth_size", label: "Size" },
]

const RESET_KEYS = {
  eye: ["eye_size", "eye_distance", "inner_eye", "eye_position"],
  nose: ["nose_width", "nose_bridge", "nose_height", "nose_root", "nose_size"],
  mouth: ["mouth_position", "smile", "mouth_size"],
} satisfies Record<string, BeautyKey[]>

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
  const [retouchOpen, setRetouchOpen] = React.useState(true)
  const [reshapeOpen, setReshapeOpen] = React.useState(false)
  const [reshapeTab, setReshapeTab] = React.useState<"eye" | "nose" | "mouth">(
    "eye"
  )
  const current = activePreset(value)
  const features = analysis?.features ?? {
    skin: true,
    eyes: true,
    nose: true,
    mouth: true,
    teeth: true,
  }

  function patch(p: BeautyPatch) {
    onChange({
      ...value,
      ...p,
      skin_smooth: features.skin ? (p.skin_smooth ?? value.skin_smooth) : 0,
      teeth_whiten: features.teeth ? (p.teeth_whiten ?? value.teeth_whiten) : 0,
      eye_brighten: features.eyes ? (p.eye_brighten ?? value.eye_brighten) : 0,
    })
  }

  function reset(keys: BeautyKey[]) {
    patch(Object.fromEntries(keys.map((key) => [key, 0])) as BeautyPatch)
  }

  return (
    <InspectorSection
      title="Retouch"
      enabled={value.enabled}
      onEnabledChange={(enabled) => patch({ enabled })}
      status={status}
      disableContent={false}
      collapsible={false}
    >
      <AccordionSection
        title="Retouch"
        open={retouchOpen}
        onToggle={() => setRetouchOpen((v) => !v)}
      >
        <div className="mb-3 flex items-center gap-1">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => patch(PRESETS[name])}
              disabled={!value.enabled}
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
            disabled={!value.enabled || !features.skin}
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
            disabled={!value.enabled || !features.teeth}
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
            disabled={!value.enabled || !features.eyes}
          />
        </FieldRow>
      </AccordionSection>

      <AccordionSection
        title="Reshape"
        open={reshapeOpen}
        onToggle={() => setReshapeOpen((v) => !v)}
      >
        <div className="mb-3 grid grid-cols-3 gap-1 rounded bg-muted/40 p-1">
          {(["eye", "nose", "mouth"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setReshapeTab(id)}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded text-xs font-medium capitalize transition-colors",
                reshapeTab === id
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {id === "eye" ? (
                <Eye className="size-3.5" />
              ) : id === "nose" ? (
                <Circle className="size-3.5" />
              ) : (
                <Smile className="size-3.5" />
              )}
              {id}
            </button>
          ))}
        </div>

        {reshapeTab === "eye" ? (
          <ReshapeGroup
            title="Eye"
            controls={EYE_CONTROLS}
            value={value}
            onChange={patch}
            onReset={() => reset(RESET_KEYS.eye)}
            disabled={!value.enabled || !features.eyes}
            collapsible={false}
          />
        ) : null}
        {reshapeTab === "nose" ? (
          <ReshapeGroup
            title="Nose"
            controls={NOSE_CONTROLS}
            value={value}
            onChange={patch}
            onReset={() => reset(RESET_KEYS.nose)}
            disabled={!value.enabled || !features.nose}
            collapsible={false}
          />
        ) : null}
        {reshapeTab === "mouth" ? (
          <ReshapeGroup
            title="Mouth"
            controls={MOUTH_CONTROLS}
            value={value}
            onChange={patch}
            onReset={() => reset(RESET_KEYS.mouth)}
            disabled={!value.enabled || !features.mouth}
            collapsible={false}
          />
        ) : null}
      </AccordionSection>
    </InspectorSection>
  )
}

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 border-b border-border/40 pb-2 last:mb-0 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium tracking-tight"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        {title}
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div>{children}</div>
        </div>
      </div>
    </div>
  )
}

function ReshapeGroup({
  title,
  controls,
  value,
  onChange,
  onReset,
  disabled,
}: {
  title: string
  controls: { key: BeautyKey; label: string }[]
  value: BeautyEffect
  onChange: (patch: BeautyPatch) => void
  onReset: () => void
  disabled?: boolean
  collapsible?: boolean
}) {
  const [open, setOpen] = React.useState(true)
  const titleIcon =
    title === "Eye" ? (
      <Eye className="size-3.5" />
    ) : title === "Nose" ? (
      <Circle className="size-3.5" />
    ) : (
      <Smile className="size-3.5" />
    )

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titleIcon}
          {title}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReset}
          disabled={disabled}
          className="h-6 w-6 rounded"
          aria-label={`Reset ${title}`}
          title={`Reset ${title}`}
        >
          <RotateCcw className="size-3" />
        </Button>
      </div>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pb-1">
        {controls.map(({ key, label }) => (
          <div
            key={key}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <ControlIcon controlKey={key} />
              {label}
            </span>
            <Slider
              value={getReshapeValue(value[key])}
              onChange={(v) => onChange({ [key]: getReshapeValue(v) })}
              min={-1}
              max={1}
              step={0.01}
              disabled={disabled}
            />
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              {formatSigned(getReshapeValue(value[key]))}
            </span>
          </div>
        ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlIcon({ controlKey }: { controlKey: BeautyKey }) {
  const className = "size-3.5 text-muted-foreground"
  switch (controlKey) {
    case "eye_size":
    case "nose_size":
    case "mouth_size":
      return <ScanFace className={className} />
    case "eye_distance":
      return <ArrowLeftRight className={className} />
    case "inner_eye":
      return <StretchHorizontal className={className} />
    case "eye_position":
    case "mouth_position":
      return <MoveVertical className={className} />
    case "nose_width":
      return <MoveHorizontal className={className} />
    case "nose_height":
      return <StretchVertical className={className} />
    case "nose_bridge":
    case "nose_root":
      return <ArrowUpDown className={className} />
    case "smile":
      return <Smile className={className} />
    default:
      return <Circle className={className} />
  }
}

function getReshapeValue(input: unknown): number {
  if (typeof input !== "number" || Number.isNaN(input)) return 0
  return Math.max(-1, Math.min(1, input))
}

function formatSigned(value: number) {
  const pct = Math.round(getReshapeValue(value) * 100)
  return pct > 0 ? `+${pct}` : `${pct}`
}
