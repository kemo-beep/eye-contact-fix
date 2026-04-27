# EyeContact

Capcut-style multi-effect editor for talking-head video. Upload once, then
configure **Eye contact** (gaze correction), **Retouch** (skin / teeth /
eyes), and **Background removal** (auto person detection or click-to-select
with SAM2) in a right-side inspector. One render pass produces an MP4 or
a transparent VP9-alpha WebM, with the original audio remuxed in.

## Repo layout

- **`/` (Next.js)** — uploader, editor (preview left, inspector right),
  before/after slider, click-to-select subject picker.
- **`apps/api`** — FastAPI backend backed by **NeonDB (PostgreSQL)** for
  metadata and **Cloudinary** for storage. Uses Redis + RQ for two queues
  (renders + fast mask previews).
- **`worker/`** — Python worker (OpenCV + MediaPipe + optional SAM2 +
  FFmpeg) that downloads each upload, runs the per-frame effect pipeline,
  and uploads the result to Cloudinary.
- **`docker-compose.yml`** — single-command deploy (web + api + worker +
  redis), Dokploy-friendly.

## Architecture

```
Browser ─► Next.js (web, :3004)
              │
              │ POST /videos/upload     (creates DRAFT job)
              │ POST /jobs/{id}/render  (effects payload)
              │ POST /jobs/{id}/subject-mask  (SAM2 click preview)
              ▼
        FastAPI (api, :8080)  ─► NeonDB (jobs metadata)
              │                ─► Cloudinary (input video)
              ▼
        Redis (two queues)
              │
              ▼
        Worker (RQ)
          ├─ render queue:
          │    download from Cloudinary
          │    build subject mask (MediaPipe Selfie or SAM2 propagation)
          │    landmarks → beauty → eye-contact → background composite
          │    encode H.264 MP4 or VP9-alpha WebM
          │    upload to Cloudinary
          ├─ fast queue:
          │    one-frame SAM2 preview for the subject picker
          └─ update job in NeonDB
```

Job states: `draft → queued → processing → completed | failed`.

## API endpoints

All under `/api/v1`:

| Method | Path                            | Purpose                                          |
| ------ | ------------------------------- | ------------------------------------------------ |
| GET    | `/health`                       | Liveness probe.                                  |
| POST   | `/videos/upload`                | Upload an MP4/MOV/MKV/WebM, creates a DRAFT job. |
| GET    | `/jobs`                         | List recent jobs.                                |
| GET    | `/jobs/{id}`                    | Get one job (status, progress, urls, effects).   |
| POST   | `/jobs/{id}/render`             | Persist effects + enqueue a render.              |
| POST   | `/jobs/{id}/subject-mask`       | Run SAM2 on the chosen frame + clicks.           |
| GET    | `/jobs/{id}/preview-frame?t=`   | Extract one frame for the subject picker.        |
| GET    | `/videos/{id}/download`         | 307 redirect to the rendered video URL.          |

OpenAPI docs: <http://localhost:8080/docs>.

## Effects payload

```jsonc
{
  "eye_contact": { "enabled": true,  "strength": 1.0 },
  "beauty":      { "enabled": true,  "skin_smooth": 0.55, "teeth_whiten": 0.5, "eye_brighten": 0.4 },
  "background":  { "enabled": true,  "mode": "auto", "output": "blur",
                   "color": "#000000", "blur_strength": 25 },
  "output_format": "mp4"      // or "webm_alpha"
}
```

Effect order per frame: subject mask is built from the original silhouette,
then beauty pixel work, then eye-contact warp, then background composite —
so the mask never drifts and the iris isn't smoothed.

## 1. Prerequisites

- A free **NeonDB** project — copy the connection string. The API uses
  asyncpg, so prefix the URL with `postgresql+asyncpg://` (the worker
  auto-converts to psycopg2).
- A **Cloudinary** account — copy the cloud name, API key and API secret.
- Local: Node 20+, Python 3.11+, Redis, FFmpeg (with `libvpx-vp9` for
  transparent output).

```bash
brew install ffmpeg redis  # macOS
```

## 2. Configure environment

```bash
cp .env.example .env
# fill in DATABASE_URL, CLOUDINARY_* values
```

## 3. Run with Docker Compose (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:3004>.

### Optional: enable the SAM2 click-to-select subject picker

The default worker image ships **without** SAM2 because torch + sam2 add
~1.5GB. With this default the **Refine subject** button still works — it
falls back to MediaPipe Selfie Segmentation, which gives auto person
detection but ignores per-click positive/negative points.

To enable SAM2 (full Capcut-style click refinement and per-clip mask
propagation):

```bash
INSTALL_SAM2=1 docker compose build worker
docker compose up
```

> ⚠️ SAM2 on CPU is several times slower than GPU. The first render that
> needs SAM2 will also download the model weights (~150MB) into a
> `sam2_weights` Docker volume, so subsequent jobs are warm. For clips
> longer than ~30s, run the worker on a GPU host (set `SAM2_DEVICE=cuda`).

## 4. Run locally without Docker

In four terminals:

```bash
# 1. Redis
redis-server

# 2. API
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# 3. Worker (from repo root, so the `worker` package resolves)
python -m venv .venv && source .venv/bin/activate
pip install -r worker/requirements.txt
# Optional: pip install -r worker/requirements-sam.txt   # for SAM2
python -m worker.run_worker

# 4. Frontend
npm install
npm run dev   # localhost:3004
```

## How each effect works

