-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EasySchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" INTEGER,
    "day" INTEGER,
    "minute" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "ampm" TEXT NOT NULL,
    "date" TEXT,
    "blockAllow" TEXT NOT NULL,
    "jobName" TEXT,
    "deviceId" INTEGER,
    "toggleSched" BOOLEAN,
    CONSTRAINT "EasySchedule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EasySchedule" ("ampm", "blockAllow", "createdAt", "date", "day", "deviceId", "hour", "id", "jobName", "minute", "month", "toggleSched") SELECT "ampm", "blockAllow", "createdAt", "date", "day", "deviceId", "hour", "id", "jobName", "minute", "month", "toggleSched" FROM "EasySchedule";
DROP TABLE "EasySchedule";
ALTER TABLE "new_EasySchedule" RENAME TO "EasySchedule";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
