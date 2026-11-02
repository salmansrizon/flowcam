// Dev only: grant a plan to a user until billing exists.
//   FLOWCAM_ALLOW_GRANT=1 npm run dev:grant-plan -- <email> <pro|trial> [days]
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production" || process.env.FLOWCAM_ALLOW_GRANT !== "1") {
  console.error("Refusing: set FLOWCAM_ALLOW_GRANT=1, and never run this with NODE_ENV=production.");
  process.exit(1);
}
try {
  process.loadEnvFile(new URL("../apps/studio/.env.local", import.meta.url));
} catch {
  // Env may already be set by the caller.
}

const [email, plan, daysArg] = process.argv.slice(2);
if (!email || (plan !== "pro" && plan !== "trial")) {
  console.error("Usage: npm run dev:grant-plan -- <email> <pro|trial> [days]");
  process.exit(1);
}
const days = Number(daysArg ?? (plan === "pro" ? 30 : 7));
if (!Number.isFinite(days) || days <= 0) {
  console.error("days must be a positive number");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (apps/studio/.env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// ponytail: scans users page by page; fine for a dev database.
let userId: string | undefined;
for (let page = 1; !userId; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error(`Could not list users: ${error.message}`);
    process.exit(1);
  }
  userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  if (data.users.length < 200) break;
}
if (!userId) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

const current_period_end = new Date(Date.now() + days * 86_400_000).toISOString();
const { error } = await supabase
  .from("subscriptions")
  .upsert({ user_id: userId, plan, status: "active", current_period_end, updated_at: new Date().toISOString() });
if (error) {
  console.error(`Could not grant plan: ${error.message}`);
  process.exit(1);
}
console.log(`Granted ${plan} to ${email} until ${current_period_end}`);