### Eye contact
Per frame, MediaPipe FaceMesh (with `refine_landmarks=True`) gives us
iris perimeter + eye corners + eyelid midpoints. For each eye:

1. Compute the **gaze target** — the midpoint of the eye corners (X) and
   the midpoint of the eyelids (Y). This is where the iris would sit if
   the subject were looking at the camera, and unlike the eye-outline
   mean it doesn't drift with the iris.
2. Compute `delta = (target − iris) * strength` and apply EMA smoothing
   across frames; reset on blinks.
3. Clamp `delta` to `MAX_SHIFT_IRIS_RADII × iris_radius` so hard side
   glances don't smear.
4. Warp pixels in a tight halo (~2.2× iris radius) around the iris with
   a smoothstep falloff via `cv2.remap`. Only the iris/pupil shift; the
   sclera, eyelids, and skin stay put.

Tunable via `GAZE_WARP_STRENGTH`, `TEMPORAL_SMOOTH`,
`MAX_SHIFT_IRIS_RADII`, and the per-render `strength` slider in the UI.

### Retouch (beauty)
- **Skin smoothing**: build a face-region mask from the FaceMesh oval,
  subtract eyes/brows/lips. Frequency-separation filter — bilateral blur
  for the lowpass, recombine with a reduced highpass so texture survives.
- **Teeth whitening**: inner-mouth ring mask restricted to bright,
  low-saturation pixels. Push L up and pull b (yellow) down in LAB.
- **Eye brightening**: full eye-outline mask. Soft L lift + small contrast
  bump in LAB, capped to avoid demonic eyes.

### Background removal
- **Auto** mode: per-frame MediaPipe Selfie Segmentation, fast on CPU
  (~2–5ms per 720p frame).
- **SAM2** mode: at render start, the worker dumps every frame to a
  temp directory, loads `sam2-hiera-tiny`, seeds the chosen frame with the
  user's clicks, and propagates masks across the clip. Falls back to auto
  if SAM2 isn't installed.

Output modes:
- **Blur** — single big Gaussian on the original frame, masked to the
  background only (subject stays sharp).
- **Color** — flat hex color underneath the subject.
- **Transparent** — VP9 + alpha plane WebM with Opus audio. Drop into any
  NLE with alpha support.

## Folder structure

```
eye-contact-fix/
├── app/                      # Next.js app directory
├── components/
│   ├── editor/
│   │   ├── editor.tsx        # preview + inspector layout
│   │   ├── preview.tsx       # video player / before-after slider
│   │   ├── inspector.tsx     # right-side panel
│   │   ├── subject-picker.tsx# SAM2 click modal
│   │   └── sections/         # per-effect inspector sections
│   ├── before-after.tsx
│   ├── recent-jobs.tsx
│   ├── theme-toggle.tsx
│   ├── uploader.tsx
│   └── ui/                   # shadcn-style primitives
├── hooks/                    # React hooks (job polling)
├── lib/                      # API client + utils
├── apps/
│   └── api/
│       ├── app/
│       │   ├── core/         # config / env settings
│       │   ├── db/           # async engine + boot migrations
│       │   ├── models/       # SQLAlchemy Job model
│       │   ├── schemas/      # pydantic effects schemas
│       │   ├── routes/       # /videos, /jobs, /health
│       │   ├── services/     # cloudinary, queue, preview-frame
│       │   └── main.py
│       ├── Dockerfile
│       └── requirements.txt
├── worker/
│   ├── effects/
│   │   ├── base.py           # Effect protocol + FrameContext
│   │   ├── eye_contact.py
│   │   ├── beauty.py
│   │   └── background.py
│   ├── segmentation/
│   │   ├── auto.py           # MediaPipe Selfie
│   │   └── sam_video.py      # SAM2 image + video predictors
│   ├── gaze/
│   │   ├── landmarks.py      # MediaPipe FaceMesh wrapper
│   │   ├── eye_warp.py       # iris-tight warp
│   │   └── video_io.py       # OpenCV + ffmpeg I/O (incl. VP9-alpha)
│   ├── config.py
│   ├── db.py
│   ├── storage.py
│   ├── main.py               # process_render_job + process_mask_preview
│   ├── run_worker.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-sam.txt  # opt-in: torch + sam2
├── Dockerfile.web
├── docker-compose.yml
├── .env.example
└── README.md
```

## Deployment

The `docker-compose.yml` is Dokploy-friendly. Suggested setup:

1. Hetzner CPX31/CPX41 for CPU-only (auto background, eye contact, beauty).
2. Hetzner GPU box (or any cloud GPU) when enabling SAM2 video propagation
   for clips longer than ~30s.
3. Install Docker + Dokploy.
4. Connect this repo as a Docker Compose app.
5. Set the env vars from `.env.example` in Dokploy's secrets. To enable
   SAM2, set `INSTALL_SAM2=1` as a build-time variable on the worker
   service (and `SAM2_DEVICE=cuda` if on a GPU host).
6. Add domains for `api.<yourdomain>` and `app.<yourdomain>`.

## What's not in this version

- GPU CUDA-image variant. SAM2 runs on CPU with a logged warning.
- Stylized BG (image / video backdrop). Output is transparent, solid
  color, or blur — adding a backdrop image is one extra branch in
  `worker/effects/background.py`.
- Other Capcut beauty features (face slim, lip tint, blemish removal).
  The shipped sliders are skin / teeth / eyes; each new one is a single
  function in `worker/effects/beauty.py` plus one slider.
