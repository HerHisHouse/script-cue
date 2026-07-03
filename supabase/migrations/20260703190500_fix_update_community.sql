DROP POLICY IF EXISTS "Allow authenticated update to community_waitlist" ON community_waitlist;

CREATE POLICY "Allow authenticated update to community_waitlist"
ON community_waitlist
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() OR
  email = (auth.jwt() ->> 'email')
)
WITH CHECK (
  user_id = auth.uid() OR
  email = (auth.jwt() ->> 'email')
);
