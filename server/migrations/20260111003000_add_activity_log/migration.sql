-- Activity Log — a queryable audit trail of all block/unblock/pause/bonus events.

CREATE TABLE "ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceMac" TEXT,
    "blockMode" TEXT,
    "detail" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true
);

-- Index for time-ordered queries (most recent first).
CREATE INDEX "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp" DESC);
