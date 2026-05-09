import { rankColor, ratingColor } from "../utils.js";
import { UserIcon } from "./Icons";

export default function ProfileCard({ user, tagCount, weakCount }) {
  const rc = rankColor(user.rank);

  return (
    <div className="card" style={{ padding: 24, position: "relative" }}>
      {/* Accent top line */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 24,
        right: 24,
        height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${rc} 50%, transparent 100%)`,
        opacity: 0.6,
      }} />

      {/* Avatar + Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, marginTop: 2 }}>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            style={{
              width: 50, height: 50,
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${rc}`,
              boxShadow: `0 0 16px ${rc}33`,
            }}
          />
        ) : (
          <div style={{
            width: 50, height: 50, borderRadius: "50%",
            background: "var(--surface-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: rc,
            border: `2px solid ${rc}`,
          }}>
            <UserIcon size={24} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="font-heading" style={{
            fontWeight: 700,
            fontSize: 22,
            color: rc,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.1,
          }}>
            {user.handle}
          </div>
          <div style={{ fontSize: 12, color: rc, opacity: 0.85, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginTop: 4, fontFamily: "var(--font-body)" }}>
            {user.rank || "unrated"}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="profile-card-stat-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {[
          { label: "Rating", value: user.rating ?? "—", color: ratingColor(user.rating) },
          { label: "Max Rating", value: user.maxRating ?? "—", color: ratingColor(user.maxRating) },
          { label: "Topics", value: tagCount, color: "var(--on-surface)" },
          { label: "Weak Areas", value: weakCount, color: weakCount > 0 ? "var(--error)" : "var(--success)" },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6, fontFamily: "var(--font-body)" }}>
              {s.label}
            </div>
            <div className="font-heading" style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Location / Org */}
      {(user.country || user.organization) && (
        <div style={{
          marginTop: 22,
          paddingTop: 20,
          borderTop: "1px solid var(--outline)",
          fontSize: 13,
          color: "var(--on-surface-variant)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontFamily: "var(--font-body)"
        }}>
          {user.country && (
            <div>
              <span style={{ color: "var(--text-muted)" }}>Location: </span>
              {user.country}
            </div>
          )}
          {user.organization && (
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-muted)" }}>Affiliation: </span>
              {user.organization}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
