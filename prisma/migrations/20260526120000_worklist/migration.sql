-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'APPEALED', 'RESOLVED', 'WONT_PURSUE');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "workStatus" "WorkStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "workNote" TEXT,
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "workUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Claim_workStatus_idx" ON "Claim"("workStatus");

-- CreateIndex
CREATE INDEX "Claim_assignedToId_idx" ON "Claim"("assignedToId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
