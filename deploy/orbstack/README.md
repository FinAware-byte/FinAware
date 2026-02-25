# OrbStack Kubernetes Runbook (Helm 3 + Ingress + cert-manager)

This runbook deploys the full FinAware stack as separate Kubernetes services.

## Prerequisites
- OrbStack running with Kubernetes enabled
- kubectl context set to OrbStack
- Helm 3
- Docker image `finaware:latest` available to OrbStack's Kubernetes runtime

## 1) Confirm context

```bash
kubectl config get-contexts
kubectl config use-context orbstack
kubectl cluster-info
```

## 2) Install ingress-nginx

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace
```

## 3) Build and load app image

```bash
docker build -t finaware:latest .
```

## 4) Choose TLS mode

### Option A: Let's Encrypt (public DNS/80/443 required)

Install cert-manager:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-cainjector -n cert-manager --timeout=180s
```

Deploy:

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

### Option B: Local self-signed TLS (recommended for local OrbStack)

Generate cert + key:

```bash
bash scripts/tls/generate-self-signed.sh
```

Create/update Kubernetes TLS secret:

```bash
bash scripts/tls/apply-k8s-self-signed.sh
```

Optional: trust the cert on macOS to remove browser warnings:

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain deploy/caddy/certs/finaware-selfsigned.crt
```

Deploy with self-signed overrides:

```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  -f deploy/helm/finaware/values-local-selfsigned.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

## 5) Map hostname locally

Get ingress external IP and map in `/etc/hosts`:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
# Add: <external-ip> dev.finaware.io
```

## 6) Verify

```bash
kubectl -n finaware get deploy,svc,ingress,pods
```

## 7) Open app

```text
https://dev.finaware.io
```
