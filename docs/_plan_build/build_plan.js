const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, LevelFormat, BorderStyle, PageBreak,
  TableOfContents, Footer, PageNumber, Header, ImageRun
} = require("docx");

const NAVY = "1F3A5F", TEAL = "0F766E", GREY = "F2F4F7", AMBER = "FFF4E5", RED = "B42318";
const W = 9638; // A4 text width with 2cm margins (DXA)

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(text) });
function runs(text) {
  // **bold** support
  if (Array.isArray(text)) return text;
  return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s =>
    s.startsWith("**") ? new TextRun({ text: s.slice(2, -2), bold: true }) : new TextRun(s));
}
const h1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun(t)] });
const h2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun(t)] });
const h3 = t => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 }, children: [new TextRun(t)] });
const b = (t, level = 0) => new Paragraph({ numbering: { reference: "bul", level }, spacing: { after: 60 }, children: runs(t) });
const n = (t, ref = "num") => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: runs(t) });
const code = t => new Paragraph({ spacing: { after: 120 }, shading: { type: ShadingType.CLEAR, fill: GREY },
  children: [new TextRun({ text: t, font: "Consolas", size: 18 })] });

function callout(title, lines, fill = AMBER, colour = "8A4B00") {
  const cell = new TableCell({
    width: { size: W, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill },
    margins: { top: 120, bottom: 120, left: 180, right: 180 },
    borders: { left: { style: BorderStyle.SINGLE, size: 24, color: colour }, top: none, bottom: none, right: none },
    children: [new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: title, bold: true, color: colour })] }),
      ...lines.map(l => new Paragraph({ spacing: { after: 60 }, children: runs(l) }))]
  });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [cell] })] });
}
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const line = { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" };

function table(headers, rows, widths) {
  const mk = (t, head, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: NAVY } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: line, bottom: line, left: line, right: line },
    children: [new Paragraph({ children: head ? [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 19 })]
      : runs(t).map(r => r) })]
  });
  return new Table({
    width: { size: widths.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, true, i)) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => mk(c, false, i)) }))]
  });
}
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------- step builder ----------
function step(num, title, effort, why, tasks, deliverables, done, extra = []) {
  return [
    h1(`Step ${num} — ${title}`),
    table(["Priority", "Effort", "Depends on"], [[`${num}`, effort.days, effort.dep]], [1600, 3000, 5038]),
    gap(),
    h3("Why this matters"), p(why),
    ...extra,
    h3("Tasks"), ...tasks.map(t => Array.isArray(t) ? b(t[0], 1) : b(t)),
    h3("Deliverables"), ...deliverables.map(d => b(d)),
    h3("Done when"), ...done.map(d => b(d)),
  ];
}

const children = [];

// ---------- cover ----------
children.push(
  new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: "FinAware", size: 64, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Machine Learning Integration — Implementation Plan", size: 36, color: TEAL })] }),
  new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: "Step-by-step, in order of importance, with effort estimates", size: 24, color: "555555" })] }),
  table(["Item", "Detail"], [
    ["Project", "FinAware — interactive personal-finance decision-support system"],
    ["Emerging technology", "Machine learning (Random Forest, Gradient Boosting, KNN, SVM)"],
    ["Dataset", "personal_finance_zar.csv — 32,424 records × 24 columns (ZAR, 1 USD = 16.27 ZAR)"],
    ["Scope", "**Additive only.** The existing FinAware application stays as it is. The ML service, the dataset and the Assess Financial Risk feature are added alongside it."],
    ["Design authority", "The four supplied UML diagrams: Class, Use Case, Activity and Sequence (Assess Financial Risk)"],
    ["Inputs reviewed", "Existing FinAware repo (FinAware-byte/FinAware, main); ML specification; developer handoff package (12 Python files); data package (2 CSVs + data dictionary); the four UML diagrams"],
    ["Date", "21 September 2026 (revision 5 — self-contained for AI use)"],
    ["Total effort", "≈ 21 developer-days core + 20% contingency ≈ 25 days (≈ 5 weeks full-time)"],
  ], [2600, 7038]),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "Contents", size: 32, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "0. Instructions for an AI assistant using this document", bold: true })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("1. Executive summary")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("2. What exists today")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("2A. Alignment with the UML diagrams")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("2B. Inventory — what remains, what is added, what is used, what is not used")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("3. Verified findings from the review")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 0 — Environment & repository setup")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 1 — Agree and document the risk target")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 2 — Fix and harden the handoff ML code")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 3 — Train, evaluate and select the model")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 4 — Per-user explainability")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 5 — Recommendation engine in the Financial API Service")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 6 — ML service API contract and error handling")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 7 — New Financial API and Financial Data services, and database tables")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 8 — Frontend: new Financial Profile and Risk Assessment pages")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 9 — Docker, Helm and Kubernetes")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 10 — Testing")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Step 11 — Documentation and academic write-up")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("4. Decisions required")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("5. Risks")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("6. Definition of done")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix A — Developer handoff package: full reference")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix B — Data package: full reference")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix C — Traceability to the ML specification")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix D — Verbatim source of the handoff package")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix E — UML diagrams (design authority) with text transcriptions")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix F — Full ML specification (as supplied)")] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun("Appendix G — Existing FinAware code reference (patterns to follow)")] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- 0. AI instructions ----------
