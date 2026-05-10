---
description: Seed development fixtures (test users, sample projects, applications)
disable-model-invocation: true
---

Seed development fixtures into the dancersbio Supabase project for end-to-end testing.

Before running, confirm:
- We are NOT in production (check `NEXT_PUBLIC_APP_URL` is localhost)
- Existing dancers/careers should NOT be modified

Idempotent seed plan:
1. Create 2 test auth users (if not exist) via `auth.users` insert with `email_confirmed_at = now()`:
   - dancer-test@local.dev (password: TestPass123!)
   - client-test@local.dev (password: TestPass123!)
2. The `handle_new_user` trigger creates their `profiles` row.
3. Set `client-test`'s `can_create_project = true` directly on profiles.
4. Create a sample public project owned by `client-test`:
   - title "테스트 공개 프로젝트", description, visibility=public, status=open
   - 2 sessions (rehearsal + main)
5. (Optional) Create a sample application from `dancer-test` to that project.

Always print the seeded IDs at the end so the user can use them in browser testing.
