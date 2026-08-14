import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = existsSync(new URL("../.env.local", import.meta.url))
  ? new URL("../.env.local", import.meta.url)
  : "C:/Users/tkay/Desktop/dev/dancers-bio/.env.local";
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const PROJECT_ID = "443e791a-327e-4556-b632-b8f87e9d5559";
const CHANNEL = "email_recommend";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const [{ data: allRows, error: allError }, { data: latest, error }] = await Promise.all([
  admin
    .from("project_notification_log")
    .select("recipient_id")
    .eq("project_id", PROJECT_ID)
    .eq("channel", CHANNEL),
  admin
    .from("project_notification_log")
    .select("recipient_id, created_at")
    .eq("project_id", PROJECT_ID)
    .eq("channel", CHANNEL)
    .order("created_at", { ascending: false })
    .limit(5),
]);

if (allError) throw allError;
if (error) throw error;

console.log(JSON.stringify({ sentLogCount: allRows?.length ?? 0, latest: latest ?? [] }, null, 2));
