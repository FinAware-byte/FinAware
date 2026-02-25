# FinAware

Secure & Private Financial Rehabilitation (prototype)

## Tech Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite
- Recharts
- Zod
- API Routes + Server Actions
- ESLint + Prettier

## Demo Disclaimer
Demo data only. Not financial advice.

## Features
- Landing login/authentication with SA ID/Passport input
- Microservice-style service domains exposed under `/api/microservices/*`
- Risk simulation logic:
  - ends with `999` => HIGH risk
  - ends with `555` => MEDIUM risk
  - otherwise => LOW risk
- Dashboard with score/risk, debt totals, obligations, financial age, donut chart
- Income vs Expense tab with cashflow analysis and score-pressure projections
- PDF overview download with password gate and watermark
- Identity management with immutable ID/passport
- Debts & Liabilities add/list/update (no delete endpoint)
- Financial Rehab with AI recommendations + fallback logic
- Get Help consultation requests + WhatsApp click-to-chat
- Main protected shell tabs for:
  - Dashboard
  - My Identity
  - Debts & Liabilities
  - Financial Rehab
  - Get Help
- Health endpoints for Kubernetes probes
- Process-isolated microservice runtimes for:
  - Authentication
  - Dashboard
  - Identity
  - Debts
  - Rehab
  - Help
  - PDF export

## Database Design (Simulated Tables)
- `Users`: identity, employment, income, risk profile
- `Credit_Profile`: score + aggregate debt totals
- `Debts`: individual debt accounts
- `Payment_History`: due-date payment outcomes
- `Legal_Records`: judgments and garnishee-related records
- `AI_Recommendations`: stored generated recommendation snapshots
- `Expert_Requests`: consultation request log
- `Providers`: advisor channel metadata (WhatsApp numbers)

## Project Structure
- `components/sidebar`
- `components/cards`
- `components/charts`
- `lib/db`
- `lib/auth`
- `lib/ai`
- `prisma`
- `deploy/k8s`
- `deploy/minikube`

## Local Setup (Replit-friendly)
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Install:
   ```bash
   npm install
   ```
3. Run:
   ```bash
   npm run dev
   ```

`predev` runs `prisma generate && prisma db push`, so one command starts the app.

### Process-isolated local stack
Run web + all microservices as separate processes:
```bash
npm run dev:stack
```

Run only microservices:
```bash
npm run dev:microservices
```

### Docker Compose (No Kubernetes)
Build and run all process-isolated services (web + auth + dashboard + identity + debts + rehab + help + pdf):
```bash
docker compose up --build
```

App URL:
```text
http://localhost:30005
```

### One-Command macOS Setup (Internal DNS + Local TLS)
Use the bootstrap script to install prerequisites, configure internal DNS for `*.finaware.io`, create trusted local TLS certs, and start the app.

```bash
scripts/macos/finaware-mac.sh all
```

What the script configures:
- Homebrew packages: `node@20`, `colima`, `docker`, `dnsmasq`, `mkcert`
- Docker runtime via Colima
- Internal DNS on macOS:
  - `*.finaware.io -> 127.0.0.1`
  - `/etc/resolver/finaware.io` pointing to local dnsmasq
- Trusted local certs for:
  - `dev.finaware.io`, `stag.finaware.io`, `prod.finaware.io`

Local URLs after setup:
- `https://dev.finaware.io`
- `https://stag.finaware.io`
- `https://prod.finaware.io`

Additional script commands:
```bash
scripts/macos/finaware-mac.sh install
scripts/macos/finaware-mac.sh start
scripts/macos/finaware-mac.sh stop
```

Notes:
- The script requires `sudo` for `/etc/resolver` setup.
- If Xcode Command Line Tools are missing, install them and rerun.
- Local HTTPS uses `docker-compose.local.yml` + `deploy/caddy/Caddyfile.local`.

### HTTPS With Let's Encrypt (Auto-Issue + Auto-Renew)
This project includes a hardened TLS edge proxy using Caddy and Let's Encrypt.

