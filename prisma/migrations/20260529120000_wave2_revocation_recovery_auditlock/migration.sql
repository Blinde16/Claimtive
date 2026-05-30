-- Session revocation: bumped to invalidate outstanding sessions.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Recovered-dollar / appeal-outcome loop (closes the ROI loop on resolution).
ALTER TABLE "Claim" ADD COLUMN "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Claim" ADD COLUMN "resolutionOutcome" TEXT;

-- Audit-log tamper-evidence: block UPDATEs at the database level so an attacker
-- (or careless admin) with DB access cannot rewrite recorded history. INSERTs
-- (normal logging) and cascade DELETEs (whole-tenant removal) remain allowed;
-- append-only DELETE protection is a separate, cascade-aware follow-up.
CREATE OR REPLACE FUNCTION claimtive_block_auditlog_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog rows are immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_no_update ON "AuditLog";
CREATE TRIGGER auditlog_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION claimtive_block_auditlog_update();
