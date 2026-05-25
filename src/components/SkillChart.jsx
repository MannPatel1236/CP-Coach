import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { acColor, shortenTag } from "../utils.js";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "linear-gradient(145deg, var(--surface-4), var(--surface-3))",
      border: "1px solid var(--outline-variant)",
      padding: "14px 18px",
      borderRadius: "var(--radius-lg)",
      fontFamily: "var(--font-body)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      backdropFilter: "blur(10px)",
    }}>
      <div className="font-heading" style={{ color: "var(--on-surface)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{d.tag}</div>
      <div className="font-heading" style={{ color: acColor(d.acRate), fontSize: 14, fontWeight: 700 }}>AC Rate: {d.acRate}%</div>
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 8, fontWeight: 500 }}>
        {d.solved} / {d.attempts} solved
        {d.avgRating ? ` · ${d.avgRating} Rating` : ""}
      </div>
    </div>
  );
}

export default function SkillChart({ tags }) {
  const chartData = useMemo(() => tags.map((t) => ({ ...t, short: shortenTag(t.tag) })), [tags]);

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
          Skill Distribution
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ left: -15, right: 0, top: 0, bottom: 40 }}>
            <XAxis
              dataKey="short"
              tick={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            <Bar dataKey="acRate" radius={[4, 4, 0, 0]} barSize={22}>
              {chartData.map((e) => (
                <Cell key={e.tag} fill={acColor(e.acRate)} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
