ALTER TYPE "UserRole" ADD VALUE 'CONSUMER';

ALTER TABLE "User"
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "dataConsentAt" TIMESTAMP(3),
  ADD COLUMN "ussdPinHash" TEXT,
  ADD COLUMN "farmerVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "mpesaNumber" TEXT;

ALTER TABLE "Cooperative"
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Cooperative"
SET
  "isVerified" = true,
  "verifiedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "Cooperative"
  ADD CONSTRAINT "Cooperative_commissionPercent_check"
  CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100);
