# Claimtive — Pilot Setup Guide (testing with a real clinic)

_Last updated: 2026-05-25_

This is the **operational checklist for Blake** to run a real-clinic pilot. It
covers what you do on your end — compliance, getting the clinic's data, onboarding
them, and presenting results. Engineering build items (the things "we" build) are
tracked separately in `docs/ROADMAP.md` (Phase 1).

> ⛔ **Hard rule: no real patient files touch Claimtive until the BAAs below are
> signed.** A remittance (835) contains PHI. Signing the BAA first is both the law
> and the thing that makes this safe to do.

---

## Overview of the pilot flow

```
1. Compliance   →  2. Get clinic data  →  3. Onboard clinic in app
       (BAAs)          (their 835 files)      (workspace + optional contracts)
                                                       │
4. Ingest & review  ←─────────────────────────────────┘
       │
5. Present "recoverable $" findings  →  6. Decide pricing & go-forward
```

You can run the whole pilot on **manual file drops** + **denial-only mode** with
what's built today. Underpayment detection turns on once you load the clinic's
contracts (optional for the first pass).

---

## Step 1 — Compliance (do this first, ~1–2 hours of your time)

### 1a. Sign the Google Cloud BAA
You must accept Google's HIPAA Business Associate Agreement for the GCP account
that hosts Claimtive (the lindesystems / `claimtive` project).

1. Sign in as the **organization / billing admin** for `blake@lindesystems.com`.
2. Review the GCP HIPAA BAA terms: <https://cloud.google.com/terms/hipaa-baa>
3. Accept it for your organization:
   - If `lindesystems.com` is on **Google Workspace**: Admin console →
     **Account → Legal & compliance → Security and privacy → Additional Terms →**
     review & accept the **HIPAA Business Associate Amendment** (answer the three
     "are you a covered entity / BA" questions).
   - For **Google Cloud Platform** specifically, follow Google's "HIPAA on Google
     Cloud" guide: <https://cloud.google.com/security/compliance/hipaa-compliance>
     (the BAA is accepted electronically at the org level; if you don't see the
     option, contact Google Cloud support/your account team to enable it).
4. After signing, you're responsible for using only **HIPAA-eligible services**
   (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager — all of which Claimtive
   uses — are eligible).

✅ **Done when:** the BAA shows as accepted in your Google admin/console.

### 1b. BAA between Claimtive (Linde Systems) and the clinic
The clinic is the "covered entity"; Claimtive is their "business associate." You
need a signed BAA **with each clinic** before receiving their data.

- Use a standard BA agreement template (HHS publishes sample language:
  <https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html>).
- Have a lawyer review your template once; then reuse it per clinic.
- Keep signed copies on file.

✅ **Done when:** you and the clinic have a signed BAA.

### 1c. Confirm the security basics are on (ask engineering)
Before real data: **MFA enabled**, **audit logging on**, **Cloud SQL backups
verified**. These are Phase-1 build items — confirm they're done before Step 4.

---

## Step 2 — Get the clinic's data (their 835 remittance files)

The clinic's **office manager or biller** is your contact. You need their **835 /
ERA (Electronic Remittance Advice)** files. Optionally their **837** (claims) too.

### What to ask them for (copy/paste)
> "To run the analysis, I need your **835 / ERA remittance files** — these are the
> electronic 'explanation of payment' files from insurers. Could you export the
> last **3–6 months** of ERAs? You can usually download them from:
> - your **clearinghouse** portal (Availity, Waystar, Optum/Change, Trizetto, etc.), or
> - your **practice management / billing software** (look for 'ERA', '835',
>   'remittance', or 'download remittance'), or
> - the **payer portals** (Aetna, BCBS, etc.) under remittance/EOB downloads.
>
> Please send them as the raw **.835 / .edi / .txt** files (not PDFs if possible).
> Send them securely — see below."

### How they should send it to you SECURELY (this is PHI)
- ❌ **Not** plain email, not text message, not a public link.
- ✅ Options, best first:
  1. **Upload directly into Claimtive** themselves (give them a login) — best, no
     middleman handling.
  2. **Encrypted file transfer** you control (e.g., a secured SFTP/Drive folder
     covered by your BAA).
  3. If they must email, an **encrypted/secure email** with a password shared
     separately.
- A 835 backfill of 3–6 months is the highest-impact thing you can get — it lets
  the dashboard instantly quantify money already left on the table.

---

## Step 3 — (Optional, for underpayment) Get their contracts / fee schedules

Only needed to detect **underpayments** (paid-below-contract). Skip for a
denial-only first pass.

> "If you also want me to catch **underpayments** (where the insurer paid less
> than your contracted rate), send me your **payer fee schedules / contracted
> rates** — typically a spreadsheet of procedure code (CPT/HCPCS) → allowed
> amount, per payer."

You'll load these via the contract-upload feature (Phase-1 build item).

---

## Step 4 — Onboard the clinic in Claimtive

1. **Create the clinic's workspace** (org) and a user login for them.
   - Today: via the app's sign-up, or seed an org for them. (Self-serve invite
     flow is a Phase-2 item.)
2. **(Optional)** Load their payer contracts / fee schedules.
3. **Upload their 835 files** (Uploads page) — start with the historical backfill.
   - Denials are detected immediately.
   - Underpayments appear if contracts were loaded.
4. **Review the dashboard**: recoverable $, denial rate, top denial reasons,
   leakage by payer, flagged claims.

---

## Step 5 — Present the findings

This is your sales moment. Lead with the single number:

> "Across the last [N] months / [N] claims, Claimtive found **$X recoverable** —
> $A in fixable denials and $B in underpayments. The biggest driver is [reason]
> with [payer]. Here's the exact list of claims to work."

Use the dashboard live, then hand them the **CSV export** of flagged claims so
their biller can act on it. That export = immediate, tangible value.

---

## Step 6 — Pricing & go-forward

For the first clinics, the easiest "yes" is **contingency** (you take 10–25% of
what they actually recover) — zero risk for them, and it proves your numbers.
Move later clinics to a **hybrid** (small monthly base + % of recovery). See
`docs/ROADMAP.md` for the full pricing/margins breakdown.

---

## Security do's & don'ts (handling PHI)

- ✅ Keep PHI **inside Claimtive** (which runs on the BAA-covered GCP project).
- ✅ Use secure transfer for any files in flight.
- ✅ Give clinic staff their **own logins**; don't share accounts.
- ❌ Don't email/Slack/text raw remittance files.
- ❌ Don't put real files in the git repo, in `sample-data/`, or in screenshots
  you share.
- ❌ Don't load real data before the BAAs (Step 1) are signed.
- 🗑️ Have a deletion path: if a clinic leaves, you can remove their org (cascades
  to all their data).

---

## Quick pilot checklist

- [ ] GCP BAA signed (Step 1a)
- [ ] Clinic BAA signed (Step 1b)
- [ ] MFA + audit logging + backups confirmed with engineering (Step 1c)
- [ ] Clinic exported 3–6 months of 835/ERA files (Step 2)
- [ ] Files received **securely** (Step 2)
- [ ] (Optional) Fee schedules received for underpayment (Step 3)
- [ ] Clinic workspace + login created (Step 4)
- [ ] Files uploaded, dashboard reviewed (Step 4)
- [ ] Findings + CSV export presented (Step 5)
- [ ] Pricing agreed (Step 6)
