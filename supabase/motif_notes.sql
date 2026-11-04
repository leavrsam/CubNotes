-- ==============================================================================
-- Motif Notes Schema for Home Assistant (Jarvis via n8n voice integration)
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.motif_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    note_type TEXT DEFAULT 'note', -- 'note', 'list', 'thought', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Indexes for fast case-insensitive lookups and sorting
CREATE INDEX IF NOT EXISTS idx_motif_notes_title ON public.motif_notes (title);
CREATE INDEX IF NOT EXISTS idx_motif_notes_updated_at ON public.motif_notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_motif_notes_note_type ON public.motif_notes (note_type);

-- 3. Row Level Security (RLS)
ALTER TABLE public.motif_notes ENABLE ROW LEVEL SECURITY;

-- Allow full access to service_role, anon, and authenticated roles so that
-- the protected internal Next.js API route (/api/jarvis) can manage notes
-- regardless of which key is present in environment (Service Role or Anon).
DROP POLICY IF EXISTS "Allow API access to motif_notes" ON public.motif_notes;
CREATE POLICY "Allow API access to motif_notes"
ON public.motif_notes
FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- 4. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION update_motif_notes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_motif_notes_updated_at ON public.motif_notes;
CREATE TRIGGER trigger_motif_notes_updated_at
BEFORE UPDATE ON public.motif_notes
FOR EACH ROW
EXECUTE FUNCTION update_motif_notes_timestamp();
