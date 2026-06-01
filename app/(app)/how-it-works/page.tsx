export const metadata = {
  title: "How It Works — Claimtive"
};

const ARCH_LAYERS = [
  {
    icon: "⬡",
    label: "Frontend — Next.js 14",
    detail:
      "App Router with Server Actions. Hosted on Firebase App Hosting (Google Cloud Run + CDN, us-central1). Deployments trigger automatically from the main branch via Cloud Build."
  },
  {
    icon: "⬡",
    label: "Database — Cloud SQL (PostgreSQL)",
    detail:
      "Managed PostgreSQL on Google Cloud SQL, accessed via the Cloud SQL Connector (IAM-authenticated, encrypted in transit). Schema managed with Prisma migrations. Automated daily backups with point-in-time recovery."
  },
  {
    icon: "⬡",
    label: "AI Layer — Claude via Vertex AI",
    detail:
      "Gemini is served through Google Cloud Vertex AI inside the same GCP project. All API calls stay entirely within the Google Cloud trust boundary. The AI layer is feature-flagged and fully optional; the deterministic engine runs independently if AI is disabled."
  },
  {
    icon: "⬡",
    label: "Secrets & Config — Secret Manager",
    detail:
      "All credentials (database password, auth secret, API keys) are stored in Google Cloud Secret Manager and injected at runtime. No secrets in source code or environment variable files."
  },
  {
    icon: "⬡",
    label: "File Ingestion — Manual Upload (Phase 1)",
    detail:
      "835 and 837 EDI files are uploaded directly through the app. Files are parsed server-side in the Cloud Run runtime. Phase 2 roadmap: SFTP auto-drop and clearinghouse integration (Availity, Waystar) for hands-off ingestion."
  }
];

const PIPELINE_STEPS = [
  {
    icon: "▤",
    label: "835 File",
    description:
      "Payer-generated X12 835 remittance advice files are uploaded directly — raw, unmodified EDI transactions."
  },
  {
    icon: "⊞",
    label: "EDI Parser",
    description:
      "Each file is parsed segment-by-segment per the X12 835 implementation guide. Every CLP, SVC, CAS, and REF segment is read in sequence."
  },
  {
    icon: "◈",
    label: "CARC / RARC Lookup",
    description:
      "Claim Adjustment Reason Codes and Remittance Advice Remark Codes are cross-referenced against CMS-published code definitions — no interpretation, no inference."
  },
  {
    icon: "◉",
    label: "Denial Category",
    description:
      "Each code maps to a category (Authorization, Medical Necessity, Coding, Timely Filing, etc.) via a fixed rule table that mirrors CMS X12 835 guidance."
  },
  {
    icon: "▦",
    label: "Dashboard",
    description:
      "Categorized denials, underpayment flags, and payer trends surface in your dashboard — every number traceable back to a specific CAS segment."
  }
];

const AI_USES = [
  {
    icon: "✓",
    label: "Plain-English Insight Summaries",
    detail:
      "Gemini reads patterns across denial categories and payer behavior to surface prioritized, actionable narratives — the kind of synthesis that takes a biller hours to compile manually."
  },
  {
    icon: "✓",
    label: "Appeal Letter Drafts",
    detail:
      "For flagged denials, Claude drafts a starting appeal letter grounded in the specific CARC/RARC codes and clinical context you provide. Your team reviews and submits."
  },
  {
    icon: "✓",
    label: "Underpayment Narrative Summaries",
    detail:
      "When contractual rates are loaded, Gemini helps narrate which payers are trending low and what the likely causes are — written for a billing manager, not a data analyst."
  }
];

const AI_NOT_USES = [
  "Code classification — CARC/RARC categories are assigned by deterministic rule lookup only",
  "Dollar calculations — all payment, adjustment, and variance figures come directly from the 835 file amounts",
  "Contractual rate comparisons — those are straight arithmetic against your uploaded fee schedule"
];

const DATA_COMMITMENTS = [
  {
    icon: "◎",
    label: "CMS-Sourced Code Definitions",
    detail:
      "CARC and RARC definitions are sourced from the official CMS X12 835 implementation guide and updated with each CMS code set release. No proprietary interpretations."
  },
  {
    icon: "◎",
    label: "Payer Compatibility Testing",
    detail:
      "The EDI parser is tested against 835 files from major payers — BCBS, Aetna, Medicare, and Cigna — to handle payer-specific formatting quirks and non-standard segment ordering."
  },
  {
    icon: "◎",
    label: "Full Tenant Isolation",
    detail:
      "No PHI crosses account boundaries. Your remittance data, claims, and fee schedules are scoped exclusively to your organization. No cross-tenant aggregation or sharing."
  },
  {
    icon: "◎",
    label: "Appeal Drafts Are Never Auto-Submitted",
    detail:
      "AI-generated appeal letters are saved as drafts only. Nothing is submitted to a payer without a human reviewer approving and sending it."
  },
  {
    icon: "◎",
    label: "Underpayment Accuracy Scales With Your Data",
    detail:
      "Contractual underpayment detection requires your fee schedules to be uploaded. Accuracy is directly proportional to how complete and current those schedules are — we will tell you when coverage is partial."
  }
];

