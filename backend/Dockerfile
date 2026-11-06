# syntax=docker/dockerfile:1
# Layer order: system deps → pip deps (cached unless requirements.txt changes) → app code.
# BuildKit cache mount speeds reinstalls when requirements.txt *does* change.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch is installed BEFORE requirements-ai.txt. sentence-transformers depends on torch;
# if torch is not already present, pip pulls the CUDA build from PyPI (+ ~4 GB of nvidia-* and
# triton wheels) that this CPU-only server never uses. Bump TORCH_VERSION deliberately.
# INSTALL_AI_EXTRAS=true (default; CI and production) installs torch + requirements-ai.txt.
# Dev compose sets false: much smaller, faster image (embedding search falls back to keyword search).
ARG TORCH_VERSION=2.15.0
ARG INSTALL_AI_EXTRAS=true
COPY requirements.txt requirements-ai.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$INSTALL_AI_EXTRAS" = "true" ]; then \
        pip install "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu \
        && pip install -r requirements.txt -r requirements-ai.txt \
        && python -c "import torch, sys; v = torch.__version__; print('torch', v); sys.exit(0 if '+cpu' in v else 'CUDA torch was installed; expected CPU-only build')"; \
    else \
        pip install -r requirements.txt; \
    fi \
    && ! pip list 2>/dev/null | grep -Ei '^(nvidia-|triton )'

# Unprivileged runtime user (added after pip so the big dependency layer stays cached).
# Fixed IDs keep volume ownership the same across rebuilds and hosts
# (manual fix if ever needed: chown -R 10001:10001 <volume path>).
ARG APP_UID=10001
ARG APP_GID=10001
RUN groupadd --system --gid "${APP_GID}" app \
    && useradd --system --uid "${APP_UID}" --gid app --home-dir /home/app --create-home \
       --shell /usr/sbin/nologin app

# Lives outside /app so the dev compose bind mount (./backend:/app) cannot hide it.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

COPY . .
# Code stays root-owned (read-only for the app user); only runtime data folders are writable.
# Bytecode is compiled here because the app user cannot write __pycache__ next to the code.
# Dev compose sets COMPILE_BYTECODE=false: its bind mount (./backend:/app) hides these files anyway.
ARG COMPILE_BYTECODE=true
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod 0755 /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/media /app/backups \
    && chown app:app /app/media /app/backups \
    && if [ "$COMPILE_BYTECODE" = "true" ]; then python -m compileall -q -j 0 app alembic; fi

# true = entrypoint drops from root to the "app" user; false = run as root (old behaviour).
ENV RUN_AS_NON_ROOT=true
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
