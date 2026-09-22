"""Generate the ML-feature versions of the FinAware architecture and service-communication diagrams.

Outputs (next to the originals in docs/, which are kept unchanged):
  docs/architecture-diagram-ml.{svg,html}
  docs/service-communication-diagram-ml.{svg,html}
PNG/PDF are rendered from the HTML with headless Chrome (see render.sh).
"""

from __future__ import annotations

from html import escape
from pathlib import Path

DOCS = Path(__file__).resolve().parents[2]
FONT = "'Segoe UI', Arial, sans-serif"

NEW_FILL, NEW_STROKE, NEW_TEXT = "#ecfdf5", "#059669", "#065f46"
OLD_FILL, OLD_STROKE, OLD_TEXT = "#f8fafc", "#94a3b8", "#334155"


class Svg:
    def __init__(self, width: int, height: int):
        self.w, self.h, self.parts = width, height, []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def rect(self, x, y, w, h, fill, stroke, rx=10, sw=1.5, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=12, weight=500, fill="#1e293b", anchor="start", italic=False):
        style = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{style}>{escape(s)}</text>')

    def line(self, x1, y1, x2, y2, color="#64748b", sw=1.6, dash=None, arrow=True):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        m = ' marker-end="url(#arrow)"' if arrow else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{d}{m}/>')

    def band(self, x, y, w, h, title, fill, stroke, title_color):
        self.rect(x, y, w, h, fill, stroke, rx=12, sw=2)
        self.text(x + 18, y + 26, title, 15, 700, title_color)

    def chip(self, x, y, w, label, new=False, h=26, size=11):
        fill, stroke, color = (NEW_FILL, NEW_STROKE, NEW_TEXT) if new else (OLD_FILL, OLD_STROKE, OLD_TEXT)
        self.rect(x, y, w, h, fill, stroke, rx=6, sw=2 if new else 1)
        self.text(x + w / 2, y + h / 2 + 4, label, size, 700 if new else 500, color, "middle")

    def card(self, x, y, w, h, title, lines, new=True, badge="NEW"):
        fill, stroke, color = (NEW_FILL, NEW_STROKE, NEW_TEXT) if new else (OLD_FILL, OLD_STROKE, OLD_TEXT)
        self.rect(x, y, w, h, "#ffffff", stroke, rx=10, sw=2.2 if new else 1.2)
        self.rect(x, y, w, 30, fill, stroke, rx=10, sw=0)
        self.text(x + 12, y + 20, title, 13, 700, color)
        if new and badge:
            self.rect(x + w - 50, y + 7, 40, 17, NEW_STROKE, NEW_STROKE, rx=8, sw=0)
            self.text(x + w - 30, y + 19, badge, 10, 700, "#ffffff", "middle")
        for i, (s, style) in enumerate(lines):
            size, weight, fill_ = {"h": (11.5, 600, "#0f172a"), "t": (11, 500, "#334155"),
                                   "m": (10.5, 600, "#7c3aed"), "w": (10.5, 700, "#b45309")}[style]
            self.text(x + 12, y + 50 + i * 16, s, size, weight, fill_)

    def render(self) -> str:
        defs = ('<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>'
                '<marker id="arrowg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#059669"/></marker>'
                '<marker id="arrowr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker></defs>')
        body = "\n  ".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" '
                f'font-family="{FONT}">\n  {defs}\n  <rect width="{self.w}" height="{self.h}" fill="#f8fafc"/>\n  {body}\n</svg>\n')


