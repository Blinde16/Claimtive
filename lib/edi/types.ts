export type EdiDocType = "X835" | "X837";

export interface ParsedAdjustment {
  level: "CLAIM" | "SERVICE";
  /** CO, PR, OA, PI, CR */
  groupCode: string;
  /** CARC (Claim Adjustment Reason Code) */
  reasonCode: string;
  amount: number;
  quantity?: number;
}

export interface ParsedServiceLine {
  procedureCode: string;
  modifier?: string;
  revenueCode?: string;
  units: number;
  serviceDate?: string;
  chargeAmount: number;
  paidAmount: number;
  adjustments: ParsedAdjustment[];
  /** RARC (Remittance Advice Remark Codes) */
  remarkCodes: string[];
}

export interface ParsedClaim {
  patientControlNumber?: string;
  payerClaimControlNumber?: string;
  statusCode?: string;
  filingIndicator?: string;
  renderingProviderNpi?: string;
  patientName?: string;
  serviceDate?: string;
  totalCharge: number;
  totalPaid: number;
  patientResponsibility: number;
  adjustments: ParsedAdjustment[];
  serviceLines: ParsedServiceLine[];
}

export interface Parsed835 {
  type: "X835";
  controlNumber?: string;
  payerName?: string;
  payerId?: string;
  paidDate?: string;
  checkNumber?: string;
  totalPaid: number;
  claims: ParsedClaim[];
}

export interface Parsed837ServiceLine {
  procedureCode: string;
  modifier?: string;
  chargeAmount: number;
  units: number;
  serviceDate?: string;
  diagnosisPointers: string[];
}

export interface Parsed837Claim {
  patientControlNumber?: string;
  totalCharge: number;
  patientName?: string;
  renderingProviderNpi?: string;
  diagnosisCodes: string[];
  serviceLines: Parsed837ServiceLine[];
}

export interface Parsed837 {
  type: "X837";
  controlNumber?: string;
  payerName?: string;
  billingProviderNpi?: string;
  claims: Parsed837Claim[];
}

export type ParsedEdi = Parsed835 | Parsed837;
