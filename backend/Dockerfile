# syntax=docker/dockerfile:1
# Layer order: system deps → pip deps (cached unless requirements.txt changes) → app code.
# BuildKit cache mount speeds reinstalls when requirements.txt *does* change.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt \
    && pip install torch --index-url https://download.pytorch.org/whl/cpu

COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
