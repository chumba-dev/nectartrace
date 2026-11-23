ALTER TABLE "HarvestLog"
  ADD COLUMN "ussdSessionId" TEXT;

CREATE UNIQUE INDEX "HarvestLog_ussdSessionId_key"
  ON "HarvestLog"("ussdSessionId");
