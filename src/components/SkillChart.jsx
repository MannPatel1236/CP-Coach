import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { acColor, shortenTag } from "../utils.js";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-color)",
      padding: "10px 14px",
      borderRadius: 10,
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    }}>
      <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{d.tag}</div>
      <div style={{ color: acColor(d.acRate), fontSize: 13, fontWeight: 600 }}>AC Rate: {d.acRate}%</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 4 }}>
        {d.solved} / {d.attempts} solved
        {d.avgRating ? ` · Avg. Rating ${d.avgRating}` : ""}
      </div>
    </div>
  );
}

export default function SkillChart({ tags }) {
  const [tab, setTab] = useState("bar");
  const chartData = tags.map((t) => ({ ...t, short: shortenTag(t.tag) }));
  const radarData = tags.slice(0, 9).map((t) => ({ ...t, short: shortenTag(t.tag) }));

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div className="font-heading" style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
          Skill Profile
        </div>
        <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", padding: 4, borderRadius: 8 }}>
          {["bar", "radar"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "var(--border-color)" : "transparent",
                border: "none",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                transition: "all 0.2s ease",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "bar" && (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: -15, right: 0, top: 0, bottom: 40 }}>
              <XAxis
                dataKey="short"
                tick={{ fill: "var(--text-secondary)", fontSize: 10, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 10, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="acRate" radius={[4, 4, 0, 0]} barSize={24}>
                {chartData.map((e, i) => (
                  <Cell key={i} fill={acColor(e.acRate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "radar" && (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="80%">
              <PolarGrid stroke="var(--border-color)" />
              <PolarAngleAxis
                dataKey="short"
                tick={{ fill: "var(--text-secondary)", fontSize: 11, fontWeight: 500 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                axisLine={false}
                tick={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Radar
                dataKey="acRate"
                stroke="var(--accent-primary)"
                fill="var(--accent-primary)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
