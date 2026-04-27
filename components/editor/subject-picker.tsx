"use client"

import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Loader2, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getPreviewFrame,
  getJob,
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
  const [imgSize, setImgSize] = React.useState<{ w: number; h: number } | null>(
    null
  )
  const [points, setPoints] = React.useState<ClickPoint[]>(initialPoints ?? [])
  const [maskUrl, setMaskUrl] = React.useState<string | null>(
    job.mask_preview_url ?? null
  )
  const maskUrlRef = React.useRef<string | null>(job.mask_preview_url ?? null)
  const [maskLoading, setMaskLoading] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [frameBox, setFrameBox] = React.useState<{
    left: number
    top: number
    w: number
    h: number
  } | null>(null)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      const nextMaskUrl = job.mask_preview_url ?? null
      setPoints(initialPoints ?? [])
      setMaskUrl(nextMaskUrl)
      maskUrlRef.current = nextMaskUrl
      setError(null)
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, initialPoints, job.mask_preview_url])

  // Fetch a preview frame when the modal opens.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const ctrl = new AbortController()
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
      return
    }
    debounceRef.current = setTimeout(async () => {
      setMaskLoading(true)
      setError(null)
      try {
        await previewSubjectMask(job.id, 0, points)
        // Worker uploads asynchronously. Poll every 700ms for a fresh mask.
        const startedAt = maskUrlRef.current
        if (pollRef.current) clearInterval(pollRef.current)
        const start = Date.now()
        pollRef.current = setInterval(async () => {
          try {
            const data = await getJob(job.id)
            if (data.mask_preview_url && data.mask_preview_url !== startedAt) {
              setMaskUrl(data.mask_preview_url)
              maskUrlRef.current = data.mask_preview_url
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
  }, [points, open, job.id])

  const updateFrameBox = React.useCallback(() => {
    const frame = frameRef.current
    if (!frame || !imgSize) return
    const rect = frame.getBoundingClientRect()
    const imageAspect = imgSize.w / imgSize.h
    const frameAspect = rect.width / rect.height
    let w = rect.width
    let h = rect.height
    let left = 0
    let top = 0
    if (frameAspect > imageAspect) {
      w = rect.height * imageAspect
      left = (rect.width - w) / 2
    } else {
      h = rect.width / imageAspect
      top = (rect.height - h) / 2
    }
    setFrameBox({ left, top, w, h })
  }, [imgSize])

  React.useEffect(() => {
    if (!open || !imgSize) return
    updateFrameBox()
    window.addEventListener("resize", updateFrameBox)
    return () => window.removeEventListener("resize", updateFrameBox)
  }, [open, imgSize, updateFrameBox])

  function handleFrameClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgSize || !frameBox) return
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left - frameBox.left
    const py = e.clientY - rect.top - frameBox.top
    if (px < 0 || py < 0 || px > frameBox.w || py > frameBox.h) return
    const x = (px / frameBox.w) * imgSize.w
    const y = (py / frameBox.h) * imgSize.h
    const label: 0 | 1 = e.metaKey || e.ctrlKey || e.shiftKey ? 0 : 1
    setPoints((prev) => [...prev, { x, y, label }])
  }

  function clearPoints() {
    setPoints([])
    setMaskUrl(null)
    maskUrlRef.current = null
  }

  async function apply() {
    setApplying(true)
    setError(null)
    try {
      if (points.length > 0) {
        await previewSubjectMask(job.id, 0, points)
      }
      onApply(points)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-4 shadow-lg sm:p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                Pick the subject
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Click the subject. Cmd-click marks background.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-m-2 inline-flex size-8 items-center justify-center rounded transition-colors hover:bg-foreground/5"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          <div
            ref={frameRef}
            className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
          >
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
                    requestAnimationFrame(updateFrameBox)
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
                {imgSize && frameBox
                  ? points.map((p, idx) => {
                      const left =
                        frameBox.left + (p.x / imgSize.w) * frameBox.w
                      const top = frameBox.top + (p.y / imgSize.h) * frameBox.h
                      return (
                        <span
                          key={idx}
                          className={cn(
                            "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md",
                            p.label === 1 ? "bg-emerald-500" : "bg-rose-500"
                          )}
                          style={{
                            left: `${left}px`,
                            top: `${top}px`,
                          }}
                        />
                      )
                    })
                  : null}
                {maskLoading ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white">
                    <Loader2 className="size-3 animate-spin" />
                    Refining
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
              <Button
                type="button"
                size="sm"
                onClick={apply}
                disabled={applying}
              >
                {applying ? <Loader2 className="animate-spin" /> : null}
                Use selection
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
