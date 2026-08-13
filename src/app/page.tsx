import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Home is never a dead end: send signed-in users to the dashboard, everyone
// else to login. (The proxy also gates, but this makes "/" route intentionally.)
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
