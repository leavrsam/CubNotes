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
