import { getContext } from "@/lib/context";
import { buildTransactionsCsv } from "@/lib/db/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getContext();

  if (!ctx) {
    return new Response("Not signed in", { status: 401 });
  }

  // The ledger currently selected: a space's export is that space's ledger.
  const csv = await buildTransactionsCsv(ctx.supabase, ctx.scope);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
