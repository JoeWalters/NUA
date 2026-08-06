-- Add deviceGroupId column to Cron table for group scheduling support
ALTER TABLE "Cron" ADD COLUMN "deviceGroupId" INTEGER;
ALTER TABLE "Cron" ADD CONSTRAINT "Cron_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "DeviceGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
