-- AddDeviceInfo to DeviceTokens
-- Multi-device support: store an optional free-form device description so a
-- driver's registered devices are distinguishable in admin tooling.
ALTER TABLE "device_tokens" ADD COLUMN "deviceInfo" TEXT;