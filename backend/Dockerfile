# syntax=docker/dockerfile:1
# Layer order: system deps → pip deps (cached unless requirements.txt changes) → app code.
# BuildKit cache mount speeds reinstalls when requirements.txt *does* change.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch is installed BEFORE requirements.txt. sentence-transformers depends on torch;
# if torch is not already present, pip pulls the CUDA build from PyPI (+ ~4 GB of nvidia-* and
# triton wheels) that this CPU-only server never uses. Bump TORCH_VERSION deliberately.
ARG TORCH_VERSION=2.15.0
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt \
    && python -c "import torch, sys; v = torch.__version__; print('torch', v); sys.exit(0 if '+cpu' in v else 'CUDA torch was installed; expected CPU-only build')" \
    && ! pip list 2>/dev/null | grep -Ei '^(nvidia-|triton )'

COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
