# Claimtive — Product & Business Roadmap

_Last updated: 2026-05-25_

Claimtive is a multi-tenant healthcare **RCM (Revenue Cycle Management) denial &
underpayment intelligence** platform. It ingests insurer remittance files
(X12 **835**) and claim files (X12 **837**), decodes the adjustment/denial codes,
and shows clinics exactly how much money they're leaving on the table — and why.

---

## 0. Current status (as of this writing)

- ✅ **Deployed & live** on Firebase App Hosting + Cloud SQL (PostgreSQL), all under
  the GCP project `claimtive`. Live URL: `https://claimtive--claimtive.us-central1.hosted.app`
  (custom domain `claimtive.lindesystems.com` provisioning).
- ✅ Core engine works end-to-end: 835/837 parsing, CARC/RARC classification,
  denial detection, underpayment detection vs contracted rates, dashboard,
  rule-based insights.
- ✅ Synthetic demo data seeded (`demo@claimtive.com`). **No real PHI yet.**
- ✅ Secure secrets (Secret Manager), durable Cloud SQL connector, versioned
  migrations, CI-quality build (typecheck + 20 tests + prod build green).

**This is a working demo, not yet a production system for real patient data.**
The gap is compliance + a few product features + automated data intake.

---

## The single most important framing

> **Denial detection needs zero configuration. Underpayment detection needs contracts.**
>
> Denials are read directly from the insurer's 835 reason codes, so we can deliver
> value to a real clinic on day one with nothing but uploaded files. Underpayment
> detection additionally requires loading the clinic's contracted rates (fee
> schedules). **Start denial-only, then layer in contracts.**

---

## The compliance gate (cannot be skipped)

Claims contain **PHI** (patient names, NPIs, dates of service). Before any real
patient data touches the system:

| Requirement | Why | Owner |
|---|---|---|
| Google Cloud **BAA** signed | Makes GCP a HIPAA-eligible processor | Blake (admin) |
| **BAA with each clinic** | Claimtive becomes the clinic's "Business Associate" | Blake / legal |
| **Audit logging** (who viewed which record, when) | HIPAA access accountability | Eng |
| **MFA** on accounts | Access control | Eng |
| Verified **backups + restore** | Data durability | Eng |
| **No PHI in application logs** | Avoid leakage | Eng |
| Encryption at rest + in transit | Required (mostly default on GCP) | ✅ Default |

> See `docs/PILOT-SETUP.md` for the exact, step-by-step compliance + onboarding
> checklist Blake runs to test with a real clinic.

---

## Phased roadmap

### Phase 0 — Demo ✅ (done)
Deployed, synthetic data, live dashboard. Proves the concept.

### Phase 1 — Pilot (one friendly clinic on real data) — _~3–5 weeks_
Goal: safely put one clinic (e.g., a friendly/family clinic) on **real** remittance
data and produce a real "recoverable dollars" number.

- [ ] Sign GCP BAA + clinic BAA
- [ ] Add **MFA** + **audit logging**
- [ ] Verify Cloud SQL automated backups + test a restore
- [ ] **Harden the 835/837 parser** against the clinic's real files
      (reversals, secondary/COB claims, payer-specific quirks)
- [ ] Handle **scale**: large files (100s–1000s of claims), background ingest,
      remove the 100-row display cap / add pagination
- [x] **Contract/fee-schedule upload UI** (unlocks underpayment detection) — _done: CSV upload + rate management, 15 tests_
- [ ] **CSV export** of flagged claims (so billers can act)
- [ ] Ingestion stays **manual file drop** (already built)
- [ ] Run **denial-only first**, then enable underpayment once contracts are loaded

### Phase 2 — Production (multi-clinic, hands-off) — _~1–3 months_
- [ ] **Automated ingestion**: SFTP drop, then clearinghouse integration
- [ ] **Appeal letter generation** (Claude) — drafts appeals from denial data
- [ ] **Claim workflow**: assign, status (new/working/appealed/resolved), notes
- [ ] **837 ↔ 835 matching** (link billed → paid per claim)
- [ ] **Team / RBAC**: invite users, role enforcement, SSO option
- [ ] **Reporting**: per-role dashboards, scheduled email summaries
- [ ] **Private networking** for Cloud SQL (VPC), least-privilege IAM pass
- [ ] Independent **penetration test**

