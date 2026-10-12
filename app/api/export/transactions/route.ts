import { createClient } from "@/lib/supabase/server";
import { buildTransactionsCsv } from "@/lib/db/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Not signed in", { status: 401 });
  }

  const csv = await buildTransactionsCsv(supabase, user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
