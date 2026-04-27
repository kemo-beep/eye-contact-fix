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
      <div className="bg-card flex flex-col gap-5 rounded-lg border p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Uploading
            </span>
            {file ? (
              <span className="truncate text-sm font-medium">{file.name}</span>
            ) : null}
          </div>
          <span className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
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
          "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center transition-all duration-300 sm:p-12",
          "border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5 hover:shadow-2xl hover:shadow-primary/5",
          isDragging && "border-primary bg-primary/10 scale-[1.02]",
          file && "border-solid border-foreground/20 bg-background/50 backdrop-blur-sm"
        )}
      >
        {file ? (
          <>
            <div className="bg-foreground/4 flex size-10 items-center justify-center rounded-md">
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
                "flex size-14 items-center justify-center rounded-full transition-all duration-300",
                isDragging
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                  : "bg-secondary text-secondary-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}
            >
              <Upload className="size-6" />
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              <span className="text-lg font-medium tracking-tight">
                Drop your video here
              </span>
              <span className="text-muted-foreground text-sm">
                Click to browse • MP4, MOV, MKV, WebM (max {formatBytes(MAX_BYTES)})
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
