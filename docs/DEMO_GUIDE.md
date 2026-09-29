# FinAware demo guide

Everything a presenter needs to show FinAware: who to sign in as, what each person shows off, how
to demo a sign-up, and the bank statements and payslips to upload. All people, employers, accounts
and documents here are **fictional demo data**.

## Before you start

1. The project lives in `~/Developer/finaware_main_project` (not in iCloud — see the note at the end).
2. Start the ML service and the app:

   ```bash
   cd ~/Developer/finaware_main_project/ml-service && .venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
   ```

   ```bash
   cd ~/Developer/finaware_main_project && npm run dev:stack
   ```

3. Open <http://localhost:30005>. Signing in needs **only an SA ID or passport number** — there is no
   password. Choose **South African ID**, type the number and press **Login** for the people below;
   **Join Now** creates a new user (see "Demo sign-ups").

## Who to sign in as

Every person below has a financial profile, a saved Money Plan and a risk assessment, so every page
works straight away — no setup during the demo.

| Person | SA ID | Their story | Risk result | Best for showing |
|---|---|---|---|---|
| **Sibusiso Mthembu** | `8211076711246` | Good payer with a bond and a vehicle, wants better rates | Low (5) | The calm baseline: Score Coach (753), peer groups, goal planner ("3-month emergency fund") |
| **Chantelle Naidoo** | `8611279795187` | Three credit cards, never late | Low (0) | A healthy file: score 804, Debt Review "unlikely", R24 914 spare a month |
| **Thandi Nkosi** | `8104065756555` | Missed payments on store accounts and a medical account | Low (10) | Missed-payment advice; her statement has an unusual medical September |
| **Pieter Van Wyk** | `7312147516555` | Small business: business loan, overdraft, equipment finance | Low (1) | Debt Review marks business credit "counsellor to confirm"; semicolon-format statement |
| **Kagiso Molefe** | `6912226070555` | Personal loan, credit card and overdraft pressure | Medium (38) | A middling file; garnishee on his payslip |
| **Ayanda Dlamini** | `7007237277999` | Garnishee orders on a personal loan and vehicle finance | Medium (51) | Garnishee orders as payslip deductions; Capitec-format statement |
| **Zanele Mkhize** | `7312147390555` | Single parent paying child maintenance | Medium (50) | Debt Review shows maintenance "paid outside debt review"; school and aftercare in her plan |
| **Stephan Botha** | `8904189656999` | Home loan in arrears, facing repossession | Medium (50) | Summons, judgment and garnishee; a R4 200 car repair in September |
| **Lebo Matlala** | `7506247168999` | Judgment, summons and garnishee; self-employed on R6 950 | Medium (62) | **Legal urgency:** Debt Review legal warnings, Case Summary "Needs attention first", Get Help suggests a legal advisor |
| **Boitumelo Maseko** | `8005258445999` | Debt review candidate: repayments are 83% of income | High (100) | **The fullest story:** Debt Review "likely", Case Summary, and a September of betting plus a new QuickCash loan debit order |
| **Lindiwe Pillay** | `9902207548999` | Retrenched, on UIF and a grant, with a summons | High (100) | Short R13 165 a month; 11 bounced debit orders on her statement |
| **Mlondi Sithole** | `7712069592999` | Unemployed, under pressure from an unregistered lender | High (99) | Pair with **Get Help → Check a Loan Offer** (try the "Loan-shark SMS" example) |

The seed has 54 people in total; the other 42 work too but have no profile, plan or documents.

### A ten-minute run-through

1. **Chantelle** — the healthy baseline: dashboard, Score Coach, *About the models*.
2. **Boitumelo** — Risk Assessment (High) → open *Why this recommendation?* → *People in a similar
   position* → Get Help → *Debt Review Check* → *Case Summary* (print it).
3. Still as Boitumelo, **Money Plan** → *Choose a CSV statement* → `boitumelo-maseko.csv`: the
   unusual-September alert finds the betting and the new QuickCash loan. Then *Plan a goal* and
   *The next three months, day by day* (enter an account balance, e.g. R2 500).
4. **Lebo** — Get Help: start typing "I got a summons…" and the form suggests a legal advisor.
5. **Mlondi** — Get Help → *Check a Loan Offer* → "Loan-shark SMS" example.
6. **Demo sign-up** — log out, *Join Now* with an ID below, tick *Use demo placeholder FICA documents*.

