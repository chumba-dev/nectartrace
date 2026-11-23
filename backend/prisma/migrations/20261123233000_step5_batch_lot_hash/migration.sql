ALTER TABLE "HoneyBatch"
  ADD COLUMN "lotIdsHash" TEXT;

CREATE UNIQUE INDEX "HoneyBatch_lotIdsHash_key"
  ON "HoneyBatch"("lotIdsHash");
