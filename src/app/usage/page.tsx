import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/ai/pricing";

/** How many individual calls to list at the bottom. */
const RECENT_LIMIT = 25;

/** Human labels for the feature tags recorded in generateValidated. */
const FEATURE_LABELS: Record<string, string> = {
  plan: "Plan generation",
  intake: "Goal intake chat",
  coach: "Coach chat",
};

function featureLabel(feature: string | null): string {
  if (!feature) return "Other";
  return FEATURE_LABELS[feature] ?? feature;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes both queries to the current user.
  const { data: rows } = await supabase
    .from("token_usage")
    .select("model, feature, input_tokens, output_tokens, cost_usd, created_at")
    .order("created_at", { ascending: false });

  const all = rows ?? [];

  const totalCost = all.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalInput = all.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutput = all.reduce((s, r) => s + r.output_tokens, 0);

  // Roll up by feature: call count + summed cost.
  type Agg = { calls: number; cost: number; input: number; output: number };
  const byFeature = new Map<string, Agg>();
  for (const r of all) {
    const key = r.feature ?? "other";
    const agg = byFeature.get(key) ?? { calls: 0, cost: 0, input: 0, output: 0 };
    agg.calls += 1;
    agg.cost += Number(r.cost_usd);
    agg.input += r.input_tokens;
    agg.output += r.output_tokens;
    byFeature.set(key, agg);
  }
  const featureRows = [...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost);

  const recent = all.slice(0, RECENT_LIMIT);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">AI usage</h1>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          Done
        </Link>
      </header>

      {all.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No AI usage recorded yet. Generating a plan or chatting with the coach
          will show up here.
        </p>
      ) : (
        <>
          {/* Totals */}
          <section className="grid grid-cols-3 gap-3">
            <Stat label="Total cost" value={formatUsd(totalCost)} />
            <Stat label="Input tokens" value={fmtInt(totalInput)} />
            <Stat label="Output tokens" value={fmtInt(totalOutput)} />
          </section>
          <p className="text-xs text-zinc-400">
            Across {all.length} AI call{all.length === 1 ? "" : "s"}. Costs are
            estimates from list prices at the time of each call.
          </p>

          {/* By feature */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">By feature</h2>
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                    <th className="px-4 py-2 font-medium">Feature</th>
                    <th className="px-4 py-2 text-right font-medium">Calls</th>
                    <th className="px-4 py-2 text-right font-medium">Tokens (in/out)</th>
                    <th className="px-4 py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {featureRows.map(([key, a]) => (
                    <tr key={key}>
                      <td className="px-4 py-2">{featureLabel(key === "other" ? null : key)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.calls}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-500">
                        {fmtInt(a.input)} / {fmtInt(a.output)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {formatUsd(a.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent calls */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recent calls</h2>
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{featureLabel(r.feature)}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(r.created_at)} ·{" "}
                      {fmtInt(r.input_tokens)} in / {fmtInt(r.output_tokens)} out
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums font-medium">
                    {formatUsd(Number(r.cost_usd))}
                  </span>
                </li>
              ))}
            </ul>
            {all.length > RECENT_LIMIT && (
              <p className="text-xs text-zinc-400">
                Showing the {RECENT_LIMIT} most recent of {all.length} calls.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
