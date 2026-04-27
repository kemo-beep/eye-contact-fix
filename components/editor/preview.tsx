"use client"

import * as React from "react"
import { Loader2, Pause, Play, Repeat } from "lucide-react"

import { BeforeAfter } from "@/components/before-after"
import type { BeautyEffect, Job, RetouchAnalysis, RetouchBox } from "@/lib/api"
import { cn } from "@/lib/utils"

type PreviewProps = {
  job: Job
  comparisonEnabled?: boolean
  maskOverlayUrl?: string | null
  maskLoading?: boolean
  onFrameTimeChange?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  retouchPreview?: {
    enabled: boolean
    effect: BeautyEffect
    analysis?: RetouchAnalysis | null
    selected?: boolean
  }
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
  comparisonEnabled = false,
  maskOverlayUrl,
  maskLoading,
  onFrameTimeChange,
  onPlayingChange,
  retouchPreview,
  statusOverlay,
}: PreviewProps) {
  const liveRetouch = Boolean(retouchPreview?.selected && retouchPreview.analysis)

  const canCompare = Boolean(job.input_url && job.output_url && !liveRetouch)
  const showComparison =
    job.status === "completed" && comparisonEnabled && canCompare
  const src =
    job.status === "completed" && job.output_url && !liveRetouch
      ? job.output_url
      : (job.input_url ?? "")
  const showMaskOverlay = job.status !== "completed" || liveRetouch

  if (showComparison && job.input_url && job.output_url) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1">
          <BeforeAfter before={job.input_url} after={job.output_url} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <SinglePlayer
        src={src}
        maskOverlayUrl={showMaskOverlay ? maskOverlayUrl : null}
        maskLoading={maskLoading}
        onFrameTimeChange={onFrameTimeChange}
        onPlayingChange={onPlayingChange}
        retouchPreview={retouchPreview}
        overlay={statusOverlay}
      />
    </div>
  )
}

