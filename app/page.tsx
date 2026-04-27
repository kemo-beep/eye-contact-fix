"use client"

import * as React from "react"

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
          <a href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-medium tracking-tight">EyeContact</span>
          </a>
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
        className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] bg-linear-to-b via-transparent to-transparent"
      />

      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-medium tracking-tight">EyeContact</span>
        </a>
        <ThemeToggle />
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-12 pb-8 sm:pt-20">
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Look people in the eye.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-md text-base sm:text-lg">
          Upload a talking-head video. Then fix gaze, retouch, or remove the
          background — all in one render.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-10">
        <Uploader onUploaded={setActiveJob} />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <RecentJobs />
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
