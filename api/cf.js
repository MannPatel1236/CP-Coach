export default async function handler(req, res) {
  const path = req.url.replace("/api/cf", "");
  const cfUrl = `https://codeforces.com/api${path}`;
  try {
    const response = await fetch(cfUrl);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60");
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: "FAILED", comment: "CF API unreachable" });
  }
}
