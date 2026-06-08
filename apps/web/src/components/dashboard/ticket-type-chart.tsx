"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TicketTypeDatum {
  name: string;
  paid: number;
  free: number;
}

export function TicketTypeChart({
  data,
  paidLabel,
  freeLabel,
}: {
  data: TicketTypeDatum[];
  paidLabel: string;
  freeLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            color: "hsl(var(--foreground))",
          }}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="paid" name={paidLabel} stackId="a" fill="#EBE05A" radius={[0, 0, 0, 0]} />
        <Bar dataKey="free" name={freeLabel} stackId="a" fill="#9FE870" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
