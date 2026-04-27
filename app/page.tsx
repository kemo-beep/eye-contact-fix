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
      <main className="relative flex h-svh flex-col overflow-hidden bg-background">
        <header className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-medium tracking-tight">
              EyeContact
            </span>
          </Link>
          <ThemeToggle />
        </header>

        <section className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 px-6 pb-6">
          <Editor initialJob={activeJob} onExit={() => setActiveJob(null)} />
        </section>
      </main>
    )
  }

  return (
    <main className="relative min-h-svh bg-background">
      <header className="mx-auto mt-2 flex max-w-3xl items-center justify-between border-b px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Logo />
          <span className="text-sm font-semibold tracking-tight">
            EyeContact
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col px-4 pt-8 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          EyeContact Studio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a video. Editing starts automatically.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-5">
        <Uploader onUploaded={setActiveJob} />
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-12">
        <RecentJobs onSelect={setActiveJob} />
      </section>
    </main>
  )
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background"
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
