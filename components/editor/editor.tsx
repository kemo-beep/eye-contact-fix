"use client"

import * as React from "react"
import { ArrowLeft, Check, Download, Loader2, RotateCcw } from "lucide-react"

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

import { Inspector } from "./inspector"
import { Preview } from "./preview"
import { SubjectPicker } from "./subject-picker"

type EditorProps = {
  initialJob: Job
  /** Reset back to the upload screen. */
  onExit: () => void
}

const ACTIVE: ReadonlySet<Job["status"]> = new Set(["queued", "processing"])

export function Editor({ initialJob, onExit }: EditorProps) {
  const [job, setJob] = React.useState<Job>(initialJob)
  const [effects, setEffects] = React.useState<EffectsPayload>(
    initialJob.effects ?? DEFAULT_EFFECTS
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

  const polledId = ACTIVE.has(job.status) ? job.id : null
  const polled = useJobPolling(polledId, 1500)
  const currentJob = polled.job ?? job

  const rendering = ACTIVE.has(currentJob.status)
  const completed = currentJob.status === "completed"
  const failed = currentJob.status === "failed"

  async function handleRender() {
    setRenderError(null)
    try {
      const r = await renderJob(currentJob.id, effects)
      setJob(r.job)
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err))
    }
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
  }

  function handleApplyPoints(next: ClickPoint[]) {
    setPoints(next)
    setEffects((prev) => ({
      ...prev,
      background: {
        ...prev.background,
        enabled: prev.background.enabled || next.length > 0,
        mode: next.length > 0 ? "sam" : prev.background.mode,
      },
    }))
    if (next.length > 0) void requestMaskPreview(next)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-card/60 px-5 py-3 shadow-sm backdrop-blur-xl transition-all">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onExit}
            disabled={rendering}
            className="h-8 rounded-full px-4 text-xs font-medium"
          >
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back
          </Button>
          <div className="h-4 w-px bg-border/60" />
          <span className="hidden truncate text-sm font-medium text-foreground/80 sm:inline tracking-tight">
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

      <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_22rem] min-[900px]:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Preview pane */}
        <div className="flex min-w-0 flex-col gap-3">
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
        </div>

        {/* Inspector */}
        <Inspector
          effects={effects}
          onChange={handleEffectsChange}
          onOpenSubjectPicker={() => setPickerOpen(true)}
          onRender={handleRender}
          rendering={rendering}
          samAvailable
          hint={maskError ?? hintFor(effects, points.length)}
        />
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

function hintFor(effects: EffectsPayload, pointCount: number): string | null {
  if (
    effects.background.enabled &&
    effects.background.mode === "sam" &&
    pointCount === 0
  ) {
    return 'Tip: click "Refine subject" to mark which person SAM2 should track.'
  }
  if (
    effects.background.enabled &&
    effects.background.output === "transparent" &&
    effects.output_format !== "webm_alpha"
  ) {
    return "Switch the output to WebM to keep transparency."
  }
  return null
}
