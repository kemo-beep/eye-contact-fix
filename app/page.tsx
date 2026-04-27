"use client"

import * as React from "react"
import Link from "next/link"

import { Editor } from "@/components/editor/editor"
import { RecentJobs } from "@/components/recent-jobs"
import { ThemeToggle } from "@/components/theme-toggle"
import { Uploader } from "@/components/uploader"
import type { Job } from "@/lib/api"

export default function Page() {
  const [activeJob, setActiveJob] = React.useState<Job | null>(null)

  if (activeJob) {
    return (
      <main className="bg-background relative min-h-svh">
        <header className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-medium tracking-tight">EyeContact</span>
          </Link>
          <ThemeToggle />
        </header>

        <section className="mx-auto max-w-[1400px] px-6 pb-12">
          <Editor
            initialJob={activeJob}
            onExit={() => setActiveJob(null)}
          />
        </section>
      </main>
    )
  }

  return (
    <main className="bg-background relative min-h-svh">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full w-full overflow-hidden"
      >
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4 mt-2 rounded-full bg-background/50 backdrop-blur-lg border border-border/40 shadow-sm transition-all">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">EyeContact</span>
        </Link>
        <ThemeToggle />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-24">
        <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
          <span className="mr-2 flex size-1.5 rounded-full bg-primary" />
          EyeContact Studio
        </div>
        <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tighter sm:text-6xl">
          Look people in the eye.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg leading-relaxed">
          Upload a talking-head video. Then fix gaze, retouch, or remove the
          background — all in one seamless render.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-10">
        <Uploader onUploaded={setActiveJob} />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <RecentJobs onSelect={setActiveJob} />
      </section>
    </main>
  )
}

function Logo() {
  return (
    <span
      aria-hidden
      className="bg-foreground text-background flex size-7 items-center justify-center rounded-lg"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
