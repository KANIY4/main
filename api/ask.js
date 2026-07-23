module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ text: null, error: "not_configured" }); return; }

  var body = req.body || {};
  var question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  var context = typeof body.context === "string" ? body.context.slice(0, 120) : null;
  if (!question.trim()) { res.status(400).json({ error: "missing question" }); return; }

  var sys = "You are Meridian's astronomy tutor, embedded in a live-sky web app. Answer clearly and concisely (under 120 words) for a curious beginner."
    + (context ? (" The visitor currently has \"" + context + "\" selected.") : "");

  try {
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: sys,
        messages: [{ role: "user", content: question }]
      })
    });
    if (!r.ok) { res.status(200).json({ text: null, error: "upstream_error" }); return; }
    var data = await r.json();
    var text = (data.content && data.content[0] && data.content[0].text) || null;
    res.status(200).json({ text: text });
  } catch (e) {
    res.status(200).json({ text: null, error: "exception" });
  }
};
