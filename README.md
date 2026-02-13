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

## Kubernetes / Minikube
### Minikube
See `deploy/minikube/README.md`.

### Manifests
- `deploy/k8s/namespace.yaml`
- `deploy/k8s/configmap.yaml`
- `deploy/k8s/secret.example.yaml`
- `deploy/k8s/pvc.yaml`
- `deploy/k8s/microservices.yaml`
- `deploy/k8s/deployment.yaml`
- `deploy/k8s/service.yaml`
- `deploy/k8s/ingress.yaml`
- `deploy/k8s/hpa.yaml`

## Cloud Scale-up TODOs
1. Migrate `DATABASE_URL` to managed Postgres.
2. Update Prisma provider and run migrations.
3. Increase replicas and HPA limits only after Postgres migration.
4. Add managed secret storage and observability stack.

## Scripts
- `npm run dev`
- `npm run dev:stack`
- `npm run dev:microservices`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm run format:write`
