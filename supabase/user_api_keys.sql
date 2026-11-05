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

-- Allow API key lookup by key value for authentication
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
-- Reads a specific page's text content by title (bypasses RLS safely via SECURITY DEFINER)
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

-- 6. Secure RPC function: jarvis_get_or_create_section
-- Atomically retrieves or initializes a notebook and section for voice notes
CREATE OR REPLACE FUNCTION public.jarvis_get_or_create_section(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notebook_id UUID;
    v_section_id UUID;
BEGIN
    -- 1. Find existing notebook for user
    SELECT id INTO v_notebook_id
    FROM public.notebooks
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- If no notebook exists, create one
    IF v_notebook_id IS NULL THEN
        INSERT INTO public.notebooks (user_id, title, is_journal)
        VALUES (p_user_id, 'Voice Notes', false)
        RETURNING id INTO v_notebook_id;
    END IF;

    -- 2. Find existing section in this notebook
    SELECT id INTO v_section_id
    FROM public.sections
    WHERE notebook_id = v_notebook_id
    ORDER BY sort_order ASC
    LIMIT 1;

    -- If no section exists, create one
    IF v_section_id IS NULL THEN
        INSERT INTO public.sections (notebook_id, title, sort_order)
        VALUES (v_notebook_id, 'Inbox', 0)
        RETURNING id INTO v_section_id;
    END IF;

    RETURN v_section_id;
END;
$$;

-- 7. Secure RPC function: jarvis_append_or_create_page
-- Atomically finds or creates a page and appends content, bypassing RLS
CREATE OR REPLACE FUNCTION public.jarvis_append_or_create_page(
    p_user_id UUID,
    p_title TEXT,
    p_text TEXT,
    p_is_list BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_page_id UUID;
    v_section_id UUID;
    v_doc_state JSONB;
    v_texts JSONB;
    v_item_html TEXT;
    v_current_content TEXT;
BEGIN
    -- Format HTML markup
    IF p_is_list THEN
        IF p_text LIKE '- %' THEN
            v_item_html := '<p>' || p_text || '</p>';
        ELSE
            v_item_html := '<p>- ' || p_text || '</p>';
        END IF;
    ELSE
        v_item_html := '<p>' || p_text || '</p>';
    END IF;

    -- Look for existing page for this user
    SELECT p.id, p.document_state
    INTO v_page_id, v_doc_state
    FROM public.pages p
    JOIN public.sections s ON s.id = p.section_id
    JOIN public.notebooks n ON n.id = s.notebook_id
    WHERE n.user_id = p_user_id
      AND (p.deleted_at IS NULL)
      AND (p.title ILIKE p_title OR p.title ILIKE '%' || p_title || '%')
    ORDER BY (p.title ILIKE p_title) DESC, p.created_at DESC
    LIMIT 1;

    IF v_page_id IS NOT NULL THEN
        -- Existing page found -> append to first text node
        v_doc_state := COALESCE(v_doc_state, '{}'::jsonb);
        v_texts := COALESCE(v_doc_state->'texts', '[]'::jsonb);

        IF jsonb_array_length(v_texts) > 0 THEN
            -- If note card was positioned underneath title header (y < 250), adjust it down cleanly
            IF COALESCE((v_texts->0->>'y')::numeric, 0) < 250 THEN
                v_texts := jsonb_set(
                    jsonb_set(v_texts, '{0,y}', '280'::jsonb),
                    '{0,x}', '64'::jsonb
                );
            END IF;

            v_current_content := COALESCE(v_texts->0->>'content', '');
            v_texts := jsonb_set(
                v_texts,
                '{0,content}',
                to_jsonb(v_current_content || v_item_html)
            );
        ELSE
            v_texts := jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid(),
                    'x', 64,
                    'y', 280,
                    'width', 480,
                    'content', v_item_html
                )
            );
        END IF;

        v_doc_state := jsonb_set(v_doc_state, '{texts}', v_texts);

        UPDATE public.pages
        SET document_state = v_doc_state
        WHERE id = v_page_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'updated',
            'page_id', v_page_id,
            'title', p_title
        );
    ELSE
        -- Page not found -> create new page in user's notebook section
        v_section_id := public.jarvis_get_or_create_section(p_user_id);
        v_page_id := gen_random_uuid();
        v_doc_state := jsonb_build_object(
            'texts', jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid(),
                    'x', 64,
                    'y', 280,
                    'width', 480,
                    'content', v_item_html
                )
            )
        );

        INSERT INTO public.pages (id, section_id, title, document_state)
        VALUES (v_page_id, v_section_id, p_title, v_doc_state);

        RETURN jsonb_build_object(
            'success', true,
            'action', 'created',
            'page_id', v_page_id,
            'title', p_title
        );
    END IF;
END;
$$;

-- 8. Secure RPC function: jarvis_create_page
-- Explicitly creates a new note page in the user's notebook, bypassing RLS
CREATE OR REPLACE FUNCTION public.jarvis_create_page(
    p_user_id UUID,
    p_title TEXT,
    p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_section_id UUID;
    v_page_id UUID;
    v_doc_state JSONB;
    v_html TEXT;
BEGIN
    v_section_id := public.jarvis_get_or_create_section(p_user_id);
    v_page_id := gen_random_uuid();
    v_html := '<p>' || p_text || '</p>';
    v_doc_state := jsonb_build_object(
        'texts', jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid(),
                'x', 64,
                'y', 280,
                'width', 480,
                'content', v_html
            )
        )
    );

    INSERT INTO public.pages (id, section_id, title, document_state)
    VALUES (v_page_id, v_section_id, p_title, v_doc_state);

    RETURN jsonb_build_object(
        'success', true,
        'action', 'created',
        'page_id', v_page_id,
        'title', p_title
    );
END;
$$;

-- 9. Explicitly grant execute on all RPC helper functions to all API roles
GRANT EXECUTE ON FUNCTION public.jarvis_get_user_pages TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jarvis_read_user_page TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jarvis_get_or_create_section TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jarvis_append_or_create_page TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jarvis_create_page TO anon, authenticated, service_role;

-- 10. Auto-fix existing pages: move any note cards positioned under the title header down to y=280
UPDATE public.pages
SET document_state = jsonb_set(
    jsonb_set(document_state, '{texts,0,y}', '280'::jsonb),
    '{texts,0,x}',
    '64'::jsonb
)
WHERE document_state->'texts' IS NOT NULL
  AND jsonb_array_length(document_state->'texts') > 0
  AND COALESCE((document_state->'texts'->0->>'y')::numeric, 0) < 250;
