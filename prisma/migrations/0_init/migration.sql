-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "EdiType" AS ENUM ('X835', 'X837');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdjustmentLevel" AS ENUM ('CLAIM', 'SERVICE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractRate" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "procedureCode" TEXT NOT NULL,
    "modifier" TEXT,
    "allowedAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdiFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT NOT NULL,
    "type" "EdiType" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "controlNumber" TEXT,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "totalCharged" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDenied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalUnderpaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EdiFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ediFileId" TEXT NOT NULL,
    "payerId" TEXT,
    "payerName" TEXT,
    "patientControlNumber" TEXT,
    "payerClaimControlNumber" TEXT,
    "statusCode" TEXT,
    "statusLabel" TEXT,
    "filingIndicator" TEXT,
    "renderingProviderNpi" TEXT,
    "patientName" TEXT,
    "serviceDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "totalCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "patientResponsibility" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deniedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "underpaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isDenied" BOOLEAN NOT NULL DEFAULT false,
    "isUnderpaid" BOOLEAN NOT NULL DEFAULT false,
    "primaryDenialCode" TEXT,
    "primaryDenialReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLine" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "procedureCode" TEXT NOT NULL,
    "modifier" TEXT,
    "revenueCode" TEXT,
    "units" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "serviceDate" TIMESTAMP(3),
    "chargeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "contractedRate" DECIMAL(12,2),
    "underpaidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deniedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isDenied" BOOLEAN NOT NULL DEFAULT false,
    "isUnderpaid" BOOLEAN NOT NULL DEFAULT false,
    "denialCode" TEXT,
    "denialReason" TEXT,
    "remarkCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" TEXT NOT NULL,
    "level" "AdjustmentLevel" NOT NULL,
    "claimId" TEXT,
    "serviceLineId" TEXT,
    "groupCode" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(10,2),

    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Payer_organizationId_idx" ON "Payer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payer_organizationId_name_key" ON "Payer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Contract_organizationId_idx" ON "Contract"("organizationId");

-- CreateIndex
CREATE INDEX "Contract_payerId_idx" ON "Contract"("payerId");

-- CreateIndex
CREATE INDEX "ContractRate_procedureCode_idx" ON "ContractRate"("procedureCode");

-- CreateIndex
CREATE UNIQUE INDEX "ContractRate_contractId_procedureCode_modifier_key" ON "ContractRate"("contractId", "procedureCode", "modifier");

-- CreateIndex
CREATE INDEX "EdiFile_organizationId_idx" ON "EdiFile"("organizationId");

-- CreateIndex
CREATE INDEX "Claim_organizationId_idx" ON "Claim"("organizationId");

-- CreateIndex
CREATE INDEX "Claim_ediFileId_idx" ON "Claim"("ediFileId");

-- CreateIndex
CREATE INDEX "Claim_isDenied_idx" ON "Claim"("isDenied");

-- CreateIndex
CREATE INDEX "Claim_isUnderpaid_idx" ON "Claim"("isUnderpaid");

-- CreateIndex
CREATE INDEX "ServiceLine_claimId_idx" ON "ServiceLine"("claimId");

-- CreateIndex
CREATE INDEX "ServiceLine_procedureCode_idx" ON "ServiceLine"("procedureCode");

-- CreateIndex
CREATE INDEX "Adjustment_claimId_idx" ON "Adjustment"("claimId");

-- CreateIndex
CREATE INDEX "Adjustment_serviceLineId_idx" ON "Adjustment"("serviceLineId");

-- CreateIndex
CREATE INDEX "Adjustment_groupCode_idx" ON "Adjustment"("groupCode");

-- CreateIndex
CREATE INDEX "Adjustment_reasonCode_idx" ON "Adjustment"("reasonCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractRate" ADD CONSTRAINT "ContractRate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdiFile" ADD CONSTRAINT "EdiFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdiFile" ADD CONSTRAINT "EdiFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ediFileId_fkey" FOREIGN KEY ("ediFileId") REFERENCES "EdiFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLine" ADD CONSTRAINT "ServiceLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_serviceLineId_fkey" FOREIGN KEY ("serviceLineId") REFERENCES "ServiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

