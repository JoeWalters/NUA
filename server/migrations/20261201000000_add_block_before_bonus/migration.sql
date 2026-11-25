-- A device that was blocked when bonus time started must be blocked again when it ends.
-- Nullable: existing rows are unaffected, NULL/false both mean "nothing owed".
ALTER TABLE "Device" ADD COLUMN "blockBeforeBonus" BOOLEAN;
