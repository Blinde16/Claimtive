-- AlterTable
ALTER TABLE "EdiFile" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "EdiFile_organizationId_contentHash_idx" ON "EdiFile"("organizationId", "contentHash");
