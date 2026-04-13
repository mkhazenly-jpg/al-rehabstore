-- Drop the existing permissive self-update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate with a WITH CHECK that blocks self-approval changes
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.user_id = auth.uid())
);