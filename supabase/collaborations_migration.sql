-- ==============================================================================
-- COLLABORATIONS & SHARING MIGRATION FOR CUBNOTES
-- Run this in your Supabase Dashboard SQL Editor
-- ==============================================================================

-- 1. Create the Collaborations Table
CREATE TABLE IF NOT EXISTS collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('notebook', 'section', 'page')),
    resource_id UUID NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collaborator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    collaborator_email TEXT,
    invite_token TEXT UNIQUE NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('edit', 'view')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 2. Indexes for Fast Lookups
CREATE INDEX IF NOT EXISTS idx_collaborations_token ON collaborations(invite_token);
CREATE INDEX IF NOT EXISTS idx_collaborations_resource ON collaborations(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_user ON collaborations(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_email ON collaborations(collaborator_email);
CREATE INDEX IF NOT EXISTS idx_collaborations_owner ON collaborations(owner_id);

-- 3. Enable RLS on Collaborations
ALTER TABLE collaborations ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Collaborations
DROP POLICY IF EXISTS "Owners can do everything on their collaborations" ON collaborations;
CREATE POLICY "Owners can do everything on their collaborations"
ON collaborations FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Collaborators can view their collaborations" ON collaborations;
CREATE POLICY "Collaborators can view their collaborations"
ON collaborations FOR SELECT
USING (
    collaborator_id = auth.uid() 
    OR (collaborator_email IS NOT NULL AND LOWER(collaborator_email) = LOWER(auth.jwt() ->> 'email'))
);

DROP POLICY IF EXISTS "Public can view invite by token" ON collaborations;
CREATE POLICY "Public can view invite by token"
ON collaborations FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can accept invite" ON collaborations;
CREATE POLICY "Authenticated users can accept invite"
ON collaborations FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Helper Function to Get Invite Details (Safe for Unauthenticated / Invitee Preview)
CREATE OR REPLACE FUNCTION get_collaboration_invite_details(token_input TEXT)
RETURNS TABLE (
    id UUID,
    resource_type TEXT,
    resource_id UUID,
    resource_title TEXT,
    owner_email TEXT,
    owner_name TEXT,
    permission TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.resource_type,
        c.resource_id,
        COALESCE(
            CASE 
                WHEN c.resource_type = 'notebook' THEN (SELECT nb.title FROM notebooks nb WHERE nb.id = c.resource_id)
                WHEN c.resource_type = 'section' THEN (SELECT s.title FROM sections s WHERE s.id = c.resource_id)
                WHEN c.resource_type = 'page' THEN (SELECT p.title FROM pages p WHERE p.id = c.resource_id)
            END,
            'Shared Note'
        ) as resource_title,
        COALESCE(u.email, 'A CubNotes user') as owner_email,
        COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) as owner_name,
        c.permission,
        c.status,
        c.created_at
    FROM collaborations c
    LEFT JOIN auth.users u ON u.id = c.owner_id
    WHERE c.invite_token = token_input
    LIMIT 1;
END;
$$;

-- 6. Helper Function to Accept an Invitation Token
CREATE OR REPLACE FUNCTION accept_collaboration_invite(token_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_collab RECORD;
    res_title TEXT;
    target_page_id UUID;
    target_section_id UUID;
    target_notebook_id UUID;
    current_uid UUID;
    current_email TEXT;
BEGIN
    current_uid := auth.uid();
    current_email := auth.jwt() ->> 'email';

    IF current_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must be authenticated to accept invitation');
    END IF;

    SELECT * INTO target_collab 
    FROM collaborations 
    WHERE invite_token = token_input;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation token');
    END IF;

    -- Update collaboration record
    UPDATE collaborations
    SET 
        collaborator_id = current_uid,
        collaborator_email = COALESCE(collaborator_email, current_email),
        status = 'accepted',
        accepted_at = NOW()
    WHERE id = target_collab.id;

    -- Resolve IDs for seamless navigation in the UI
    IF target_collab.resource_type = 'notebook' THEN
        target_notebook_id := target_collab.resource_id;
        SELECT title INTO res_title FROM notebooks WHERE id = target_notebook_id;
        -- Find first page if available
        SELECT p.id INTO target_page_id 
        FROM pages p 
        JOIN sections s ON s.id = p.section_id 
        WHERE s.notebook_id = target_notebook_id 
        ORDER BY s.sort_order, p.created_at DESC LIMIT 1;
    ELSIF target_collab.resource_type = 'section' THEN
        target_section_id := target_collab.resource_id;
        SELECT title, notebook_id INTO res_title, target_notebook_id FROM sections WHERE id = target_section_id;
        SELECT id INTO target_page_id FROM pages WHERE section_id = target_section_id ORDER BY created_at DESC LIMIT 1;
    ELSIF target_collab.resource_type = 'page' THEN
        target_page_id := target_collab.resource_id;
        SELECT p.title, s.id, s.notebook_id INTO res_title, target_section_id, target_notebook_id 
        FROM pages p 
        JOIN sections s ON s.id = p.section_id 
        WHERE p.id = target_page_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'resource_type', target_collab.resource_type,
        'resource_id', target_collab.resource_id,
        'title', COALESCE(res_title, 'Shared Item'),
        'page_id', target_page_id,
        'section_id', target_section_id,
        'notebook_id', target_notebook_id
    );
END;
$$;

-- 7. Update RLS on Notebooks
DROP POLICY IF EXISTS "Users can view their own notebooks" ON notebooks;
DROP POLICY IF EXISTS "Users can view own and shared notebooks" ON notebooks;
CREATE POLICY "Users can view own and shared notebooks"
ON notebooks FOR SELECT
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'notebook'
          AND c.resource_id = notebooks.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM sections s
        JOIN collaborations c ON c.resource_type = 'section' AND c.resource_id = s.id
        WHERE s.notebook_id = notebooks.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM sections s
        JOIN pages p ON p.section_id = s.id
        JOIN collaborations c ON c.resource_type = 'page' AND c.resource_id = p.id
        WHERE s.notebook_id = notebooks.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
);

DROP POLICY IF EXISTS "Users can update their own notebooks" ON notebooks;
DROP POLICY IF EXISTS "Users can update own and shared notebooks" ON notebooks;
CREATE POLICY "Users can update own and shared notebooks"
ON notebooks FOR UPDATE
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'notebook'
          AND c.resource_id = notebooks.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.permission = 'edit'
          AND c.status = 'accepted'
    )
);