function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-600">
        {eyebrow}
      </p>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}

function AccuracyCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
      <span className="mt-0.5 text-base text-brand-600">◆</span>
      <p className="text-sm font-medium text-brand-900">{children}</p>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">How It Works</h1>
        <p className="mt-2 text-sm text-slate-500">
          Claimtive is built on a deliberate separation of concerns: deterministic
          code for anything that must be exact, AI for pattern synthesis and
          communication. This page explains exactly what each layer does — and what
          it does not do.
        </p>
      </div>

      {/* Section 1 — Deterministic Engine */}
      <section>
        <SectionHeader
          eyebrow="Section 1"
          title="The Deterministic Engine"
          description="Everything touching dollar amounts, code classification, and denial categorization is handled by rule-based logic with no probabilistic components. The output is fully reproducible and auditable."
        />

        {/* Pipeline */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="relative">
              <div className="card flex h-full flex-col p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base text-brand-600">
                    {step.icon}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Step {i + 1}
                  </span>
                </div>
                <p className="mb-1 text-sm font-semibold text-slate-900">
                  {step.label}
                </p>
                <p className="text-xs leading-relaxed text-slate-500">
                  {step.description}
                </p>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="absolute -right-1.5 top-1/2 hidden -translate-y-1/2 text-slate-300 lg:block">
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pipeline label row for large screens */}
        <div className="mt-3 hidden items-center justify-center gap-2 text-xs text-slate-400 lg:flex">
          {PIPELINE_STEPS.map((step, i) => (
            <span key={step.label} className="flex items-center gap-2">
              <span className="font-medium text-slate-600">{step.label}</span>
              {i < PIPELINE_STEPS.length - 1 && (
                <span className="text-slate-300">→</span>
              )}
            </span>
          ))}
        </div>

        <AccuracyCallout>
          Code classification is 100% deterministic. We read what the payer says,
          exactly. CARC and RARC codes are mapped directly to CMS-published
          definitions — no model, no inference, no guessing.
        </AccuracyCallout>
      </section>

      {/* Section 2 — AI-Powered Analysis */}
      <section>
        <SectionHeader
          eyebrow="Section 2"
          title="AI-Powered Analysis"
          description="Gemini (Google), served via Google Cloud Vertex AI, is used selectively for tasks where human-quality language and pattern synthesis add real value. It operates downstream of classification, on already-structured data — and stays entirely within the Google Cloud trust boundary."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AI_USES.map((use) => (
            <div key={use.label} className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-600">
                  {use.icon}
                </span>
                <p className="text-sm font-semibold text-slate-900">
                  {use.label}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">{use.detail}</p>
            </div>
          ))}
        </div>

        {/* Not used for */}
        <div className="card mt-4 p-5">
          <p className="mb-3 text-sm font-semibold text-slate-900">
            AI is explicitly not used for:
          </p>
          <ul className="space-y-2">
            {AI_NOT_USES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-rose-400">✕</span>
                <span className="text-sm text-slate-600">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <AccuracyCallout>
          AI insights are pattern synthesis and suggestions for review — your team
          retains final judgment on every action. No appeal is submitted, no
          adjustment is recorded, and no code is changed without a human making
          that call.
        </AccuracyCallout>
      </section>

      {/* Section 3 — Data Quality Commitments */}
      <section>
        <SectionHeader
          eyebrow="Section 3"
          title="Our Data Quality Commitments"
          description="Accuracy in RCM isn't a feature — it's a baseline requirement. These are the specific commitments we make about how your data is handled and how our reference data is maintained."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DATA_COMMITMENTS.map((item) => (
            <div key={item.label} className="card p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base text-brand-500">{item.icon}</span>
                <p className="text-sm font-semibold text-slate-900">
                  {item.label}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 — System Architecture */}
      <section>
        <SectionHeader
          eyebrow="Section 4"
          title="System Architecture"
          description="Claimtive runs entirely on Google Cloud Platform. Every component — compute, database, AI, and secrets — lives inside a single GCP project, which means a single Google Cloud BAA covers your PHI end to end."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ARCH_LAYERS.map((layer) => (
            <div key={layer.label} className="card p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base text-brand-500">{layer.icon}</span>
                <p className="text-sm font-semibold text-slate-900">
                  {layer.label}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                {layer.detail}
              </p>
            </div>
          ))}
        </div>

        <AccuracyCallout>
          One GCP project. One BAA. No data crosses cloud providers or vendor
          boundaries. Firebase App Hosting, Cloud SQL, Vertex AI, and Secret
          Manager are all Google Cloud services under the same compliance
          envelope.
        </AccuracyCallout>
      </section>

      {/* Footer note */}
      <div className="border-t border-slate-200 pt-6 pb-2">
        <p className="text-xs text-slate-400">
          Questions about methodology or data handling? Contact your account
          manager or reach us at{" "}
          <a
            href="mailto:support@claimtive.com"
            className="text-brand-600 hover:underline"
          >
            support@claimtive.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
