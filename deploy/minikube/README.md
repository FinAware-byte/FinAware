# Minikube Deployment Runbook

## Prerequisites
- Minikube installed
- Docker daemon running
- NGINX ingress addon enabled

## Commands
1. Start cluster:
   ```bash
   minikube start
   minikube addons enable ingress
   ```
2. Build image in Minikube Docker environment:
   ```bash
   eval $(minikube docker-env)
   docker build -t finaware:latest .
   ```
3. Apply manifests (web + process-isolated microservices):
   ```bash
   kubectl apply -f deploy/k8s/namespace.yaml
   kubectl apply -f deploy/k8s/configmap.yaml
   kubectl apply -f deploy/k8s/secret.example.yaml
   kubectl apply -f deploy/k8s/pvc.yaml
   kubectl apply -f deploy/k8s/microservices.yaml
   kubectl apply -f deploy/k8s/deployment.yaml
   kubectl apply -f deploy/k8s/service.yaml
   kubectl apply -f deploy/k8s/ingress.yaml
   kubectl apply -f deploy/k8s/hpa.yaml
   ```
4. Verify service deployments:
   ```bash
   kubectl -n finaware get deploy
   kubectl -n finaware get svc
   ```
   Expected deployments:
   - `finaware-web`
   - `finaware-auth`
   - `finaware-dashboard`
   - `finaware-identity`
   - `finaware-debts`
   - `finaware-rehab`
   - `finaware-help`
5. Access web service:
   ```bash
   kubectl -n finaware port-forward svc/finaware-web 3000:80
   ```
   Open http://localhost:3000

## Notes
- SQLite mode is single-replica per service domain in this prototype and uses one shared PVC.
- Move to managed Postgres before enabling horizontal scale.