-- 8. Update RLS on Sections
DROP POLICY IF EXISTS "Users can view sections of their notebooks" ON sections;
DROP POLICY IF EXISTS "Users can view own and shared sections" ON sections;
CREATE POLICY "Users can view own and shared sections"
ON sections FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM notebooks
        WHERE notebooks.id = sections.notebook_id
          AND notebooks.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'notebook'
          AND c.resource_id = sections.notebook_id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'section'
          AND c.resource_id = sections.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM pages p
        JOIN collaborations c ON c.resource_type = 'page' AND c.resource_id = p.id
        WHERE p.section_id = sections.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
);

DROP POLICY IF EXISTS "Users can insert sections to their notebooks" ON sections;
DROP POLICY IF EXISTS "Users can insert sections to own or shared notebooks" ON sections;
CREATE POLICY "Users can insert sections to own or shared notebooks"
ON sections FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM notebooks
        WHERE notebooks.id = sections.notebook_id
          AND (
            notebooks.user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'notebook'
                  AND c.resource_id = notebooks.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
          )
    )
);

DROP POLICY IF EXISTS "Users can update sections of their notebooks" ON sections;
DROP POLICY IF EXISTS "Users can update own and shared sections" ON sections;
CREATE POLICY "Users can update own and shared sections"
ON sections FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM notebooks
        WHERE notebooks.id = sections.notebook_id
          AND (
            notebooks.user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'notebook'
                  AND c.resource_id = notebooks.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
          )
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'section'
          AND c.resource_id = sections.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.permission = 'edit'
          AND c.status = 'accepted'
    )
);

-- 9. Update RLS on Pages
DROP POLICY IF EXISTS "Users can view pages of their sections" ON pages;
DROP POLICY IF EXISTS "Users can view own and shared pages" ON pages;
CREATE POLICY "Users can view own and shared pages"
ON pages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sections
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id
          AND notebooks.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM sections
        JOIN collaborations c ON c.resource_type = 'notebook' AND c.resource_id = sections.notebook_id
        WHERE sections.id = pages.section_id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'section' AND c.resource_id = pages.section_id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'page' AND c.resource_id = pages.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.status = 'accepted'
    )
);

DROP POLICY IF EXISTS "Users can insert pages to their sections" ON pages;
DROP POLICY IF EXISTS "Users can insert pages to own or shared sections" ON pages;
CREATE POLICY "Users can insert pages to own or shared sections"
ON pages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM sections
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id
          AND (
            notebooks.user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'notebook' AND c.resource_id = notebooks.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'section' AND c.resource_id = sections.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
          )
    )
);

DROP POLICY IF EXISTS "Users can update pages of their sections" ON pages;
DROP POLICY IF EXISTS "Users can update own and shared pages" ON pages;
CREATE POLICY "Users can update own and shared pages"
ON pages FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM sections
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id
          AND (
            notebooks.user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'notebook' AND c.resource_id = notebooks.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
            OR EXISTS (
                SELECT 1 FROM collaborations c
                WHERE c.resource_type = 'section' AND c.resource_id = sections.id
                  AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
                  AND c.permission = 'edit'
                  AND c.status = 'accepted'
            )
          )
    )
    OR EXISTS (
        SELECT 1 FROM collaborations c
        WHERE c.resource_type = 'page' AND c.resource_id = pages.id
          AND (c.collaborator_id = auth.uid() OR LOWER(c.collaborator_email) = LOWER(auth.jwt() ->> 'email'))
          AND c.permission = 'edit'
          AND c.status = 'accepted'
    )
);

-- 10. Update RLS on Page Versions
DROP POLICY IF EXISTS "Users can view versions of their pages" ON page_versions;
CREATE POLICY "Users can view versions of their pages"
ON page_versions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM pages
        WHERE pages.id = page_versions.page_id
    )
);

DROP POLICY IF EXISTS "Users can insert versions of their pages" ON page_versions;
CREATE POLICY "Users can insert versions of their pages"
ON page_versions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM pages
        WHERE pages.id = page_versions.page_id
    )
);

-- 11. Enable Realtime Publications for collaborations and pages
ALTER TABLE pages REPLICA IDENTITY FULL;
ALTER TABLE collaborations REPLICA IDENTITY FULL;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE collaborations;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE pages;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

