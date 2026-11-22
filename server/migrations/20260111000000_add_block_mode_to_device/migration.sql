-- Add blockMode to Device.
-- Values: "full" (association-level block, current default),
--         "internet" (firewall LAN→WAN deny, device stays on LAN),
--         "speedlimit" (qos-rule cap at 1–2 Kbps, device online but unusable).
-- Existing devices default to "full" — backward compatible.

ALTER TABLE "Device" ADD COLUMN "blockMode" TEXT NOT NULL DEFAULT 'full';
