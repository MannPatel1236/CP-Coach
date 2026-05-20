import { motion, AnimatePresence } from "framer-motion";

function getStepsForPlatform(platform, mode) {
  const isCombined = platform === "combined";
  const isLC = platform === "lc";
  const isCF = platform === "cf";
  
  const platformName = isCombined ? "Codeforces & LeetCode" : isLC ? "LeetCode" : "Codeforces";
  
  if (mode === "deep") {
    return [
      `Accessing ${platformName} record...`,
      isCombined 
        ? "Scanning both platform histories (may take 10–20s)..."
        : `Scanning full submission history (may take 10–20s)...`,
      "Building skill metrics...",
      "Curating problem set...",
    ];
  }
  
  return [
    `Accessing ${platformName} record...`,
    isCombined 
      ? "Analyzing submissions from both platforms..."
      : "Scanning recent submissions...",
    "Building skill metrics...",
    "Curating problem set...",
  ];
}

const line = { hidden: { pathLength: 0, opacity: 0 }, visible: { pathLength: 1, opacity: 1 } };
const dot = { hidden: { scale: 0, opacity: 0 }, visible: { scale: 1, opacity: 1 } };

function StepRow({ label, status, index, isLast }) {
  const done = status === "done";
  const active = status === "active";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, minHeight: 36 }}>
      {/* Icon column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20, paddingTop: 2 }}>
        <motion.div
          initial="hidden"
          animate="visible"
          style={{
            width: 20, height: 20, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {done ? (
            <motion.svg width="20" height="20" viewBox="0 0 20 20" fill="none"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
              <circle cx="10" cy="10" r="9" fill="rgba(52, 211, 153, 0.08)" stroke="rgba(52, 211, 153, 0.3)" strokeWidth="1.5" />
              <motion.path d="M6 10.5L8.5 13L14 7.5" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                initial={line.hidden} animate={line.visible} transition={{ duration: 0.3, delay: 0.15 }} />
            </motion.svg>
          ) : active ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              style={{ width: 20, height: 20 }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="var(--surface-3)" strokeWidth="2.5" />
                <motion.circle cx="10" cy="10" r="8" stroke="url(#grad)" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray="50" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  style={{ transformOrigin: "center" }} />
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="var(--primary-container)" />
                    <stop offset="1" stopColor="var(--primary-bright)" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>
          ) : (
            <motion.div
              initial="hidden" animate="visible" variants={dot} transition={{ duration: 0.25 }}
              style={{
                width: 20, height: 20, borderRadius: "50%",
                border: "2px solid var(--surface-3)", background: "transparent",
              }}
            />
          )}
        </motion.div>

        {/* Connector line */}
        {!isLast && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: done ? 16 : 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ width: 1.5, background: done ? "rgba(52, 211, 153, 0.35)" : "var(--surface-3)", borderRadius: 1 }}
          />
        )}
      </div>

      {/* Label */}
      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            fontSize: 13, lineHeight: "20px",
            fontWeight: active ? 700 : done ? 500 : 400,
            color: active ? "var(--on-surface)" : done ? "var(--success)" : "var(--text-muted)",
            fontFamily: "var(--font-body)",
            letterSpacing: done ? "0.02em" : "0.01em",
          }}
        >
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function LoadingState({ step, mode, isFetchingRecs, platform = "cf" }) {
  const labels = getStepsForPlatform(platform, mode);

  // Always show all 4 steps from the start - no conditional rendering
  const visibleSteps = labels.map((label, i) => {
    const stepNum = i + 1;
    let status;
    
    // Step 4 is always pending until recommendations are being fetched
    if (stepNum === 4) {
      if (isFetchingRecs || step >= 4) {
        status = "active";
      } else {
        status = "pending";
      }
    } else if (stepNum < step) {
      status = "done";
    } else if (stepNum === step) {
      status = "active";
    } else {
      status = "pending";
    }
    return { label, status, stepNum };
  });

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        maxWidth: 480, margin: "20px 48px",
        padding: "22px 26px",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      {visibleSteps.map((s, i) => (
        <StepRow key={s.stepNum} label={s.label} status={s.status} index={i} isLast={i === visibleSteps.length - 1} />
      ))}
    </motion.div>
  );
}