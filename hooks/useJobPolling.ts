"use client"

import { useEffect, useRef, useState } from "react"

import { getJob, type Job } from "@/lib/api"

const TERMINAL: ReadonlySet<Job["status"]> = new Set(["completed", "failed"])

// Statuses where the user is editing or otherwise idle and we don't need
// a tight polling loop. We still poll occasionally so manual edits to the
// job (e.g., updating effects from another tab) are reflected.
const IDLE: ReadonlySet<Job["status"]> = new Set(["draft", "uploaded"])

export function useJobPolling(jobId: string | null, intervalMs = 1500) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!jobId) {
      return
    }

    let cancelled = false
    const controller = new AbortController()

    async function tick() {
      if (cancelled || !jobId) return
      try {
        const fresh = await getJob(jobId, controller.signal)
        if (cancelled) return
        setJob(fresh)
        setError(null)
        if (TERMINAL.has(fresh.status)) {
          return
        }
        const next = IDLE.has(fresh.status) ? intervalMs * 4 : intervalMs
        timer.current = setTimeout(tick, next)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        timer.current = setTimeout(tick, intervalMs * 2)
      }
    }

    tick()

    return () => {
      cancelled = true
      controller.abort()
      if (timer.current) clearTimeout(timer.current)
      setJob(null)
      setError(null)
    }
  }, [jobId, intervalMs])

  return { job, error }
}
