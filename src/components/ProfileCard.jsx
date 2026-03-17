import { rankColor, ratingColor } from "../utils.js";
import { UserIcon } from "./Icons";

export default function ProfileCard({ user, tagCount, weakCount }) {
  const rc = rankColor(user.rank);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            style={{ width: 48, height: 48, borderRadius: 10, border: "2px solid var(--border-color)", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: "rgba(100, 116, 139, 0.1)", border: "2px solid var(--border-color)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: rc,
          }}>
            <UserIcon size={24} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="font-heading" style={{
            fontWeight: 800,
            fontSize: 18,
            color: rc,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {user.handle}
          </div>
          <div style={{ fontSize: 11, color: rc, opacity: 0.7, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", marginTop: 2 }}>
            {user.rank || "unrated"}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { label: "rating", value: user.rating ?? "—", color: ratingColor(user.rating) },
          { label: "max rating", value: user.maxRating ?? "—", color: ratingColor(user.maxRating) },
          { label: "topics", value: tagCount, color: "var(--text-secondary)" },
          { label: "weak areas", value: weakCount, color: weakCount > 0 ? "var(--accent-danger)" : "var(--accent-success)" },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
