const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];
const CF_BASE = "https://codeforces.com/api";
const FETCH_TIMEOUT = 15000;

const ALLOWED_PATHS = [
  /^\/user\.info/,
  /^\/user\.status/,
  /^\/problemset\.problems/,
];

async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ status: "FAILED", comment: "Method not allowed." });
    return;
  }

  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  const stripped = req.url.replace(/^\/api\/cf/, "");

  const isAllowed = ALLOWED_PATHS.some((pattern) => pattern.test(stripped));
  if (!isAllowed) {
    res.status(403).json({ status: "FAILED", comment: "Endpoint not allowed." });
    return;
  }

  const cfUrl = `${CF_BASE}${stripped}`;

  try {
    const response = await fetchWithTimeout(cfUrl, { method: "GET" });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.status(502).json({
        status: "FAILED",
        comment: "Codeforces returned a non-JSON response. Try again in a moment.",
      });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=60");
    res.json(data);
  } catch (err) {
    if (err.name === "AbortError") {
      res.status(504).json({
        status: "FAILED",
        comment: "Codeforces API timed out. Please try again.",
      });
    } else {
      res.status(500).json({
        status: "FAILED",
        comment: "Could not reach Codeforces API.",
      });
    }
  }
}
