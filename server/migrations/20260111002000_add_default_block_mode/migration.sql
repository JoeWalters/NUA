-- Default Block Behavior: three-level hierarchy (Device > Group > Global).
--
-- Device.blockMode becomes nullable (null = inherit from group/global).
-- Existing "full" values are backfilled to null so they inherit.
-- DeviceGroup.defaultBlockMode and Credentials.defaultBlockMode are new.
--
-- SQLite requires a table rebuild to change a column from NOT NULL to nullable.

-- Rebuild Device table with blockMode nullable.
CREATE TABLE "Device_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "bonusTimeActive" BOOLEAN NOT NULL DEFAULT false,
    "bonusTimeExpiresAt" DATETIME,
    "blockMode" TEXT,
    "pausedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER,
    "deviceGroupId" INTEGER,
    CONSTRAINT "Device_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "DeviceGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy data, converting "full" to NULL (inherit).
INSERT INTO "Device_new" ("id", "name", "macAddress", "active", "bonusTimeActive", "bonusTimeExpiresAt", "blockMode", "pausedUntil", "createdAt", "order", "deviceGroupId")
SELECT "id", "name", "macAddress", "active", "bonusTimeActive", "bonusTimeExpiresAt",
  CASE WHEN "blockMode" = 'full' THEN NULL ELSE "blockMode" END,
  "pausedUntil", "createdAt", "order", "deviceGroupId"
FROM "Device";

DROP TABLE "Device";
ALTER TABLE "Device_new" RENAME TO "Device";

-- Add defaultBlockMode to DeviceGroup (null = inherit from global).
ALTER TABLE "DeviceGroup" ADD COLUMN "defaultBlockMode" TEXT;

-- Add defaultBlockMode to Credentials (null = "full" fallback).
ALTER TABLE "Credentials" ADD COLUMN "defaultBlockMode" TEXT;
