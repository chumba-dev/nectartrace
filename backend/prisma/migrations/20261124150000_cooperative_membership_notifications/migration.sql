CREATE TYPE "CooperativeApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CooperativeMemberRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "NotificationType" AS ENUM (
  'COOPERATIVE_APPLICATION_SUBMITTED',
  'COOPERATIVE_APPLICATION_APPROVED',
  'COOPERATIVE_APPLICATION_REJECTED',
  'HARVEST_OFFER_SUBMITTED',
  'ORDER_CREATED'
);

CREATE TABLE "CooperativeApplication" (
  "id" SERIAL NOT NULL,
  "applicantId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "village" TEXT NOT NULL,
  "ward" TEXT NOT NULL,
  "county" TEXT NOT NULL DEFAULT 'Baringo',
  "walletAddress" TEXT NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "CooperativeApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "reviewedById" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "cooperativeId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooperativeApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CooperativeApplication_commissionPercent_check"
    CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100)
);

CREATE TABLE "CooperativeMembership" (
  "id" SERIAL NOT NULL,
  "cooperativeId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "CooperativeMemberRole" NOT NULL DEFAULT 'STAFF',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "invitedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooperativeMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" SERIAL NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRecipient" (
  "id" SERIAL NOT NULL,
  "notificationId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CooperativeApplication_applicantId_status_idx"
  ON "CooperativeApplication"("applicantId", "status");
CREATE INDEX "CooperativeApplication_status_createdAt_idx"
  ON "CooperativeApplication"("status", "createdAt");
CREATE INDEX "CooperativeApplication_reviewedById_idx"
  ON "CooperativeApplication"("reviewedById");
CREATE INDEX "CooperativeApplication_cooperativeId_idx"
  ON "CooperativeApplication"("cooperativeId");

CREATE UNIQUE INDEX "CooperativeMembership_userId_key"
  ON "CooperativeMembership"("userId");
CREATE UNIQUE INDEX "CooperativeMembership_cooperativeId_userId_key"
  ON "CooperativeMembership"("cooperativeId", "userId");
CREATE INDEX "CooperativeMembership_cooperativeId_isActive_role_idx"
  ON "CooperativeMembership"("cooperativeId", "isActive", "role");
CREATE INDEX "CooperativeMembership_invitedByUserId_idx"
  ON "CooperativeMembership"("invitedByUserId");

CREATE UNIQUE INDEX "Notification_type_entityType_entityId_key"
  ON "Notification"("type", "entityType", "entityId");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "Notification_entityType_entityId_idx"
  ON "Notification"("entityType", "entityId");

CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key"
  ON "NotificationRecipient"("notificationId", "userId");
CREATE INDEX "NotificationRecipient_userId_readAt_createdAt_idx"
  ON "NotificationRecipient"("userId", "readAt", "createdAt");
CREATE INDEX "NotificationRecipient_notificationId_idx"
  ON "NotificationRecipient"("notificationId");

ALTER TABLE "CooperativeApplication" ADD CONSTRAINT "CooperativeApplication_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CooperativeApplication" ADD CONSTRAINT "CooperativeApplication_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooperativeApplication" ADD CONSTRAINT "CooperativeApplication_cooperativeId_fkey"
  FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeMembership" ADD CONSTRAINT "CooperativeMembership_cooperativeId_fkey"
  FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CooperativeMembership" ADD CONSTRAINT "CooperativeMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CooperativeMembership" ADD CONSTRAINT "CooperativeMembership_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve fixed global roles. Membership activation mirrors the existing account state,
-- and the lowest-id active staff account is the deterministic owner for each cooperative.
INSERT INTO "CooperativeMembership" (
  "cooperativeId",
  "userId",
  "role",
  "isActive",
  "invitedByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  staff."cooperativeId",
  staff."id",
  CASE
    WHEN staff."isActive"
      AND staff."id" = MIN(staff."id") FILTER (WHERE staff."isActive")
        OVER (PARTITION BY staff."cooperativeId")
      THEN 'OWNER'::"CooperativeMemberRole"
    ELSE 'STAFF'::"CooperativeMemberRole"
  END,
  staff."isActive",
  NULL,
  staff."createdAt",
  CURRENT_TIMESTAMP
FROM "User" AS staff
WHERE staff."role" = 'COOPERATIVE_STAFF'
  AND staff."cooperativeId" IS NOT NULL
ORDER BY staff."cooperativeId", staff."id";
