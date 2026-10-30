-- Lane B follow-up to 202610292013: anon has no write path (no INSERT/UPDATE/DELETE grant or policy) on any of the nine
-- guarded tables, so the anon EXECUTE added in 2013 is unnecessary, and tenant-security requires anon-callable SECURITY DEFINER
-- functions to be allowlisted. Restores anon to its pre-2013 state; authenticated keeps EXECUTE (the actual fix).
revoke execute on function public.fixture_purge_active() from anon;
