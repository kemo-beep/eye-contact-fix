"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"

import { downloadUrl, listJobs, type Job } from "@/lib/api"
import { cn } from "@/lib/utils"

const POLL_MS = 4000

export function RecentJobs({ onSelect }: { onSelect?: (job: Job) => void }) {
  const [items, setItems] = React.useState<Job[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()

    async function tick() {
      try {
        const data = await listJobs(6, controller.signal)
        if (cancelled) return
        setItems(data.items)
        setError(null)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS)
      }
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (items === null && !error) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Recent
          </h2>
        </div>
        <ul className="divide-border/40 divide-y border-y border-border/40">
          {[1, 2, 3].map((i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted/40" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded bg-muted/50" />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (error && !items) return null
  if (items && items.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Recent
        </h2>
        {items ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {items.length}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-muted-foreground text-xs">Recent jobs are unavailable.</p>
      ) : null}

      <ul className="divide-border/40 divide-y border-y border-border/40">
        {items?.map((j) => <JobRow key={j.id} job={j} onSelect={onSelect} />)}
      </ul>
    </section>
  )
}

function JobRow({ job, onSelect }: { job: Job; onSelect?: (job: Job) => void }) {
  const isDone = job.status === "completed"
  return (
    <li className="group flex items-center justify-between gap-3 py-2.5">
      <button
        type="button"
        onClick={() => onSelect?.(job)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className="truncate text-sm font-medium">
          {job.original_filename}
        </span>
        <span className="text-muted-foreground text-xs">
          {timeAgo(job.created_at)}
        </span>
      </button>
      <div className="flex items-center gap-3">
        <StatusLabel status={job.status} progress={job.progress} />
        {isDone ? (
          <a
            href={downloadUrl(job.id)}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/6 inline-flex size-7 items-center justify-center rounded transition-colors"
            aria-label="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowRight className="size-3.5" />
          </a>
        ) : null}
      </div>
    </li>
  )
}

function StatusLabel({
  status,
  progress,
}: {
  status: Job["status"]
  progress: number
}) {
  const dot = (
    <span
      className={cn(
        "size-1.5 rounded-full",
        status === "completed" && "bg-emerald-500",
        status === "processing" && "bg-foreground animate-pulse",
        status === "queued" && "bg-foreground/40 animate-pulse",
        status === "uploaded" && "bg-foreground/40",
        status === "draft" && "bg-foreground/30",
        status === "failed" && "bg-destructive"
      )}
    />
  )
  const label =
    status === "processing"
      ? `${progress}%`
      : status === "queued"
        ? "queued"
        : status === "uploaded"
          ? "uploaded"
          : status === "draft"
            ? "draft"
            : status === "completed"
              ? "done"
              : "failed"

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tabular-nums">
      {dot}
      {label}
    </span>
  )
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  const s = Math.floor(diff / 1000)
  if (s < 45) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
