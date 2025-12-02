-- Create scenes table
CREATE TABLE IF NOT EXISTS scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    heading TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '[Sin contenido]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create lines table
CREATE TABLE IF NOT EXISTS lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
    character_name TEXT NOT NULL,
    content TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    prosody_hints JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lines ENABLE ROW LEVEL SECURITY;

-- Create policies for scenes
CREATE POLICY "Users can view scenes of their scripts" ON scenes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = scenes.script_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert scenes to their scripts" ON scenes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = scenes.script_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update scenes of their scripts" ON scenes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = scenes.script_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete scenes of their scripts" ON scenes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = scenes.script_id
            AND scripts.user_id = auth.uid()
        )
    );

-- Create policies for lines
CREATE POLICY "Users can view lines of their scenes" ON lines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN scripts ON scripts.id = scenes.script_id
            WHERE scenes.id = lines.scene_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert lines to their scenes" ON lines
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN scripts ON scripts.id = scenes.script_id
            WHERE scenes.id = lines.scene_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update lines of their scenes" ON lines
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN scripts ON scripts.id = scenes.script_id
            WHERE scenes.id = lines.scene_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete lines of their scenes" ON lines
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN scripts ON scripts.id = scenes.script_id
            WHERE scenes.id = lines.scene_id
            AND scripts.user_id = auth.uid()
        )
    );
