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
          "group relative flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors sm:p-8",
          "border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5",
          isDragging && "border-primary bg-primary/10",
          file && "border-solid border-foreground/20 bg-background/50"
        )}
      >
        {file ? (
          <>
            <div className="flex size-9 items-center justify-center rounded-md bg-foreground/5">
              <Film className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-md transition-colors",
                isDragging
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}
            >
              <Upload className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium tracking-tight">
                Drop video
              </span>
              <span className="text-xs text-muted-foreground">
                MP4, MOV, MKV, WebM · {formatBytes(MAX_BYTES)}
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
