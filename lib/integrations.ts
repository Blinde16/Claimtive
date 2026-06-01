// Connector catalog for the "Connect your data" / Integrations page.
//
// Plain, server-safe data only (no imports, no React). This is the single
// source of truth for how a clinic's claims data can flow into Claimtive.
//
// HONESTY MATTERS: clinic owners are domain experts. The `status` field must
// reflect reality. Today, only "Manual file upload" is actually live. Do not
// promote anything to "live" until it genuinely works end-to-end.

/** How far along an intake method is, from a clinic's point of view. */
export type IntegrationStatus = "live" | "onboarding" | "pilot" | "roadmap";

/** Coarse grouping for the catalog UI. */
export type IntegrationCategory =
  | "Direct"
  | "Automated intake"
  | "Source system";

export type Integration = {
  /** Stable, URL-safe identifier. */
  id: string;
  /** Display name of the intake method. */
  name: string;
  /** Grouping shown in the UI. */
  category: IntegrationCategory;
  /** Truthful current availability. */
  status: IntegrationStatus;
  /** One- or two-sentence plain-English description for clinic owners. */
  blurb: string;
  /** Optional in-app destination, only set when the method actually works. */
  href?: string;
  /** Optional list of representative vendor / payer names. */
  vendors?: string[];
};

export const INTEGRATIONS: readonly Integration[] = [
  {
    id: "manual-upload",
    name: "Manual file upload",
    category: "Direct",
    status: "live",
    blurb:
      "Drag-and-drop your 835 remittance and 837 claim files. Works today, no setup.",
    href: "/uploads"
  },
  {
    id: "sftp-drop",
    name: "Secure SFTP drop",
    category: "Automated intake",
    status: "onboarding",
    blurb:
      "We provision a secure folder; your billing system or clearinghouse drops files there and Claimtive imports them automatically on a schedule. No manual exports."
  },
  {
    id: "clearinghouse-sync",
    name: "Clearinghouse sync",
    category: "Automated intake",
    status: "pilot",
    blurb:
      "Connect once to your clearinghouse to pull 835 remittances and 277 claim-status automatically across most payers — the highest-leverage single connection.",
    vendors: [
      "Availity",
      "Waystar",
      "Change Healthcare / Optum",
      "Office Ally",
      "Trizetto"
    ]
  },
  {
    id: "emr-pm",
    name: "EMR / Practice Management",
    category: "Source system",
    status: "roadmap",
    blurb:
      "Direct hooks into your EMR/PM to pull remittances and submitted claims without a clearinghouse in the middle.",
    vendors: [
      "athenahealth",
      "eClinicalWorks",
      "Tebra (Kareo)",
      "DrChrono",
      "NextGen"
    ]
  },
  {
    id: "payer-portals",
    name: "Payer portals",
    category: "Source system",
    status: "roadmap",
    blurb:
      "Aggregate claim status and appeal submission across individual payer portals in one place.",
    vendors: ["BCBS", "Aetna", "UnitedHealthcare", "Cigna", "Medicare"]
  }
] as const;
