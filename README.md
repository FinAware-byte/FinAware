# FinAware

Secure and private financial rehabilitation — a prototype that helps South Africans understand their
debt, their credit score and their options. It runs on your own computer with made-up demo people.

> **Demo only.** Every person, account and document in FinAware is fictional. Nothing here is
> financial, legal or tax advice.

**Contents:** [Install and run it](#install-and-run-it-step-by-step) ·
[Logging in](#logging-in-what-you-need) · [Stopping and starting again](#stopping-and-starting-again) ·
[When something goes wrong](#when-something-goes-wrong) · [For developers](#for-developers) ·
[Deployment](#deployment-advanced)

---

## Install and run it (step by step)

These steps are for a **Mac**. On Windows, see [Running with Docker](#running-with-docker-any-computer)
instead. Allow about **30 minutes** the first time (most of it is downloading) and about **3 GB** of
free disk space. You need an internet connection.

You will type commands into **Terminal**: press <kbd>⌘</kbd> + <kbd>Space</kbd>, type `Terminal`, and
press <kbd>Return</kbd>. Copy each command below, paste it into Terminal, and press <kbd>Return</kbd>.
Wait for each one to finish (you get your prompt back) before the next.

### Step 1 — Install the tools FinAware needs (once per computer)

FinAware needs four free tools: **Git** (downloads the code), **Homebrew** (installs the others),
**Node.js** (runs the website) and **Python 3.12 or newer** (runs the risk models).

1. **Git** — Apple provides it with its developer tools. Run this and click **Install** in the window
   that appears. If it says the tools are already installed, that's fine — move on.

   ```bash
   xcode-select --install
   ```

2. **Homebrew** — paste this, press <kbd>Return</kbd>, and type your Mac password when asked (nothing
   shows as you type — that's normal):

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

   When it finishes it prints **"Next steps"** with one or two commands starting with `echo` or `eval`.
   **Copy and run those too** — they let Terminal find Homebrew. Then close Terminal and open a new
   window.

3. **Node.js** — go to <https://nodejs.org>, download the **LTS** installer for macOS, open it, and
   click through the installer.

4. **Python:**

   ```bash
   brew install python@3.12
   ```

5. **Check it worked.** Run each of these; you should see a version number, not "command not found":

   ```bash
   git --version
   ```

   ```bash
   node --version
   ```

   ```bash
   python3.12 --version
   ```

   Node 20, 22 or 24 all work. (Your Mac may also have an older `python3` — that's fine; FinAware looks
   for `python3.12` or newer by name.) If `node` isn't found, close Terminal and open a new window.

### Step 2 — Get the FinAware code

Put the project in a folder called **Developer** in your home folder. **Don't put it in Documents or
Desktop**: if iCloud syncs those folders, macOS moves files to the cloud when your disk fills up and
FinAware stops starting properly.

```bash
mkdir -p ~/Developer && cd ~/Developer
```

```bash
git clone https://github.com/FinAware-byte/FinAware.git finaware_main_project
```

```bash
cd ~/Developer/finaware_main_project
```

If you were given the project as a zip file instead, unzip it into `~/Developer`, then run the last
command above. **Every command from here on is run in this folder.** If you open a new Terminal window
later, run `cd ~/Developer/finaware_main_project` first.

### Step 3 — Create the settings file

FinAware reads its settings from a file called `.env`. Make one from the example:

```bash
cp .env.example .env
```

The example settings work as they are — **you don't need to change anything** to run the demo. Two
settings are optional: `OPENAI_API_KEY` (an OpenAI key, used only to reword some advice; without it
FinAware uses its own wording) and `NCA_REPO_RATE` (the Reserve Bank repo rate the loan offer check
uses). Never share your `.env` file or put it online — it's where keys live.

### Step 4 — Install FinAware's building blocks

```bash
npm ci
```

This downloads the libraries the website uses. It takes a minute or two and prints some warnings —
that's normal. It should end with a line like `added 539 packages`.

### Step 5 — Create the database with the demo people

```bash
npm run prisma:sync
```

```bash
npm run seed
```

You should see **"Seeded 54 users"** and **"Demo personas: 12 profiles and Money Plans applied."**

### Step 6 — Set up the risk models (about 10 minutes)

FinAware's three machine-learning models are built on your computer rather than downloaded:

```bash
npm run ml:setup
```

This prints `Using Python 3.12…` (or newer) and ends with **"ML environment ready"**. Then build the models:

```bash
npm run ml:models
```

This takes about ten minutes and prints a lot as it goes. It is finished when you get your prompt back
and it has printed a list of six peer groups (lines like `0: High living costs, weaker credit record`).

### Step 7 — Start FinAware

```bash
npm run dev:stack:ml
```

This starts the website and the ten small services behind it, all in this one window. After about
half a minute you'll see a line saying **`Ready`**. **Leave this Terminal window open** — closing it
stops FinAware.

### Step 8 — Open it

Open your web browser and go to **<http://localhost:30005>**. See [Logging in](#logging-in-what-you-need)
for who to sign in as.

### Step 9 (optional) — Prepare risk assessments for the demo people

With FinAware running, open a **second** Terminal window and run:

```bash
cd ~/Developer/finaware_main_project && npm run demo:data -- --assess
```

This runs a risk assessment for each demo person, so their Risk Assessment page already shows a result.
Without it, the page has a **Request risk assessment** button that does the same thing.

---

## Logging in: what you need

FinAware signs people in with **an ID number only — there are no passwords, emails or codes.** On the
login page choose **South African ID** (or **Passport**, then the country), type the number into
**Enter SA ID Number**, and press **Login**.

**Use these demo people** — each already has a full financial picture:

| Person | SA ID number to type | Their situation |
|---|---|---|
| Sibusiso Mthembu | `8211076711246` | Good payer with a home loan and a car — the calm example |
| Chantelle Naidoo | `8611279795187` | Healthy finances, never late |
| Boitumelo Maseko | `8005258445999` | Repayments take 83% of her income — a debt review candidate |
| Lebo Matlala | `7506247168999` | A summons, a judgment and a garnishee order |
| Lindiwe Pillay | `9902207548999` | Lost her job; living on UIF and a grant |

Twelve demo people are ready to use; [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) lists them all, with what
to show for each, a ten-minute demo, and matching bank statements and payslips to upload.

**Creating a new account:** on the login page click **Join Now**, enter an ID number that hasn't been
used, and press **Get Started Now**. FinAware invents a whole financial profile for that person. Then:

- **Use a realistic ID number.** FinAware currently accepts any number here, but a real-format South
  African ID (13 digits, the first six a date of birth as YYMMDD, and a correct check digit) makes the
  demo believable. These are valid and unused: `9506151200083`, `9107042105555`, `8709113408999`.
- The **last three digits choose the situation**: `999` → high risk, `555` → medium risk, anything
  else → low risk.
- You'll be asked for FICA documents. Tick **"Use demo placeholder FICA documents"**, tick the consent
  box, and submit — no real documents are needed.
- Next time, sign in to that account on the login page with **Login** and the same number.

To switch person, press **Log out** (left sidebar, or top right on a phone).

---

## Stopping and starting again

- **To stop FinAware:** click the Terminal window running it and press <kbd>Control</kbd> + <kbd>C</kbd>.
- **To start it again later:** open Terminal and run:

  ```bash
  cd ~/Developer/finaware_main_project && npm run dev:stack:ml
  ```

  Steps 1–6 only happen once.
- **To reset the demo data** to how it started (this signs everyone out and removes accounts created
  with Join Now):

  ```bash
  npm run seed
  ```

---

## When something goes wrong

| What you see | What to do |
|---|---|
| `command not found: brew` | Homebrew isn't on the path yet. Run the "Next steps" commands Homebrew printed at the end of step 1, or close Terminal and open a new window. |
| `command not found: npm` or `node` | Node.js isn't installed, or Terminal was open during the install. Open a new Terminal window; if it still fails, run the installer from <https://nodejs.org> again. |
| `npm run ml:setup` says **Python 3.12 or newer is needed** | Run `brew install python@3.12`, open a new Terminal window, and try again. |
| **"Port 30005 is in use"** or **`EADDRINUSE`** (ports 30005, 4101–4109, 8000) | FinAware is already running in another window. Use that one, or stop it with <kbd>Control</kbd> + <kbd>C</kbd> first. |
| The Risk Assessment says **"The risk model is not available"** | The models weren't built or the model service isn't running. Run `npm run ml:models` (step 6), then restart with `npm run dev:stack:ml`. |
| **"No account found for this ID/Passport. Use Join Now to create one."** | That number isn't in the demo data. Check for typos, use one from the table above, or use **Join Now** to create it. If you ran `npm run seed` recently, accounts made with Join Now were removed. |
| FinAware sits there and never starts, using no CPU | The project is probably in an iCloud-synced folder (Documents or Desktop). Move it to `~/Developer` (step 2), then run `npm ci` and `npm run ml:setup` again. |
| Advice doesn't use AI wording | Expected without an OpenAI key, or if the OpenAI account has no credit. All the figures still work — they never come from the AI. |

---

## Running with Docker (any computer)

This is the alternative for Windows, or if you'd rather not install Node.js and Python. It needs
[Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running, and still
needs steps 2 and 3 (on Windows, run the commands in PowerShell and use `copy .env.example .env`).

```bash
docker compose up --build
```

The first build takes a long time (it trains the risk models inside Docker). Then, in a second window,
add the demo people:

```bash
docker compose run --rm db-init npx prisma db seed
```

Open <http://localhost:30005>. Docker runs without the missed-payment model (it learns from the app's
own database, which the image build can't see); everything else works the same.

---

## For developers

### What's inside

- **Web app:** Next.js 14 (App Router) + TypeScript, Tailwind CSS, Zod, Recharts — on port `30005`.
- **Diagrams:** architecture, deployment, data model, ML models, the user journey and step-by-step flows
  are in [`docs/diagrams/`](docs/diagrams/README.md).
- **Services:** ten process-isolated services behind the web app's `/api/*` routes, which act as the
  authenticated edge. Nearly all data access runs in the services; the Score Coach, Debt Review Check
  and Case Summary pages also read the database directly, on the server.

  | Service | Port | Does |
  |---|---|---|
  | `auth` | 4101 | ID/passport sign-in, join, FICA |
  | `dashboard` | 4102 | Dashboard overview |
  | `identity` | 4103 | Identity profile |
  | `debts` | 4104 | Debts and liabilities |
  | `rehab` | 4105 | Financial rehab plan |
  | `help` | 4106 | Consultation requests (WhatsApp click-to-chat) |
  | `pdf` | 4107 | Password-gated PDF overview |
  | `financial-api` | 4108 | Risk assessment, Money Plan, peer groups, orchestration and rules |
  | `financial-data` | 4109 | All database access for the ML features |
  | `ml-service` | 8000 | Python FastAPI: risk tier, missed-payment and peer-group models |

- **Database:** Prisma + SQLite (`prisma/prisma/dev.db`). Tables: `Users`, `Credit_Profile`, `Debts`,
  `Payment_History`, `Legal_Records`, `Wealth_Assets`, `AI_Recommendations`, `Expert_Requests`,
  `Providers`, `Financial_Profile`, `Risk_Assessment`, `Risk_Driver`, `Recommendation`, `Budget_Item`.

### Features

- Sign-in by SA ID or passport; simulated profiles on join (last three digits `999` high, `555` medium,
  otherwise low); FICA verification with demo placeholder documents.
- Dashboard, Income vs Expense, Debts & Liabilities, Financial Rehab, password-gated PDF overview.
- **Credit score** calculated from each person's accounts (payment history, repayments, history length,
  account mix, judgments) — never entered by hand. **Score Coach** shows which factor costs the most.
- **Risk Assessment** (ML): Low/Medium/High with probabilities, SHAP drivers, rule-based
  recommendations with a "Why this recommendation?" drill-down, a what-if simulator, a missed-payment
  outlook and **peer groups** (KMeans).
- **Money Plan**: essentials, surplus allocation and payoff simulation; **bank statement import** (CSV,
  read in the browser) with unusual-spending alerts; **goal planner**; **cashflow forecast** day by day.
- **Get Help**: consultation requests with an advisor suggestion, **Debt Review Check** (National Credit
  Act), **Check a Loan Offer** (NCA fee and interest caps, scam signs) and a printable **Case Summary**.
- **About the models** (`/about-the-model`): what each model does and doesn't, with live figures.

### Environment variables

All in `.env.example` with working defaults. `DATABASE_URL` (default `file:./prisma/dev.db`, relative to
`prisma/`); `OPENAI_API_KEY` (optional) and `OPENAI_MODEL` (default `gpt-4.1-mini`); `NCA_REPO_RATE`
(default 7); the `*_SERVICE_URL` / `*_SERVICE_PORT` pairs above; `ML_SERVICE_TIMEOUT_MS` (default
15000); `SESSION_COOKIE_*`, `FICA_*_COOKIE_NAME`; WhatsApp and support contact numbers; and for TLS
deployments `ENVIRONMENT` (`dev` | `stag` | `prod`), `LETSENCRYPT_EMAIL`, `LETSENCRYPT_CA`, `DOMAIN`.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev:stack:ml` | Web app + all Node services + the ML service |
| `npm run dev:stack` | Web app + all Node services (start the ML service separately with `npm run service:ml`) |
| `npm test` | Node tests |
| `npm run ml:test` | Python tests |
| `npm run typecheck` · `npm run lint` | Type check · lint |
| `npm run seed` | Rebuild the demo database (also re-applies the demo personas' profiles and plans) |
| `npm run demo:data [-- --assess]` | Regenerate demo statements and payslips; `--assess` also runs risk assessments |
| `npm run ml:setup` · `npm run ml:models` | Python environment · build all three models |
| `npm run ml:audit` | Data-quality report on the training data |

The Node version the project runs on is in `.nvmrc` (`nvm use`). Keep the project outside iCloud-synced
folders.

### Machine learning

- Methodology and limitations: `docs/ml/ML_METHODOLOGY.md`
- Risk target (constructed; **pending supervisor sign-off**): `docs/risk_tier_methodology.md`
- FinAware records to model inputs: `docs/ml/feature_mapping.md`
- ML service reference: `ml-service/README.md`

The risk model is Gradient Boosting (compared with Random Forest, KNN and SVM) with per-user SHAP
explanations. Its target is constructed and not yet approved, so `npm run ml:models` trains it with
`--allow-proposed-target` and its artefacts are labelled provisional. Models are built locally (and in
the Docker build), never committed.

### Notes

- **WhatsApp:** `wa.me` click-to-chat links only — nothing is sent automatically.
- **PDF protection:** a password gate before generation plus a watermark; true PDF encryption is not
  guaranteed.
- **Diagrams:** the current set, with how to rebuild it, is [`docs/diagrams/`](docs/diagrams/README.md).
  The older ones (`FinAware_architecture_diagram.svg`, `docs/architecture-diagram-ml.png`,
  `docs/service-communication-diagram-ml.png`, the supplied UML in `docs/uml/`) predate the Money Plan,
  the help tools and the newer models.

---

## Deployment (advanced)

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

### Kubernetes (Helm 3)
#### Full-stack services deployed
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

#### Chart files
- `deploy/helm/finaware/Chart.yaml`
- `deploy/helm/finaware/values.yaml`
- `deploy/helm/finaware/values-dev.yaml`
- `deploy/helm/finaware/values-stag.yaml`
- `deploy/helm/finaware/values-prod.yaml`
- `deploy/helm/finaware/values-local-selfsigned.yaml`
- `deploy/helm/finaware/templates/*`

#### Prerequisites
- Kubernetes cluster (Minikube or OrbStack)
- Helm 3
- NGINX ingress controller
- cert-manager (required for Let's Encrypt mode only)
- Container image built as `finaware:latest`

#### Install ingress + cert-manager
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

#### Validate and render
```bash
npm run helm:lint
npm run helm:template:dev
```

#### Deploy dev
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-dev.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

#### Deploy staging
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-stag.yaml \
  --set-string secret.databaseUrl="file:/app/prisma/dev.db" \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

#### Deploy production
```bash
helm upgrade --install finaware deploy/helm/finaware \
  --namespace finaware \
  --create-namespace \
  -f deploy/helm/finaware/values-prod.yaml \
  --set-string secret.openaiApiKey="${OPENAI_API_KEY:-}"
```

#### Verify
```bash
kubectl -n finaware get deploy,svc,ingress,pods
kubectl -n finaware get pvc
```

#### TLS / Let's Encrypt
Ingress is cert-manager-ready and can auto-issue/auto-renew certificates via `ClusterIssuer`.
Requirements for successful Let's Encrypt HTTP-01 issuance:
1. Public DNS record for `${ENVIRONMENT}.finaware.io`.
2. Public reachability on ports `80` and `443`.
3. Ingress class set correctly (`nginx` by default).

For local-only Minikube/OrbStack testing without public DNS, use HTTP or a local/self-signed issuer.

#### Local self-signed TLS fallback (for local clusters)
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

#### Environment runbooks
- Minikube: `deploy/minikube/README.md`
- OrbStack: `deploy/orbstack/README.md`
- Helm overview: `deploy/helm/README.md`

#### Legacy static manifests
Static manifests remain available in `deploy/k8s/*`, but Helm is the primary deployment method.

### Cloud scale-up to-dos

1. Migrate `DATABASE_URL` to managed Postgres.
2. Update the Prisma provider and run migrations.
3. Increase replicas and HPA limits only after the Postgres migration.
4. Add managed secret storage and an observability stack.
