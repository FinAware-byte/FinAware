# ML dataset

Copied unchanged from the data package (`redeveloperhandoffpackagefolder`). Do not edit these files;
every transformation happens in code (`ml/`) and is reported in `reports/data_audit.md`.

| File | Bytes | SHA-256 | Use |
|---|---|---|---|
| personal_finance_zar.csv | 5,339,919 | aa0aeae913049a68c92754cf44e9fd92371a66e0e59c5e2ed54f30fc941bce53 | Training dataset (32,424 × 24) |
| synthetic_personal_finance_dataset.csv | 4,193,916 | b54172efe63e9c32bc0e1281ee22a79d9ae0def21786b1cc75ffb252539f7012 | Original USD source — provenance only |
| data_dictionary.xlsx | 10,112 | a1dfd356005bdb70c07e9167455c953665581cbb46ec11e43e3e7c1cc60086b9 | Authoritative field descriptions |

Verify: `shasum -a 256 data/*`

Currency: 1 USD = 16.27 ZAR (fixed academic localisation rate). The dataset is synthetic and
**contains no genuine Low/Medium/High risk label** — see `../docs/risk_tier_methodology.md`.
