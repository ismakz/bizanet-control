-- Hotspot MikroTik credentials synced from BizaNet-Agent
ALTER TABLE "customers" ADD COLUMN "hotspotUsername" TEXT;
ALTER TABLE "customers" ADD COLUMN "hotspotPassword" TEXT;
ALTER TABLE "customers" ADD COLUMN "hotspotProfile" TEXT;
ALTER TABLE "customers" ADD COLUMN "hotspotEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "hotspotCreatedAt" TIMESTAMP(3);