children.push(
  h1("0. Instructions for an AI assistant using this document"),
  p("This document is self-contained. It includes the full ML specification (Appendix F), the four UML diagrams with text transcriptions (Appendix E), the existing FinAware code patterns (Appendix G), the developer handoff code verbatim (Appendix D), the dataset reference (Appendix B) and the step-by-step plan (Steps 0–11). An AI assistant given this document should be able to implement the ML feature without other context."),
  callout("Suggested prompt to paste with this document", [
    "\"You are implementing the FinAware ML risk-assessment feature described in the attached document. Read section 0 first and follow its rules. Work through Steps 0 to 11 in order. Before each step, restate what you will build and which files you will create. Do not modify existing FinAware behaviour. Stop and ask me at every STOP POINT listed in section 0.4.\"",
  ], "E8F4F8", NAVY),
  gap(),
  h2("0.1 Hard rules (never break these)"),
  n("**Do not invent the risk target.** The dataset has no genuine Low/Medium/High label. Propose a constructed target (Step 1), then STOP until the human confirms the supervisor has approved it. Never train the final models on an unapproved target.", "rules"),
  n("**Additive only.** Do not change or remove existing pages, services, tables, data or behaviour. Only the additive touch points in section 2A.5 may be edited.", "rules"),
  n("**Follow the UML diagrams (Appendix E).** Components, flow, names and responsibilities come from the sequence, activity and class diagrams — e.g. recommendations are generated in the Financial API Service, and data access goes through the Financial Data Service.", "rules"),
  n("**No OpenAI or other LLM in the new flow.** Recommendations are deterministic rules.", "rules"),
  n("**Do not silently alter data.** Every transformation is logged and documented.", "rules"),
  n("**Do not claim causation or independent discovery.** Use 'Factors influencing this prediction'; disclose that the target is constructed.", "rules"),
  n("**Do not invent numbers.** Metrics, importances and class distributions come from running code on the real data.", "rules"),
  n("**Never expose the ML service, model files or secrets to the browser.**", "rules"),
  h2("0.2 Where things are"),
  tableS(["Item", "Location"], [
    ["FinAware repository", "~/Documents/school proj/finaware_main_project (GitHub FinAware-byte/FinAware, branch main)"],
    ["Handoff code", "finaware_main_project/developerhandoffpackagefolder/ (verbatim in Appendix D)"],
    ["Dataset and dictionary", "~/Downloads/redeveloperhandoffpackagefolder (1)/ — personal_finance_zar.csv, synthetic_personal_finance_dataset.csv, data_dictionary.xlsx (reference in Appendix B)"],
    ["UML diagrams", "finaware_main_project/docs/uml/01-class, 02-use-case, 03-activity, 04-sequence (Appendix E)"],
    ["Specification", "Appendix F (full text)"],
    ["Existing code patterns", "Appendix G"],
  ], [2600, 7038]),
  h2("0.3 Work order"),
  tableS(["Order", "Step", "Output", "Gate"], [
    ["1", "Step 0 — setup", "ml-service/ with data; working Node and Python", "App builds unchanged"],
    ["2", "Step 1 — propose target rubric + class distribution", "docs/risk_tier_methodology.md draft", "**STOP A**"],
    ["3", "Step 2 — data audit, features, pipeline (fixed handoff code)", "reports/data_audit.md; ml/ modules", "—"],
    ["4", "Steps 6, 7, 8, 9 against a stubbed ML response", "New services, tables, pages, deployment", "**STOP B** (migration review)"],
    ["5", "Step 3 — train & evaluate (only after STOP A approval)", "reports/model_comparison.md; artefacts", "**STOP C**"],
    ["6", "Steps 4 and 5 — explainability, recommendation rules", "explain.py; recommendations.ts", "—"],
    ["7", "Step 10 — tests; Step 11 — documentation", "Tests green; docs complete", "**STOP D** (final review)"],
  ], [800, 4200, 3100, 1538]),
  h2("0.4 STOP POINTS (ask the human before continuing)"),
  b("**STOP A — Target approval.** Present the proposed rubric, thresholds, weights, class distribution and the circularity disclosure. Continue to Step 3 only after explicit approval. Also confirm Decisions D-1 to D-6 (section 4); if not answered, use the recommended option and say so."),
  b("**STOP B — Database migration.** Show the Prisma diff and confirm it only creates new tables and adds the Users back-relation."),
  b("**STOP C — Model selection.** Present the comparison table, confusion matrices and the proposed final model with reasons."),
  b("**STOP D — Final review.** Walk through the activity diagram on screen, including both error branches, and the §52 checklist (Appendix C.4)."),
  h2("0.5 Known environment issues on this machine"),
  b("Global npm is broken in every nvm Node version (missing proc-log module). Fix first: nvm install 20 --reinstall-packages-from=20.20.0."),
  b("Python 3 is installed but has no pandas or scikit-learn; use a virtual environment inside ml-service/."),
  b("Training all four models takes about 5–6 minutes (SVM dominates)."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- 1. summary ----------
children.push(
  h1("1. Executive summary"),
  p("FinAware today is a working Next.js 14 prototype with seven Express microservices, Prisma/SQLite, Docker Compose and a Helm chart. **This plan does not modify the existing application.** It adds a new Assess Financial Risk capability exactly as drawn in the four UML diagrams: a Financial API Service, a Financial Data Service, an ML Prediction Service, new FinancialProfile / RiskAssessment / Recommendation records, and a new page reached from the dashboard. Existing pages, services, tables and data remain unchanged."),
  p("The developer handoff package supplies a usable Python/FastAPI ML service skeleton, and the data package supplies a clean dataset. Both were run end-to-end during this review. The skeleton trains and serves predictions, but it has confirmed defects, and the risk target it proposes does not work on this data (High risk = 0.54 % of records)."),
  callout("The one blocking decision", [
    "The dataset contains no genuine Low/Medium/High label. A **constructed risk_tier target must be designed, agreed with the supervisor and documented before supervised training**. It must not be quietly invented. Everything else can be built around the API contract while that sign-off is pending.",
  ]),
  gap(),
  h2("1.1 Effort at a glance"),
  table(["#", "Step", "Days", "Can run in parallel with"], [
    ["0", "Environment & repository setup", "0.5", "—"],
    ["1", "Agree and document the risk target", "1.5 (+ supervisor turnaround)", "2, 7, 8, 9"],
    ["2", "Fix and harden the handoff ML code", "1.5", "1"],
    ["3", "Train, evaluate and select the model", "2", "—  (needs 1 signed off)"],
    ["4", "Per-user explainability (SHAP)", "1", "5"],
    ["5", "Recommendation engine in the Financial API Service", "1", "4"],
    ["6", "ML Prediction Service API contract & errors", "1", "7"],
    ["7", "New Financial API + Financial Data services and database tables (additive)", "3.5", "1, 6, 8"],
    ["8", "Frontend: new Financial Profile & Risk Assessment pages", "3", "1, 7"],
    ["9", "Docker / Helm / Kubernetes", "1.5", "1, 7, 8"],
    ["10", "Testing (data, feature, model, API, E2E + regression)", "2.5", "written alongside each step"],
    ["11", "Documentation & academic write-up", "2", "—  (final)"],
    ["", "**Core total**", "**21 days**", ""],
    ["", "**With 20 % contingency**", "**≈ 25 days ≈ 5 weeks full-time**", ""],
  ], [500, 4900, 2300, 1938]),
  gap(),
  p("How that translates to calendar time:"),
  b("**One full-time developer:** about 5 weeks."),
  b("**Part-time student (~15 hours/week):** about 11–13 weeks."),
  b("**With AI-assisted coding** (the code-heavy Steps 2–10 generated and then reviewed): roughly 8–10 days of human effort. Most of the remaining time is review, supervisor sign-off, testing the demo and writing up — those cannot be shortened much."),
  b("**Critical path:** Step 1 sign-off → Step 3 training. Start Step 1 on day one; build Steps 7–9 against a stubbed ML response while waiting."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- 2. current state ----------
children.push(
  h1("2. What exists today"),
  h2("2.1 Existing FinAware application"),
  table(["Area", "Current state", "Action (additive only)"], [
    ["Frontend", "Next.js 14 App Router, Tailwind, Recharts. Dashboard, Income vs Expense, Identity, Debts, Rehab, Get Help pages", "Unchanged. Add new Financial Profile and Risk Assessment pages"],
    ["Backend", "Next.js API routes proxy to 7 Express services (ports 4101–4107)", "Unchanged. Add Financial API (4108) and Financial Data (4109) services"],
    ["Database", "Prisma + SQLite. Users, Credit_Profile, Debts, Payment_History, Legal_Records, AI_Recommendations, Expert_Requests, Providers, Wealth_Assets", "Unchanged tables and data. Add FinancialProfile, RiskAssessment, RiskDriver, Recommendation"],
    ["Existing risk", "Users.risk_level derived from ID-number suffix (demo simulation)", "Unchanged. The ML assessment is stored separately in RiskAssessment"],
    ["Existing AI recommendations", "OpenAI call on the Rehab page", "Unchanged. The new flow does not use OpenAI (spec §48)"],
    ["Infrastructure", "Dockerfile, Docker Compose, Caddy TLS, Helm chart (dev/stag/prod), legacy k8s manifests", "Unchanged services. Add three new services"],
    ["Quality", "CI runs lint, typecheck, build. No automated tests", "Add tests + Python CI job; regression check that existing pages still work"],
  ], [1700, 4500, 3438]),
  h2("2.2 Developer handoff package"),
  p("Location: finaware_main_project/developerhandoffpackagefolder (also in Downloads). Contents: README, requirements.txt, Dockerfile, config.py, preprocessing.py, train.py, inference.py, explainability.py, recommendations.py, api.py, sample_request.json, node_integration_example.ts."),
  p("**Not included:** docs/risk_tier_methodology.md (referenced by the README) and tests. The data files are in a separate zip: personal_finance_zar.csv, synthetic_personal_finance_dataset.csv (original USD source with region) and data_dictionary.xlsx. The four UML diagrams were supplied as separate images."),
  new Paragraph({ children: [new PageBreak()] }),

  h1("2A. Alignment with the UML diagrams"),
  p("The four diagrams are the design authority for the new feature. Every element maps to something built in Steps 1–11:"),
  h2("2A.1 Sequence diagram → components"),
  table(["Diagram participant", "Built as", "Responsibilities (from the diagram)"], [
    ["User / Financial Web Interface", "New Next.js pages /financial-profile and /risk-assessment + API routes /api/financial-profile and /api/risk-assessment", "Enter financial information; request risk assessment; display risk score, risk level and recommendations"],
    ["Financial API Service", "New Express service services/financial-api (port 4108)", "Validate financial information; orchestrate POST /risk-assessment; send features to ML; create RiskAssessment; **generate Recommendation**; return result"],
    ["Financial Data Service", "New Express service services/financial-data (port 4109)", "Query FinancialProfile and Debt; INSERT RiskAssessment and Recommendations via Prisma"],
    ["PostgreSQL Database", "Existing Prisma database (SQLite today) — see Decision D-1", "Stores FinancialProfile, RiskAssessment, Recommendation; existing Debts read-only"],
    ["ML Prediction Service", "New Python FastAPI service ml-service (port 8000)", "Apply preprocessing rules; generate ML features; generate risk prediction; return risk score and risk level"],
  ], [2400, 3400, 3838]),
  gap(),
  callout("Two changes to the earlier plan that the sequence diagram requires", [
    "1. **Recommendations are generated in the Financial API Service (Node/TypeScript), not in the Python ML service.** The ML service returns risk score, risk level, probabilities and drivers; the Node rule engine turns those into Recommendations.",
    "2. **Data access goes through a separate Financial Data Service.** The API service never talks to the database directly.",
  ], "E8F4F8", NAVY),
  gap(),
  h2("2A.2 Class diagram → new Prisma models"),
  table(["Diagram class", "Implementation", "Notes"], [
    ["User", "Existing Users table — **unchanged**", "Diagram's email/passwordHash are conceptual; FinAware's existing ID-number login is kept"],
    ["Debt", "Existing Debts table — **read-only**", "balance → outstandingBalance; interest_rate → interestRate; monthly payment taken from existing Credit_Profile.monthly_obligations (see D-4)"],
    ["FinancialProfile", "**New** model: profileId (uuid), userId → Users, monthlyIncome, monthlyExpenses, savings, creditScore, financialGoal, updatedAt", "1 User : 1 FinancialProfile. financialGoal is stored and shown, not a model input"],
    ["ML Prediction Service", "ml-service with modelName, modelVersion; preprocessData(), predictRisk()", "Matches /predict and model_metadata.json"],
    ["RiskAssessment", "**New** model: assessmentId (uuid), profileId, riskLevel, riskScore, lowProbability, mediumProbability, highProbability, predictionDate, modelName, modelVersion, targetVersion", "1 FinancialProfile : 0..* RiskAssessment (full history kept)"],
    ["(driver detail)", "**New** model RiskDriver: assessmentId, featureName, displayName, importance, direction", "Needed for spec §26–29; not drawn but consistent with the diagram"],
    ["Recommendation", "**New** model: recommendationId (uuid), assessmentId, recommendationType, recommendationText, reason, priority, rulesVersion, createdDate", "1 RiskAssessment : 0..* Recommendation"],
  ], [2000, 4600, 3038]),
  gap(),
  p("**riskScore** appears in the class and sequence diagrams but the ML model outputs probabilities. Define it transparently (Decision D-3), e.g. riskScore = 100 × (0.5 × P(Medium) + 1.0 × P(High)), a 0–100 value that rises with predicted risk. riskLevel is always the class with the highest probability."),
  h2("2A.3 Activity diagram → required behaviour"),
  table(["Activity step", "Where it happens"], [
    ["User logs in → Open Financial Dashboard", "Existing login and dashboard; one new link/sidebar entry to the Risk Assessment page"],
    ["Enter or update financial information", "New Financial Profile page (PUT /api/financial-profile)"],
    ["Validate → invalid: display errors, correct, resubmit", "Financial API Service validation (Zod) returning field-level errors; form shows them inline"],
    ["User requests financial risk assessment", "Button on the Risk Assessment page (POST /api/risk-assessment)"],
    ["Retrieve FinancialProfile and Debt data", "Financial Data Service"],
    ["Prepare data → preprocessing → generate ML features → send to ML → generate prediction", "Financial API Service assembles the feature payload; ML Prediction Service preprocesses and predicts"],
    ["Prediction successful? No → display prediction error → allow retry", "Structured error from ML/API; page shows error with a Retry button; nothing is stored"],
    ["Yes → create and store RiskAssessment → generate Recommendation → display score, level and recommendation", "Financial Data Service stores; Financial API Service generates recommendations; page renders results"],
  ], [4200, 5438]),
  h2("2A.4 Use-case diagram → coverage"),
  table(["Use case", "Status"], [
    ["Register Account, Login, Manage Debt, View Financial Dashboard", "Existing — unchanged"],
    ["Manage Financial Profile", "New (Step 7–8)"],
    ["Assess Financial Risk «include» Preprocess Financial Data, Generate Risk Prediction, Store Risk Assessment", "New (Steps 2–7)"],
    ["Generate Recommendation «extend» Assess Financial Risk", "New (Step 5)"],
    ["View Risk Assessment «include»d by View Financial Dashboard", "New page + latest-assessment link from the dashboard (Step 8)"],
    ["ML Prediction Service (secondary actor)", "New ml-service (Steps 2–6)"],
  ], [5600, 4038]),
  h2("2A.5 Minimal touch points to existing files"),
  p("Adding a feature cannot be done with literally zero edits to existing files. These are the only ones, and each is a pure addition (no existing line changes behaviour):"),
  table(["File", "Addition"], [
    ["prisma/schema.prisma", "Four new models, plus one back-relation line on Users (Prisma requires both sides). No existing column or table altered; migration only creates tables"],
    ["middleware.ts", "Add /financial-profile and /risk-assessment to the protected route list"],
    ["components/sidebar/main-tabs.tsx", "One new tab: Risk Assessment"],
    ["lib/microservices/proxy.ts", "Two new service names and URLs"],
    ["package.json", "New service:* scripts; include them in dev:stack"],
    [".env.example", "FINANCIAL_API_SERVICE_URL, FINANCIAL_DATA_SERVICE_URL, ML_SERVICE_URL"],
    ["docker-compose.yml, Helm values/templates, deploy/k8s", "Three new services appended"],
    [".github/workflows/ci.yml", "New Python job"],
  ], [3600, 6038]),
  new Paragraph({ children: [new PageBreak()] }),

  h1("2B. Inventory — what remains, what is added, what is used, what is not used"),
  p("A single reference for what happens to every part of FinAware and the handoff package."),
  h2("2B.1 What remains unchanged (existing FinAware)"),
  table(["Area", "Items kept exactly as they are"], [
    ["Pages", "/login, /join, /fica-verification, /dashboard, /income-expense, /identity, /debts, /rehab, /help"],
    ["Services", "auth (4101), dashboard (4102), identity (4103), debts (4104), rehab (4105), help (4106), pdf (4107)"],
    ["Database tables and data", "Users, Credit_Profile, Debts, Payment_History, Legal_Records, AI_Recommendations, Expert_Requests, Providers, Wealth_Assets"],
    ["Existing behaviour", "ID-number login, FICA flow, simulated risk badge (ID suffix), OpenAI recommendations on the Rehab page, PDF export, WhatsApp help"],
    ["Infrastructure", "Existing Dockerfile, Caddy TLS, existing Compose services, Helm templates for existing services, deploy/k8s manifests, macOS scripts"],
    ["Documentation", "Existing README sections and docs/ diagrams (kept; new versions added alongside)"],
  ], [2600, 7038]),
  h2("2B.2 What is added (new)"),
  table(["Area", "New items"], [
    ["Dataset", "ml-service/data/: personal_finance_zar.csv, synthetic_personal_finance_dataset.csv (provenance), data_dictionary.xlsx, checksums README"],
    ["ML Prediction Service", "ml-service/ (Python, FastAPI, port 8000): data audit, features, target, pipeline, training, evaluation, prediction, SHAP explainability, API, tests, reports"],
    ["Financial API Service", "services/financial-api (Node/Express, port 4108): validation, orchestration, recommendation rule engine"],
    ["Financial Data Service", "services/financial-data (Node/Express, port 4109): FinancialProfile, RiskAssessment, Recommendation persistence; read-only access to Debts and Credit_Profile"],
    ["Database tables", "FinancialProfile, RiskAssessment, RiskDriver, Recommendation (create-only migration)"],
    ["Frontend", "/financial-profile and /risk-assessment pages, API routes /api/financial-profile and /api/risk-assessment, one sidebar tab"],
    ["Infrastructure", "Three new Compose services, Helm Deployments/Services/ConfigMap entries, deploy/k8s additions, Python CI job"],
    ["Documentation", "risk_tier_methodology.md, feature_mapping.md, data_audit.md, model_comparison.md, the four UML diagrams, updated architecture diagrams, ML README"],
  ], [2600, 7038]),
  h2("2B.3 Handoff package — how each file is used"),
  table(["Handoff file", "Status", "What happens", "New location"], [
    ["requirements.txt", "Used (updated)", "Pin exact versions; add shap, pytest, httpx", "ml-service/requirements.txt"],
    ["config.py", "Used (fixed)", "Correct loan_interest_rate_pct name; drop region alias; D-2 feature list", "ml-service/ml/config.py"],
    ["preprocessing.py → clean()", "Rewritten", "Report and log every change instead of silently blanking or dropping rows", "ml-service/ml/data_audit.py"],
    ["preprocessing.py → engineer()", "Used (fixed)", "Correct DTI definition; stop overwriting savings_to_income_ratio; remove duplicate features; documented zero handling", "ml-service/ml/features.py"],
    ["preprocessing.py → target()", "Replaced", "Supervisor-approved rubric replaces the handoff rubric (High = 0.54 %)", "ml-service/ml/target.py"],
    ["preprocessing.py → preprocessor()", "Used almost as is", "One-hot (handle_unknown='ignore') + scaling, fitted on training data only", "ml-service/ml/pipeline.py"],
    ["train.py", "Used (extended)", "Keep 4 models, stratified 80/20, seed 42, 5-fold CV. Add SVM calibration, weighted F1, confusion-matrix images, ablation, selection rationale, metadata; save only the chosen model", "ml-service/ml/train.py + evaluate.py"],
    ["inference.py", "Used (fixed)", "Probabilities mapped by class name; add riskScore; no silent filling of missing inputs", "ml-service/ml/predict.py"],
    ["explainability.py", "Not used — replaced", "Inverted direction and near-zero values; replaced by SHAP", "ml-service/ml/explain.py (new code)"],
    ["recommendations.py", "Ported to TypeScript", "Rules reused; moved to the Financial API Service as the sequence diagram requires", "services/financial-api/src/recommendations.ts"],
    ["api.py", "Used (fixed)", "Port 8000; /health/live, /health/ready, /model-info; required inputs; structured errors", "ml-service/api/main.py"],
    ["Dockerfile", "Used (upgraded)", "Multi-stage, model baked in, non-root user, port 8000, health check", "ml-service/Dockerfile"],
    ["sample_request.json", "Used (rewritten)", "Real dataset category values; becomes a test fixture", "ml-service/tests/fixtures/"],
    ["node_integration_example.ts", "Reference only", "Existing callServiceJson helper is used instead (timeouts and 'service unavailable' already handled)", "—"],
    ["README.md", "Merged", "Corrected commands merged into the ML README", "ml-service/README.md"],
  ], [2300, 1500, 3700, 2138]),
  gap(),
  p("Roughly 70 % of the handoff Python is reused (pipeline, training loop, FastAPI app, Dockerfile). The explainability module and the target rubric are replaced; the recommendation rules move to Node."),
  h2("2B.4 What will NOT be used"),
  table(["Item", "Reason"], [
    ["Handoff target rubric (component_dti / exp / save / credit, 35/25/20/20 weights)", "High tier only 0.54 %; savings component never fires on this data"],
    ["Handoff explainability method (set feature to 0 and compare)", "Direction inverted for Low predictions; breaks ratios; impacts ≈ 0"],
    ["Saving all four models in one 28 MB bundle", "Only the selected model is deployed; others are reported, not shipped"],
    ["training_dataset_with_risk_tier.csv output in artifacts", "Not needed at runtime; the target is reproducible from target.py"],
    ["Engineered duplicates: debt_zar, loan_burden_zar, emi_to_income_ratio", "Duplicate existing fields (spec §16)"],
    ["USD columns as model features", "Duplicate the ZAR columns (spec §16); kept in the file for provenance only"],
    ["synthetic_personal_finance_dataset.csv for training", "Original USD source kept for provenance only; training uses personal_finance_zar.csv"],
    ["region field and aliases", "Removed from the cleaned dataset; not in the UML data model"],
    ["gender, education_level, job_title, loan_term_months, loan_type as model inputs", "Not captured by FinancialProfile/Debt in the class diagram; no signal in the data (Decision D-2)"],
    ["user_id and record_date as features", "Identifier and date only (spec §6, §16)"],
    ["OpenAI in the new Assess Financial Risk flow", "Spec §48; recommendations are rule-based. The existing Rehab page keeps its own OpenAI feature untouched"],
    ["Port 8001", "Standardised on 8000 per the specification"],
    ["developerhandoffpackagefolder/ inside the repo", "Removed once its contents are in ml-service/; the Downloads zip stays as the untouched original"],
  ], [4300, 5338]),
  h2("2B.5 Final layout of the new ML service"),
  code("ml-service/  Dockerfile · requirements.txt · README.md"),
  code("  data/       personal_finance_zar.csv · synthetic_personal_finance_dataset.csv · data_dictionary.xlsx"),
  code("  ml/         config · data_audit · features · target · pipeline · train · evaluate · predict · explain"),
  code("  api/        main.py  (FastAPI, port 8000)"),
  code("  artifacts/  pipeline.joblib · feature_schema.json · model_metadata.json  (built, not committed)"),
  code("  reports/    data_audit.md · model_comparison.md · confusion matrices"),
  code("  tests/      data · feature · model · API tests + fixtures"),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- 3. findings ----------
children.push(
  h1("3. Verified findings from the review"),
  h2("3.1 The dataset"),
  table(["Check", "Result"], [
    ["Shape", "32,424 rows × 24 columns — matches the dictionary"],
    ["Missing values / duplicate rows", "0 / 0"],
    ["ZAR fields", "Exactly USD × 16.27 for all five monetary fields"],
    ["Loan consistency", "has_loan = No ⇒ loan_type 'No Loan' and all loan fields = 0 (no exceptions)"],
    ["debt_to_income_ratio", "= monthly EMI ÷ monthly income. An extra emi_to_income_ratio would be a duplicate — do not add it"],
    ["savings_to_income_ratio", "= savings ÷ **annual** income, clipped to 0.1–10. The dictionary does not say this, and spec §13.4 (÷ monthly income) is wrong for this data"],
    ["Independence of columns", "Credit score correlates ≈ 0 with every field; job_title is independent of employment_status (unemployed doctors, employed 'Students'); median income is ≈ R65k for every employment status"],
    ["Loan burden", "60 % of loan holders have EMI > income; 82.5 % of loan holders have a negative monthly surplus"],
    ["Savings", "Very large: median savings cover 101 months of expenses"],
  ], [3000, 6638]),
  gap(),
  callout("Academic consequence", [
    "The columns were generated independently at random. Demographic and job fields carry no real signal, so **the model can only learn whatever rule is used to build the target**. This is acceptable for a prototype but must be disclosed; do not claim the model discovered risk from the data.",
  ], "E8F4F8", NAVY),
  h2("3.2 Handoff code — results when run on the real data"),
  table(["Model", "Accuracy", "Macro F1", "High-risk recall"], [
    ["Gradient Boosting (selected by the script)", "0.995", "0.965", "0.94"],
    ["Random Forest", "0.988", "0.951", "0.94"],
    ["SVM", "0.981", "0.927", "0.86"],
    ["KNN", "0.955", "0.634", "0.00"],
  ], [4238, 1800, 1800, 1800]),
  gap(),
  p("Training all four took 5.5 minutes; the saved bundle is 28 MB because it stores every model. The proposed target produced **Low 66.95 % / Medium 32.52 % / High 0.54 % (174 rows)**, and the tier is effectively 'has a loan or not' (99.4 % of non-borrowers are Low; 80 % of borrowers are Medium)."),
  h2("3.3 Confirmed defects in the handoff code"),
  table(["#", "Defect", "Effect"], [
    ["D1", "config.py names the rate 'interest_rate'; the data column is loan_interest_rate_pct", "Interest rate silently dropped from the model"],
    ["D2", "If debt_to_income_ratio is omitted, it is computed as loan amount ÷ income", "Sample request gets 2.38 instead of 0.107; a 'DTI > 0.40' recommendation appears beside a Low result"],
    ["D3", "engineer() overwrites savings_to_income_ratio with savings ÷ monthly income", "Changes a documented field's meaning; savings component of the target never fires"],
    ["D4", "sample_request.json uses \"Bachelor's Degree\", loan_status \"Active\", region \"Gauteng\"", "None exist in the training data"],
    ["D5", "Explainability measures change against the predicted class and 'neutralises' features by setting them to 0", "Direction is inverted for Low predictions; income = 0 breaks ratios; impacts ≈ 0.000008"],
    ["D6", "Probabilities saturate (sample = 99.998 % Low)", "Over-confident output; weak explanations"],
    ["D7", "debt_zar, loan_burden_zar, emi_to_income_ratio duplicate existing fields", "Violates spec §16"],
    ["D8", "clean() blanks out-of-range values and drops duplicates without logging", "Violates spec §5 (no silent alteration)"],
    ["D9", "Every failure returns HTTP 400, including model missing", "Violates spec §43 structured errors"],
    ["D10", "API fills any omitted field with the median / most frequent value", "A request with only income, expenses and savings returns 99.99 % Low"],
    ["D11", "No model_metadata.json, versions, weighted F1, display labels or rules version; response shape differs from spec §35", "Spec deliverables missing"],
    ["D12", "SVC(probability=True) deprecated in scikit-learn 1.9; port 8001 vs spec 8000; container runs as root; image has no trained model", "Maintenance / deployment gaps"],
  ], [600, 4800, 4238]),
  gap(),
  p("Verified working: /health returns 200; /predict returns 200 for the sample; a negative income is rejected with 422."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- steps ----------
children.push(...step(0, "Environment & repository setup", { days: "0.5 day", dep: "Nothing — do first" },
  "Nothing else can be built or verified until the toolchain works and the ML code and data live inside the project repository under version control.",
  [
    "Repair npm (currently broken in every nvm Node install): nvm install 20 --reinstall-packages-from=20.20.0. Confirm npm ci, npm run typecheck, npm run lint and npm run build pass on the untouched app.",
    "Move the handoff code into the repo as ml-service/ (not left as developerhandoffpackagefolder/).",
    "Add ml-service/data/personal_finance_zar.csv, synthetic_personal_finance_dataset.csv (provenance) and data_dictionary.xlsx. Record SHA-256 checksums in ml-service/data/README.md.",
    "Create a Python 3.12 virtual environment; pin exact versions (pandas, numpy, scikit-learn 1.5–1.7, joblib, fastapi, uvicorn, pydantic, shap, pytest, httpx).",
    "Git-ignore ml-service/artifacts/; models are produced by training (locally and in the Docker build), not committed.",
    "Create a feature branch, e.g. feature/ml-risk-engine.",
  ],
  ["Working Node and Python toolchains", "ml-service/ folder with data and pinned requirements"],
  ["Baseline app builds cleanly", "python train.py runs inside the repo"]));

children.push(...step(1, "Agree and document the risk target", { days: "1.5 days + supervisor turnaround", dep: "Step 0. Blocks Step 3" },
  "This is the specification's single blocking issue. The dataset has no real risk label, and the handoff's rubric is unusable on this data (High = 0.54 %; the savings component never fires). Training on an undocumented or broken target would undermine the whole ML component academically.",
  [
    "Choose Option A (genuine labelled dataset) or Option B (documented constructed target). Unless the supervisor can supply labels, use Option B.",
    "Build risk_target_version 1.0 as a points-based rubric using independent financial indicators:",
    ["Repayment burden — debt_to_income_ratio (EMI ÷ income)"],
    ["Monthly surplus after expenses and EMI (as a share of income)"],
    ["Expense-to-income ratio"],
    ["Credit score"],
    ["Savings coverage in months (savings ÷ monthly expenses) — using correct definitions"],
    "Calibrate the thresholds against the real distributions so every tier is meaningful (e.g. no tier below ~15 %). Report the resulting class distribution.",
    "Write docs/risk_tier_methodology.md: variables, thresholds, weights, rationale, class distribution, version, and the circularity disclosure (spec §20).",
    "Agree the model feature set (Decision D-2). Per the activity and sequence diagrams, the model may only use data retrieved from FinancialProfile and Debt (plus age and employment status already held on Users). Recommended inputs: monthly income, monthly expenses, savings, credit score, has loan, total debt balance, monthly debt repayment, interest rate, age, employment status, plus engineered ratios. Recommended exclusions: gender, education level, job title, loan term and loan type — none are captured by the diagrams' data model, and the data audit shows they carry no signal.",
    "Plan an ablation run: the four models trained without the rubric's input variables, to show honestly how much the remaining fields predict.",
    "Obtain written supervisor sign-off before Step 3.",
  ],
  ["target.py (versioned)", "docs/risk_tier_methodology.md", "Class-distribution table", "Supervisor approval (email or signed page)"],
  ["Thresholds approved", "Every tier has a usable share of records", "Circularity is disclosed in writing"],
  [callout("Example rubric shape (thresholds to be calibrated on the data)", [
    "Each indicator scores 0 (healthy), 1 or 2 (stressed). Total 0–10 → Low / Medium / High by agreed cut-points.",
    "Example cut-offs to start from: credit score ≥700 / 600–699 / <600; EMI ÷ income <0.20 / 0.20–0.40 / >0.40; expenses ÷ income <0.60 / 0.60–0.85 / >0.85.",
  ], "E8F4F8", NAVY), gap()]));

children.push(...step(2, "Fix and harden the handoff ML code", { days: "1.5 days", dep: "Step 0. Can run in parallel with Step 1" },
  "The handoff code is a good base but trains on wrong or silently altered inputs (defects D1–D12). Fixing it before training avoids having to retrain and re-report later.",
  [
    "D1: map loan_interest_rate_pct correctly; remove the stale region alias.",
    "D2/D3: never recompute dataset fields with a different definition. The server computes debt_to_income_ratio (EMI ÷ income) and savings_to_income_ratio (savings ÷ annual income, clip 0.1–10) from raw values exactly as in the dataset.",
    "D7: remove debt_zar, loan_burden_zar and emi_to_income_ratio. Engineered features: disposable_income_zar, expense_to_income_ratio, monthly_surplus_after_emi_zar, savings_coverage_months, loan_to_income_ratio (keep only if it adds value).",
    "Division by zero: income ≤ 0 is rejected at validation; expenses = 0 → savings_coverage_months capped (e.g. 120) plus an expenses_zero flag. Document both. Assert no inf/NaN reaches the model.",
    "D8: replace silent cleaning with a data-audit step that reports and logs every change (spec §5).",
    "Exclude user_id, record_date, all *_usd columns and the target from features, plus the D-2 exclusions.",
    "Write the FinAware → dataset field mapping (feature_mapping.md): FinancialProfile.monthlyIncome → monthly_income_zar; monthlyExpenses → monthly_expenses_zar; savings → savings_zar; creditScore → credit_score; sum of active Debts.balance → loan_amount_zar; Credit_Profile.monthly_obligations → monthly_emi_zar; balance-weighted Debts.interest_rate → loan_interest_rate_pct; any active debt → has_loan; Users.real_age → age; Users.employment_status → employment_status (value mapping documented).",
    "Split 80/20, stratified, random_state = 42. One sklearn Pipeline per model: feature engineering → ColumnTransformer (OneHotEncoder(handle_unknown='ignore') + StandardScaler) → model. Fit on training data only.",
    "D12: replace SVC(probability=True) with CalibratedClassifierCV(SVC()); pin scikit-learn.",
    "D4: rewrite sample_request.json using real category values.",
    "Save only the selected pipeline: pipeline.joblib, feature_schema.json (fields, types, allowed categories, ranges), model_metadata.json (name, version 1.0, target_version, random_state, class order, metrics).",
  ],
  ["ml/data_audit.py → reports/data_audit.md", "ml/features.py, ml/pipeline.py (fixed)", "Artefact files as listed"],
  ["Training uses exactly the documented feature list", "Data audit confirms 32,424 × 24 with no silent changes"]));

children.push(...step(3, "Train, evaluate and select the model", { days: "2 days", dep: "Steps 1 (signed off) and 2" },
  "The specification requires all four algorithms evaluated with a comparable methodology and an evidence-based, documented final selection — not just 'highest accuracy'.",
  [
    "Train Random Forest, Gradient Boosting, KNN and SVM on the same split with 5-fold stratified cross-validation on the training set; small hyper-parameter grid per model.",
    "Evaluate on the held-out 20 %: accuracy, macro F1, weighted F1, per-class precision / recall / F1, confusion matrix (saved as PNG).",
    "Address KNN's weak High-class recall (distance weighting, k tuning, scaling check) and report the result either way.",
    "Run the ablation models (without the rubric's inputs) and report them alongside.",
    "Compute global permutation importance for all four models on the test set.",
    "Select the final model using macro F1, High-risk recall, confusion matrix, probability quality, explainability and inference speed. Record the reasoning.",
  ],
  ["ml/train.py, ml/evaluate.py", "reports/model_comparison.md with tables and confusion matrices", "Final pipeline.joblib + model_metadata.json"],
  ["All four models reported with every required metric", "Selection justified in writing"]));

children.push(...step(4, "Per-user explainability", { days: "1 day", dep: "Step 3" },
  "FinAware must answer 'Why did the model classify me this way?'. Global feature_importances_ describe the model overall, not an individual user. The handoff's perturbation method is inverted and unstable (D5).",
  [
    "Use SHAP TreeExplainer for the selected tree model (Random Forest or Gradient Boosting): fast and exact per prediction.",
    "Compute contributions towards the High-risk class so 'direction' is consistent: increases_risk / decreases_risk.",
    "Aggregate one-hot columns back to their source feature (e.g. all loan_type_* → Loan type).",
    "Return the top 3–5 drivers with human-readable labels (spec §29) and an influence band (Significant / Moderate / Minor).",
    "Wording everywhere: 'Factors influencing this prediction' — never causal language.",
  ],
  ["ml/explain.py", "Display-name mapping file"],
  ["Drivers are stable, correctly signed and readable", "No invented importance values"]));

children.push(...step(5, "Recommendation engine in the Financial API Service", { days: "1 day", dep: "Step 4 (driver format)" },
  "The sequence diagram places 'Generate Recommendation' in the Financial API Service after the RiskAssessment is created. Recommendations must be deterministic, reproducible, testable and traceable to the prediction, and the new flow must not use OpenAI (spec §48). The handoff's recommendations.py is ported to TypeScript and corrected.",
  [
    "Implement in services/financial-api/src/recommendations.ts (TypeScript), consuming riskLevel, probabilities, topDrivers and the user's financial values.",
    "Store rules as versioned data (rules_version 1.0), not hard-coded if-statements.",
    "Tier rules (spec §31) for Low, Medium and High.",
    "Driver rules (spec §32): debt-to-income, expense-to-income, savings, credit score, low/negative monthly surplus.",
    "Each output item: title, description, reason, priority, plus trace fields (tier, driver, user value that triggered it).",
    "De-duplicate and cap at a sensible number (e.g. 5); order by priority.",
  ],
  ["services/financial-api/src/recommendations.ts + rules file", "rulesVersion stored on every Recommendation"],
  ["Every recommendation can be traced to tier + driver + user value", "Same input always yields the same recommendations"]));

children.push(...step(6, "ML service API contract and error handling", { days: "1 day", dep: "Steps 3–5 (contract can be fixed earlier)" },
  "The Node backend and frontend depend on a stable contract. Fixing it early lets Steps 7–9 proceed with a stub while training is pending.",
  [
    "FastAPI on port 8000. Endpoints: POST /predict, GET /health/live, GET /health/ready (model loaded), GET /model-info (metadata only).",
    "Input validation generated from feature_schema.json. D10: required model inputs must be supplied — no silent median filling.",
    "Server-side calculation of debt_to_income_ratio and savings_to_income_ratio; client-supplied values ignored.",
    "Structured errors: INVALID_INPUT (422), UNKNOWN_CATEGORY (warning, prediction still returned), MODEL_UNAVAILABLE (503), PREDICTION_FAILED (500).",
    "Response (sequence diagram: 'Return risk score and risk level', extended per spec §35): riskLevel, riskScore, probabilities {Low, Medium, High} mapped by class name (never by position), topDrivers, model {name, version}, targetVersion. Recommendations are added later by the Financial API Service, not by this service.",
    "Validate probabilities sum to ≈ 1 and riskTier = argmax.",
    "Convert all numpy types to native Python before returning.",
  ],
  ["ml-service/api/main.py", "OpenAPI schema (auto-generated by FastAPI)"],
  ["Contract documented and frozen", "All error cases return structured JSON"]));

children.push(...step(7, "New Financial API and Financial Data services, and database tables", { days: "3.5 days", dep: "Step 6 contract (can use a stub ML response)" },
  "This implements the middle of the sequence diagram exactly: Financial API Service ↔ Financial Data Service ↔ database, and Financial API Service ↔ ML Prediction Service. Everything is new code beside the existing services; nothing existing is modified.",
  [
    "Prisma: add FinancialProfile, RiskAssessment, RiskDriver and Recommendation (section 2A.2), with UUID keys and a back-relation on Users. Migration creates tables only; verify existing tables and data are untouched.",
    "services/financial-data (port 4109), following the existing services/*/src/server.ts pattern:",
    ["GET/PUT /financial-profile/:userId — read and upsert FinancialProfile"],
    ["GET /financial-data/:userId — FinancialProfile + active Debts + Credit_Profile.monthly_obligations (read-only on existing tables)"],
    ["POST /risk-assessments — INSERT RiskAssessment + RiskDriver rows; POST /risk-assessments/:id/recommendations"],
    ["GET /risk-assessments/:userId/latest and /history"],
    "services/financial-api (port 4108) — no database access of its own:",
    ["PUT /financial-profile — validate (Zod, field-level errors) → Financial Data Service → 'Validation successful'"],
    ["POST /risk-assessment — retrieve FinancialProfile and Debt → prepare feature payload (feature_mapping.md) → ML Prediction Service → on success create RiskAssessment → generate Recommendations (Step 5) → store → return assessment + recommendations"],
    ["On ML failure: return a structured PREDICTION_FAILED / MODEL_UNAVAILABLE error and store nothing (activity diagram 'No' branch)"],
    "New Next.js routes /api/financial-profile and /api/risk-assessment (session-checked proxies via callServiceJson). The browser never calls the ML or data services directly.",
    "Additive edits only as listed in section 2A.5 (proxy.ts service names, package.json scripts, .env.example).",
  ],
  ["services/financial-api, services/financial-data", "Prisma migration (create-only)", "feature_mapping.md"],
  ["The full sequence diagram runs end-to-end with a stubbed ML response, then with the real model", "Existing services, pages and tables behave exactly as before"]));

children.push(...step(8, "Frontend: new Financial Profile and Risk Assessment pages", { days: "3 days", dep: "Step 7 (can start against a stub)" },
  "The activity diagram is the user journey the examiner will follow: log in → open dashboard → enter or update financial information → validate → request assessment → see risk score, risk level and recommendations (or an error with retry). All screens are new; existing pages are not edited.",
  [
    "New page /financial-profile ('Manage Financial Profile'): monthly income, monthly expenses, savings, credit score, financial goal. Shows existing debts read-only with a link to the existing Debts page ('Manage Debt').",
    "Validation errors displayed inline per field; user corrects and resubmits (activity 'No' branch). Server validation is authoritative.",
    "New page /risk-assessment ('Assess Financial Risk' / 'View Risk Assessment'): 'Request risk assessment' button; if no profile exists, direct the user to /financial-profile first.",
    "Results card: '<Level> Financial Risk', risk score, 'N % predicted probability', Low / Medium / High distribution bar (whole-number rounding).",
    "'What is influencing your result?' list with influence bands; 'Your recommended actions' list with titles and reasons.",
    "Prediction error state with a Retry button (activity diagram); loading state; 'Demo data — not financial advice' disclaimer.",
    "Assessment history list (RiskAssessment 0..* per profile).",
    "Entry point from the dashboard: one new sidebar tab (section 2A.5). The existing dashboard page itself is not edited.",
    "Label the new result clearly as the **ML Financial Risk Assessment** so it is not confused with the existing simulated risk badge (Decision D-5).",
  ],
  ["/financial-profile and /risk-assessment pages and components"],
  ["The activity diagram can be walked through on screen, including both error branches", "Spec §50 end-to-end scenario demonstrated", "No technical feature names visible to users"]));

children.push(...step(9, "Docker, Helm and Kubernetes", { days: "1.5 days", dep: "Steps 6–7" },
  "The ML service must deploy consistently with the existing architecture and remain internal-only.",
  [
    "Multi-stage Dockerfile: stage 1 trains (or copies approved artefacts), stage 2 slim runtime, non-root user, health check.",
    "Add financial-api and financial-data to the existing Node image build (same Dockerfile pattern as the other services).",
    "docker-compose.yml: append ml-service, financial-api and financial-data without publishing their ports; services reach each other by name.",
    "Helm: new Deployments + ClusterIP Services for the three services, readiness probes, resource limits, new URLs in the ConfigMap; values for dev/stag/prod. Existing templates' behaviour unchanged.",
    "Mirror in deploy/k8s legacy manifests; update Minikube/OrbStack runbooks.",
  ],
  ["Dockerfile, compose and Helm changes", "Updated deployment READMEs"],
  ["docker compose up gives a working end-to-end prediction", "helm lint and template pass; ml-service not reachable from outside the cluster"]));

children.push(...step(10, "Testing", { days: "2.5 days (written alongside Steps 2–9)", dep: "Each step as it completes" },
  "The specification lists specific data, feature, model and API tests, and the project currently has no automated tests at all.",
  [
    "Data tests (pytest): 32,424 rows, 24 columns, dtypes, allowed categories, no missing values, ZAR = USD × 16.27, loan consistency, DTI definition.",
    "Feature tests: hand-calculated examples for each engineered feature, including zero-expense handling.",
    "Model tests: artefact loads, prediction succeeds, probabilities sum to ≈ 1, tier = argmax, class order fixed.",
    "API tests: valid, invalid, missing field, wrong type, unknown category, model unavailable.",
    "Node tests for financial-api (validation, orchestration, recommendation rules, ML-failure branch) with mocked data and ML services; financial-data tests against a throw-away SQLite file.",
    "End-to-end tests for both activity-diagram branches: valid profile → assessment stored and displayed; invalid profile → errors → resubmit; ML down → prediction error → retry succeeds.",
    "Regression check: existing pages (login, dashboard, identity, debts, rehab, help, PDF) and existing tables behave exactly as before.",
    "Add a Python job to .github/workflows/ci.yml.",
  ],
  ["ml-service/tests/*, Node tests, CI update"],
  ["CI green on every push", "All spec §45 test cases covered"]));

children.push(...step(11, "Documentation and academic write-up", { days: "2 days", dep: "All previous steps" },
  "The ML component is assessed as much on how it is justified and disclosed as on whether it runs.",
  [
    "README: ML architecture, how to train, how to run, environment variables.",
    "Methodology: data audit, target design and circularity, preprocessing and leakage prevention, model comparison and selection, explainability method and its limits, recommendation rules.",
    "Limitations: synthetic, independently generated data; constructed target; SVM probability calibration; importance ≠ causation.",
    "Add the four UML diagrams (class, use case, activity, sequence) to docs/ and reference them as the design of the ML feature.",
    "Add new versions of the architecture and service-communication diagrams that show the three new services beside the existing ones (keep the originals).",
    "Tick off the specification §52 checklist with evidence links.",
  ],
  ["Updated README and docs/", "Completed §52 checklist"],
  ["An examiner can trace dataset → target → model → prediction → UI from the documents alone"]));

// ---------- decisions / risks ----------
children.push(
  h1("4. Decisions required"),
  table(["#", "Decision", "Owner", "Recommendation", "Needed by"], [
    ["D-0", "Option A (real labels) or Option B (constructed target); rubric thresholds and weights", "Supervisor", "Option B; calibrate on data so no tier < ~15 %", "Step 1"],
    ["D-1", "Sequence diagram shows PostgreSQL; FinAware uses SQLite", "Supervisor / owner", "Keep SQLite (no change to the current system) and note the diagram's database as the production target. Switching to Postgres changes the existing app and adds ~1.5 days", "Step 7"],
    ["D-2", "Model feature set", "Supervisor", "Only data in FinancialProfile + Debt (+ age, employment status); exclude gender, education, job title, loan term, loan type", "Step 1"],
    ["D-3", "Definition of riskScore", "Supervisor + developer", "100 × (0.5·P(Medium) + 1.0·P(High)); riskLevel = highest probability", "Step 6"],
    ["D-4", "Monthly debt repayment source (existing Debts has no monthly payment field)", "Developer", "Use existing Credit_Profile.monthly_obligations read-only; do not alter the Debts table", "Step 2"],
    ["D-5", "The existing dashboard risk badge (simulated, ID-suffix) stays; the new ML result may differ", "Supervisor / owner", "Keep both, label the new one 'ML Financial Risk Assessment', and explain in the write-up that the badge is legacy demo data", "Step 8"],
    ["D-6", "Include ablation models", "Developer", "Yes", "Step 3"],
  ], [700, 3000, 1600, 3000, 1338]),
  h1("5. Risks"),
  table(["Risk", "Impact", "Mitigation"], [
    ["Supervisor sign-off on the target is slow", "Blocks training (critical path)", "Submit Step 1 on day 1–2; build Steps 7–9 against a stub"],
    ["Near-perfect scores look suspicious", "Examiner questions validity", "Disclose circularity; present the ablation models"],
    ["Random, independent data gives meaningless demographic drivers", "Odd explanations", "Explain in limitations; exclude gender; drivers focus on financial indicators"],
    ["SVM training time (minutes) and probability calibration", "Slow iteration", "Calibrated SVC; train once per change; cache artefacts"],
    ["Two different risk levels shown for the same user (legacy badge vs ML)", "Examiner confusion", "Decision D-5: clear labelling and a note in the write-up"],
    ["Existing FinAware data does not match the dataset's shape (e.g. no loan term; different debt types)", "Mapped inputs differ from training data", "feature_mapping.md; restrict features per D-2; test with real FinAware users"],
    ["SQLite shared across services (diagram shows PostgreSQL)", "Concurrency limits under Kubernetes scale-out", "Keep replicas at 1 for the prototype; Postgres is a documented future step (D-1)"],
    ["Broken local npm", "Cannot build or verify", "Step 0 repair"],
  ], [3200, 2800, 3638]),
  h1("6. Definition of done"),
  p("A user enters financial information and FinAware returns, through the full chain, a risk tier, the Low / Medium / High probability distribution, the factors influencing the prediction and traceable rule-based recommendations — with the model, target and rule versions recorded:"),
  code("Financial input → Validation → Feature engineering → Preprocessing → ML model → Risk tier → Probabilities → Drivers → Recommendation rules → API → FinAware UI"),
);

// ================= APPENDICES: full handoff + data package reference =================
const HO = "/Users/kumbulani/Documents/school proj/finaware_main_project/developerhandoffpackagefolder";
const DICT = JSON.parse(fs.readFileSync(__dirname + "/dict.json", "utf8"));
const size = f => fs.statSync(`${HO}/${f}`).size.toLocaleString("en-ZA") + " B";

// small-font table for dense reference data
function tableS(headers, rows, widths) {
  const cellRuns = t => String(t).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s =>
    s.startsWith("**") ? new TextRun({ text: s.slice(2, -2), bold: true, size: 16 }) : new TextRun({ text: s, size: 16 }));
  const mk = (t, head, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: NAVY } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: { top: line, bottom: line, left: line, right: line },
    children: [new Paragraph({ children: head ? [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 16 })] : cellRuns(t) })]
  });
  return new Table({
    width: { size: widths.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, true, i)) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => mk(c, false, i)) }))]
  });
}
const listing = file => fs.readFileSync(`${HO}/${file}`, "utf8").replace(/\r/g, "").split("\n")
  .map(l => new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: GREY },
    children: [new TextRun({ text: l.length ? l : " ", font: "Consolas", size: 14 })] }));

