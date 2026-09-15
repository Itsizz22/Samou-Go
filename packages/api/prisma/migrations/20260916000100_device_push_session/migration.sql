-- Additive only. Legacy registrations remain stored, but must rebind on app open.
ALTER TABLE "device_tokens" ADD COLUMN "refreshTokenId" TEXT;
CREATE INDEX "device_tokens_refreshTokenId_idx" ON "device_tokens"("refreshTokenId");
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_refreshTokenId_fkey" FOREIGN KEY ("refreshTokenId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
