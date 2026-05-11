-- Add router management fields used by COMPANY_ADMIN and CEO.
ALTER TABLE "routers"
ADD COLUMN "apiPort" INTEGER NOT NULL DEFAULT 8728,
ADD COLUMN "location" TEXT,
ADD COLUMN "networkMode" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3);
