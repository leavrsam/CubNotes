-- ==============================================================================
-- Motif User API Keys Schema & Assistant Integration
-- ==============================================================================

-- 1. Create table for user-scoped API keys
CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT 'Jarvis Assistant',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_key ON public.user_api_keys (api_key);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys (user_id);

-- 2. Add user_id column to motif_notes table if not already present
ALTER TABLE public.motif_notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_motif_notes_user_id ON public.motif_notes (user_id);

-- 3. Row Level Security for user_api_keys
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own API keys" ON public.user_api_keys;
CREATE POLICY "Users can view their own API keys"
ON public.user_api_keys FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own API keys" ON public.user_api_keys;
CREATE POLICY "Users can create their own API keys"
ON public.user_api_keys FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own API keys" ON public.user_api_keys;
CREATE POLICY "Users can update their own API keys"
ON public.user_api_keys FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.user_api_keys;
CREATE POLICY "Users can delete their own API keys"
ON public.user_api_keys FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow service_role and anon (for internal API routes authenticated via key)
DROP POLICY IF EXISTS "Allow API key lookup" ON public.user_api_keys;
CREATE POLICY "Allow API key lookup"
ON public.user_api_keys FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- 4. Secure RPC function: jarvis_get_user_pages
-- Returns the latest pages belonging to the user for Jarvis listing
CREATE OR REPLACE FUNCTION public.jarvis_get_user_pages(
    p_user_id UUID,
    p_search TEXT DEFAULT '',
    p_limit INT DEFAULT 15
)
RETURNS TABLE (
    page_id UUID,
    title TEXT,
    date DATE,
    created_at TIMESTAMP WITH TIME ZONE,
    notebook_title TEXT,
    section_title TEXT,
    content_preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS page_id,
        p.title,
        p.date,
        p.created_at,
        n.title AS notebook_title,
        s.title AS section_title,
        COALESCE(
            (
                SELECT string_agg(
                    regexp_replace(elem->>'content', '<[^>]+>', ' ', 'g'),
                    ' '
                )
                FROM jsonb_array_elements(p.document_state->'texts') AS elem
            ),
            ''
        ) AS content_preview
    FROM public.pages p
    JOIN public.sections s ON s.id = p.section_id
    JOIN public.notebooks n ON n.id = s.notebook_id
    WHERE n.user_id = p_user_id
      AND (p.deleted_at IS NULL)
      AND (p_search = '' OR p.title ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$;

-- 5. Secure RPC function: jarvis_read_user_page
-- Reads a specific page's text content by title
CREATE OR REPLACE FUNCTION public.jarvis_read_user_page(
    p_user_id UUID,
    p_title TEXT
)
RETURNS TABLE (
    page_id UUID,
    title TEXT,
    date DATE,
    created_at TIMESTAMP WITH TIME ZONE,
    content TEXT,
    raw_document_state JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS page_id,
        p.title,
        p.date,
        p.created_at,
        COALESCE(
            (
                SELECT string_agg(
                    regexp_replace(elem->>'content', '<[^>]+>', ' ', 'g'),
                    E'\n\n'
                )
                FROM jsonb_array_elements(p.document_state->'texts') AS elem
            ),
            ''
        ) AS content,
        p.document_state AS raw_document_state
    FROM public.pages p
    JOIN public.sections s ON s.id = p.section_id
    JOIN public.notebooks n ON n.id = s.notebook_id
    WHERE n.user_id = p_user_id
      AND (p.deleted_at IS NULL)
      AND (p.title ILIKE p_title OR p.title ILIKE '%' || p_title || '%')
    ORDER BY (p.title ILIKE p_title) DESC, p.created_at DESC
    LIMIT 1;
END;
$$;
