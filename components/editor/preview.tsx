"use client"

import * as React from "react"
import { Loader2, Pause, Play, Repeat } from "lucide-react"

import { BeforeAfter } from "@/components/before-after"
import type { Job } from "@/lib/api"
import { cn } from "@/lib/utils"

type PreviewProps = {
  job: Job
  maskOverlayUrl?: string | null
  maskLoading?: boolean
  /** A status banner to overlay (e.g. "Rendering — 35%"). */
  statusOverlay?: React.ReactNode
}

/** Editor preview pane.
 *
 * - For DRAFT/UPLOADED jobs: shows the original input video with custom transport.
 * - For QUEUED/PROCESSING: shows the input dimmed with a status overlay.
 * - For COMPLETED: shows the BeforeAfter comparison slider.
 * - For FAILED: shows the input with the error in the overlay.
 */
export function Preview({
  job,
  maskOverlayUrl,
  maskLoading,
  statusOverlay,
}: PreviewProps) {
  if (job.status === "completed" && job.input_url && job.output_url) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1">
          <BeforeAfter before={job.input_url} after={job.output_url} />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Drag the divider to compare. Press{" "}
          <kbd className="rounded bg-muted px-1 py-0.5">←</kbd> /{" "}
          <kbd className="rounded bg-muted px-1 py-0.5">→</kbd> for fine
          control.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <SinglePlayer
        src={job.input_url ?? ""}
        maskOverlayUrl={maskOverlayUrl}
        maskLoading={maskLoading}
        overlay={statusOverlay}
      />
    </div>
  )
}

function SinglePlayer({
  src,
  maskOverlayUrl,
  maskLoading,
  overlay,
}: {
  src: string
  maskOverlayUrl?: string | null
  maskLoading?: boolean
  overlay?: React.ReactNode
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState(1)
  const [loop, setLoop] = React.useState(true)

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    v.addEventListener("play", onPlay)
    v.addEventListener("pause", onPause)
    v.addEventListener("ended", onEnded)
    return () => {
      v.removeEventListener("play", onPlay)
      v.removeEventListener("pause", onPause)
      v.removeEventListener("ended", onEnded)
    }
  }, [])

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  function handleSpeedChange(next: number) {
    setSpeed(next)
    const v = videoRef.current
    if (!v) return
    v.playbackRate = next
  }

  function handleLoopToggle() {
    const next = !loop
    setLoop(next)
    const v = videoRef.current
    if (!v) return
    v.loop = next
  }

  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = speed
    v.loop = loop
  }, [speed, loop])

  return (
    <div className="relative h-full min-h-80 w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
      {src ? (
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/60">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {src ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-black/65 px-2.5 py-2 text-white backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/15 transition-colors hover:bg-white/25"
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 translate-x-px" />
                )}
              </button>
              <button
                type="button"
                onClick={handleLoopToggle}
                aria-label={loop ? "Disable loop" : "Enable loop"}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
                  loop ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                )}
              >
                <Repeat className="size-3.5" />
                Loop
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <span className="text-white/80">Speed</span>
              <select
                value={speed}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="h-8 rounded-md border border-white/20 bg-black/60 px-2 text-xs text-white outline-none"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {maskOverlayUrl ? (
        <img
          src={maskOverlayUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-80 mix-blend-screen"
        />
      ) : null}

      {maskLoading ? (
        <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded bg-black/70 px-2.5 py-1 text-[11px] text-white">
          <Loader2 className="size-3 animate-spin" />
          Selecting
        </div>
      ) : null}

      {overlay ? (
        <div className="pointer-events-none absolute inset-0 flex items-end p-4">
          <div className="pointer-events-auto w-full">{overlay}</div>
        </div>
      ) : null}
    </div>
  )
}
