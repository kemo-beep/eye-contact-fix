"use client"

import * as React from "react"
import { ArrowUpRight, Film, Loader2, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatBytes, uploadVideo, type Job } from "@/lib/api"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"]
const MAX_BYTES = 200 * 1024 * 1024

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "failed"; error: string }

type UploaderProps = {
  onUploaded: (job: Job) => void
}

export function Uploader({ onUploaded }: UploaderProps) {
  const [file, setFile] = React.useState<File | null>(null)
  const [upload, setUpload] = React.useState<UploadState>({ kind: "idle" })
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  function pickFile(f: File | null) {
    setValidationError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setValidationError(`Unsupported file type: ${f.type || "unknown"}`)
      return
    }
    if (f.size > MAX_BYTES) {
      setValidationError(
        `File too large: ${formatBytes(f.size)} (max ${formatBytes(MAX_BYTES)})`
      )
      return
    }
    setFile(f)
  }

  function reset() {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setUpload({ kind: "idle" })
    setValidationError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!file) return
    setValidationError(null)
    setUpload({ kind: "uploading", pct: 0 })
    abortRef.current = new AbortController()
    try {
      const { job } = await uploadVideo(
        file,
        (pct) => setUpload({ kind: "uploading", pct }),
        abortRef.current.signal
      )
      onUploaded(job)
      // Don't reset state — the parent will swap the UI to the editor.
    } catch (err) {
      setUpload({
        kind: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) pickFile(f)
  }

  if (upload.kind === "uploading") {
    return (
      <div className="bg-card flex flex-col gap-6 rounded-3xl border p-8 sm:p-10">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Uploading
            </span>
            {file ? (
              <span className="truncate text-sm font-medium">{file.name}</span>
            ) : null}
          </div>
          <span className="text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
            {Math.round(upload.pct)}
            <span className="text-muted-foreground text-base font-normal">%</span>
          </span>
        </div>

        <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-foreground h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${upload.pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Sending to storage
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 transition-colors hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label
        htmlFor="video-input"
        onDragEnter={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border border-dashed p-12 text-center transition-all sm:p-16",
          "border-border/80 bg-card hover:border-foreground/40",
          isDragging && "border-primary bg-primary/5",
          file && "border-solid border-foreground/15"
        )}
      >
        {file ? (
          <>
            <div className="bg-foreground/4 flex size-12 items-center justify-center rounded-2xl">
              <Film className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-muted-foreground text-xs">
                {formatBytes(file.size)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-2xl transition-all",
                isDragging
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/4 text-foreground group-hover:bg-foreground/8"
              )}
            >
              <Upload className="size-5" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium tracking-tight">
                Drop a video, or click to choose
              </span>
              <span className="text-muted-foreground text-xs">
                MP4 · MOV · MKV · WebM &nbsp;·&nbsp; up to {formatBytes(MAX_BYTES)}
              </span>
            </div>
          </>
        )}
        <input
          id="video-input"
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {validationError || upload.kind === "failed" ? (
        <div className="text-destructive flex items-start gap-2 text-sm">
          <X className="mt-0.5 size-4 shrink-0" />
          <span className="wrap-break-word">
            {validationError ||
              (upload.kind === "failed" ? upload.error : null)}
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        {file ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        ) : null}
        <Button type="submit" disabled={!file} size="lg">
          Continue
          <ArrowUpRight />
        </Button>
      </div>
    </form>
  )
}
