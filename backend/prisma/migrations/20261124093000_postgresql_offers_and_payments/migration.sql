-- Extend the existing enum in place so legacy HarvestOffer rows retain their values.
ALTER TYPE "HarvestOfferStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "HarvestOfferStatus" ADD VALUE IF NOT EXISTS 'PAID';

CREATE TYPE "PaymentMethod" AS ENUM ('daraja_b2c');
CREATE TYPE "PaymentPurpose" AS ENUM ('direct_purchase', 'consignment');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'submitted', 'succeeded', 'failed', 'timeout');

-- Keep the legacy columns and foreign keys, changing only their numeric representation.
ALTER TABLE "HarvestOffer"
  ALTER COLUMN "offeredWeightKg" TYPE DECIMAL(12,3)
    USING "offeredWeightKg"::DECIMAL(12,3),
  ALTER COLUMN "expectedPricePerKg" TYPE DECIMAL(12,2)
    USING "expectedPricePerKg"::DECIMAL(12,2),
  ALTER COLUMN "acceptedWeightKg" TYPE DECIMAL(12,3)
    USING "acceptedWeightKg"::DECIMAL(12,3),
  ALTER COLUMN "agreedPricePerKg" TYPE DECIMAL(12,2)
    USING "agreedPricePerKg"::DECIMAL(12,2),
  ADD COLUMN "commissionPercent" DECIMAL(5,2),
  ADD COLUMN "moisturePercent" DECIMAL(5,2),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "saleAmount" DECIMAL(14,2),
  ADD COLUMN "paymentDetailsConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "batchReservationToken" TEXT,
  ADD COLUMN "offeredAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill every new required value before adding NOT NULL constraints.
UPDATE "HarvestOffer" AS offer
SET "commissionPercent" = cooperative."commissionPercent"::DECIMAL(5,2)
FROM "Cooperative" AS cooperative
WHERE cooperative."id" = offer."cooperativeId";

UPDATE "HarvestOffer"
SET
  "expectedPricePerKg" = COALESCE("expectedPricePerKg", 0),
  "commissionPercent" = COALESCE("commissionPercent", 0),
  "offeredAt" = "createdAt",
  "expiresAt" = "createdAt" + INTERVAL '48 hours',
  "acceptedAt" = CASE
    WHEN "status" IN ('ACCEPTED', 'RECEIVED', 'VERIFIED') THEN "updatedAt"
    ELSE NULL
  END,
  "rejectedAt" = CASE WHEN "status" = 'REJECTED' THEN "updatedAt" ELSE NULL END,
  "deliveredAt" = CASE
    WHEN "status" IN ('RECEIVED', 'VERIFIED') THEN "updatedAt"
    ELSE NULL
  END,
  "verifiedAt" = CASE WHEN "status" = 'VERIFIED' THEN "updatedAt" ELSE NULL END;

ALTER TABLE "HarvestOffer"
  ALTER COLUMN "expectedPricePerKg" SET DEFAULT 0,
  ALTER COLUMN "expectedPricePerKg" SET NOT NULL,
  ALTER COLUMN "commissionPercent" SET NOT NULL,
  ALTER COLUMN "offeredAt" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL;

-- A batch can aggregate many offers. Preserve the FK but remove the old one-to-one index.
DROP INDEX IF EXISTS "HarvestOffer_honeyBatchId_key";
DROP INDEX IF EXISTS "HarvestOffer_cooperativeId_status_idx";

CREATE INDEX "HarvestOffer_cooperativeId_status_expiresAt_idx"
  ON "HarvestOffer"("cooperativeId", "status", "expiresAt");
CREATE INDEX "HarvestOffer_cooperativeId_status_honeyBatchId_idx"
  ON "HarvestOffer"("cooperativeId", "status", "honeyBatchId");
CREATE INDEX "HarvestOffer_batchReservationToken_idx"
  ON "HarvestOffer"("batchReservationToken");

CREATE TABLE "Payment" (
  "id" SERIAL NOT NULL,
  "offerId" INTEGER NOT NULL,
  "farmerId" INTEGER NOT NULL,
  "cooperativeId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'daraja_b2c',
  "reference" TEXT NOT NULL,
  "purpose" "PaymentPurpose" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "originatorConversationId" TEXT,
  "conversationId" TEXT,
  "transactionId" TEXT,
  "resultCode" INTEGER,
  "resultDescription" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");
CREATE UNIQUE INDEX "Payment_offerId_purpose_key" ON "Payment"("offerId", "purpose");
CREATE INDEX "Payment_farmerId_status_idx" ON "Payment"("farmerId", "status");
CREATE INDEX "Payment_cooperativeId_status_idx" ON "Payment"("cooperativeId", "status");
CREATE INDEX "Payment_originatorConversationId_idx" ON "Payment"("originatorConversationId");
CREATE INDEX "Payment_conversationId_idx" ON "Payment"("conversationId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "HarvestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_farmerId_fkey"
  FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cooperativeId_fkey"
  FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "FarmerSettlement" IS
  'Legacy compatibility only; active payouts use Payment.';
