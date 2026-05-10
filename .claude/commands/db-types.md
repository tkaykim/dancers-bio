---
description: Regenerate TypeScript types from Supabase live schema and report changes
disable-model-invocation: true
---

Run `npm run db:types` to regenerate `src/lib/supabase/types.ts` from the dancersbio Supabase schema.

Steps:
1. Run the script and capture output:
   ```bash
   npm run db:types 2>&1
   ```
2. If the script fails because `supabase login` hasn't been run, instruct the user:
   "Run `npx supabase login` once on this machine, then `/db-types` again."
3. After successful generation, run a diff vs HEAD if in a git repo:
   ```bash
   git diff src/lib/supabase/types.ts | head -80
   ```
4. Summarize what changed (new tables, columns, types) in 2–4 bullet points.
