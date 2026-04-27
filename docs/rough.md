Project: EyeContactFixer MVP
Goal

Upload a talking-head video → AI detects face/eyes → subtly corrects gaze toward camera → exports corrected MP4.

Recommended MVP stack

Frontend

Next.js
Upload video
Show job progress
Preview/download result

Backend API

FastAPI
Handles uploads/jobs
Stores metadata

Worker

Python
OpenCV + FFmpeg
MediaPipe Face Landmarker for face/eye tracking
PyTorch later for neural eye rendering

Queue

Redis + RQ/Celery

Storage

Local volume for MVP
Later: S3 / R2 / Hetzner Storage Box

Deploy

Docker Compose on Dokploy
Hetzner CPU server first
GPU server only when adding neural rendering

MediaPipe Face Landmarker supports face landmarks and video/image streams, which fits the tracking layer of this project. Dokploy supports Docker Compose deployments directly.

MVP phases
Phase 1 — Fake but useful correction

Use geometry-based eye correction.

Pipeline:

video.mp4
→ extract frames
→ detect face landmarks
→ crop eye regions
→ estimate gaze direction
→ warp iris/pupil slightly toward camera
→ blend eyes back
→ rebuild video with audio

This will not be Descript-level yet, but it proves the feature.

Phase 2 — Better correction

Add a small neural model:

eye crop + target gaze
→ image-to-image model
→ corrected eye crop
→ temporal smoothing
→ compositing
Phase 3 — Production quality

Add:

blink preservation
flicker reduction
face angle limits
before/after preview
batch processing
paid credits
Folder structure
eyecontact-fixer/
  apps/
    web/                 # Next.js frontend
    api/                 # FastAPI backend
  worker/
    main.py              # job processor
    gaze/
      landmarks.py
      eye_crop.py
      gaze_estimator.py
      eye_warp.py
      compositor.py
      video_io.py
  storage/
    uploads/
    outputs/
  docker-compose.yml
  .env
Local Mac setup
mkdir eyecontact-fixer
cd eyecontact-fixer

mkdir -p apps/api apps/web worker storage/uploads storage/outputs

Create Python env:

cd worker
python3 -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn opencv-python mediapipe numpy redis rq python-multipart
brew install ffmpeg redis

Run Redis locally:

redis-server
API endpoints
POST   /videos/upload
GET    /jobs/{job_id}
GET    /videos/{job_id}/download

Job states:

uploaded
queued
processing
completed
failed
Core worker flow
def process_video(input_path, output_path):
    frames = extract_frames(input_path)

    for frame in frames:
        landmarks = detect_face_landmarks(frame)

        if not landmarks:
            save_original_frame(frame)
            continue

        eyes = crop_eyes(frame, landmarks)
        gaze = estimate_gaze(eyes, landmarks)

        corrected_eyes = warp_eyes_toward_camera(eyes, gaze)
        corrected_frame = blend_eyes_back(frame, corrected_eyes, landmarks)

        save_frame(corrected_frame)

    rebuild_video_with_audio(output_path)
Docker Compose for Dokploy
services:
  api:
    build: ./apps/api
    ports:
      - "8080:8080"
    environment:
      - REDIS_URL=redis://redis:6379
      - STORAGE_DIR=/app/storage
    volumes:
      - ./storage:/app/storage
    depends_on:
      - redis

  worker:
    build: ./worker
    environment:
      - REDIS_URL=redis://redis:6379
      - STORAGE_DIR=/app/storage
    volumes:
      - ./storage:/app/storage
    depends_on:
      - redis

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  redis_data:
Deployment on Dokploy + Hetzner
Create Hetzner server
Install Docker + Dokploy
Create new Docker Compose app in Dokploy
Connect GitHub repo
Add env vars
Add domain:
api.eyecontact.yourdomain.com
Deploy

Dokploy can route Docker Compose apps through its domain settings or Traefik labels.

Important server note

Start with CPU Hetzner server for MVP.

Use GPU only when adding neural eye generation. Hetzner offers GPU servers with NVIDIA RTX/CUDA for AI workloads, but they are much more expensive than normal CPU boxes.

Suggested MVP server:

Hetzner CPX31 / CPX41
4–8 vCPU
8–16 GB RAM
80–160 GB disk

For neural rendering:

GPU server
NVIDIA CUDA support
16GB+ VRAM preferred
MVP feature list
✅ Upload MP4
✅ Process talking-head video
✅ Detect face and eye landmarks
✅ Apply light gaze correction
✅ Preserve original audio
✅ Export MP4
✅ Job progress
✅ Download result
✅ Docker deployable
What NOT to build first
❌ Real-time webcam correction
❌ Full deepfake-style face generation
❌ Multi-person correction
❌ Mobile app
❌ Browser-only processing
Best build order
FastAPI upload + job queue
Worker extracts/rebuilds video
MediaPipe face/eye tracking
Simple eye-region warp
Smooth frame-to-frame corrections
Web UI preview/download
Docker Compose deploy
Neural eye renderer later

This is the fastest path to a working Descript-style eye contact correction prototype.