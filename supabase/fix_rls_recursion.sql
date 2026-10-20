-- =========================================================================
-- Fix Infinite Recursion in Row Level Security (RLS) Policies
-- Project: CubNotes
--
-- Root Cause:
-- The previous RLS policies for `notebooks`, `sections`, and `pages` each
-- had subqueries referencing the other tables. When PostgreSQL evaluated
-- notebooks -> sections -> notebooks -> sections, it detected an infinite
-- recursion loop.
--
-- Solution:
-- We define SECURITY DEFINER helper functions. In PostgreSQL, queries executed
-- inside SECURITY DEFINER functions bypass RLS evaluation on the underlying
-- tables, completely breaking the recursion cycle while maintaining 100%
-- security enforcement.
-- =========================================================================

-- 1. Helper function: Check if user has access to a notebook
CREATE OR REPLACE FUNCTION public.check_user_notebook_access(nb_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        -- User is the owner of the notebook
        EXISTS (
            SELECT 1 FROM notebooks
            WHERE id = nb_id AND user_id = u_id
        )
        -- OR User is directly a collaborator on this notebook
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'notebook'
              AND c.resource_id = nb_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- OR User is a collaborator on a section inside this notebook
        OR EXISTS (
            SELECT 1 FROM sections s
            JOIN collaborations c ON c.resource_type = 'section' AND c.resource_id = s.id
            WHERE s.notebook_id = nb_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- OR User is a collaborator on a page inside this notebook
        OR EXISTS (
            SELECT 1 FROM sections s
            JOIN pages p ON p.section_id = s.id
            JOIN collaborations c ON c.resource_type = 'page' AND c.resource_id = p.id
            WHERE s.notebook_id = nb_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
    );
$$;

-- 2. Helper function: Check if user can edit a notebook
CREATE OR REPLACE FUNCTION public.check_user_notebook_edit(nb_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        EXISTS (
            SELECT 1 FROM notebooks
            WHERE id = nb_id AND user_id = u_id
        )
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'notebook'
              AND c.resource_id = nb_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
    );
$$;

-- 3. Helper function: Check if user can view a section
CREATE OR REPLACE FUNCTION public.check_user_section_access(sec_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        -- Owner of parent notebook
        EXISTS (
            SELECT 1 FROM sections s
            JOIN notebooks n ON n.id = s.notebook_id
            WHERE s.id = sec_id AND n.user_id = u_id
        )
        -- Collaborator on parent notebook
        OR EXISTS (
            SELECT 1 FROM sections s
            JOIN collaborations c ON c.resource_type = 'notebook' AND c.resource_id = s.notebook_id
            WHERE s.id = sec_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- Collaborator on this section
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'section'
              AND c.resource_id = sec_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- Collaborator on a page inside this section
        OR EXISTS (
            SELECT 1 FROM pages p
            JOIN collaborations c ON c.resource_type = 'page' AND c.resource_id = p.id
            WHERE p.section_id = sec_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
    );
$$;

-- 4. Helper function: Check if user can edit a section
CREATE OR REPLACE FUNCTION public.check_user_section_edit(sec_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        EXISTS (
            SELECT 1 FROM sections s
            JOIN notebooks n ON n.id = s.notebook_id
            WHERE s.id = sec_id AND n.user_id = u_id
        )
        OR EXISTS (
            SELECT 1 FROM sections s
            JOIN collaborations c ON c.resource_type = 'notebook' AND c.resource_id = s.notebook_id
            WHERE s.id = sec_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'section'
              AND c.resource_id = sec_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
    );
$$;

-- 5. Helper function: Check if user can view a page
CREATE OR REPLACE FUNCTION public.check_user_page_access(p_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        -- Owner of parent notebook
        EXISTS (
            SELECT 1 FROM pages p
            JOIN sections s ON s.id = p.section_id
            JOIN notebooks n ON n.id = s.notebook_id
            WHERE p.id = p_id AND n.user_id = u_id
        )
        -- Collaborator on parent notebook
        OR EXISTS (
            SELECT 1 FROM pages p
            JOIN sections s ON s.id = p.section_id
            JOIN collaborations c ON c.resource_type = 'notebook' AND c.resource_id = s.notebook_id
            WHERE p.id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- Collaborator on parent section
        OR EXISTS (
            SELECT 1 FROM pages p
            JOIN collaborations c ON c.resource_type = 'section' AND c.resource_id = p.section_id
            WHERE p.id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
        -- Collaborator on this page
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'page'
              AND c.resource_id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.status = 'accepted'
        )
    );
$$;

-- 6. Helper function: Check if user can edit a page
CREATE OR REPLACE FUNCTION public.check_user_page_edit(p_id UUID, u_id UUID, u_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT (
        EXISTS (
            SELECT 1 FROM pages p
            JOIN sections s ON s.id = p.section_id
            JOIN notebooks n ON n.id = s.notebook_id
            WHERE p.id = p_id AND n.user_id = u_id
        )
        OR EXISTS (
            SELECT 1 FROM pages p
            JOIN sections s ON s.id = p.section_id
            JOIN collaborations c ON c.resource_type = 'notebook' AND c.resource_id = s.notebook_id
            WHERE p.id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
        OR EXISTS (
            SELECT 1 FROM pages p
            JOIN collaborations c ON c.resource_type = 'section' AND c.resource_id = p.section_id
            WHERE p.id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
        OR EXISTS (
            SELECT 1 FROM collaborations c
            WHERE c.resource_type = 'page'
              AND c.resource_id = p_id
              AND (c.collaborator_id = u_id OR (u_email IS NOT NULL AND LOWER(c.collaborator_email) = LOWER(u_email)))
              AND c.permission = 'edit'
              AND c.status = 'accepted'
        )
    );
$$;


-- =========================================================================
-- RE-APPLY RLS POLICIES USING NON-RECURSIVE SECURITY DEFINER HELPERS
-- =========================================================================

-- --- NOTEBOOKS ---
DROP POLICY IF EXISTS "Users can view own and shared notebooks" ON notebooks;
DROP POLICY IF EXISTS "Users can view their own notebooks" ON notebooks;
CREATE POLICY "Users can view own and shared notebooks"
ON notebooks FOR SELECT
USING (
    user_id = auth.uid() OR check_user_notebook_access(id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can update own and shared notebooks" ON notebooks;
DROP POLICY IF EXISTS "Users can update their own notebooks" ON notebooks;
CREATE POLICY "Users can update own and shared notebooks"
ON notebooks FOR UPDATE
USING (
    user_id = auth.uid() OR check_user_notebook_edit(id, auth.uid(), auth.jwt() ->> 'email')
);

-- --- SECTIONS ---
DROP POLICY IF EXISTS "Users can view own and shared sections" ON sections;
DROP POLICY IF EXISTS "Users can view sections of their notebooks" ON sections;
CREATE POLICY "Users can view own and shared sections"
ON sections FOR SELECT
USING (
    check_user_section_access(id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can insert sections to own or shared notebooks" ON sections;
DROP POLICY IF EXISTS "Users can insert sections to their notebooks" ON sections;
CREATE POLICY "Users can insert sections to own or shared notebooks"
ON sections FOR INSERT
WITH CHECK (
    check_user_notebook_edit(notebook_id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can update own and shared sections" ON sections;
DROP POLICY IF EXISTS "Users can update sections of their notebooks" ON sections;
CREATE POLICY "Users can update own and shared sections"
ON sections FOR UPDATE
USING (
    check_user_section_edit(id, auth.uid(), auth.jwt() ->> 'email')
);

-- --- PAGES ---
DROP POLICY IF EXISTS "Users can view own and shared pages" ON pages;
DROP POLICY IF EXISTS "Users can view pages of their sections" ON pages;
CREATE POLICY "Users can view own and shared pages"
ON pages FOR SELECT
USING (
    check_user_page_access(id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can insert pages to own or shared sections" ON pages;
DROP POLICY IF EXISTS "Users can insert pages to their sections" ON pages;
CREATE POLICY "Users can insert pages to own or shared sections"
ON pages FOR INSERT
WITH CHECK (
    check_user_section_edit(section_id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can update own and shared pages" ON pages;
DROP POLICY IF EXISTS "Users can update pages of their sections" ON pages;
CREATE POLICY "Users can update own and shared pages"
ON pages FOR UPDATE
USING (
    check_user_page_edit(id, auth.uid(), auth.jwt() ->> 'email')
);

-- --- PAGE VERSIONS ---
DROP POLICY IF EXISTS "Users can view versions of their pages" ON page_versions;
CREATE POLICY "Users can view versions of their pages"
ON page_versions FOR SELECT
USING (
    check_user_page_access(page_id, auth.uid(), auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can insert versions of their pages" ON page_versions;
CREATE POLICY "Users can insert versions of their pages"
ON page_versions FOR INSERT
WITH CHECK (
    check_user_page_edit(page_id, auth.uid(), auth.jwt() ->> 'email')
);
