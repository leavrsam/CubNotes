-- ==============================================================================
-- pages.updated_at: bump on every change (editor saves AND Jarvis API writes)
-- Safe to run more than once.
-- ==============================================================================

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill: use the last change time stamped inside the document if present
UPDATE public.pages
SET updated_at = COALESCE(
  (document_state->>'_updatedAt')::timestamptz,
  to_timestamp(NULLIF(document_state->>'_clientUpdatedAt', '')::double precision / 1000.0),
  created_at,
  NOW()
)
WHERE updated_at IS NULL OR updated_at = created_at;

CREATE OR REPLACE FUNCTION public.set_pages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_pages_updated_at ON public.pages;
CREATE TRIGGER trigger_pages_updated_at
BEFORE UPDATE ON public.pages
FOR EACH ROW
EXECUTE FUNCTION public.set_pages_updated_at();

NOTIFY pgrst, 'reload schema';