Supported environments:
- `dev.finaware.io`
- `stag.finaware.io`
- `prod.finaware.io`

Prerequisites:
- `${ENVIRONMENT}.finaware.io` has a public DNS `A`/`AAAA` record to this host.
- Ports `80` and `443` are open to the internet.
- No other reverse proxy is binding ports `80/443`.

1. Set TLS env vars in `.env`:
   ```bash
   ENVIRONMENT="dev"    # dev | stag | prod
   LETSENCRYPT_EMAIL="security@finaware.io"
   LETSENCRYPT_CA="https://acme-v02.api.letsencrypt.org/directory"
   DOMAIN=""            # optional override; otherwise ENVIRONMENT.finaware.io is used
   ```
   For staging/prod, switch to:
   ```bash
   ENVIRONMENT="stag"   # serves https://stag.finaware.io
   # or
   ENVIRONMENT="prod"   # serves https://prod.finaware.io
   ```
2. Start stack with TLS edge:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
   ```
3. Access the app over HTTPS:
   ```text
   https://dev.finaware.io
   ```

Renewal behavior:
- Certificates are renewed automatically by Caddy.
- Cert state is persisted in Docker volumes: `caddy_data` and `caddy_config`.

Security notes:
- Set `SESSION_COOKIE_SECURE="true"` in production HTTPS deployments.
- For ACME dry-runs to avoid rate limits, use staging CA:
  `LETSENCRYPT_CA="https://acme-staging-v02.api.letsencrypt.org/directory"`

## Environment Variables
- `DATABASE_URL` (default `file:./prisma/dev.db`)
- `OPENAI_API_KEY` (optional, fallback used when missing)
- `OPENAI_MODEL` (default `gpt-4.1-mini`)
- `PROVIDER_WHATSAPP_NUMBER`
- `PROVIDER_WHATSAPP_NUMBER_FINANCIAL`
- `PROVIDER_WHATSAPP_NUMBER_DEBT`
- `PROVIDER_WHATSAPP_NUMBER_LEGAL`
- `SUPPORT_PHONE`
- `SUPPORT_EMAIL`
- `SESSION_COOKIE_NAME`
- `SESSION_COOKIE_SECURE`
- `AUTH_SERVICE_URL`
- `DASHBOARD_SERVICE_URL`
- `IDENTITY_SERVICE_URL`
- `DEBTS_SERVICE_URL`
- `REHAB_SERVICE_URL`
- `HELP_SERVICE_URL`
- `PDF_SERVICE_URL`
- `ENVIRONMENT` (`dev` | `stag` | `prod`)
- `LETSENCRYPT_EMAIL`
- `LETSENCRYPT_CA`
- `DOMAIN` (optional override; default derives from `ENVIRONMENT`)

## AI Recommendations
- Endpoint: `POST /api/ai-recommendations`
- Returns:
  - `summary`
  - `top_actions[]`
  - `risk_factors[]`
  - `monthly_plan.week1..week4[]`
  - `warnings[]`
- If OpenAI key is missing or request fails, deterministic recommendations are returned.

## Service Domains (Microservice API Surface)
- `POST /api/microservices/auth/login`
- `GET /api/microservices/auth/session`
- `GET /api/microservices/dashboard/overview`
- `GET/PATCH /api/microservices/identity/profile`
- `GET/POST /api/microservices/debts`
- `PATCH /api/microservices/debts/:id`
- `POST /api/microservices/rehab/plan`
- `GET/POST /api/microservices/help/requests`

These Next routes act as the authenticated edge/BFF and proxy to process-isolated internal services:
- `auth` on `4101`
- `dashboard` on `4102`
- `identity` on `4103`
- `debts` on `4104`
- `rehab` on `4105`
- `help` on `4106`
- `pdf` on `4107`

The web layer does not connect directly to Prisma/SQLite; all data and domain operations run behind microservices.

## WhatsApp Integration Note
This prototype uses `wa.me` click-to-chat URLs and does **not** automatically send messages.

## PDF Protection Note
True cryptographic PDF encryption is not guaranteed in this environment.
Implemented protections:
1. Password gate before generation (ID/passport or saved password)
2. Watermark inside generated PDF: `Protected – requires ID to access`

## Architecture Diagram
- `FinAware_architecture_diagram.svg`
- `FinAware_diagram_README.md`

## Kubernetes (Helm 3)
### Full-stack services deployed
The Helm chart deploys process-isolated services as separate deployments/services.
Ingress (NGINX) load-balances across web replicas, and HPA can scale pods when enabled:

- `web`
- `auth`
- `dashboard`
- `identity`
- `debts`
- `rehab`
- `help`
- `pdf`

### Chart files
- `deploy/helm/finaware/Chart.yaml`
- `deploy/helm/finaware/values.yaml`
- `deploy/helm/finaware/values-dev.yaml`
- `deploy/helm/finaware/values-stag.yaml`
- `deploy/helm/finaware/values-prod.yaml`
- `deploy/helm/finaware/values-local-selfsigned.yaml`
- `deploy/helm/finaware/templates/*`

### Prerequisites
- Kubernetes cluster (Minikube or OrbStack)
- Helm 3
- NGINX ingress controller
- cert-manager (required for Let's Encrypt mode only)
- Container image built as `finaware:latest`

### Install ingress + cert-manager
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace

kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-cainjector -n cert-manager --timeout=180s
```

### Validate and render
```bash
npm run helm:lint
npm run helm:template:dev
```

### Deploy dev
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

### Deploy staging
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-stag.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

### Deploy production
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-prod.yaml \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

### Verify
```bash
kubectl -n finaware get deploy,svc,ingress,pods
kubectl -n finaware get pvc
```

### TLS / Let's Encrypt
Ingress is cert-manager-ready and can auto-issue/auto-renew certificates via `ClusterIssuer`.
Requirements for successful Let's Encrypt HTTP-01 issuance:
1. Public DNS record for `${ENVIRONMENT}.finaware.io`.
2. Public reachability on ports `80` and `443`.
3. Ingress class set correctly (`nginx` by default).

For local-only Minikube/OrbStack testing without public DNS, use HTTP or a local/self-signed issuer.

### Local self-signed TLS fallback (for local clusters)
Use this when Let's Encrypt cannot validate local Minikube/OrbStack domains.

1. Generate certificate and key:
```bash
bash scripts/tls/generate-self-signed.sh
```

2. Create Kubernetes TLS secret:
```bash
bash scripts/tls/apply-k8s-self-signed.sh
```

Optional: trust the cert on macOS to remove browser warnings:

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain deploy/caddy/certs/finaware-selfsigned.crt
```

3. Deploy Helm with local self-signed overrides:
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  -f deploy/helm/finaware/values-local-selfsigned.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

### Environment runbooks
- Minikube: `deploy/minikube/README.md`
- OrbStack: `deploy/orbstack/README.md`
- Helm overview: `deploy/helm/README.md`

### Legacy static manifests
Static manifests remain available in `deploy/k8s/*`, but Helm is the primary deployment method.

## Cloud Scale-up TODOs
1. Migrate `DATABASE_URL` to managed Postgres.
2. Update Prisma provider and run migrations.
3. Increase replicas and HPA limits only after Postgres migration.
4. Add managed secret storage and observability stack.

## Scripts
- `scripts/macos/finaware-mac.sh all`
- `scripts/macos/finaware-mac.sh install`
- `scripts/macos/finaware-mac.sh start`
- `scripts/macos/finaware-mac.sh stop`
- `npm run dev`
- `npm run dev:stack`
- `npm run dev:microservices`
- `npm run helm:lint`
- `npm run helm:template:dev`
- `npm run helm:template:stag`
- `npm run helm:template:prod`
- `npm run helm:install:dev`
- `npm run helm:install:stag`
- `npm run helm:install:prod`
- `npm run tls:selfsigned:generate`
- `npm run tls:selfsigned:k8s-secret`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm run format:write`