children.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix A — Developer handoff package: full reference"),
  p("Every file in developerhandoffpackagefolder, with its contents described in full. Status column refers to section 2B.3. Verbatim source is in Appendix D."),
  h2("A.1 Package contents"),
  tableS(["File", "Size", "Purpose", "Plan status"], [
    ["README.md", size("README.md"), "Architecture summary, quick-start and test commands", "Merged"],
    ["requirements.txt", size("requirements.txt"), "Python dependencies (7 packages, version ranges)", "Used (updated)"],
    ["Dockerfile", size("Dockerfile"), "Container image for the FastAPI ML service", "Used (upgraded)"],
    ["config.py", size("config.py"), "Paths, column-name aliases, numeric and categorical column lists", "Used (fixed)"],
    ["preprocessing.py", size("preprocessing.py"), "Cleaning, feature engineering, risk-target construction, feature selection, sklearn preprocessor", "Split: rewritten / fixed / replaced / kept"],
    ["train.py", size("train.py"), "Trains and evaluates 4 classifiers, selects primary model, writes artefacts", "Used (extended)"],
    ["inference.py", size("inference.py"), "FinAwarePredictor class: loads bundle, predicts, assembles response", "Used (fixed)"],
    ["explainability.py", size("explainability.py"), "Local perturbation-based driver calculation", "Not used — replaced by SHAP"],
    ["recommendations.py", size("recommendations.py"), "Rule-based recommendation generator", "Ported to TypeScript"],
    ["api.py", size("api.py"), "FastAPI app: /health and /predict, Pydantic input model", "Used (fixed)"],
    ["sample_request.json", size("sample_request.json"), "Example /predict payload", "Used (rewritten)"],
    ["node_integration_example.ts", size("node_integration_example.ts"), "Example Node fetch call + Express route pattern", "Reference only"],
  ], [2300, 900, 4400, 2038]),

  h2("A.2 README.md"),
  p("**Stated scope:** preprocessing, feature engineering, risk-tier target creation, four classifiers, evaluation, probabilities, explainability, rule-based recommendations, FastAPI inference, Node/Express integration and Kubernetes deployment."),
  p("**Stated architecture:** Next.js/React → Node/Express financial microservice → Python FastAPI ML service → saved scikit-learn model → prediction + probabilities + explainability + recommendations → Node → frontend."),
  p("**Quick start (as written; assumes a folder named finaware-ml and data/ inside it):**"),
  code("cd finaware-ml"), code("python3 -m venv .venv && source .venv/bin/activate"),
  code("pip install -r requirements.txt"), code("python train.py --data data/personal_finance_zar.csv"),
  code("uvicorn api:app --host 0.0.0.0 --port 8001"),
  p("**Test commands:** curl http://localhost:8001/health and curl -X POST http://localhost:8001/predict with sample_request.json."),
  p("**Statement on the target:** the source dataset has no official risk_tier; the package derives an application-defined financial-health target and refers to docs/risk_tier_methodology.md — **that file is not included in the package.**"),
  p("**Gaps:** the README claims Kubernetes deployment, but no Kubernetes or Helm files are in the package; the folder is not named finaware-ml and contains no data/ directory."),

  h2("A.3 requirements.txt"),
  tableS(["Package", "Allowed versions", "Used for", "Plan"], [
    ["pandas", ">=2.2, <3", "Data loading and transformation", "Pin exact"],
    ["numpy", ">=1.26, <3", "Numerics", "Pin exact"],
    ["scikit-learn", ">=1.5, <1.8", "Pipelines, 4 models, metrics", "Pin exact (1.9 deprecates SVC probability=True)"],
    ["joblib", ">=1.4, <2", "Saving/loading the model bundle", "Pin exact"],
    ["fastapi", ">=0.115, <1", "HTTP API", "Pin exact"],
    ["uvicorn[standard]", ">=0.30, <1", "ASGI server", "Pin exact"],
    ["pydantic", ">=2.7, <3", "Request validation", "Pin exact"],
    ["(missing)", "—", "shap, pytest, httpx", "Add"],
  ], [2000, 1700, 3000, 2938]),

  h2("A.4 Dockerfile"),
  tableS(["Setting", "Value in handoff", "Plan"], [
    ["Base image", "python:3.12-slim", "Keep"],
    ["Working directory", "/app", "Keep"],
    ["Dependency install", "pip install --no-cache-dir -r requirements.txt", "Keep"],
    ["Source copy", "COPY . . (whole folder)", "Copy only ml/, api/ and approved artefacts; add .dockerignore"],
    ["Port", "EXPOSE 8001", "8000"],
    ["Command", "uvicorn api:app --host 0.0.0.0 --port 8001", "Port 8000"],
    ["User", "root (default)", "Non-root user"],
    ["Model", "Not built or copied — /predict fails until train.py has been run", "Multi-stage build bakes in the approved model"],
    ["Health check", "None", "Add (HEALTHCHECK on /health/ready)"],
  ], [2200, 4300, 3138]),

  h2("A.5 config.py"),
  p("**Paths:** BASE_DIR = folder of config.py; ARTIFACT_DIR = BASE_DIR/artifacts."),
  p("**ALIASES** — maps a canonical column name to accepted input names (column names are normalised to lower_snake_case first):"),
  tableS(["Canonical name", "Accepted aliases", "Matches dataset column?"], [
    ["age", "age", "Yes"],
    ["gender", "gender, sex", "Yes"],
    ["education_level", "education_level, education", "Yes"],
    ["employment_status", "employment_status, employment", "Yes"],
    ["job_title", "job_title, occupation", "Yes"],
    ["monthly_income_zar", "monthly_income_zar, monthly_income, income", "Yes"],
    ["monthly_expenses_zar", "monthly_expenses_zar, monthly_expenses, expenses", "Yes"],
    ["savings_zar", "savings_zar, savings", "Yes"],
    ["loan_status", "loan_status, has_loan, loan", "Renames has_loan → loan_status"],
    ["loan_type", "loan_type", "Yes"],
    ["loan_amount_zar", "loan_amount_zar, loan_amount", "Yes"],
    ["loan_term_months", "loan_term_months, loan_term", "Yes"],
    ["monthly_emi_zar", "monthly_emi_zar, monthly_emi, emi", "Yes"],
    ["interest_rate", "interest_rate, interest_rate_percent", "**No — dataset uses loan_interest_rate_pct (defect D1)**"],
    ["debt_to_income_ratio", "debt_to_income_ratio, debt_to_income, dti", "Yes"],
    ["credit_score", "credit_score", "Yes"],
    ["savings_to_income_ratio", "savings_to_income_ratio, savings_to_income, savings_ratio", "Yes"],
    ["region", "region, province", "**No — removed from the cleaned dataset**"],
    ["record_date", "record_date, date", "Yes (excluded from features)"],
  ], [2600, 3900, 3138]),
  p("**NUMERIC:** age, monthly_income_zar, monthly_expenses_zar, savings_zar, loan_amount_zar, loan_term_months, monthly_emi_zar, interest_rate, debt_to_income_ratio, credit_score, savings_to_income_ratio."),
  p("**CATEGORICAL:** gender, education_level, employment_status, job_title, loan_status, loan_type, region."),

  h2("A.6 preprocessing.py"),
  h3("norm(s)"), p("Lower-cases a column name and replaces any run of non-alphanumeric characters with a single underscore."),
  h3("clean(df)"),
  b("Normalises column names and renames aliases to canonical names (A.5)."),
  b("Numeric columns: strips $, R, commas, % and spaces, then converts to numbers; unparseable values become blank (NaN)."),
  b("Negative income, expenses, savings, loan amount, loan term or EMI → blanked."),
  b("interest_rate outside 0–100 → blanked (never fires on the real data because of D1)."),
  b("credit_score outside 300–850 → blanked."),
  b("Drops exact duplicate rows and resets the index. **None of these changes are logged (defect D8).**"),
  h3("engineer(df) — engineered features"),
  tableS(["Feature", "Formula in handoff", "Issue / plan"], [
    ["expense_to_income_ratio", "monthly_expenses_zar ÷ monthly_income_zar (income 0 → blank)", "Keep"],
    ["savings_to_income_ratio", "savings_zar ÷ monthly_income_zar — **overwrites the dataset field**", "Dataset field is savings ÷ annual income clipped 0.1–10 (D3). Keep the dataset definition"],
    ["debt_zar", "loan_amount_zar (missing → 0)", "Duplicate of loan_amount_zar (D7) — drop"],
    ["emi_to_income_ratio", "monthly_emi_zar ÷ monthly_income_zar", "Duplicate of debt_to_income_ratio (D7) — drop"],
    ["debt_to_income_ratio", "Only if missing: debt_zar ÷ monthly income", "Wrong definition — dataset uses EMI ÷ income (D2)"],
    ["disposable_income_zar", "monthly_income_zar − monthly_expenses_zar", "Keep"],
    ["financial_buffer_months", "savings_zar ÷ monthly_expenses_zar (expenses 0 → blank)", "Keep as savings_coverage_months with documented zero handling"],
    ["loan_burden_zar", "monthly_emi_zar (missing → 0)", "Duplicate of monthly_emi_zar (D7) — drop"],
    ["(all)", "±infinity replaced with blank", "Replace with explicit, documented handling"],
    ["(not in handoff)", "monthly_surplus_after_emi_zar, loan_to_income_ratio", "Add (spec §13.5, §13.6)"],
  ], [2400, 3900, 3338]),
  h3("target(df) — handoff risk target (not used)"),
  p("Four component scores, each 0–100 (higher = riskier). A missing value scores a neutral 50."),
  tableS(["Component", "Formula (value v as ratio; clipped 0–100)", "Weight"], [
    ["Debt-to-income", "(max(0, v×100) − 20) ÷ 40 × 100 → 0 at ≤20 %, 100 at ≥60 %", "0.35"],
    ["Savings", "(20 − v×100) ÷ 20 × 100 on savings_to_income_ratio → 0 at ≥0.20, 100 at 0", "0.25"],
    ["Expense-to-income", "(max(0, v×100) − 50) ÷ 50 × 100 → 0 at ≤50 %, 100 at ≥100 %", "0.20"],
    ["Credit score", "(750 − v) ÷ 450 × 100 → 0 at ≥750, 100 at ≤300", "0.20"],
  ], [2000, 6138, 1500]),
  p("risk_score = 0.35·DTI + 0.25·Savings + 0.20·Expense + 0.20·Credit, clipped 0–100. Tiers: Low < 33.33 ≤ Medium < 66.67 ≤ High. Returns the data with risk_score and risk_tier plus a count/percentage summary."),
  p("**Result on the real data:** Low 21,707 (66.95 %), Medium 10,543 (32.52 %), High 174 (0.54 %). Because savings_to_income_ratio is overwritten with a monthly ratio (median ≈ 60), the savings component is almost always 0."),
  h3("features(df)"),
  p("Excludes risk_score, risk_tier, record_date, date, id, customer_id, user_id. Keeps any column listed in NUMERIC or CATEGORICAL, then adds the engineered columns. Resulting 22 features on the real data: age, gender, education_level, employment_status, job_title, loan_status, loan_type, loan_term_months, debt_to_income_ratio, credit_score, savings_to_income_ratio, monthly_income_zar, monthly_expenses_zar, savings_zar, loan_amount_zar, monthly_emi_zar, expense_to_income_ratio, debt_zar, emi_to_income_ratio, disposable_income_zar, financial_buffer_months, loan_burden_zar. **loan_interest_rate_pct is missing (D1).**"),
  h3("preprocessor(X)"),
  b("Numeric columns (detected by dtype): SimpleImputer(median) → StandardScaler."),
  b("Categorical columns: SimpleImputer(most_frequent) → OneHotEncoder(handle_unknown='ignore', dense output)."),
  b("ColumnTransformer with remainder='drop'. Imputers are the cause of defect D10 at inference time."),

  h2("A.7 train.py"),
  p("**Command line:** --data (required path to CSV); --test-size (default 0.2)."),
  p("**Flow:** read CSV → clean → engineer → target → features → stratified train/test split (random_state 42) → for each model: build Pipeline(preprocessor, model), fit, evaluate on test set, 5-fold StratifiedKFold (shuffle, seed 42) cross-validated macro F1 on the training set."),
  tableS(["Model", "Hyper-parameters"], [
    ["random_forest", "RandomForestClassifier(n_estimators=400, min_samples_leaf=2, class_weight='balanced', random_state=42, n_jobs=-1)"],
    ["gradient_boosting", "GradientBoostingClassifier(n_estimators=250, learning_rate=0.05, max_depth=3, random_state=42)"],
    ["knn", "KNeighborsClassifier(n_neighbors=15, weights='distance')"],
    ["svm", "SVC(kernel='rbf', C=2.0, gamma='scale', probability=True, class_weight='balanced', random_state=42)"],
  ], [2000, 7638]),
  p("**Metrics per model:** accuracy, macro precision, macro recall, macro F1, full classification report, confusion matrix, macro one-vs-rest ROC AUC, cross-validated macro F1 mean and standard deviation. **Not reported:** weighted F1 as a headline figure, confusion-matrix images."),
  p("**Selection rule:** highest test macro F1, ties broken by accuracy. No written rationale."),
  tableS(["Artefact written to artifacts/", "Content"], [
    ["finaware_model.joblib", "Bundle: selected pipeline, **all four pipelines**, primary model name, feature columns, risk labels [Low, Medium, High] (28 MB)"],
    ["model_metrics.json", "Metrics for all four models"],
    ["feature_schema.json", "List of feature names only (no types, categories or ranges)"],
    ["risk_target_summary.json", "Tier counts and percentages"],
    ["evaluation_report.json", "Records before/after cleaning, primary model, all metrics"],
    ["training_dataset_with_risk_tier.csv", "Full engineered dataset with risk_score and risk_tier (8.6 MB)"],
  ], [3200, 6438]),
  p("**Observed on the real data (5 min 33 s):** Gradient Boosting accuracy 0.995 / macro F1 0.965; Random Forest 0.988 / 0.951; SVM 0.981 / 0.927; KNN 0.955 / 0.634 (High recall 0.00). Selected: gradient_boosting. scikit-learn 1.9 prints a deprecation warning for SVC(probability=True)."),

  h2("A.8 inference.py"),
  p("FinAwarePredictor(path) loads the joblib bundle. predict(payload) runs clean → engineer on a one-row DataFrame, selects the feature columns and returns:"),
  tableS(["Response field", "Content"], [
    ["risk_tier", "model.predict()"],
    ["confidence", "Highest probability"],
    ["probabilities", "{class: probability} zipped with model.classes_ (alphabetical: High, Low, Medium)"],
    ["financial_indicators", "debt_to_income_ratio, expense_to_income_ratio, savings_to_income_ratio, disposable_income_zar, financial_buffer_months, emi_to_income_ratio"],
    ["explainability", "Output of explain_prediction (A.9)"],
    ["recommendations", "Output of generate_recommendations (A.10)"],
  ], [2600, 7038]),

  h2("A.9 explainability.py (replaced)"),
  b("Takes the predicted class and its probability."),
  b("For each feature: sets it to 0 (numeric) or 'Unknown' (categorical), re-predicts, and records the change in the predicted class's probability."),
  b("Direction text: 'increases predicted risk' if the change is positive — but this is measured against whichever class was predicted, so for a Low prediction it is inverted (D5)."),
  b("Returns method 'local_feature_perturbation', predicted class, probability and the top 5 features by absolute change."),

  h2("A.10 recommendations.py (ported to TypeScript)"),
  p("Recomputes ratios from raw values (expense ratio, savings ratio, EMI ratio; income 0 → expense ratio 1, others 0). Uses the supplied debt_to_income_ratio or falls back to loan ÷ income."),
  tableS(["Priority", "Category", "Rule", "Recommendation text"], [
    ["High", "Expenses", "expense_to_income_ratio > 0.80", "Review discretionary spending and create a monthly expense-reduction plan."],
    ["Critical", "Cash Flow", "expense_to_income_ratio > 1.00", "Monthly expenses exceed income; prioritise immediate cash-flow stabilisation."],
    ["High", "Savings", "savings_to_income_ratio < 0.10", "Increase the monthly savings allocation, starting with a manageable fixed amount."],
    ["High", "Debt", "debt_to_income_ratio > 0.40", "Prioritise reducing high-cost debt and avoid unnecessary new debt."],
    ["High", "Debt", "monthly EMI ÷ income > 0.25", "Review monthly debt repayments and assess whether repayment restructuring may be appropriate."],
    ["High", "Credit", "credit_score < 580", "Prioritise consistent on-time payments and reduce outstanding balances where possible."],
    ["= tier", "Financial Health", "risk_tier == High", "Create a short-term financial stabilisation plan covering cash flow, debt and emergency savings."],
    ["= tier", "Financial Health", "risk_tier == Medium", "Focus on reducing debt burden and increasing the financial buffer before taking on new obligations."],
    ["= tier", "Financial Health", "risk_tier == Low", "Maintain healthy savings, manageable debt and sustainable spending patterns."],
  ], [1000, 1500, 2600, 4538]),
  p("Sorted Critical → High → Medium → Low, capped at 8. Output fields: priority, category, rule, recommendation. **Not driven by the model's drivers** (spec §32 requires driver-based rules) and no rules version."),

  h2("A.11 api.py"),
  tableS(["Endpoint", "Behaviour"], [
    ["GET /health", "Lazily loads the model; returns {status: ok, service: finaware-ml, model: <primary name>} or HTTP 503 with the error text"],
    ["POST /predict", "Validates FinancialInput, lazily loads the model, returns FinAwarePredictor.predict(); any exception → HTTP 400 'Prediction failed: …' (D9)"],
  ], [2200, 7438]),
  p("Model path from environment variable FINAWARE_MODEL_PATH (default artifacts/finaware_model.joblib). App title 'FinAware ML Service', version 1.0.0."),
  tableS(["Input field", "Type", "Required", "Constraint"], [
    ["monthly_income_zar", "number", "Yes", "> 0"],
    ["monthly_expenses_zar", "number", "Yes", "≥ 0"],
    ["savings_zar", "number", "Yes", "≥ 0"],
    ["age", "number", "No", "—"],
    ["gender, education_level, employment_status, job_title", "text", "No", "Any value accepted"],
    ["loan_status, loan_type, region", "text", "No", "Any value accepted"],
    ["loan_amount_zar", "number", "No (default 0)", "≥ 0"],
    ["loan_term_months", "number", "No", "≥ 0"],
    ["monthly_emi_zar", "number", "No (default 0)", "≥ 0"],
    ["interest_rate", "number", "No", "≥ 0"],
    ["debt_to_income_ratio", "number", "No", "≥ 0"],
    ["credit_score", "number", "No", "300–850"],
    ["savings_to_income_ratio", "number", "No", "≥ −1"],
  ], [3600, 1200, 1800, 3038]),
  p("**Verified:** /health 200; /predict 200 for the sample; negative income → 422. A request with only income, expenses and savings still returns ≈ 99.99 % Low because the rest are imputed (D10)."),

  h2("A.12 sample_request.json"),
  tableS(["Field", "Value", "Valid for the dataset?"], [
    ["age", "31", "Yes"], ["gender", "Female", "Yes"],
    ["education_level", "Bachelor's Degree", "**No — dataset uses 'Bachelor'**"],
    ["employment_status", "Employed", "Yes"],
    ["job_title", "Software Developer", "**No — not one of the 9 job titles**"],
    ["monthly_income_zar", "42000", "Yes"], ["monthly_expenses_zar", "22000", "Yes"], ["savings_zar", "8000", "Yes (below dataset minimum 10,347)"],
    ["loan_status", "Active", "**No — dataset uses has_loan Yes/No**"],
    ["loan_type", "Personal", "**No — dataset: Business, Car, Education, Home, No Loan**"],
    ["loan_amount_zar", "100000", "Yes"], ["loan_term_months", "48", "Yes"], ["monthly_emi_zar", "4500", "Yes"],
    ["interest_rate", "12.5", "**Ignored (D1)**"], ["credit_score", "680", "Yes"],
    ["region", "Gauteng", "**No — field removed from dataset**"],
  ], [2600, 2600, 4438]),
  p("Result when run: Low, 99.998 %; debt_to_income_ratio computed as 2.38 (loan ÷ income) instead of 0.107 (EMI ÷ income), triggering a 'DTI > 0.40' recommendation beside a Low result."),

  h2("A.13 node_integration_example.ts"),
  b("getFinancialRiskPrediction(financialData): POSTs JSON to ${ML_SERVICE_URL}/predict (default http://finaware-ml:8001) and throws on a non-2xx response."),
  b("Commented Express route pattern: router.post('/financial/risk') returning the prediction, or HTTP 500 'Unable to calculate financial risk'."),
  b("No timeout, no validation, no persistence. The plan uses FinAware's existing callServiceJson helper in the new Financial API Service instead."),

  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix B — Data package: full reference"),
  h2("B.1 Files"),
  tableS(["File", "Size", "Rows × columns", "SHA-256", "Use"], [
    ["personal_finance_zar.csv", "5,339,919 B", "32,424 × 24", "aa0aeae913049a68c92754cf44e9fd92371a66e0e59c5e2ed54f30fc941bce53", "Training dataset"],
    ["synthetic_personal_finance_dataset.csv", "4,193,916 B", "32,424 × 20", "b54172efe63e9c32bc0e1281ee22a79d9ae0def21786b1cc75ffb252539f7012", "Original USD source — provenance only"],
    ["data_dictionary.xlsx", "10,112 B", "3 sheets", "a1dfd356005bdb70c07e9167455c953665581cbb46ec11e43e3e7c1cc60086b9", "Authoritative field descriptions"],
  ], [2300, 1100, 1200, 3638, 1400]),
  p("Source: Downloads/redeveloperhandoffpackagefolder (1) (identical copies in both redeveloperhandoffpackagefolder zips)."),
  h2("B.2 Dictionary sheet 'Dataset Summary'"),
  tableS(["Property", "Value"], DICT["Dataset Summary"], [3200, 6438]),
  h2("B.3 Dictionary sheet 'Data Dictionary' — all 24 fields"),
  tableS(["Column", "Description", "Type / unit", "Example", "Range / values", "Origin & cleaning", "ML relevance"],
    DICT["Data Dictionary"].map(r => [r[0], r[1], r[3] ? `${r[2]} (${r[3]})` : r[2], r[4], r[5], r[7] ? `${r[6]}: ${r[7]}` : r[6], r[8]]),
    [1450, 1700, 1050, 1000, 1500, 1500, 1438]),
  gap(),
  p("**Review notes on the dictionary:** it does not state that savings_to_income_ratio uses **annual** income and is clipped to 0.1–10; it does describe debt_to_income_ratio correctly as EMI ÷ monthly income; it flags gender as needing an appropriateness assessment."),
  h2("B.4 Dictionary sheet 'Category Breakdown'"),
  tableS(["Column", "Category", "Count", "Percentage"], DICT["Category Breakdown"], [3000, 2800, 1900, 1938]),
  h2("B.5 Original source file vs cleaned file"),
  tableS(["Aspect", "synthetic_personal_finance_dataset.csv", "personal_finance_zar.csv"], [
    ["Columns", "20: " + DICT["orig_cols"].join(", "), "24: the same minus region, plus 5 ZAR columns"],
    ["region", "Present: " + Object.entries(DICT["orig_region"]).map(([k, v]) => `${k} ${v}`).join(", ") + " (global regions, not SA provinces)", "Removed"],
    ["loan_type when no loan", "Blank (19,429 rows)", "'No Loan'"],
    ["Currency", "USD only", "USD kept + ZAR added (× 16.27, 2 decimals)"],
    ["Rows / duplicates / other missing", "32,424 / 0 / 0", "32,424 / 0 / 0"],
  ], [2000, 4300, 3338]),
  h2("B.6 Additional verified facts (not in the dictionary)"),
  b("All five ZAR columns equal USD × 16.27 exactly; has_loan = No always has zero loan amount, term, EMI and rate; has_loan = Yes never has a zero loan amount."),
  b("debt_to_income_ratio = monthly EMI ÷ monthly income (max difference 0.005)."),
  b("savings_to_income_ratio = savings ÷ (monthly income × 12), clipped to 0.1–10."),
  b("No row has expenses above income; 33.1 % of all rows (82.5 % of borrowers) have a negative surplus after EMI; 59.7 % of borrowers have EMI above income."),
  b("Median savings cover 101 months of expenses."),
  b("Credit score correlation with every other numeric field is between −0.01 and +0.01; job_title is independent of employment_status; median income is ≈ R65,000 for every employment status."),

  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix C — Traceability to the ML specification"),
  callout("The governing rule (specification §17–20)", [
    "The dataset does **not** contain a genuine Low / Medium / High risk target. The developer must **not quietly invent one**. The target methodology must be **agreed with the supervisor and documented before supervised training** (Step 1), labelled as a constructed/synthetic target, versioned (risk_target_version 1.0), and its circularity disclosed. Everything else may be built around the defined contract in the meantime.",
  ]),
  gap(),
  h2("C.1 The specification's 14 starting steps → this plan"),
  tableS(["#", "Specification step", "Covered in", "Note"], [
    ["1", "Review the existing FinAware build", "Sections 2, 2A, 2B", "Done in this review"],
    ["2", "Integrate personal_finance_zar.csv", "Step 0", "ml-service/data/ with checksums"],
    ["3", "Review the data dictionary", "Step 2 (data audit); Appendix B", "Reviewed; savings ratio definition gap found"],
    ["4", "Implement the preprocessing pipeline", "Step 2", "Fit on training data only"],
    ["5", "Implement the feature engineering", "Step 2", "Spec §13 features + zero handling"],
    ["6", "Confirm the risk_tier target methodology", "**Step 1 — gate before Step 3**", "Supervisor sign-off; no invented target"],
    ["7", "Train the four required algorithms", "Step 3", "Only after Step 1 sign-off"],
    ["8", "Evaluate the models", "Step 3", "All §22 metrics + ablation"],
    ["9", "Implement probability output", "Steps 3 and 6", "Class order controlled; sums ≈ 1"],
    ["10", "Implement explainability", "Step 4", "SHAP per user + permutation importance"],
    ["11", "Implement the rule-based recommendation engine", "Step 5", "In the Financial API Service (sequence diagram)"],
    ["12", "Connect the ML service to the FinAware backend", "Steps 6 and 7", "New Financial API + Data services (additive)"],
    ["13", "Update the frontend (risk, probability, drivers, recommendations)", "Step 8", "New pages; existing pages untouched"],
    ["14", "Test the complete end-to-end flow", "Step 10", "Includes both activity-diagram error branches"],
  ], [500, 3500, 2600, 3038]),
  p("Step 1 is listed first in this plan because it has the longest lead time (supervisor turnaround). It runs in parallel with the specification's steps 1–5 and must be closed before step 7."),
  h2("C.2 Specification sections → this plan"),
  tableS(["Spec §", "Requirement", "Where addressed"], [
    ["1", "ML is the core analytical technology; not a chatbot", "Whole plan; new flow has no OpenAI"],
    ["2", "Extend, don't rebuild; ML as a separate analytical service", "Scope (additive only); ml-service"],
    ["3–4", "Dataset, dictionary as authority, ZAR fields", "Step 0, Step 2, Appendix B"],
    ["5", "Data-quality checks; no silent alteration", "Step 2 data_audit.py → reports/data_audit.md"],
    ["6", "user_id not a feature", "Step 2 exclusions"],
    ["7", "Preserve 'No Loan'", "Step 2; verified in B.6"],
    ["8–11", "Reproducible pipeline; 80/20 stratified, seed 42; one-hot with unknown handling; scaling", "Step 2"],
    ["12", "Retain large values; document any outlier treatment", "Step 2 (no removal)"],
    ["13", "Engineered features", "Step 2 (emi_to_income_ratio omitted as duplicate of DTI, per §13.3)"],
    ["14", "Division-by-zero strategy", "Step 2"],
    ["15–16", "Baseline features and exclusions", "Step 1 (Decision D-2) and Step 2"],
    ["17–20", "Target: Option A/B, documented rubric, version, circularity", "**Step 1**"],
    ["21–23", "Four models, comparable evaluation, evidence-based selection", "Step 3"],
    ["24–25, 45b", "Probabilities, predict_proba, class order, ≈ 1.0", "Steps 3 and 6"],
    ["26–29", "Explainability, no invented importance, no causal claims, display names", "Step 4"],
    ["30–33", "Deterministic, risk- and driver-based, traceable recommendations", "Step 5"],
    ["34–35", "POST /predict and response structure", "Step 6"],
    ["36–38", "Results, drivers and recommendations UI", "Step 8"],
    ["39", "Prediction, driver and recommendation tables", "Step 7 (named per the class diagram — see C.3)"],
    ["40", "pipeline.joblib, feature_schema.json, model_metadata.json", "Step 2"],
    ["41", "Containerised internal ml-service:8000", "Step 9"],
    ["43", "Structured errors", "Step 6"],
    ["44", "Security: no exposed models/secrets; backend validation", "Steps 6, 7, 9"],
    ["45", "Data, feature, model, API tests", "Step 10"],
    ["46–47", "Model and recommendation versioning", "Steps 2, 5, 7"],
    ["48", "OpenAI not the primary recommendation mechanism", "New flow is rule-based; see C.3"],
    ["50", "End-to-end demonstration and academic positioning", "Steps 8, 10, 11"],
    ["51", "Hand-back folder structure", "Section 2B.5 (adapted: ml-service/)"],
    ["52–53", "Final checklist and definition of done", "C.4 and section 6"],
  ], [1100, 4600, 3938]),
  h2("C.3 Where the plan differs from the specification (for supervisor approval)"),
  tableS(["Specification says", "Plan does", "Why"], [
    ["§48: remove the OpenAI recommendation call", "New Assess Financial Risk flow uses only rule-based recommendations; the existing Rehab page keeps its OpenAI feature untouched", "Instruction: do not change the existing system. §48 is met because OpenAI is not the mechanism for the ML feature"],
    ["§39 table names FinancialRiskPrediction / FinancialRiskDriver / FinancialRecommendation", "RiskAssessment / RiskDriver / Recommendation with the spec's fields", "Names follow the supplied class diagram"],
    ["§35 field riskTier", "riskLevel (plus riskScore)", "Class and sequence diagrams use riskLevel and riskScore"],
    ["§30, §35: recommendations in the ML response", "ML service returns prediction and drivers; the Financial API Service generates recommendations", "Sequence diagram places 'Generate Recommendation' in the Financial API Service"],
    ["§10, §15, §34: gender, education, job title, loan term, loan type as inputs", "Excluded (Decision D-2)", "Not in the class diagram's data model; no signal in the data; gender appropriateness flagged by the dictionary"],
    ["§13.4: savings_to_income_ratio = savings ÷ monthly income", "Keep the dataset's field as defined (savings ÷ annual income, clipped 0.1–10)", "§13.4 also says to use the documented existing field; the data shows the annual definition"],
    ["§36: the current financial form feeds the ML service", "New Financial Profile page feeds it; existing forms unchanged", "Additive-only instruction; matches the activity diagram"],
    ["Diagram: PostgreSQL", "Existing SQLite (Decision D-1)", "Additive-only instruction"],
  ], [3100, 3300, 3238]),
  h2("C.4 Specification §52 checklist → step"),
  tableS(["Checklist group", "Items", "Step"], [
    ["Data", "Dataset integrated; 32,424 records verified; dictionary reviewed; types; missing; duplicates; ZAR used; USD excluded", "0, 2"],
    ["Target", "Defined; Low/Medium/High documented; methodology documented; class distribution; leakage assessed", "1"],
    ["Features", "Engineering; ratios validated; division by zero; duplicates removed; schema documented", "2"],
    ["Preprocessing", "Split; stratification; encoding; scaling; no leakage; reusable pipeline", "2"],
    ["Models", "RF, GB, KNN, SVM; all evaluated; confusion matrices; accuracy, precision, recall, F1, macro F1; final model documented", "3"],
    ["Prediction", "Tier; Low/Medium/High probabilities; validated; model version", "3, 6"],
    ["Explainability", "Top drivers; readable labels; method per model; shown in UI; no causal claims", "4, 8"],
    ["Recommendations", "Rule engine; risk rules; driver rules; traceable; no OpenAI in generation", "5"],
    ["Backend", "ML endpoint; validation; errors; Node integration; persistence", "6, 7"],
    ["Frontend", "Tier; distribution; drivers; recommendations; plain terms; loading/error states", "8"],
    ["Infrastructure", "Containerised; Kubernetes; networking; env documented; artefacts included", "9"],
    ["Testing", "Data, feature, model, API, end-to-end", "10"],
  ], [1800, 6300, 1538]),

  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix D — Verbatim source of the handoff package"),
  p("Exact contents of each file as supplied, for reference. Long lines wrap."),
  ...["README.md", "requirements.txt", "Dockerfile", "config.py", "preprocessing.py", "train.py", "inference.py",
    "explainability.py", "recommendations.py", "api.py", "sample_request.json", "node_integration_example.ts"]
    .flatMap(f => [h2(`D · ${f}`), ...listing(f), gap()]),
);

