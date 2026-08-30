-- CreateTable
CREATE TABLE "RuleTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3B82F6',
    "icon" TEXT DEFAULT '🏷️',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrafficRuleTags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trafficRulesId" INTEGER NOT NULL,
    "ruleTagId" INTEGER NOT NULL,
    CONSTRAINT "TrafficRuleTags_trafficRulesId_fkey" FOREIGN KEY ("trafficRulesId") REFERENCES "TrafficRules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrafficRuleTags_ruleTagId_fkey" FOREIGN KEY ("ruleTagId") REFERENCES "RuleTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficRuleTags_trafficRulesId_ruleTagId_key" ON "TrafficRuleTags"("trafficRulesId", "ruleTagId");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficRuleTags_ruleTagId_trafficRulesId_key" ON "TrafficRuleTags"("ruleTagId", "trafficRulesId");
