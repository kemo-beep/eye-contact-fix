"use client"

import * as React from "react"
import { ArrowLeft, Check, Download, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useJobPolling } from "@/hooks/useJobPolling"
import {
  DEFAULT_EFFECTS,
  downloadUrl,
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

const ACTIVE: ReadonlySet<Job["status"]> = new Set([
  "queued",
  "processing",
])

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

  const polledId = ACTIVE.has(job.status) ? job.id : null
  const polled = useJobPolling(polledId, 1500)

  React.useEffect(() => {
    if (polled.job) setJob(polled.job)
  }, [polled.job])

  const rendering = ACTIVE.has(job.status)
  const completed = job.status === "completed"
  const failed = job.status === "failed"

  async function handleRender() {
    setRenderError(null)
    try {
      const r = await renderJob(job.id, effects)
      setJob(r.job)
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleApplyPoints(next: ClickPoint[]) {
    setPoints(next)
    setEffects((prev) => ({
      ...prev,
      background: {
        ...prev.background,
        enabled: prev.background.enabled || next.length > 0,
        mode: next.length > 0 ? "sam" : prev.background.mode,
        subject_points: next.length > 0 ? next : null,
      },
    }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExit}
            disabled={rendering}
          >
            <ArrowLeft />
            Back
          </Button>
          <span className="text-muted-foreground hidden truncate text-xs sm:inline">
            {job.original_filename}
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
          {completed && job.output_url ? (
            <a
              href={downloadUrl(job.id)}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_24rem]">
        {/* Preview pane */}
        <div className="flex min-w-0 flex-col gap-3">
          <Preview
            job={job}
            statusOverlay={
              rendering ? (
                <div className="bg-black/60 backdrop-blur rounded-2xl px-4 py-3 text-white">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="size-3.5 animate-spin" />
                      {job.status === "queued" ? "Queued" : "Rendering"}
                    </span>
                    <span className="text-sm tabular-nums">
                      {job.progress}%
                    </span>
                  </div>
                  <div className="bg-white/15 relative h-1 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-white absolute inset-y-0 left-0 transition-[width] duration-500"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              ) : completed ? (
                <ResultBanner job={job} />
              ) : null
            }
          />
          {renderError ? (
            <p className="text-destructive text-xs">{renderError}</p>
          ) : null}
        </div>

        {/* Inspector */}
        <Inspector
          effects={effects}
          onChange={setEffects}
          onOpenSubjectPicker={() => setPickerOpen(true)}
          onRender={handleRender}
          rendering={rendering}
          samAvailable
          hint={hintFor(effects, points.length)}
        />
      </div>

      <SubjectPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        job={job}
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
        "flex items-center gap-2 rounded-2xl bg-emerald-500/95 px-4 py-2.5 text-emerald-950 shadow-lg backdrop-blur"
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
    return "Tip: click \"Refine subject\" to mark which person SAM2 should track."
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
