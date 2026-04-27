"use client"

import * as React from "react"
import { Loader2, Pause, Play } from "lucide-react"

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
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity",
            playing ? "opacity-0 hover:opacity-100" : "opacity-100"
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black backdrop-blur transition-transform hover:scale-105">
            {playing ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5 translate-x-0.5" />
            )}
          </span>
        </button>
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
