"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"

import { Editor } from "@/components/editor/editor"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { getJob, type Job } from "@/lib/api"

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>()
  const router = useRouter()
  const jobId = params.jobId

  const [job, setJob] = React.useState<Job | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getJob(jobId, controller.signal)
        if (cancelled) return
        setJob(data)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [jobId])

  return (
    <main className="relative flex h-svh flex-col overflow-hidden bg-background">
      <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push("/")}
            className="h-9 rounded-lg px-3 text-xs font-medium"
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Back
          </Button>
          <span className="truncate text-sm font-semibold tracking-tight">
            {job?.original_filename ?? "Loading job..."}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 px-6 pb-6">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading job...
            </span>
          </div>
        ) : error || !job ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-lg border border-border/50 bg-card px-4 py-3 text-sm">
              <p className="font-medium">Unable to load this job.</p>
              {error ? (
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              ) : null}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-3 text-xs text-primary underline-offset-4 hover:underline"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        ) : (
          <Editor initialJob={job} />
        )}
      </section>
    </main>
  )
}
