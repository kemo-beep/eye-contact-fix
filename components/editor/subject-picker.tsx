"use client"

import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Loader2, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getPreviewFrame,
  previewSubjectMask,
  type ClickPoint,
  type Job,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
  initialPoints?: ClickPoint[]
  onApply: (points: ClickPoint[]) => void
}

const DEBOUNCE_MS = 600

export function SubjectPicker({
  open,
  onOpenChange,
  job,
  initialPoints,
  onApply,
}: Props) {
  const [frameUrl, setFrameUrl] = React.useState<string | null>(null)
  const [imgSize, setImgSize] = React.useState<{ w: number; h: number } | null>(null)
  const [points, setPoints] = React.useState<ClickPoint[]>(initialPoints ?? [])
  const [maskUrl, setMaskUrl] = React.useState<string | null>(
    job.mask_preview_url ?? null
  )
  const [maskLoading, setMaskLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch a preview frame when the modal opens.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const ctrl = new AbortController()
    setError(null)
    setFrameUrl(null)
    ;(async () => {
      try {
        const r = await getPreviewFrame(job.id, 0, ctrl.signal)
        if (!cancelled) {
          setFrameUrl(r.url)
          if (r.width && r.height) setImgSize({ w: r.width, h: r.height })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [open, job.id])

  // Poll the job for an updated mask_preview_url after we trigger a request.
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  React.useEffect(() => {
    if (!open) return
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  // Debounced mask refresh whenever points change.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (points.length === 0) {
      setMaskUrl(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setMaskLoading(true)
      setError(null)
      try {
        await previewSubjectMask(job.id, 0, points)
        // Worker uploads asynchronously. Poll every 700ms for a fresh mask.
        const startedAt = job.mask_preview_url
        if (pollRef.current) clearInterval(pollRef.current)
        const start = Date.now()
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"}/jobs/${job.id}`,
              { cache: "no-store" }
            )
            if (!res.ok) return
            const data = (await res.json()) as Job
            if (
              data.mask_preview_url &&
              data.mask_preview_url !== startedAt
            ) {
              setMaskUrl(data.mask_preview_url)
              setMaskLoading(false)
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
            } else if (Date.now() - start > 30_000) {
              setMaskLoading(false)
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
            }
          } catch {}
        }, 700)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setMaskLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [points, open, job.id, job.mask_preview_url])

  const imgRef = React.useRef<HTMLImageElement>(null)

  function handleFrameClick(e: React.MouseEvent<HTMLDivElement>) {
    const img = imgRef.current
    if (!img || !imgSize) return
    const rect = img.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const x = (px / rect.width) * imgSize.w
    const y = (py / rect.height) * imgSize.h
    const label: 0 | 1 = e.metaKey || e.ctrlKey || e.shiftKey ? 0 : 1
    setPoints((prev) => [...prev, { x, y, label }])
  }

  function clearPoints() {
    setPoints([])
    setMaskUrl(null)
  }

  function apply() {
    onApply(points)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Popup className="bg-card fixed left-1/2 top-1/2 z-50 grid w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-3xl border p-6 shadow-2xl">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                Pick the subject
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground text-xs">
                Click on the subject to add it. <kbd className="bg-muted rounded px-1">Cmd</kbd>-click to mark a region as background.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="hover:bg-foreground/5 -m-2 inline-flex size-8 items-center justify-center rounded-full transition-colors"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            {!frameUrl ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : (
              <div
                role="presentation"
                onClick={handleFrameClick}
                className="absolute inset-0 cursor-crosshair"
              >
                <img
                  ref={imgRef}
                  src={frameUrl}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    const i = e.currentTarget
                    setImgSize({ w: i.naturalWidth, h: i.naturalHeight })
                  }}
                  className="absolute inset-0 h-full w-full object-contain select-none"
                />
                {maskUrl ? (
                  <img
                    src={maskUrl}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-screen select-none"
                  />
                ) : null}
                {imgSize
                  ? points.map((p, idx) => {
                      const left = (p.x / imgSize.w) * 100
                      const top = (p.y / imgSize.h) * 100
                      return (
                        <span
                          key={idx}
                          className={cn(
                            "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md",
                            p.label === 1 ? "bg-emerald-500" : "bg-rose-500"
                          )}
                          style={{ left: `${left}%`, top: `${top}%` }}
                        />
                      )
                    })
                  : null}
                {maskLoading ? (
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white">
                    <Loader2 className="size-3 animate-spin" />
                    Refining
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                Subject ({points.filter((p) => p.label === 1).length})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" />
                Background ({points.filter((p) => p.label === 0).length})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPoints}
                disabled={points.length === 0}
              >
                <Trash2 />
                Clear
              </Button>
              <Button type="button" size="sm" onClick={apply}>
                Use this selection
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
