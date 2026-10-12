"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatRSD, fromMinor } from "@/lib/money";
import { monthKey, type MonthTotals } from "@/lib/reports";

function compact(major: number): string {
  if (major >= 1_000_000) return `${+(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1000) return `${+(major / 1000).toFixed(0)}k`;
  return String(major);
}

export function CashFlowChart({
  series,
  selectedMonthIso,
}: {
  series: MonthTotals[];
  selectedMonthIso: string;
}) {
  const router = useRouter();
  const [showTable, setShowTable] = useState(false);

  const data = series.map((m) => ({
    month: m.month,
    label: format(parseISO(m.month), "MMM"),
    income: fromMinor(m.income), // chart geometry only
    expense: fromMinor(m.expense),
    raw: m,
  }));

  const select = (month: string) => router.push(`/reports?m=${monthKey(month)}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-income" aria-hidden />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-expense" aria-hidden />
            Expense
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Month</th>
              <th className="py-2 text-right font-medium">Income</th>
              <th className="py-2 text-right font-medium">Expense</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <td className="py-2">{format(parseISO(m.month), "MMM yyyy")}</td>
                <td className="py-2 text-right font-mono">{formatRSD(m.income)}</td>
                <td className="py-2 text-right font-mono">{formatRSD(m.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barGap={2}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval={0}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={compact}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={({ active, payload }) => {
                  const raw = active
                    ? (payload?.[0]?.payload as { raw: MonthTotals } | undefined)?.raw
                    : undefined;
                  if (!raw) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">
                        {format(parseISO(raw.month), "MMMM yyyy")}
                      </p>
                      <p className="font-mono text-xs text-income">
                        Income {formatRSD(raw.income)}
                      </p>
                      <p className="font-mono text-xs text-expense">
                        Expense {formatRSD(raw.expense)}
                      </p>
                    </div>
                  );
                }}
              />
              {(["income", "expense"] as const).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(entry) =>
                    select((entry as unknown as { month: string }).month)
                  }
                >
                  {data.map((d) => (
                    <Cell
                      key={d.month}
                      fill={key === "income" ? "var(--income)" : "var(--expense)"}
                      fillOpacity={d.month === selectedMonthIso ? 1 : 0.55}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
