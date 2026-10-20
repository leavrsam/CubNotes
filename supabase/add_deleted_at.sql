-- =========================================================================
-- Add deleted_at column for soft-delete and 30-day trash support
-- Project: CubNotes
--
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gweaekdjdejysujlavou/sql
-- =========================================================================

ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
