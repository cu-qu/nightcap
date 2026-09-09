# Dev and local Docker Compose image
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg and devcontainer health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    postgresql-client \
    procps \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (copied first for layer cache)
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code (overridden by mount in compose)
COPY . .

# Default: keep container alive so devcontainer or compose can run runserver/celery
CMD ["sleep", "infinity"]
