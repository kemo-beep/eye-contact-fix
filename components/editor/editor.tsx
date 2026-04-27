"use client"

import * as React from "react"
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  Loader2,
  ScanFace,
  Scissors,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useJobPolling } from "@/hooks/useJobPolling"
import {
  DEFAULT_EFFECTS,
  downloadUrl,
  getJob,
  previewSubjectMask,
  renderJob,
  type ClickPoint,
  type EffectsPayload,
  type Job,
} from "@/lib/api"
import { cn } from "@/lib/utils"

import { Inspector, type ToolId } from "./inspector"
import { Preview } from "./preview"
import { SubjectPicker } from "./subject-picker"

type EditorProps = {
  initialJob: Job
  /** Reset back to the upload screen. */
  onExit: () => void
}

const ACTIVE: ReadonlySet<Job["status"]> = new Set(["queued", "processing"])
const TOOLS: {
  id: ToolId
  title: string
  Icon: React.ComponentType<{ className?: string }>
  active: (effects: EffectsPayload) => boolean
}[] = [
  {
    id: "background",
    title: "Remove BG",
    Icon: Scissors,
    active: (effects) => effects.background.enabled,
  },
  {
    id: "beauty",
    title: "Retouch",
    Icon: ScanFace,
    active: (effects) => effects.beauty.enabled,
  },
  {
    id: "eye_contact",
    title: "Eye Contact",
    Icon: Eye,
    active: (effects) => effects.eye_contact.enabled,
  },
]

