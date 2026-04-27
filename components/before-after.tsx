"use client"

import * as React from "react"
import { Pause, Play } from "lucide-react"

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

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-2xl bg-black select-none",
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

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity",
          playing ? "opacity-0 hover:opacity-100" : "opacity-100"
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg backdrop-blur transition-transform hover:scale-105">
          {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
        </span>
      </button>

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-white/90 backdrop-blur">
        Original
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-black">
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
        className="absolute top-0 bottom-0 w-1 -translate-x-1/2 cursor-ew-resize bg-white/90 outline-none ring-0"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            className="text-black"
          >
            <path
              d="M6 4L2 9L6 14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 4L16 9L12 14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