## Demo sign-ups

**Join Now** (then **Get Started Now**) with an unused ID creates a new person whose whole profile is
simulated from the number. The last three digits choose the risk band: **999** → high, **555** →
medium, anything else → low. After joining, the FICA page appears: tick **"Use demo placeholder FICA
documents"**, tick the consent box, and submit — no real documents are needed.

The app currently accepts any number here (SA ID validation exists in the code but is not yet applied
to sign-up), so use a realistic one like those below to keep the demo believable.

These are valid and unused (checked 2026-09-29). Each creates the same person every time:

| Band | SA ID | Creates |
|---|---|---|
| Low | `9506151200083` | Nandi Ndlovu, self-employed, R55 319, 2 debts |
| Low | `8803225300085` | Anele Jacobs, employed, R49 281, 2 debts |
| Medium | `9107042105555` | Zanele Khumalo, student, R33 094, 3 debts |
| Medium | `0202186107555` | Anele Mahlangu, student, R35 572, 4 debts |
| High | `8709113408999` | Naledi Khumalo, employed, R15 146, 4 debts |
| High | `9904257701999` | Nandi Naidoo, self-employed, R8 542, 6 debts |

Passports work too: choose *Passport*, then the country — e.g. Zimbabwe `FN204999` (high) or
Botswana `RB1204555` (medium).

Once an ID has joined it exists, so it signs in with **Login** afterwards; `npm run seed` removes
joined users. (`9308084100088`, Lerato Ndlovu, was used to test this flow and already exists.)

## Bank statements and payslips

Generated for the personas above from their own figures, in `public/samples/demo/`. Download one
from the app (e.g. <http://localhost:30005/samples/demo/statements/boitumelo-maseko.csv>) or pick it
straight from that folder in the file dialog.

**Statements** — 1 June to 28 September 2026, one per person (`statements/<first>-<last>.csv`):

- Salary arrives on payday (moved to the Friday before when it falls on a weekend); debit orders run
  on the day each debt's payments fall due.
- Garnished debts do not appear: a garnishee is deducted from salary before it reaches the account.
- A debit order the balance cannot cover is returned with a dishonour fee — that is how a missed
  payment looks (Lindiwe 11, Mlondi 11, Lebo 4, Boitumelo 2).
- Three bank layouts, to show the importer copes: FNB-style (most), Capitec-style money-in/money-out
  (Ayanda, Zanele, Mlondi) and semicolon with comma decimals (Pieter).
- Planted unusual Septembers: Boitumelo (betting, new QuickCash loan), Thandi (medical), Stephan
  (car repair), Mlondi (new "Easy Cash 4 U" loan).
- Importing a person's statement into the Money Plan gives back roughly their saved plan.

**Payslips** — September 2026, for everyone with an employer (`payslips/<first>-<last>-2026-09.pdf`,
plus a `.txt` copy): Sibusiso, Thandi, Ayanda, Boitumelo, Zanele, Stephan, Chantelle and Kagiso.

- Net pay is exactly the take-home income FinAware holds for that person.
- PAYE uses the SARS 2025/26 tables (with the 65+ rebate for Zanele); UIF is 1%, capped at R177.12.
- Garnishee orders appear as *Emoluments attachment order* deductions (Ayanda, Boitumelo, Stephan,
  Zanele, Kagiso).
- For the payslip reader, which is still to be built.

## Resetting the demo

```bash
npm run seed
```

```bash
npm run demo:data -- --assess
```

`npm run seed` rebuilds everyone and re-applies the personas' profiles and Money Plans itself.
`npm run demo:data` regenerates the statements and payslips; `--assess` also runs a fresh risk
assessment for each persona through the running app, so start the stack first. Both are safe to
run again.

## Good to know

- **Why `~/Developer`:** the project used to sit in iCloud-synced Documents. When the disk ran low,
  macOS moved its files to iCloud and the app hung on start. Keep it out of Documents and Desktop.
- **Language-model features** (the AI wording on the dashboard, and the advisor suggestion's
  refinement) fall back to calculated text until the OpenAI account has credit.
- Credit scores are calculated by FinAware from each person's accounts — not bureau scores.
