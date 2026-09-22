# syntax=docker/dockerfile:1.7
# FinAware ML Prediction Service — internal only (ml-service:8000). Fixes handoff defect D12.

# Where the model comes from: "trainer" (default — trains from the dataset during the build, reproducible,
# what CI uses) or "prebuilt" (reuses ml-service/artifacts from the host; fast local/dev builds).
# Must be declared before the first FROM to be usable in a FROM instruction.
ARG ARTIFACT_STAGE=trainer

# ---- Stage 1: train the model from the dataset (reproducible, seed 42) ----
FROM python:3.12-slim AS trainer
WORKDIR /build
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY ml ./ml
COPY data ./data
# Why: training refuses to run on an unapproved risk target unless this is explicitly set to 1.
ARG ALLOW_PROPOSED_TARGET=0
RUN if [ "$ALLOW_PROPOSED_TARGET" = "1" ]; then FLAG=--allow-proposed-target; else FLAG=; fi \
 && python -m ml.train $FLAG --skip-ablation

# ---- Stage 1b: reuse artefacts already trained on the host (fast local builds) ----
# Build with --build-arg ARTIFACT_STAGE=prebuilt to skip training; ml-service/artifacts must exist.
FROM python:3.12-slim AS prebuilt
WORKDIR /build
COPY artifacts ./artifacts

FROM ${ARTIFACT_STAGE} AS artifact_source

# ---- Stage 2: slim runtime with the trained artefacts baked in ----
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FINAWARE_ARTIFACT_DIR=/app/artifacts
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 mlservice
COPY ml ./ml
COPY api ./api
COPY --from=artifact_source /build/artifacts ./artifacts
USER mlservice
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
