-- Allow insert from anon (for the web landing)
ALTER TABLE community_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert to community_waitlist"
ON community_waitlist
FOR INSERT
TO anon
WITH CHECK (true);

-- Also allow insert from authenticated users just in case it isn't set
CREATE POLICY "Allow authenticated insert to community_waitlist"
ON community_waitlist
FOR INSERT
TO authenticated
WITH CHECK (true);
