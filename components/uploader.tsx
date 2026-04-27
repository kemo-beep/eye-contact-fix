"use client"

import * as React from "react"
import { Film, Loader2, Upload, X } from "lucide-react"

import { formatBytes, uploadVideo, type Job } from "@/lib/api"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
]
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
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  )
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  async function pickFile(f: File | null) {
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
    setUpload({ kind: "uploading", pct: 0 })
    abortRef.current = new AbortController()
    try {
      const { job } = await uploadVideo(
        f,
        (pct) => setUpload({ kind: "uploading", pct }),
        abortRef.current.signal
      )
      onUploaded(job)
    } catch (err) {
      setUpload({
        kind: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function reset() {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setUpload({ kind: "idle" })
    setValidationError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) pickFile(f)
  }

  if (upload.kind === "uploading") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs tracking-wider text-muted-foreground uppercase">
              Uploading
            </span>
            {file ? (
              <span className="truncate text-sm font-medium">{file.name}</span>
            ) : null}
          </div>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {Math.round(upload.pct)}
            <span className="text-base font-normal text-muted-foreground">
              %
            </span>
          </span>
        </div>

        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
            style={{ width: `${upload.pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Sending to storage
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
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
          "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center transition-all duration-300 sm:p-12",
          "border-border/40 bg-card/40 hover:border-primary/40 hover:bg-primary/5",
          isDragging && "scale-[1.02] border-primary/50 bg-primary/10 shadow-none",
          file && "border-solid border-foreground/10 bg-background/50 scale-100"
        )}
      >
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        
        {file ? (
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground/5 shadow-none">
              <Film className="size-7 text-foreground/70" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-heading text-base font-medium">{file.name}</span>
              <span className="text-sm text-muted-foreground font-medium">
                {formatBytes(file.size)}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-2xl transition-all duration-500 shadow-none",
                isDragging
                  ? "scale-110 bg-primary text-primary-foreground shadow-none"
                  : "bg-secondary text-secondary-foreground group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-none"
              )}
            >
              <Upload className="size-6 transition-transform duration-500 group-hover:-translate-y-0.5" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-heading text-lg font-semibold tracking-tight">
                Click to upload or drag and drop
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                MP4, MOV, MKV, WebM up to {formatBytes(MAX_BYTES)}
              </span>
            </div>
          </div>
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
        <div className="flex items-start gap-2 text-xs text-destructive">
          <X className="mt-0.5 size-4 shrink-0" />
          <span className="wrap-break-word">
            {validationError ||
              (upload.kind === "failed" ? upload.error : null)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