def html_wrap(svg: str, title: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>{escape(title)}</title>
<style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{background:#f8fafc}}svg{{display:block;width:100%;height:auto}}</style>
</head><body>
{svg}</body></html>
"""


def legend(s: Svg, y: int, extra: list[tuple[str, str]] | None = None) -> None:
    s.rect(20, y, s.w - 40, 40, "#ffffff", "#e2e8f0", rx=8, sw=1)
    s.text(38, y + 25, "Legend:", 12, 700, "#0f172a")
    s.chip(100, y + 8, 150, "Existing — unchanged")
    s.chip(262, y + 8, 170, "NEW — ML feature (additive)", new=True)
    x = 450
    for label, kind in (extra or []):
        if kind == "http":
            s.line(x, y + 21, x + 40, y + 21, "#475569")
        elif kind == "ml":
            s.add(f'<line x1="{x}" y1="{y + 21}" x2="{x + 40}" y2="{y + 21}" stroke="#059669" stroke-width="2" marker-end="url(#arrowg)"/>')
        elif kind == "err":
            s.add(f'<line x1="{x}" y1="{y + 21}" x2="{x + 40}" y2="{y + 21}" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrowr)"/>')
        elif kind == "ret":
            s.line(x, y + 21, x + 40, y + 21, "#64748b", dash="5 4")
        s.text(x + 48, y + 25, label, 11, 500, "#334155")
        x += 48 + 7 * len(label) + 30


# ---------------------------------------------------------------------------------------------------------------
def architecture() -> str:
    s = Svg(1600, 1240)
    s.text(800, 42, "FinAware — System Architecture with ML Financial Risk Assessment", 26, 700, "#0f172a", "middle")
    s.text(800, 66, "Existing system unchanged · new components (green) follow the supplied UML class, use-case, activity and sequence diagrams",
           13, 500, "#475569", "middle")

    # Client
    s.band(20, 84, 1560, 62, "CLIENT", "#dbeafe", "#93c5fd", "#1e3a8a")
    for i, lab in enumerate(["Web browser (React 18)", "httpOnly session cookie", "Tailwind CSS", "Recharts"]):
        s.chip(150 + i * 200, 106, 185, lab)
    s.text(960, 124, "The browser never calls the ML or data services directly", 12, 600, NEW_TEXT)
    s.line(800, 146, 800, 162)

    # Frontend
    s.band(20, 164, 1560, 118, "FRONTEND — Next.js 14 App Router (port 30005)", "#e0e7ff", "#a5b4fc", "#3730a3")
    s.text(40, 217, "Pages", 12, 700, "#3730a3")
    for i, lab in enumerate(["/login", "/join", "/fica-verification", "/dashboard", "/income-expense", "/identity", "/debts", "/rehab", "/help"]):
        s.chip(100 + i * 112, 201, 104, lab)
    s.chip(1112, 201, 150, "/financial-profile", new=True)
    s.chip(1272, 201, 150, "/risk-assessment", new=True)
    s.text(40, 256, "Components", 12, 700, "#3730a3")
    s.chip(130, 240, 470, "Existing: Sidebar, MetricCard, RiskBadge (legacy demo badge), forms, charts, AI recs card")
    s.chip(612, 240, 520, "FinancialProfileForm · RiskAssessmentPanel · RiskResult · +1 tab \"Risk Assessment\"", new=True)
    s.chip(1144, 240, 278, "Warnings, retry & loading states", new=True)
    s.line(800, 282, 800, 298)

    # Middleware + routes + proxy
    s.band(20, 300, 1560, 96, "MIDDLEWARE · API ROUTES · SERVICE PROXY", "#fef3c7", "#fbbf24", "#92400e")
    s.chip(40, 334, 360, "middleware.ts — auth guard, FICA (+2 protected routes)", new=False)
    s.chip(412, 334, 360, "/api/microservices/*, /api/ai-recommendations, /api/pdf")
    s.chip(784, 334, 360, "/api/financial-profile (GET, PUT) · /api/risk-assessment (GET, POST)", new=True)
    s.chip(40, 364, 732, "lib/microservices/proxy.ts — callServiceJson(): AUTH/DASHBOARD/IDENTITY/DEBTS/REHAB/HELP/PDF_SERVICE_URL")
    s.chip(784, 364, 776, "+ FINANCIAL_API_SERVICE_URL · FINANCIAL_DATA_SERVICE_URL · ML_SERVICE_URL (new service names)", new=True)
    s.chip(1256, 334, 304, "Session check on every route (401 if absent)", new=True)
    s.line(400, 396, 400, 414)
    s.line(1100, 396, 1100, 414, "#059669")

    # Services
    s.band(20, 416, 1560, 350, "MICROSERVICES — independent processes", "#dcfce7", "#86efac", "#166534")
    old = [("Auth :4101", "login, FICA"), ("Dashboard :4102", "overview, metrics"), ("Identity :4103", "profile"),
           ("Debts :4104", "debt CRUD"), ("Rehab :4105", "OpenAI plan (unchanged)"), ("Help :4106", "WhatsApp"),
           ("PDF :4107", "protected export")]
    for i, (t, d) in enumerate(old):
        s.card(40, 452 + i * 42, 280, 36, t, [], new=False)
        s.text(310, 452 + i * 42 + 21, d, 10.5, 500, "#64748b", "end")
    s.card(340, 452, 390, 296, "Financial API Service :4108", [
        ("services/financial-api (Express)", "t"),
        ("PUT /financial-profile/:userId", "h"),
        ("  Zod validation → field-level errors", "t"),
        ("POST /risk-assessment/:userId", "h"),
        ("  1 retrieve profile + debts (data svc)", "t"),
        ("  2 send features → ML service", "t"),
        ("  3 validate: Σp≈1, level = argmax", "t"),
        ("  4 create RiskAssessment (data svc)", "t"),
        ("  5 Generate Recommendation", "t"),
        ("     deterministic rules v1.0, no LLM", "m"),
        ("  6 return assessment + recommendations", "t"),
        ("ML down → MODEL_UNAVAILABLE, nothing stored", "w"),
        ("No direct database access", "m"),
    ])
    s.card(750, 452, 380, 296, "Financial Data Service :4109", [
        ("services/financial-data (Express + Prisma)", "t"),
        ("GET/PUT /financial-profile/:userId", "h"),
        ("GET /financial-data/:userId", "h"),
        ("  maps records → 10 model inputs", "t"),
        ("  (docs/ml/feature_mapping.md)", "t"),
        ("POST /risk-assessments/:userId", "h"),
        ("POST …/by-id/:id/recommendations", "h"),
        ("GET …/latest · …/history", "h"),
        ("Only component of the ML feature", "m"),
        ("that touches the database", "m"),
        ("Reads Users, Debts, Credit_Profile", "t"),
        ("  (read-only)", "t"),
    ])
    s.card(1150, 452, 410, 296, "ML Prediction Service :8000", [
        ("ml-service (Python · FastAPI · scikit-learn)", "t"),
        ("POST /predict · GET /health/live, /health/ready", "h"),
        ("GET /model-info (metadata only)", "h"),
        ("Pipeline: features → scale/one-hot → model", "t"),
        ("Selected: Gradient Boosting v1.0", "t"),
        ("  (compared with RF, KNN, SVM)", "t"),
        ("Probabilities by class name; riskScore 0–100", "t"),
        ("Per-user drivers: SHAP (exact, tree model)", "t"),
        ("Structured errors: INVALID_INPUT 422,", "t"),
        ("  MODEL_UNAVAILABLE 503, PREDICTION_FAILED 500", "t"),
        ("Warnings: UNKNOWN_CATEGORY, OUTSIDE_TRAINING_RANGE", "w"),
        ("Target v1.0 constructed — pending approval", "w"),
        ("Internal only · non-root container", "m"),
    ])
    s.add('<line x1="730" y1="600" x2="748" y2="600" stroke="#059669" stroke-width="2" marker-end="url(#arrowg)"/>')
    s.add('<line x1="730" y1="728" x2="1148" y2="728" stroke="#059669" stroke-width="2" marker-end="url(#arrowg)"/>')
    s.text(940, 721, "POST /predict (features)", 10.5, 700, NEW_TEXT, "middle")
    s.line(180, 766, 180, 786)
    s.line(940, 766, 940, 786, "#059669")

    # Data + ML assets
    s.band(20, 788, 1000, 214, "DATABASE — Prisma + SQLite (shared volume)", "#fee2e2", "#fca5a5", "#991b1b")
    for i, lab in enumerate(["Users", "Credit_Profile", "Debts", "Payment_History", "Legal_Records", "Expert_Requests",
                             "AI_Recommendations", "Providers", "Wealth_Assets"]):
        s.chip(40 + (i % 5) * 150, 822 + (i // 5) * 34, 140, lab)
    for i, lab in enumerate(["Financial_Profile", "Risk_Assessment", "Risk_Driver", "Recommendation"]):
        s.chip(40 + i * 190, 900, 180, lab, new=True)
    s.text(40, 946, "Users 1—1 Financial_Profile 1—* Risk_Assessment 1—* Risk_Driver / Recommendation   (UUID keys)", 11.5, 600, NEW_TEXT)
    s.text(40, 966, "Migration creates 4 tables + indexes only — no ALTER / DROP; existing data untouched", 11.5, 600, NEW_TEXT)
    s.text(40, 986, "Each assessment stores model, target & rules versions, input snapshot, indicators and warnings (traceability)", 11, 500, "#7f1d1d")

    s.band(1040, 788, 540, 214, "ML DATA & ARTEFACTS (NEW)", NEW_FILL, NEW_STROKE, NEW_TEXT)
    s.chip(1060, 822, 500, "data/personal_finance_zar.csv — 32,424 × 24, SHA-256 checked", new=True)
    s.chip(1060, 854, 245, "data_audit → 31/31 checks", new=True)
    s.chip(1315, 854, 245, "target.py → risk_tier v1.0", new=True)
    s.chip(1060, 886, 500, "train.py → 4 models, 5-fold CV, test metrics, ablation", new=True)
    s.chip(1060, 918, 500, "artifacts: pipeline.joblib · feature_schema.json · model_metadata.json", new=True)
    s.chip(1060, 950, 500, "reports: data_audit.md · model_comparison.md · confusion matrices", new=True)
    s.line(1310, 1002, 1310, 1004, arrow=False)

    # Deployment
    s.band(20, 1014, 1560, 128, "DEPLOYMENT & DEVOPS", "#ccfbf1", "#5eead4", "#115e59")
    s.chip(40, 1048, 360, "Docker Compose — existing 9 containers + SQLite volume")
    s.chip(410, 1048, 380, "+ ml-service, financial-api, financial-data (no published ports)", new=True)
    s.chip(800, 1048, 360, "Helm dev/stag/prod — Deployments, Services, Ingress, HPA")
    s.chip(1170, 1048, 390, "+ 3 Deployments/Services · NetworkPolicy: only financial-api → ML", new=True)
    s.chip(40, 1082, 360, "Health probes /health/live · /health/ready")
    s.chip(410, 1082, 380, "ml-service image: multi-stage, trains at build, non-root", new=True)
    s.chip(800, 1082, 360, "CI: lint · typecheck · build")
    s.chip(1170, 1082, 390, "+ npm test · Python job: audit, train, pytest", new=True)
    s.text(40, 1128, "Existing Helm resources render byte-identical; ConfigMap only gains 5 keys. Ingress still exposes only the web app.", 11.5, 600, "#115e59")
    legend(s, 1156, [("HTTP (existing)", "http"), ("HTTP (new ML flow)", "ml")])
    s.text(800, 1226, "FinAware · ML Financial Risk Assessment architecture · generated by docs/ml/diagrams/build_diagrams.py", 10.5, 500, "#94a3b8", "middle")
    return s.render()


# ---------------------------------------------------------------------------------------------------------------
def communication() -> str:
    s = Svg(1600, 1260)
    s.text(800, 42, "FinAware — Service Communication: Assess Financial Risk", 26, 700, "#0f172a", "middle")
    s.text(800, 66, "Implementation of the supplied UML sequence diagram · endpoints, ports and error branches as built", 13, 500, "#475569", "middle")

    cols = [("User / Browser", "React 18", False), ("Next.js web :30005", "pages + /api routes", False),
            ("Financial API Service", ":4108 · validate · orchestrate · rules", True),
            ("Financial Data Service", ":4109 · Prisma", True), ("SQLite (Prisma)", "shared volume", False),
            ("ML Prediction Service", ":8000 · FastAPI", True)]
    xs = [130, 380, 640, 910, 1170, 1430]
    top, bottom = 90, 1082
    for (t, sub, new), x in zip(cols, xs):
        fill, stroke, color = (NEW_FILL, NEW_STROKE, NEW_TEXT) if new else ("#ffffff", "#94a3b8", "#0f172a")
        s.rect(x - 115, top, 230, 52, fill, stroke, rx=10, sw=2)
        s.text(x, top + 23, t, 13.5, 700, color, "middle")
        s.text(x, top + 41, sub, 10.5, 500, "#475569", "middle")
        s.line(x, top + 52, x, bottom, "#cbd5e1", 1.2, dash="4 4", arrow=False)

    y = [170]

    def msg(a, b, label, kind="call", note=None):
        x1, x2 = xs[a], xs[b]
        yy = y[0]
        if a == b:
            if a == len(xs) - 1:
                s.add(f'<path d="M{x1} {yy} h-40 v18 h38" fill="none" stroke="#475569" stroke-width="1.4" marker-end="url(#arrow)"/>')
                s.text(x1 - 48, yy + 13, label, 11, 500, "#1e293b", "end")
            else:
                s.add(f'<path d="M{x1} {yy} h40 v18 h-38" fill="none" stroke="#475569" stroke-width="1.4" marker-end="url(#arrow)"/>')
                s.text(x1 + 48, yy + 13, label, 11, 500, "#1e293b")
            y[0] += 46
            return
        color = {"call": "#475569", "ml": "#059669", "ret": "#64748b", "err": "#dc2626"}[kind]
        dash = ' stroke-dasharray="5 4"' if kind in ("ret", "err") else ""
        marker = {"ml": "arrowg", "err": "arrowr"}.get(kind, "arrow")
        off = -2 if x2 > x1 else 2
        s.add(f'<line x1="{x1}" y1="{yy}" x2="{x2 + off}" y2="{yy}" stroke="{color}" stroke-width="{2 if kind == "ml" else 1.5}"{dash} marker-end="url(#{marker})"/>')
        mid = (x1 + x2) / 2
        s.text(mid, yy - 6, label, 11, 600 if kind != "ret" else 500, color if kind != "call" else "#1e293b", "middle")
        if note:
            s.text(mid, yy + 13, note, 9.5, 500, "#64748b", "middle", italic=True)
        y[0] += 36 if note else 30

    def section(label, color="#0f172a", fill="#eef2ff"):
        s.rect(40, y[0] - 14, 1520, 22, fill, fill, rx=5, sw=0)
        s.text(52, y[0] + 2, label, 11.5, 700, color)
        y[0] += 26

    section("A · Manage Financial Profile (activity: enter → validate → [invalid → correct & resubmit])")
    msg(0, 1, "1 PUT /api/financial-profile", note="session cookie checked")
    msg(1, 2, "2 PUT /financial-profile/:userId")
    msg(2, 2, "3 Validate financial information (Zod)")
    msg(2, 1, "invalid → 400 INVALID_INPUT + fieldErrors", "err")
    msg(2, 3, "4 PUT /financial-profile/:userId", note="re-validated (defence in depth)")
    msg(3, 4, "upsert Financial_Profile")
    msg(2, 0, "5 \"Validation successful\" → profile saved", "ret")

    section("B · Assess Financial Risk (sequence diagram messages 5–23)")
    msg(0, 1, "6 POST /api/risk-assessment")
    msg(1, 2, "7 POST /risk-assessment/:userId")
    msg(2, 3, "8 GET /financial-data/:userId", note="Retrieve FinancialProfile and Debt")
    msg(3, 4, "9–10 query Financial_Profile, Debts (ACTIVE), Users")
    msg(3, 2, "11 profile + 10 model inputs (feature_mapping.md)", "ret")
    msg(2, 5, "12 POST /predict  { income, expenses, savings, credit score, debt, repayment, rate, age, … }", "ml")
    msg(5, 5, "13–15 validate → engineer features → scale/one-hot → Gradient Boosting → SHAP")
    msg(5, 2, "16 riskLevel, riskScore, probabilities, topDrivers, indicators, warnings, versions", "ret")
    msg(2, 2, "check Σp ≈ 1 and riskLevel = most probable class")
    msg(2, 3, "17 POST /risk-assessments/:userId")
    msg(3, 4, "18 INSERT Risk_Assessment + Risk_Driver")
    msg(3, 2, "19–20 { assessmentId }", "ret")
    msg(2, 2, "21 Generate Recommendation — rules v1.0 (tier + driver + user value), max 5")
    msg(2, 3, "POST /risk-assessments/by-id/:id/recommendations → INSERT Recommendation")
    msg(2, 1, "22 201 assessment + recommendations", "ret")
    msg(1, 0, "23 Display risk score, level, probabilities, factors, recommendations", "ret")

    section("C · Prediction failed (activity: display prediction error → allow retry)", "#991b1b", "#fee2e2")
    msg(5, 2, "ML unreachable / 503 MODEL_UNAVAILABLE / 500 PREDICTION_FAILED / invalid probabilities", "err")
    msg(2, 0, "503 / 502 structured error — nothing stored → page shows error + \"Retry assessment\"", "err")

    # Security note
    s.rect(40, 1094, 1520, 92, "#ffffff", "#e2e8f0", rx=10, sw=1)
    s.text(58, 1118, "Boundaries", 13, 700, "#0f172a")
    notes = [
        "• Only Next.js is exposed (Ingress / published port). financial-api, financial-data and ml-service are ClusterIP / internal Compose services.",
        "• Kubernetes NetworkPolicy: ml-service accepts traffic only from financial-api pods. /model-info returns metadata only — never model files, paths or env.",
        "• Every hop uses callServiceJson(): connection failure → 503; ML call has a 15 s timeout (ML_SERVICE_TIMEOUT_MS). No OpenAI/LLM in this flow.",
    ]
    for i, n in enumerate(notes):
        s.text(58, 1140 + i * 18, n, 11.5, 500, "#334155")
    legend(s, 1198, [("request", "http"), ("request to ML", "ml"), ("response", "ret"), ("error branch", "err")])
    return s.render()


def main() -> None:
    for name, build, title in [("architecture-diagram-ml", architecture, "FinAware Architecture with ML"),
                               ("service-communication-diagram-ml", communication, "FinAware Assess Financial Risk — Service Communication")]:
        svg = build()
        (DOCS / f"{name}.svg").write_text(svg, encoding="utf-8")
        (DOCS / f"{name}.html").write_text(html_wrap(svg, title), encoding="utf-8")
        print("wrote", name)


if __name__ == "__main__":
    main()