// ================= Appendix E: UML diagrams =================
const REPO = "/Users/kumbulani/Documents/school proj/finaware_main_project";
const img = (file, w, h) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [new ImageRun({ type: "png", data: fs.readFileSync(`${REPO}/docs/uml/${file}`), transformation: { width: w, height: h } })] });
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix E — UML diagrams (design authority) with text transcriptions"),
  p("Image files: docs/uml/01-class-diagram.png, 02-use-case-diagram.png, 03-activity-diagram.png, 04-sequence-diagram.png. Each image is followed by a full text transcription so the content is readable without the picture."),

  h2("E.1 Class diagram"),
  img("01-class-diagram.png", 460, 505),
  tableS(["Class", "Attributes", "Operations"], [
    ["User", "-userId: UUID; -firstName: String; -lastName: String; -email: String; -passwordHash: String", "+register(): void; +login(): boolean; +updateProfile(): void"],
    ["Debt", "-debtId: UUID; -debtType: String; -outstandingBalance: Decimal; -monthlyPayment: Decimal; -interestRate: Decimal", "+calculateDebtBalance(): Decimal; +calculateMonthlyDebtObligation(): Decimal"],
    ["FinancialProfile", "-profileId: UUID; -monthlyIncome: Decimal; -monthlyExpenses: Decimal; -savings: Decimal; -creditScore: Integer; -financialGoal: String", "+calculateDebtToIncomeRatio(): Decimal; +calculateSavingsRatio(): Decimal; +updateFinancialProfile(): void"],
    ["ML Prediction Service", "-modelVersion: String; -modelName: String", "+preprocessData(): void; +predictRisk(): RiskAssessment"],
    ["RiskAssessment", "-assessmentId: UUID; -riskLevel: String; -riskScore: Decimal; -predictionDate: DateTime; -modelVersion: String", "+calculateRiskScore(): Decimal; +getRiskLevel(): String"],
    ["Recommendation", "-recommendationId: UUID; -recommendationType: String; -recommendationText: String; -createdDate: DateTime", "+generateRecommendation(): void"],
  ], [1900, 4400, 3338]),
  p("**Relationships:** User 1 — 0..* Debt (aggregation). User 1 — 1 FinancialProfile (composition). ML Prediction Service uses debt data (→ Debt) and uses financial data (→ FinancialProfile), and produces RiskAssessment. FinancialProfile 1 — 0..* RiskAssessment. RiskAssessment 1 — 0..* Recommendation."),

  h2("E.2 Use-case diagram"),
  img("02-use-case-diagram.png", 520, 294),
  p("**System boundary:** FinAware System. **Actors:** User (primary); ML Prediction Service (secondary)."),
  b("User → Register Account; Login; Manage Financial Profile; Manage Debt; Generate Recommendation; View Financial Dashboard; Assess Financial Risk; View Risk Assessment."),
  b("Generate Recommendation «extend» Assess Financial Risk."),
  b("View Financial Dashboard «include» View Risk Assessment."),
  b("Assess Financial Risk «include» Store Risk Assessment; «include» Preprocess Financial Data; «include» Generate Risk Prediction."),
  b("ML Prediction Service → Generate Risk Prediction."),

  h2("E.3 Activity diagram — FinAware: Assess Financial Risk"),
  img("03-activity-diagram.png", 360, 567),
  n("Start → User logs into FinAware → Open Financial Dashboard → Enter or update financial information → Validate financial information.", "act"),
  n("Decision 'Is financial data valid?' — **No:** Display validation errors → User corrects financial information → Resubmit financial information → (to the final merge).", "act"),
  n("**Yes:** User requests financial risk assessment → Retrieve FinancialProfile and Debt data → Prepare financial data → Apply preprocessing rules → Generate ML features → Send features to ML Prediction Service → Generate risk prediction.", "act"),
  n("Decision 'Prediction successful?' — **Yes:** Create RiskAssessment → Store RiskAssessment → Generate Recommendation → Display risk score, risk level and recommendation.", "act"),
  n("**No:** Display prediction error → Allow User to retry assessment.", "act"),
  n("Both prediction branches merge, then merge with the validation branch → End.", "act"),

  h2("E.4 Sequence diagram — FinAware: Assess Financial Risk"),
  img("04-sequence-diagram.png", 620, 464),
  p("**Participants (left to right):** User; Financial Web Interface; Financial API Service; Financial Data Service; PostgreSQL Database; ML Prediction Service."),
  tableS(["#", "From → To", "Message"], [
    ["1", "User → Financial Web Interface", "Enter financial information"],
    ["2", "Web Interface → Financial API Service", "Submit financial information"],
    ["3", "Financial API Service → itself", "Validate financial information"],
    ["4", "Financial API Service → Web Interface", "Validation successful (return)"],
    ["5", "User → Web Interface", "Request risk assessment"],
    ["6", "Web Interface → Financial API Service", "POST /risk-assessment"],
    ["7", "Financial API Service → Financial Data Service", "Retrieve FinancialProfile and Debt"],
    ["8", "Financial Data Service → Database", "Query FinancialProfile"],
    ["9", "Financial Data Service → Database", "Query Debt"],
    ["10", "Database → Financial Data Service", "Financial data (return)"],
    ["11", "Financial Data Service → Financial API Service", "FinancialProfile and Debt data (return)"],
    ["12", "Financial API Service → ML Prediction Service", "Send financial features"],
    ["13", "ML Prediction Service → itself", "Apply preprocessing rules"],
    ["14", "ML Prediction Service → itself", "Generate ML features"],
    ["15", "ML Prediction Service → itself", "Generate risk prediction"],
    ["16", "ML Prediction Service → Financial API Service", "Return risk score and risk level"],
    ["17", "Financial API Service → Financial Data Service", "Create RiskAssessment"],
    ["18", "Financial Data Service → Database", "INSERT RiskAssessment"],
    ["19", "Database → Financial Data Service", "Assessment stored (return)"],
    ["20", "Financial Data Service → Financial API Service", "RiskAssessment created (return)"],
    ["21", "Financial API Service → itself", "Generate Recommendation"],
    ["22", "Financial API Service → Web Interface", "Return risk assessment and recommendation"],
    ["23", "Web Interface → User", "Display risk score, risk level and recommendation"],
  ], [600, 4200, 4838]),
);

