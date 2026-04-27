"use client"

import * as React from "react"
import { Pause, Play, Repeat } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  before: string
  after: string
  className?: string
}

export function BeforeAfter({ before, after, className }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const beforeRef = React.useRef<HTMLVideoElement>(null)
  const afterRef = React.useRef<HTMLVideoElement>(null)
  const draggingRef = React.useRef(false)
  const [pos, setPos] = React.useState(50)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState(1)
  const [loop, setLoop] = React.useState(true)
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

  // Keep the "after" track in sync with the "before" track. Using "before" as
  // the master keeps audio scrubbing/seek behavior natural.
  React.useEffect(() => {
    const a = beforeRef.current
    const b = afterRef.current
    if (!a || !b) return

    const onPlay = () => {
      void b.play().catch(() => {})
      setPlaying(true)
    }
    const onPause = () => {
      b.pause()
      setPlaying(false)
    }
    const onEnded = () => setPlaying(false)
    const onSeek = () => {
      b.currentTime = a.currentTime
    }
    const onTime = () => {
      if (Math.abs(b.currentTime - a.currentTime) > 0.12) {
        b.currentTime = a.currentTime
      }
    }

    a.addEventListener("play", onPlay)
    a.addEventListener("pause", onPause)
    a.addEventListener("ended", onEnded)
    a.addEventListener("seeked", onSeek)
    a.addEventListener("timeupdate", onTime)
    return () => {
      a.removeEventListener("play", onPlay)
      a.removeEventListener("pause", onPause)
      a.removeEventListener("ended", onEnded)
      a.removeEventListener("seeked", onSeek)
      a.removeEventListener("timeupdate", onTime)
    }
  }, [])

  const updateFromClientX = React.useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    const next = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setPos(next)
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    draggingRef.current = true
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    updateFromClientX(e.clientX)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {}
  }

  function togglePlay() {
    const a = beforeRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  React.useEffect(() => {
    const a = beforeRef.current
    const b = afterRef.current
    if (!a || !b) return
    a.playbackRate = speed
    b.playbackRate = speed
    a.loop = loop
    b.loop = loop
  }, [speed, loop])

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        ref={containerRef}
        className={cn(
          "relative aspect-video w-full select-none overflow-hidden rounded-xl bg-black shadow-none ring-1 ring-white/5",
          className
        )}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          ref={beforeRef}
          src={before}
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
        />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        aria-hidden
      >
        <video
          ref={afterRef}
          src={after}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>

        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/90 backdrop-blur-sm ring-1 ring-white/10">
          Original
        </span>
        <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black shadow-none ring-1 ring-black/5 backdrop-blur-sm">
          Corrected
        </span>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Comparison slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 2))
            if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 2))
          }}
          className="absolute top-0 bottom-0 w-px -translate-x-1/2 cursor-ew-resize bg-white/50 shadow-none outline-none ring-0 transition-colors hover:bg-white"
          style={{ left: `${pos}%` }}
        >
          <div className="absolute bottom-2 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95">
            <svg
              width="14"
              height="14"
              viewBox="0 0 18 18"
              fill="none"
              className="text-black"
            >
              <path
                d="M6 4L2 9L6 14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 4L16 9L12 14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-card/70 px-2.5 py-2 text-foreground backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
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
            onClick={() => setLoop((v) => !v)}
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
            onChange={(e) => setSpeed(Number(e.target.value))}
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
    </div>
  )
}
