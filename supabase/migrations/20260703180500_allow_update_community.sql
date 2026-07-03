CREATE POLICY "Allow authenticated update to community_waitlist"
ON community_waitlist
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
