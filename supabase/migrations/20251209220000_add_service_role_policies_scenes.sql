-- Add service role policies for scenes and lines
-- This allows Edge Functions to insert/update/delete scenes and lines

-- Service role can do anything with scenes
CREATE POLICY "Service role can manage scenes" ON scenes
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Service role can do anything with lines
CREATE POLICY "Service role can manage lines" ON lines
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
