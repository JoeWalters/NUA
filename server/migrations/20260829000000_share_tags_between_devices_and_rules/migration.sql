-- Drop the rule-specific tag tables; tags are now shared with devices via DeviceGroup.
DROP TABLE "TrafficRuleTags";
DROP TABLE "RuleTag";

-- CreateTable
CREATE TABLE "TrafficRuleTags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trafficRulesId" INTEGER NOT NULL,
    "deviceGroupId" INTEGER NOT NULL,
    CONSTRAINT "TrafficRuleTags_trafficRulesId_fkey" FOREIGN KEY ("trafficRulesId") REFERENCES "TrafficRules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrafficRuleTags_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "DeviceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficRuleTags_trafficRulesId_deviceGroupId_key" ON "TrafficRuleTags"("trafficRulesId", "deviceGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficRuleTags_deviceGroupId_trafficRulesId_key" ON "TrafficRuleTags"("deviceGroupId", "trafficRulesId");
