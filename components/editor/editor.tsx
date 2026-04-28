"use client"

import * as React from "react"
import {
  Eye,
  ScanFace,
  Scissors,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useJobPolling } from "@/hooks/useJobPolling"
import {
  DEFAULT_EFFECTS,
  getJob,
  getRetouchAnalysis,
  previewSubjectMask,
  renderJob,
  type ClickPoint,
  type EffectsPayload,
  type Job,
  type RetouchAnalysis,
} from "@/lib/api"
import { cn } from "@/lib/utils"

import { Inspector, type ToolId } from "./inspector"
import { Preview } from "./preview"
import { SubjectPicker } from "./subject-picker"

type EditorProps = {
  initialJob: Job
  onJobChange?: (job: Job) => void
  comparisonEnabled?: boolean
}

type RenderPhase = "idle" | "pending" | "rendering" | "done_flash"

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

export function Editor({
  initialJob,
  onJobChange,
  comparisonEnabled = false,
}: EditorProps) {
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
  const [retouchAnalysis, setRetouchAnalysis] =
    React.useState<RetouchAnalysis | null>(null)
  const [maskLoading, setMaskLoading] = React.useState(false)
  const [maskError, setMaskError] = React.useState<string | null>(null)
  const [previewTime, setPreviewTime] = React.useState(0)
  const [previewPlaying, setPreviewPlaying] = React.useState(false)
  const [selectedTool, setSelectedTool] = React.useState<ToolId>("beauty")
  const [renderPhase, setRenderPhase] = React.useState<RenderPhase>(
    initialJob.status === "completed" ? "idle" : "pending"
  )
  const autoRenderTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const queuedRender = React.useRef<EffectsPayload | null>(null)
  const renderBusy = React.useRef(false)
  const flashTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadRenderActivity = React.useRef(false)
  const prevPreviewPlaying = React.useRef(false)

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
    onJobChange?.(currentJob)
  }, [currentJob, onJobChange])

  React.useEffect(() => {
    return () => {
      if (autoRenderTimer.current) clearTimeout(autoRenderTimer.current)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  React.useEffect(() => {
    if (rendering) {
      const id = window.setTimeout(() => setRenderPhase("rendering"), 0)
      return () => window.clearTimeout(id)
    }
    if (failed) {
      const id = window.setTimeout(() => setRenderPhase("idle"), 0)
      hadRenderActivity.current = false
      return () => window.clearTimeout(id)
    }
    if (completed && hadRenderActivity.current) {
      const id = window.setTimeout(() => setRenderPhase("done_flash"), 0)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => {
        setRenderPhase("idle")
      }, 1200)
      hadRenderActivity.current = false
      return () => window.clearTimeout(id)
    }
    if (completed && renderPhase === "pending") {
      const id = window.setTimeout(() => setRenderPhase("idle"), 0)
      return () => window.clearTimeout(id)
    }
  }, [rendering, failed, completed, renderPhase])

  React.useEffect(() => {
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      if (!currentJob.input_url) {
        setRetouchAnalysis(null)
        return
      }
      getRetouchAnalysis(currentJob.id, 0, ctrl.signal)
        .then(setRetouchAnalysis)
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          setRetouchAnalysis(null)
        })
    }, 0)
    return () => {
      ctrl.abort()
      window.clearTimeout(id)
    }
  }, [currentJob.id, currentJob.input_url])

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
    hadRenderActivity.current = true
    setRenderPhase("pending")
    await performRender(effects)
  }

  function scheduleRender(eff: EffectsPayload, delay = 900) {
    hadRenderActivity.current = true
    setRenderPhase("pending")
    queuedRender.current = eff
    if (autoRenderTimer.current) clearTimeout(autoRenderTimer.current)
    autoRenderTimer.current = setTimeout(() => {
      const next = queuedRender.current
      queuedRender.current = null
      if (next) void performRender(next)
    }, delay)
  }

  const pollForMask = React.useCallback(
    async (startedAt: string | null) => {
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
    },
    [currentJob.id]
  )

  const requestMaskPreview = React.useCallback(
    async (nextPoints: ClickPoint[], atTime = previewTime) => {
      setMaskLoading(true)
      setMaskError(null)
      const startedAt = maskPreviewUrl ?? currentJob.mask_preview_url ?? null
      try {
        await previewSubjectMask(currentJob.id, Math.max(0, atTime), nextPoints)
        await pollForMask(startedAt)
      } catch (err) {
        setMaskError(err instanceof Error ? err.message : String(err))
      } finally {
        setMaskLoading(false)
      }
    },
    [
      currentJob.id,
      currentJob.mask_preview_url,
      maskPreviewUrl,
      pollForMask,
      previewTime,
    ]
  )

  function sanitizeEffects(next: EffectsPayload): EffectsPayload {
    if (!retouchAnalysis) return next
    const features = retouchAnalysis.features
    const beauty = {
      ...next.beauty,
      skin_smooth: features.skin ? next.beauty.skin_smooth : 0,
      teeth_whiten: features.teeth ? next.beauty.teeth_whiten : 0,
      eye_brighten: features.eyes ? next.beauty.eye_brighten : 0,
      eye_size: features.eyes ? next.beauty.eye_size : 0,
      eye_distance: features.eyes ? next.beauty.eye_distance : 0,
      inner_eye: features.eyes ? next.beauty.inner_eye : 0,
      eye_position: features.eyes ? next.beauty.eye_position : 0,
      nose_width: features.nose ? next.beauty.nose_width : 0,
      nose_bridge: features.nose ? next.beauty.nose_bridge : 0,
      nose_height: features.nose ? next.beauty.nose_height : 0,
      nose_root: features.nose ? next.beauty.nose_root : 0,
      nose_size: features.nose ? next.beauty.nose_size : 0,
      mouth_position: features.mouth ? next.beauty.mouth_position : 0,
      smile: features.mouth ? next.beauty.smile : 0,
      mouth_size: features.mouth ? next.beauty.mouth_size : 0,
    }
    if (!features.skin && !features.eyes && !features.nose && !features.mouth && !features.teeth) {
      beauty.enabled = false
    }
    return { ...next, beauty }
  }

  function handleEffectsChange(next: EffectsPayload) {
    const safeNext = sanitizeEffects(next)
    const enabledNow = !effects.background.enabled && safeNext.background.enabled
    const openedPicker =
      effects.background.mode !== "sam" && safeNext.background.mode === "sam"
    setEffects(safeNext)
    if (enabledNow) void requestMaskPreview(points)
    if (openedPicker) setPickerOpen(true)
    scheduleRender(safeNext)
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

  React.useEffect(() => {
    if (
      prevPreviewPlaying.current &&
      !previewPlaying &&
      effects.background.enabled &&
      points.length > 0 &&
      !maskLoading
    ) {
      void requestMaskPreview(points, previewTime)
    }
    prevPreviewPlaying.current = previewPlaying
  }, [
    previewPlaying,
    effects.background.enabled,
    points,
    maskLoading,
    previewTime,
    requestMaskPreview,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden w-full mx-auto max-w-6xl p-2 sm:p-4 font-sans">
      {failed ? (
        <div className="flex items-center justify-end gap-2 rounded-xl border border-border/20 bg-card/40 px-4 py-3">
          {failed ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRender}
              className="h-9 rounded-lg shadow-none"
            >
              <RotateCcw className="size-4 mr-1.5" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Preview pane */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <Preview
            job={currentJob}
            comparisonEnabled={comparisonEnabled}
            retouchPreview={{
              enabled: effects.beauty.enabled,
              effect: effects.beauty,
              analysis: retouchAnalysis,
              selected: selectedTool === "beauty",
            }}
            maskOverlayUrl={
              effects.background.enabled && !previewPlaying
                ? (maskPreviewUrl ?? currentJob.mask_preview_url)
                : null
            }
            maskLoading={maskLoading}
            statusOverlay={null}
            onFrameTimeChange={setPreviewTime}
            onPlayingChange={setPreviewPlaying}
          />
          {renderError ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 shadow-none">
              <p className="text-sm text-destructive font-medium">{renderError}</p>
            </div>
          ) : null}
          {maskError ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 shadow-none">
              <p className="text-sm text-destructive font-medium">{maskError}</p>
            </div>
          ) : null}
        </div>

        {/* Inspector */}
        <Inspector
          effects={effects}
          onChange={handleEffectsChange}
          onOpenSubjectPicker={() => setPickerOpen(true)}
          selectedTool={selectedTool}
          renderPhase={renderPhase}
          progress={currentJob.progress}
          retouchAnalysis={retouchAnalysis}
          samAvailable
        />
      </div>
      
      <div className="rounded-xl border border-border/20 bg-card/40 backdrop-blur-md p-2">
        <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
          {TOOLS.map(({ id, title, Icon, active }) => {
            const isSelected = selectedTool === id
            const isActive = active(effects)
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedTool(id)}
                className={cn(
                  "relative flex min-w-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-4 py-3 transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-none scale-100"
                    : "border-transparent hover:border-border/40 hover:bg-secondary/30"
                )}
              >
                <Icon className={cn("size-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>{title}</span>
                {isActive ? (
                  <span
                    className="absolute top-2 right-2 flex size-2 rounded-full bg-primary"
                    aria-label={`${title} enabled`}
                    title={`${title} enabled`}
                  />
                ) : null}
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