// ================= Appendix F: full specification =================
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix F — Full ML specification (as supplied)"),
  p("The complete specification text, reproduced for completeness. Where the plan deviates (additive-only scope, UML naming), see Appendix C.3."),
  ...fs.readFileSync(__dirname + "/spec.txt", "utf8").split("\n").map(l => {
    if (/^(\d+(\s\(b\))?\.\s+[A-Z][A-Z0-9 /&,—'_-]+|IMPORTANT NOTE|QUICK SUMMARY|FINAWARE)$/.test(l.trim()))
      return new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: l.trim(), bold: true, color: TEAL })] });
    if (/^\s*[{}\[\]"]/.test(l) || /^\s{2,}/.test(l))
      return new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: GREY }, children: [new TextRun({ text: l, font: "Consolas", size: 16 })] });
    return new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: l || " ", size: 19 })] });
  }),
);

// ================= Appendix G: existing FinAware code reference =================
const repoListing = rel => fs.readFileSync(`${REPO}/${rel}`, "utf8").replace(/\r/g, "").split("\n")
  .map(l => new Paragraph({ spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: GREY },
    children: [new TextRun({ text: l.length ? l : " ", font: "Consolas", size: 14 })] }));
children.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Appendix G — Existing FinAware code reference (patterns to follow)"),
  p("New code must follow these existing patterns. These files are shown for reference only; apart from the additive touch points in section 2A.5 they must not be modified."),
  h2("G.1 Conventions"),
  tableS(["Topic", "Existing convention"], [
    ["Stack", "Next.js 14 App Router + TypeScript, Tailwind, Recharts, Zod, Prisma 5 + SQLite, Express 4 services run with tsx"],
    ["Service pattern", "services/<name>/src/server.ts uses createServiceApp(name) from services/shared/boot.ts (adds express.json, /health/live, /health/ready) and resolvePort(env, default); domain logic lives in lib/microservices/*"],
    ["Ports", "web 30005 (dev:web); auth 4101; dashboard 4102; identity 4103; debts 4104; rehab 4105; help 4106; pdf 4107. New: financial-api 4108; financial-data 4109; ml-service 8000"],
    ["Web → service calls", "Next.js route handlers under app/api/microservices/* read the session with getSessionUserId() and call services with callServiceJson(name, path, init) from lib/microservices/proxy.ts; service URLs come from <NAME>_SERVICE_URL env vars with localhost defaults"],
    ["Auth", "Cookie session (finaware_session = user id); middleware.ts redirects protected prefixes to /login and enforces FICA"],
    ["Database IDs", "Existing tables use Int autoincrement keys (Users.user_id). New tables may use UUID primary keys with Int foreign key user_id"],
    ["Scripts", "npm run dev:stack runs web + all services via concurrently; prisma:sync = prisma generate && prisma db push; typecheck = tsc --noEmit; lint = next lint"],
    ["Style", "Prettier (prettier-plugin-tailwindcss), ESLint next config; short 'Why:' comments explain security-relevant choices"],
  ], [2200, 7438]),
  h2("G.2 Repository file list (tracked files; docs binaries omitted)"),
  ...fs.readFileSync(__dirname + "/tree.txt", "utf8").trim().split("\n").reduce((acc, l, i, arr) => {
    if (i % 3 === 0) acc.push(arr.slice(i, i + 3).join("    ·    ")); return acc; }, [])
    .map(l => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l, font: "Consolas", size: 14 })] })),
  ...[
    ["G.3 prisma/schema.prisma", "prisma/schema.prisma"],
    ["G.4 services/shared/boot.ts (service template)", "services/shared/boot.ts"],
    ["G.5 services/debts/src/server.ts (example service)", "services/debts/src/server.ts"],
    ["G.6 lib/microservices/proxy.ts (service calls)", "lib/microservices/proxy.ts"],
    ["G.7 app/api/microservices/debts/route.ts (example API route)", "app/api/microservices/debts/route.ts"],
    ["G.8 lib/auth/session.ts", "lib/auth/session.ts"],
    ["G.9 middleware.ts", "middleware.ts"],
    ["G.10 components/sidebar/main-tabs.tsx", "components/sidebar/main-tabs.tsx"],
    ["G.11 package.json", "package.json"],
    ["G.12 .env.example", ".env.example"],
    ["G.13 Dockerfile", "Dockerfile"],
    ["G.14 docker-compose.yml", "docker-compose.yml"],
    ["G.15 deploy/helm/finaware/values.yaml", "deploy/helm/finaware/values.yaml"],
    ["G.16 deploy/helm/finaware/templates/deployments.yaml", "deploy/helm/finaware/templates/deployments.yaml"],
  ].flatMap(([t, f]) => [h2(t), ...repoListing(f), gap()]),
);

const doc = new Document({
  creator: "FinAware", title: "FinAware ML Implementation Plan",
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: NAVY }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: TEAL }, paragraph: { outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, color: "344054" }, paragraph: { outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: "bul", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } } ] },
    { reference: "rules", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
    { reference: "act", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "FinAware — ML Implementation Plan", size: 16, color: "888888" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 16, color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }), new TextRun({ text: " of ", size: 16, color: "888888" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888" })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(process.argv[2], buf); console.log("written", process.argv[2]); });
