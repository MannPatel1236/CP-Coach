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
  const [tab, setTab] = useState("bar");
  const chartData = tags.map((t) => ({ ...t, short: shortenTag(t.tag) }));
  const radarData = tags.slice(0, 9).map((t) => ({ ...t, short: shortenTag(t.tag) }));

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
          Skill Distribution
        </div>
        <div style={{
          display: "flex",
          background: "var(--surface-dim)",
          padding: 3,
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--outline)",
        }}>
          {["bar", "radar"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t
                  ? "linear-gradient(135deg, var(--primary-container), var(--primary-dim))"
                  : "transparent",
                border: "none",
                color: tab === t ? "var(--on-primary)" : "var(--text-muted)",
                padding: "5px 16px",
                borderRadius: "var(--radius-full)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                transition: "all 0.3s ease",
                fontFamily: "var(--font-body)",
                boxShadow: tab === t ? "0 0 12px var(--primary-glow)" : "none",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "bar" && (
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
                {chartData.map((e, i) => (
                  <Cell key={i} fill={acColor(e.acRate)} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "radar" && (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
              <PolarGrid stroke="var(--outline)" strokeOpacity={0.5} />
              <PolarAngleAxis
                dataKey="short"
                tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}
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
                stroke="var(--primary-container)"
                fill="var(--primary-container)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
