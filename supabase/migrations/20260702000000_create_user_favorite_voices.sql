-- Create user_favorite_voices table
CREATE TABLE user_favorite_voices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    voice_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, voice_id, provider)
);

-- Enable RLS
ALTER TABLE user_favorite_voices ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their favorite voices" 
ON user_favorite_voices FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their favorite voices" 
ON user_favorite_voices FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their favorite voices" 
ON user_favorite_voices FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_user_favorite_voices_user ON user_favorite_voices(user_id);
