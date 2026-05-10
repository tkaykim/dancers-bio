---
description: Show RLS policies for a table in human-readable form
disable-model-invocation: true
argument-hint: [table_name]
---

Show all Row Level Security policies for the table `$ARGUMENTS` in the dancersbio Supabase project.

Use the Supabase MCP `execute_sql` tool with this query (substitute the table name):

```sql
select 
  policyname,
  cmd,
  permissive,
  roles,
  qual as using_clause,
  with_check as with_check_clause
from pg_policies
where schemaname = 'public' and tablename = '$ARGUMENTS'
order by cmd, policyname;
```

Then format the output as a markdown table with columns: Policy, Cmd, USING, WITH CHECK. Highlight any policy whose USING or WITH CHECK is just `true` (broad access — verify intent).

If `$ARGUMENTS` is empty, list all tables that have RLS enabled and their policy counts instead.