export function Editor({ initialJob, onExit }: EditorProps) {
  const [job, setJob] = React.useState<Job>(initialJob)
  const [effects, setEffects] = React.useState<EffectsPayload>(
    normalizeEffects(initialJob.effects)
  )
  const [renderError, setRenderError] = React.useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [points, setPoints] = React.useState<ClickPoint[]>(
    initialJob.subject_points ?? []
  )
  const [maskPreviewUrl, setMaskPreviewUrl] = React.useState<string | null>(
    initialJob.mask_preview_url ?? null
  )
  const [maskLoading, setMaskLoading] = React.useState(false)
  const [maskError, setMaskError] = React.useState<string | null>(null)
  const [selectedTool, setSelectedTool] = React.useState<ToolId>("eye_contact")
  const autoRenderTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const queuedRender = React.useRef<EffectsPayload | null>(null)
  const renderBusy = React.useRef(false)

  const polledId = ACTIVE.has(job.status) ? job.id : null
  const polled = useJobPolling(polledId, 1500)
  const currentJob = polled.job ?? job

  const rendering = ACTIVE.has(currentJob.status)
  const completed = currentJob.status === "completed"
  const failed = currentJob.status === "failed"

  React.useEffect(() => {
    const fresh = polled.job
    if (!fresh) return
    const id = window.setTimeout(() => setJob(fresh), 0)
    return () => window.clearTimeout(id)
  }, [polled.job])

  React.useEffect(() => {
    return () => {
      if (autoRenderTimer.current) clearTimeout(autoRenderTimer.current)
    }
  }, [])

  React.useEffect(() => {
    if (rendering || !queuedRender.current) return
    const next = queuedRender.current
    queuedRender.current = null
    scheduleRender(next, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendering])

  async function performRender(eff: EffectsPayload) {
    if (renderBusy.current || ACTIVE.has(currentJob.status)) {
      queuedRender.current = eff
      return
    }
    renderBusy.current = true
    setRenderError(null)
    try {
      const r = await renderJob(currentJob.id, eff)
      setJob(r.job)
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err))
    } finally {
      renderBusy.current = false
    }
  }

  async function handleRender() {
    await performRender(effects)
  }

  function scheduleRender(eff: EffectsPayload, delay = 900) {
    queuedRender.current = eff
    if (autoRenderTimer.current) clearTimeout(autoRenderTimer.current)
    autoRenderTimer.current = setTimeout(() => {
      const next = queuedRender.current
      queuedRender.current = null
      if (next) void performRender(next)
    }, delay)
  }

  async function pollForMask(startedAt: string | null) {
    const start = Date.now()
    while (Date.now() - start < 30_000) {
      const data = await getJob(currentJob.id)
      if (data.mask_preview_url && data.mask_preview_url !== startedAt) {
        setJob(data)
        setMaskPreviewUrl(data.mask_preview_url)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
  }

  async function requestMaskPreview(nextPoints: ClickPoint[]) {
    setMaskLoading(true)
    setMaskError(null)
    const startedAt = maskPreviewUrl ?? currentJob.mask_preview_url ?? null
    try {
      await previewSubjectMask(currentJob.id, 0, nextPoints)
      await pollForMask(startedAt)
    } catch (err) {
      setMaskError(err instanceof Error ? err.message : String(err))
    } finally {
      setMaskLoading(false)
    }
  }

  function handleEffectsChange(next: EffectsPayload) {
    const enabledNow = !effects.background.enabled && next.background.enabled
    const openedPicker =
      effects.background.mode !== "sam" && next.background.mode === "sam"
    setEffects(next)
    if (enabledNow) void requestMaskPreview(points)
    if (openedPicker) setPickerOpen(true)
    scheduleRender(next)
  }

  function handleApplyPoints(next: ClickPoint[]) {
    setPoints(next)
    const nextEffects: EffectsPayload = {
      ...effects,
      background: {
        ...effects.background,
        enabled: effects.background.enabled || next.length > 0,
        mode: next.length > 0 ? "sam" : "auto",
      },
    }
    setEffects(nextEffects)
    if (next.length > 0) void requestMaskPreview(next)
    scheduleRender(nextEffects, 250)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden w-full mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExit}
            disabled={rendering}
            className="h-8 px-2 text-xs"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
          <span className="hidden truncate text-xs font-medium text-muted-foreground sm:inline">
            {currentJob.original_filename}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {failed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRender}
            >
              <RotateCcw />
              Retry
            </Button>
          ) : null}
          {completed && currentJob.output_url ? (
            <a
              href={downloadUrl(currentJob.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" size="sm">
                <Download />
                Download
              </Button>
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Preview pane */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <Preview
            job={currentJob}
            maskOverlayUrl={
              effects.background.enabled
                ? (maskPreviewUrl ?? currentJob.mask_preview_url)
                : null
            }
            maskLoading={maskLoading}
            statusOverlay={
              rendering ? (
                <div className="rounded-lg bg-black/60 px-4 py-3 text-white backdrop-blur">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="size-3.5 animate-spin" />
                      {currentJob.status === "queued" ? "Queued" : "Rendering"}
                    </span>
                    <span className="text-sm tabular-nums">
                      {currentJob.progress}%
                    </span>
                  </div>
                  <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="absolute inset-y-0 left-0 bg-white transition-[width] duration-500"
                      style={{ width: `${currentJob.progress}%` }}
                    />
                  </div>
                </div>
              ) : completed ? (
                <ResultBanner job={currentJob} />
              ) : null
            }
          />
          {renderError ? (
            <p className="text-xs text-destructive">{renderError}</p>
          ) : null}
          {maskError ? (
            <p className="text-xs text-destructive">{maskError}</p>
          ) : null}
        </div>

        {/* Inspector */}
        <Inspector
          effects={effects}
          onChange={handleEffectsChange}
          onOpenSubjectPicker={() => setPickerOpen(true)}
          selectedTool={selectedTool}
          samAvailable
        />
      </div>

      <div className="rounded-lg border border-border/50 bg-card p-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TOOLS.map(({ id, title, Icon, active }) => {
            const isSelected = selectedTool === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedTool(id)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:border-border hover:bg-secondary/50"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="text-sm font-medium">{title}</span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    active(effects)
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {active(effects) ? "On" : "Off"}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <SubjectPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        job={currentJob}
        initialPoints={points}
        onApply={handleApplyPoints}
      />
    </div>
  )
}

function normalizeEffects(effects?: EffectsPayload | null): EffectsPayload {
  return {
    ...DEFAULT_EFFECTS,
    ...effects,
    eye_contact: {
      ...DEFAULT_EFFECTS.eye_contact,
      ...effects?.eye_contact,
    },
    beauty: {
      ...DEFAULT_EFFECTS.beauty,
      ...effects?.beauty,
    },
    background: {
      ...DEFAULT_EFFECTS.background,
      ...effects?.background,
    },
  }
}

function ResultBanner({ job }: { job: Job }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-emerald-500/95 px-4 py-2.5 text-emerald-950 backdrop-blur"
      )}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-950/15">
        <Check className="size-3" />
      </span>
      <span className="text-sm font-medium">
        Render complete · {job.output_format === "webm_alpha" ? "WebM" : "MP4"}
      </span>
    </div>
  )
}
