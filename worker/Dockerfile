FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# OpenCV + MediaPipe runtime deps + ffmpeg (with libvpx for VP9 alpha output)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libpq-dev \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-sam.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Optional SAM2 stack. Default off because torch + sam2 add ~1.5GB to the image
# and SAM2 on CPU is slow. Build with `--build-arg INSTALL_SAM2=1` to enable
# the click-to-select subject picker.
ARG INSTALL_SAM2=0
RUN if [ "$INSTALL_SAM2" = "1" ]; then \
        pip install -r requirements-sam.txt; \
    else \
        echo "Skipping SAM2 install. Set INSTALL_SAM2=1 build arg to include it."; \
    fi

# Persistent dir for SAM2 weights (mounted as a volume in docker-compose).
RUN mkdir -p /models/sam2

COPY . ./worker
# Make /app a package root so `from worker...` imports work.
ENV PYTHONPATH=/app

CMD ["python", "-m", "worker.run_worker"]
