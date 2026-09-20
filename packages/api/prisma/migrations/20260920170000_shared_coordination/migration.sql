CREATE TABLE "shared_rate_limits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hits" INTEGER NOT NULL,
  "reset_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "shared_rate_limits_reset_at_idx" ON "shared_rate_limits"("reset_at");
CREATE TABLE "background_job_leases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL
);
