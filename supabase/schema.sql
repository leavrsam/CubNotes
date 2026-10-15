-- Supabase Schema for Project Zenith Notes

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Notebooks Table
CREATE TABLE notebooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_journal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sections Table
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pages Table
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date DATE,
    is_journal_entry BOOLEAN DEFAULT false,
    document_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Notebooks Policies
CREATE POLICY "Users can view their own notebooks" 
ON notebooks FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notebooks" 
ON notebooks FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notebooks" 
ON notebooks FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notebooks" 
ON notebooks FOR DELETE 
USING (auth.uid() = user_id);

-- Sections Policies
CREATE POLICY "Users can view sections of their notebooks" 
ON sections FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM notebooks 
        WHERE notebooks.id = sections.notebook_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert sections to their notebooks" 
ON sections FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM notebooks 
        WHERE notebooks.id = sections.notebook_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update sections of their notebooks" 
ON sections FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM notebooks 
        WHERE notebooks.id = sections.notebook_id 
        AND notebooks.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM notebooks 
        WHERE notebooks.id = sections.notebook_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete sections of their notebooks" 
ON sections FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM notebooks 
        WHERE notebooks.id = sections.notebook_id 
        AND notebooks.user_id = auth.uid()
    )
);

-- Pages Policies
CREATE POLICY "Users can view pages of their sections" 
ON pages FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM sections 
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert pages to their sections" 
ON pages FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM sections 
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update pages of their sections" 
ON pages FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM sections 
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id 
        AND notebooks.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM sections 
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete pages of their sections" 
ON pages FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM sections 
        JOIN notebooks ON notebooks.id = sections.notebook_id
        WHERE sections.id = pages.section_id 
        AND notebooks.user_id = auth.uid()
    )
);


-- Page Versions Table
CREATE TABLE page_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    document_state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE page_versions ENABLE ROW LEVEL SECURITY;

-- Page Versions Policies
CREATE POLICY "Users can view versions of their pages" 
ON page_versions FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM pages
        JOIN sections ON pages.section_id = sections.id
        JOIN notebooks ON sections.notebook_id = notebooks.id
        WHERE pages.id = page_versions.page_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert versions of their pages" 
ON page_versions FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM pages
        JOIN sections ON pages.section_id = sections.id
        JOIN notebooks ON sections.notebook_id = notebooks.id
        WHERE pages.id = page_versions.page_id 
        AND notebooks.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete versions of their pages" 
ON page_versions FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM pages
        JOIN sections ON pages.section_id = sections.id
        JOIN notebooks ON sections.notebook_id = notebooks.id
        WHERE pages.id = page_versions.page_id 
        AND notebooks.user_id = auth.uid()
    )
);

-- Tiered Version Retention Function (Keeps up to 2 months old: 10 today, 5/day this week, 1/day up to 60 days)
CREATE OR REPLACE FUNCTION prune_page_versions_tiered(target_page_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Delete versions older than 60 days (2 months)
    DELETE FROM page_versions
    WHERE page_id = target_page_id
      AND created_at < NOW() - INTERVAL '60 days';

    -- 2. Same day (today): keep latest 10, delete rest
    DELETE FROM page_versions
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
            FROM page_versions
            WHERE page_id = target_page_id
              AND created_at::date = CURRENT_DATE
        ) sub
        WHERE rn > 10
    );

    -- 3. Last 7 days (days 1-7, excluding today): keep up to 5 per calendar day
    DELETE FROM page_versions
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY created_at::date ORDER BY created_at DESC) as rn
            FROM page_versions
            WHERE page_id = target_page_id
              AND created_at::date >= CURRENT_DATE - INTERVAL '7 days'
              AND created_at::date < CURRENT_DATE
        ) sub
        WHERE rn > 5
    );

    -- 4. Days 8 to 60 (month 1 to month 2): keep up to 1 per calendar day
    DELETE FROM page_versions
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY created_at::date ORDER BY created_at DESC) as rn
            FROM page_versions
            WHERE page_id = target_page_id
              AND created_at::date >= CURRENT_DATE - INTERVAL '60 days'
              AND created_at::date < CURRENT_DATE - INTERVAL '7 days'
        ) sub
        WHERE rn > 1
    );
END;
$$;

-- Trigger to auto-prune versions on insert
CREATE OR REPLACE FUNCTION trigger_prune_page_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM prune_page_versions_tiered(NEW.page_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_page_version_insert ON page_versions;
CREATE TRIGGER after_page_version_insert
AFTER INSERT ON page_versions
FOR EACH ROW
EXECUTE FUNCTION trigger_prune_page_versions();


-- Storage Bucket for Audio & Media Recordings
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recordings', 'recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Recordings
CREATE POLICY "Public Access for Recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'recordings');

CREATE POLICY "Authenticated users can upload recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recordings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update recordings"
ON storage.objects FOR UPDATE
USING (bucket_id = 'recordings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete recordings"
ON storage.objects FOR DELETE
USING (bucket_id = 'recordings' AND auth.role() = 'authenticated');

-- 30-Day Trash & Soft-Delete Support
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;