function SinglePlayer({
  src,
  maskOverlayUrl,
  maskLoading,
  onFrameTimeChange,
  onPlayingChange,
  retouchPreview,
  overlay,
}: {
  src: string
  maskOverlayUrl?: string | null
  maskLoading?: boolean
  onFrameTimeChange?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  retouchPreview?: {
    enabled: boolean
    effect: BeautyEffect
    analysis?: RetouchAnalysis | null
    selected?: boolean
  }
  overlay?: React.ReactNode
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState(1)
  const [loop, setLoop] = React.useState(true)
  const [viewport, setViewport] = React.useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const lastFrameNotify = React.useRef(0)

  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    const onTimeUpdate = () => {
      const now = performance.now()
      if (now - lastFrameNotify.current < 140) return
      lastFrameNotify.current = now
      onFrameTimeChange?.(v.currentTime)
    }
    v.addEventListener("play", onPlay)
    v.addEventListener("pause", onPause)
    v.addEventListener("ended", onEnded)
    v.addEventListener("timeupdate", onTimeUpdate)
    return () => {
      v.removeEventListener("play", onPlay)
      v.removeEventListener("pause", onPause)
      v.removeEventListener("ended", onEnded)
      v.removeEventListener("timeupdate", onTimeUpdate)
    }
  }, [onFrameTimeChange])

  React.useEffect(() => {
    onPlayingChange?.(playing)
  }, [playing, onPlayingChange])

  const updateViewport = React.useCallback(() => {
    const root = frameRef.current
    const v = videoRef.current
    if (!root || !v || !v.videoWidth || !v.videoHeight) return
    const rect = root.getBoundingClientRect()
    const mediaRatio = v.videoWidth / v.videoHeight
    const frameRatio = rect.width / rect.height
    let width = rect.width
    let height = rect.height
    let left = 0
    let top = 0
    if (frameRatio > mediaRatio) {
      width = height * mediaRatio
      left = (rect.width - width) / 2
    } else {
      height = width / mediaRatio
      top = (rect.height - height) / 2
    }
    setViewport({ left, top, width, height })
  }, [])

  React.useEffect(() => {
    const root = frameRef.current
    if (!root) return
    const observer = new ResizeObserver(updateViewport)
    observer.observe(root)
    window.addEventListener("resize", updateViewport)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateViewport)
    }
  }, [updateViewport])

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

  function mapBox(box?: RetouchBox | null): React.CSSProperties | null {
    const analysis = retouchPreview?.analysis
    if (!box || !analysis || !viewport.width || !viewport.height) return null
    return {
      left: viewport.left + (box.x / analysis.width) * viewport.width,
      top: viewport.top + (box.y / analysis.height) * viewport.height,
      width: (box.width / analysis.width) * viewport.width,
      height: (box.height / analysis.height) * viewport.height,
    }
  }

  function retouchLayer(
    box: RetouchBox | null | undefined,
    amount: number,
    className: string,
    style?: React.CSSProperties
  ) {
    const mapped = mapBox(box)
    if (!mapped) return null
    return (
      <div
        className={cn("pointer-events-none absolute", className)}
        style={{
          ...mapped,
          opacity: Math.max(0.12, Math.min(0.55, amount)),
          ...style,
        }}
      />
    )
  }

  function renderRetouchPreview() {
    const data = retouchPreview?.analysis
    if (!data || !retouchPreview?.selected) return null
    const effect = retouchPreview.effect
    const faceStyle = mapBox(data.face)
    const leftEyeStyle = mapBox(data.left_eye)
    const rightEyeStyle = mapBox(data.right_eye)
    return (
      <>
        {faceStyle ? (
          <div
            className="pointer-events-none absolute"
            style={faceStyle}
          >
            <span className="absolute -left-0.5 -top-0.5 h-4 w-4 rounded-tl border-l-2 border-t-2 border-sky-400/95" />
            <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-tr border-t-2 border-r-2 border-sky-400/95" />
            <span className="absolute -bottom-0.5 -left-0.5 h-4 w-4 rounded-bl border-b-2 border-l-2 border-sky-400/95" />
            <span className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-br border-r-2 border-b-2 border-sky-400/95" />
          </div>
        ) : null}
        {leftEyeStyle ? <EyeGuide style={leftEyeStyle} /> : null}
        {rightEyeStyle ? <EyeGuide style={rightEyeStyle} /> : null}
        {retouchPreview.enabled && data.features.skin
          ? retouchLayer(
              data.face,
              0.14 + effect.skin_smooth * 0.28,
              "rounded bg-rose-100/10 mix-blend-screen backdrop-blur-[2px]",
              {
                backdropFilter: `blur(${effect.skin_smooth * 2.4}px) saturate(${1 + effect.skin_smooth * 0.12})`,
              }
            )
          : null}
        {retouchPreview.enabled && data.features.eyes
          ? (
              <>
                {retouchLayer(
                  data.left_eye,
                  0.18 + effect.eye_brighten * 0.42,
                  "rounded bg-cyan-100/20 mix-blend-screen",
                  {
                    backdropFilter: `brightness(${1 + effect.eye_brighten * 0.35}) contrast(${1 + effect.eye_brighten * 0.08})`,
                  }
                )}
                {retouchLayer(
                  data.right_eye,
                  0.18 + effect.eye_brighten * 0.42,
                  "rounded bg-cyan-100/20 mix-blend-screen",
                  {
                    backdropFilter: `brightness(${1 + effect.eye_brighten * 0.35}) contrast(${1 + effect.eye_brighten * 0.08})`,
                  }
                )}
              </>
            )
          : null}
        {retouchPreview.enabled && data.features.teeth
          ? retouchLayer(
              data.teeth,
              0.18 + effect.teeth_whiten * 0.45,
              "rounded bg-white/30 mix-blend-screen",
              {
                backdropFilter: `brightness(${1 + effect.teeth_whiten * 0.45}) saturate(${1 - effect.teeth_whiten * 0.25})`,
              }
            )
          : null}
      </>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black shadow-sm"
      >
        {src ? (
          <video
            ref={videoRef}
            src={src}
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              updateViewport()
              onFrameTimeChange?.(0)
            }}
            onLoadedData={updateViewport}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}

        {maskOverlayUrl ? (
          <img
            src={maskOverlayUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-80 mix-blend-screen"
          />
        ) : null}

        {renderRetouchPreview()}

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

      {src ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-card/70 px-2.5 py-2 text-foreground backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary transition-colors hover:bg-secondary/80"
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
                loop ? "bg-secondary" : "bg-secondary/60 hover:bg-secondary/80"
              )}
            >
              <Repeat className="size-3.5" />
              Loop
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Speed</span>
            <select
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs outline-none"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  )
}

function EyeGuide({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="pointer-events-none absolute border-2 border-dotted border-sky-400/90"
      style={{
        ...style,
        borderRadius: "9999px",
      }}
    />
  )
}
