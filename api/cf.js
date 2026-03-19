export default async function handler(req, res) {
  // Strip /api/cf prefix, keep the rest including query string
  const stripped = req.url.replace(/^\/api\/cf/, "");
  const cfUrl = `https://codeforces.com/api${stripped}`;

  try {
    const response = await fetch(cfUrl);

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

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=60");
    res.json(data);
  } catch (err) {
    res.status(500).json({
      status: "FAILED",
      comment: "Could not reach Codeforces API.",
    });
  }
}
