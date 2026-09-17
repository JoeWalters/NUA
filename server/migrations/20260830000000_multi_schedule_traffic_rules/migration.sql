-- Traffic rules can now hold MANY schedules (mirrors device EasySchedule rows).
-- The previous design stored a single schedule as columns on the TrafficRules row;
-- that data is migrated into the new table and the old columns are dropped.

-- CreateTable
CREATE TABLE "TrafficRuleSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trafficRulesId" INTEGER NOT NULL,
    "scheduleType" TEXT,
    "scheduleDate" TEXT,
    "scheduleHour" INTEGER,
    "scheduleMinute" INTEGER,
    "scheduleDays" TEXT,
    "scheduleAction" TEXT,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleJobName" TEXT,
    CONSTRAINT "TrafficRuleSchedule_trafficRulesId_fkey" FOREIGN KEY ("trafficRulesId") REFERENCES "TrafficRules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrafficRuleSchedule_trafficRulesId_idx" ON "TrafficRuleSchedule"("trafficRulesId");

-- Copy any existing single schedules into the new table
INSERT INTO "TrafficRuleSchedule" ("trafficRulesId", "scheduleType", "scheduleDate", "scheduleHour", "scheduleMinute", "scheduleDays", "scheduleAction", "scheduleEnabled", "scheduleJobName")
SELECT "id", "scheduleType", "scheduleDate", "scheduleHour", "scheduleMinute", "scheduleDays", "scheduleAction", "scheduleEnabled", "scheduleJobName"
FROM "TrafficRules"
WHERE "scheduleType" IS NOT NULL;

-- Drop the old single-schedule columns
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleType";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleDate";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleHour";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleMinute";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleDays";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleAction";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleEnabled";
ALTER TABLE "TrafficRules" DROP COLUMN "scheduleJobName";
