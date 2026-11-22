-- Add pausedUntil to Device for the Pause Internet Timer feature.
-- When a device is paused, active is false and pausedUntil holds the expiry
-- timestamp. On timer expiry (or server restart with a past expiry), the
-- device is unblocked and pausedUntil is cleared.
-- This mirrors bonusTimeExpiresAt but for the inverse state (blocked, not unblocked).

ALTER TABLE "Device" ADD COLUMN "pausedUntil" DATETIME;
