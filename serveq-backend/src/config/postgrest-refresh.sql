-- Run this once in Supabase → SQL Editor after creating or renaming tables.
-- Fixes: "Could not find the table 'public.<name>' in the schema cache"
NOTIFY pgrst, 'reload schema';
