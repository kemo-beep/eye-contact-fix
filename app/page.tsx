"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Sparkles, Video, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RecentJobs } from "@/components/recent-jobs"
import { ThemeToggle } from "@/components/theme-toggle"
import { Uploader } from "@/components/uploader"

export default function Page() {
  const router = useRouter()
  const [createOpen, setCreateOpen] = React.useState(false)

  React.useEffect(() => {
    if (!createOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCreateOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [createOpen])

  return (
    <main className="relative min-h-svh bg-background font-sans selection:bg-primary/20 selection:text-primary">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] h-[50%] w-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <header className="relative z-10 mx-auto mt-4 flex max-w-4xl items-center justify-between rounded-2xl border border-border/20 bg-background/60 px-4 py-3 shadow-none backdrop-blur-md transition-all sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Logo />
          <span className="font-heading text-base font-semibold tracking-tight">
            EyeContact
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-4 pt-16 pb-20 sm:px-6">
        <section className="mb-10 flex flex-col items-start gap-4 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/20 bg-secondary/50 px-3 py-1 text-xs font-medium text-secondary-foreground backdrop-blur-sm">
            <Sparkles className="size-3.5 text-primary" />
            <span>AI-powered gaze correction</span>
          </div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
            Perfect eye contact, <br />
            <span className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
              in every video.
            </span>
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg leading-relaxed">
            Upload a talking-head video and instantly fix your gaze to look directly at the camera. Professional results in seconds.
          </p>
          <div className="mt-4">
            <Button 
              size="lg" 
              onClick={() => setCreateOpen(true)}
              className="h-12 gap-2 rounded-xl bg-primary px-8 font-medium text-primary-foreground shadow-none transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
            >
              <Video className="size-4" />
              Create New Project
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border/20 bg-card/40 p-1 shadow-none backdrop-blur-sm sm:p-2">
          <div className="rounded-xl bg-card p-4 sm:p-6 shadow-none border border-border/20">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold tracking-tight">Recent Projects</h2>
            </div>
            <RecentJobs onSelect={(job) => router.push(`/jobs/${job.id}`)} />
          </div>
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md transition-all duration-300 animate-in fade-in zoom-in-95">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border/20 bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border/20 bg-muted/20 px-6 py-4">
              <div>
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                  Upload Media
                </h2>
                <p className="text-sm text-muted-foreground">
                  Select a video to process. Max 200MB.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCreateOpen(false)}
                className="rounded-full hover:bg-muted"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-6">
              <Uploader
                onUploaded={(job) => {
                  setCreateOpen(false)
                  router.push(`/jobs/${job.id}`)
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-none group-hover:opacity-90 transition-opacity"
    >
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
        <path
          d="M1 7C2.5 4 4.5 2.5 7 2.5S11.5 4 13 7C11.5 10 9.5 11.5 7 11.5S2.5 10 1 7Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="7" cy="7" r="2" fill="currentColor" />
      </svg>
    </span>
  )
}

