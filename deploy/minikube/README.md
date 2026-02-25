# Minikube Full-Stack Runbook (Helm 3 + Ingress + cert-manager)

This runbook deploys every FinAware service as process-isolated Kubernetes workloads:
- web
- auth
- dashboard
- identity
- debts
- rehab
- help
- pdf

## Prerequisites
- Minikube v1.33+
- kubectl
- Helm 3
- Docker
- `finaware` image built locally

## 1) Start cluster and ingress

```bash
minikube start --cpus=4 --memory=8192
minikube addons enable ingress
```

## 2) Build app image in Minikube Docker daemon

```bash
eval "$(minikube docker-env)"
docker build -t finaware:latest .
```

## 3) Choose TLS mode

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

### Option B: Local self-signed TLS (recommended for local Minikube)

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

## 4) Point local host entry (for testing ingress)

```bash
minikube ip
# Add to /etc/hosts using the Minikube IP:
# <minikube-ip> dev.finaware.io
```

## 5) Verify

```bash
kubectl -n finaware get deploy,svc,ingress,pods
kubectl -n finaware get pvc
```

## 6) Open app

```text
https://dev.finaware.io
```

## Cleanup

```bash
helm uninstall finaware -n finaware
kubectl delete namespace finaware
```
