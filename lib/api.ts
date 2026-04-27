export type JobStatus =
  | "draft"
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed"

export type OutputFormat = "mp4" | "webm_alpha"

export type EyeContactEffect = {
  enabled: boolean
  strength: number
}

export type BeautyEffect = {
  enabled: boolean
  skin_smooth: number
  teeth_whiten: number
  eye_brighten: number
  eye_size: number
  eye_distance: number
  inner_eye: number
  eye_position: number
  nose_width: number
  nose_bridge: number
  nose_height: number
  nose_root: number
  nose_size: number
  mouth_position: number
  smile: number
  mouth_size: number
}

export type BackgroundOutputMode = "transparent" | "color" | "blur"
export type BackgroundMaskMode = "auto" | "sam"

export type BackgroundEffect = {
  enabled: boolean
  mode: BackgroundMaskMode
  output: BackgroundOutputMode
  color: string
  blur_strength: number
  invert_mask: boolean
}

export type EffectsPayload = {
  eye_contact: EyeContactEffect
  beauty: BeautyEffect
  background: BackgroundEffect
  output_format: OutputFormat
}

export type ClickPoint = {
  x: number
  y: number
  label: 0 | 1
}

export type Job = {
  id: string
  status: JobStatus
  original_filename: string
  mime_type?: string | null
  size_bytes?: number | null
  input_url?: string | null
  output_url?: string | null
  output_format: OutputFormat
  progress: number
  error?: string | null
  effects?: EffectsPayload | null
  subject_points?: ClickPoint[] | null
  preview_frame_url?: string | null
  mask_preview_url?: string | null
  created_at: string
  updated_at: string
}

export type JobList = {
  items: Job[]
  total: number
}

export type PreviewFrame = {
  url: string
  width: number
  height: number
  duration?: number | null
}

export type RetouchBox = {
  x: number
  y: number
  width: number
  height: number
}

export type RetouchAnalysis = {
  width: number
  height: number
  face?: RetouchBox | null
  left_eye?: RetouchBox | null
  right_eye?: RetouchBox | null
  teeth?: RetouchBox | null
  features: {
    skin: boolean
    eyes: boolean
    teeth: boolean
  }
}

export type SubjectMaskResult = {
  mask_url: string
  frame_url: string
}

export const DEFAULT_EFFECTS: EffectsPayload = {
  eye_contact: { enabled: false, strength: 1.0 },
  beauty: {
    enabled: false,
    skin_smooth: 0.5,
    teeth_whiten: 0.5,
    eye_brighten: 0.4,
    eye_size: 0,
    eye_distance: 0,
    inner_eye: 0,
    eye_position: 0,
    nose_width: 0,
    nose_bridge: 0,
    nose_height: 0,
    nose_root: 0,
    nose_size: 0,
    mouth_position: 0,
    smile: 0,
    mouth_size: 0,
  },
  background: {
    enabled: false,
    mode: "auto",
    output: "blur",
    color: "#000000",
    blur_strength: 25,
    invert_mask: false,
  },
  output_format: "mp4",
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: string
    try {
      const data = await res.json()
      detail =
        (typeof data?.detail === "string" && data.detail) ||
        JSON.stringify(data)
    } catch {
      detail = await res.text()
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (i === attempts - 1) break
      await new Promise((resolve) => setTimeout(resolve, 450 * (i + 1)))
    }
  }
  throw last
}

export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ job: Job }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", apiUrl("/videos/upload"))
    xhr.responseType = "json"

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () => reject(new Error("Upload aborted"))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as { job: Job })
      } else {
        const detail =
          (xhr.response && xhr.response.detail) ||
          `${xhr.status} ${xhr.statusText}`
        reject(
          new Error(
            typeof detail === "string" ? detail : JSON.stringify(detail)
          )
        )
      }
    }

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true })
    }
    xhr.send(fd)
  })
}

export async function getJob(
  jobId: string,
  signal?: AbortSignal
): Promise<Job> {
  return retry(async () => {
    const res = await fetch(apiUrl(`/jobs/${jobId}`), {
      cache: "no-store",
      signal,
    })
    return handle<Job>(res)
  })
}

export async function listJobs(
  limit = 10,
  signal?: AbortSignal
): Promise<JobList> {
  return retry(async () => {
    const res = await fetch(apiUrl(`/jobs?limit=${limit}`), {
      cache: "no-store",
      signal,
    })
    return handle<JobList>(res)
  })
}

export async function renderJob(
  jobId: string,
  effects: EffectsPayload,
  signal?: AbortSignal
): Promise<{ job: Job }> {
  const res = await fetch(apiUrl(`/jobs/${jobId}/render`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ effects }),
    signal,
  })
  return handle<{ job: Job }>(res)
}

export async function getPreviewFrame(
  jobId: string,
  t: number,
  signal?: AbortSignal
): Promise<PreviewFrame> {
  const res = await fetch(
    apiUrl(`/jobs/${jobId}/preview-frame?t=${encodeURIComponent(String(t))}`),
    { cache: "no-store", signal }
  )
  return handle<PreviewFrame>(res)
}

export async function getRetouchAnalysis(
  jobId: string,
  t: number,
  signal?: AbortSignal
): Promise<RetouchAnalysis> {
  const res = await fetch(
    apiUrl(`/jobs/${jobId}/retouch-analysis?t=${encodeURIComponent(String(t))}`),
    { cache: "no-store", signal }
  )
  return handle<RetouchAnalysis>(res)
}

export async function previewSubjectMask(
  jobId: string,
  frame_time: number,
  points: ClickPoint[],
  signal?: AbortSignal
): Promise<SubjectMaskResult> {
  const res = await fetch(apiUrl(`/jobs/${jobId}/subject-mask`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame_time, points }),
    signal,
  })
  return handle<SubjectMaskResult>(res)
}

export function downloadUrl(jobId: string): string {
  return apiUrl(`/videos/${jobId}/download`)
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}
