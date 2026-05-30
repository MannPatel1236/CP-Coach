import { memo } from "react";
import { rankColor, ratingColor } from "../utils.js";
import { UserIcon } from "./Icons";

function ProfileCard({ user, tagCount, weakCount }) {
  const isLeetCode = user.platform === "lc";
  const rc = isLeetCode ? "#28a745" : rankColor(user.rank ?? "");
  const displayRank = isLeetCode ? "LeetCode" : (user.rank || "unrated");
  const showRating = user.rating != null;

  const stats = [];
  
  if (isLeetCode && showRating) {
    stats.push(
      { label: "Rating", value: user.rating, color: "var(--on-surface)" },
      { label: "Max Rating", value: user.maxRating ?? user.rating, color: "var(--on-surface)" },
      { label: "Easy", value: user.easy_solved ?? 0, color: "#22c55e" },
      { label: "Medium", value: user.medium_solved ?? 0, color: "#f59e0b" },
      { label: "Hard", value: user.hard_solved ?? 0, color: "#ef4444" },
      { label: "Weak Areas", value: weakCount, color: weakCount > 0 ? "var(--error)" : "var(--success)" },
    );
  } else if (isLeetCode) {
    stats.push(
      { label: "Easy", value: user.easy_solved ?? 0, color: "#22c55e" },
      { label: "Medium", value: user.medium_solved ?? 0, color: "#f59e0b" },
      { label: "Hard", value: user.hard_solved ?? 0, color: "#ef4444" },
      { label: "Weak Areas", value: weakCount, color: weakCount > 0 ? "var(--error)" : "var(--success)" },
    );
  } else {
    stats.push(
      { label: "Rating", value: user.rating ?? "—", color: ratingColor(user.rating) },
      { label: "Max Rating", value: user.maxRating ?? "—", color: ratingColor(user.maxRating) },
      { label: "Topics", value: tagCount, color: "var(--on-surface)" },
      { label: "Weak Areas", value: weakCount, color: weakCount > 0 ? "var(--error)" : "var(--success)" },
    );
  }

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
            alt={`${user.handle} avatar`}
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
          <div style={{ fontSize: 12, color: rc, opacity: 0.85, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginTop: 4, fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>{displayRank}</span>
            {isLeetCode && (
              <span style={{
                background: "rgba(40, 167, 69, 0.15)",
                color: "#28a745",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 9,
              }}>
                LC
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="profile-card-stat-grid" style={{ 
        display: "grid", 
        gridTemplateColumns: stats.length === 6 ? "1fr 1fr 1fr" : "1fr 1fr", 
        gap: 18 
      }}>
        {stats.map((s) => (
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

export default memo(ProfileCard);