CREATE TYPE "HarvestOfferStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'RECEIVED', 'VERIFIED');
CREATE TYPE "SettlementType" AS ENUM ('DIRECT_PURCHASE', 'CONSIGNMENT');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID');

ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "email" IS NOT NULL;

CREATE TABLE "HarvestOffer" (
  "id" SERIAL NOT NULL,
  "reference" TEXT NOT NULL,
  "ussdSessionId" TEXT,
  "farmerId" INTEGER NOT NULL,
  "cooperativeId" INTEGER NOT NULL,
  "pickupVillage" TEXT NOT NULL,
  "offeredWeightKg" DOUBLE PRECISION NOT NULL,
  "expectedPricePerKg" DOUBLE PRECISION,
  "settlementType" "SettlementType" NOT NULL,
  "status" "HarvestOfferStatus" NOT NULL DEFAULT 'SUBMITTED',
  "acceptedWeightKg" DOUBLE PRECISION,
  "agreedPricePerKg" DOUBLE PRECISION,
  "rejectionReason" TEXT,
  "honeyBatchId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HarvestOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FarmerSettlement" (
  "id" SERIAL NOT NULL,
  "offerId" INTEGER NOT NULL,
  "farmerId" INTEGER NOT NULL,
  "cooperativeId" INTEGER NOT NULL,
  "type" "SettlementType" NOT NULL,
  "grossAmount" DOUBLE PRECISION NOT NULL,
  "commissionAmount" DOUBLE PRECISION NOT NULL,
  "netAmount" DOUBLE PRECISION NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
  "paymentReference" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FarmerSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerificationToken" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "HarvestOffer_reference_key" ON "HarvestOffer"("reference");
CREATE UNIQUE INDEX "HarvestOffer_ussdSessionId_key" ON "HarvestOffer"("ussdSessionId");
CREATE UNIQUE INDEX "HarvestOffer_honeyBatchId_key" ON "HarvestOffer"("honeyBatchId");
CREATE INDEX "HarvestOffer_farmerId_createdAt_idx" ON "HarvestOffer"("farmerId", "createdAt");
CREATE INDEX "HarvestOffer_cooperativeId_status_idx" ON "HarvestOffer"("cooperativeId", "status");
CREATE UNIQUE INDEX "FarmerSettlement_offerId_key" ON "FarmerSettlement"("offerId");
CREATE INDEX "FarmerSettlement_farmerId_status_idx" ON "FarmerSettlement"("farmerId", "status");
CREATE INDEX "FarmerSettlement_cooperativeId_status_idx" ON "FarmerSettlement"("cooperativeId", "status");
CREATE UNIQUE INDEX "EmailVerificationToken_userId_key" ON "EmailVerificationToken"("userId");
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "HarvestOffer" ADD CONSTRAINT "HarvestOffer_farmerId_fkey"
  FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HarvestOffer" ADD CONSTRAINT "HarvestOffer_cooperativeId_fkey"
  FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HarvestOffer" ADD CONSTRAINT "HarvestOffer_honeyBatchId_fkey"
  FOREIGN KEY ("honeyBatchId") REFERENCES "HoneyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "HarvestOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_farmerId_fkey"
  FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_cooperativeId_fkey"
  FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
