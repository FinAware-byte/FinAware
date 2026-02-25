# FinAware Helm Deployment

This chart deploys all process-isolated FinAware services:
- web
- auth
- dashboard
- identity
- debts
- rehab
- help
- pdf

## Chart path

`deploy/helm/finaware`

## Validate chart

```bash
helm lint deploy/helm/finaware
helm template finaware deploy/helm/finaware -n finaware -f deploy/helm/finaware/values-dev.yaml
```

## Install (dev)

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml
```

## Install (staging)

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-stag.yaml
```

## Install (prod)

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-prod.yaml
```

## Required overrides

Before install, set secrets with `--set-string` or a secure values file:

```bash
--set-string secret.openaiApiKey="$OPENAI_API_KEY" \
--set-string secret.databaseUrl="file:/app/prisma/dev.db"
```

Use Postgres before enabling multi-replica scale in production.

## Local self-signed TLS (no Let's Encrypt)

1. Generate local certificate and key:

```bash
bash scripts/tls/generate-self-signed.sh
```

2. Create/update Kubernetes TLS secret:

```bash
bash scripts/tls/apply-k8s-self-signed.sh
```

3. Deploy using self-signed values:

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  -f deploy/helm/finaware/values-local-selfsigned.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