### Phase 3 — Scale & differentiate — _~3–9 months_
- [ ] **Predictive denial prevention** (flag claims likely to deny before submission)
- [ ] **Cross-clinic benchmarking** ("your prior-auth denials are 2× peers")
- [ ] **Self-serve onboarding** + in-app billing/invoicing
- [ ] Direct payer EDI connections (only where clearinghouses fall short)
- [ ] **SOC 2 Type II** certification

---

## Architecture

**Current**
```
GitHub (Blinde16/Claimtive, main)
   └─ push → Firebase App Hosting (Cloud Build → Cloud Run + CDN, us-central1)
                 └─ Next.js 14 (App Router, Server Actions)
                       └─ Prisma + Cloud SQL Connector → Cloud SQL (PostgreSQL)
                 └─ Secrets: Secret Manager (AUTH_SECRET, DB_PASSWORD)
   Ingestion: manual file upload (835/837) → parse → analyze → dashboard
```

**Target (Phase 2+)**
```
Clinic billing system / clearinghouse
   └─ 835/837 via SFTP or clearinghouse API
        └─ Cloud Storage bucket → Cloud Scheduler → Cloud Run ingest job
              └─ parse → analyze → Cloud SQL (private IP / VPC)
   App: same Next.js front end + worklists, appeals, reporting
```

---

## Costs (operating — estimates)

Infra is **largely fixed and shared** across clinics (multi-tenant); marginal cost
per clinic is small.

| Cost | Pilot (1 clinic) | Production (several clinics) |
|---|---|---|
| Cloud SQL | ~$10/mo (micro) | ~$100–250/mo (2 vCPU, HA) |
| App Hosting / Cloud Run | ~$0–20/mo (scales to zero) | ~$50–200/mo |
| Secret Mgr / logging / backups / storage | ~$5/mo | ~$20–50/mo |
| Anthropic API (insights + appeals) | a few $/mo | usage-based (~cents/claim) |
| Clearinghouse fees (Phase 2) | — | varies; budget per-provider or per-claim |
| Monitoring / email / domain | ~$0–20/mo | ~$50/mo |
| **Infra subtotal** | **~$25–50/mo** | **~$300–700/mo total** |
| One-time / annual | — | Pen test ~$5–15k; SOC 2 ~$15–50k/yr (Phase 3) |

---

## Pricing & margins

| Model | Example | Best for |
|---|---|---|
| **% of recovered $ (contingency)** | 10–25% of recovered dollars | Easiest first "yes" — clinic pays only when money is found |
| **Per-provider / month** | $200–500 / provider / mo | Predictable SaaS once proven |
| **Tiered by claim volume** | $X/mo up to N claims | Simple usage-based |
| **Hybrid** | small base + 10–15% of recovery | Best long-term: predictable floor + upside |

**Illustrative:** a clinic running ~2,000 claims/mo with typical leakage may have
**$15k–40k/mo recoverable**; at 15% contingency ≈ **$2,250–6,000/mo per clinic**,
against ~$50–150/mo infra share. **Gross margins ~80–90%+** once built. The real
costs at scale are support, onboarding, clearinghouse fees, and compliance.

**Go-to-market recommendation:** land the first 2–3 clinics on **contingency**
(zero risk for them, proves the numbers), then move new clinics to **hybrid**.

---

## Data ingestion options (adopt in this order)

| Method | How it works | Effort | When |
|---|---|---|---|
| **1. Manual file drop** ✅ | Clinic uploads 835/837 exported from their system/portal | None (built) | Pilot |
| **2. SFTP auto-drop** | Secure folder; files dropped + ingested on schedule | Low | Phase 1–2 |
| **3. Clearinghouse integration** | Pull 835s from Availity / Waystar / Optum-Change / Trizetto | Medium (account + fees) | Phase 2 (main path) |
| **4. Direct payer EDI** | Per-payer trading-partner feeds | High | Phase 3 / rare |
| **5. PMS/EHR API** | Pull remittances from the practice-management system | Medium–high | Alternative |

Most clinics already route claims through a **clearinghouse** — that's the
scalable, hands-off backbone. Start with file drops to prove value, graduate to
clearinghouse for automation.

---

## Key risks / open items

- **Compliance first.** No real PHI before BAAs + MFA + audit logging are in place.
- **Parser robustness** is the biggest technical unknown — real payer 835s vary
  widely. Test early with real files.
- **Contract data quality** drives underpayment accuracy — clinics' fee schedules
  can be messy.
- **Clearinghouse partnerships** have lead time and per-transaction cost.
- IAM is currently broad (granted to several service accounts during setup) —
  tighten to least-privilege in Phase 2.
