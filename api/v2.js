export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔒 বটের গোপন ক্রেডেনশিয়াল
  const BOT_ID = "2890129";
  const PUBLIC_TOKEN = "cfab0a2692a9ba1b3712a6af4e031ad6";
  const COMMAND = "child_handler";

  try {
    const queryParams = Object.assign({}, req.query || {}, req.body || {});
    queryParams.command = COMMAND;
    queryParams.public_user_token = PUBLIC_TOKEN;

    const queryString = new URLSearchParams(queryParams).toString();
    const targetUrl = `https://api.bots.business/v1/bots/${BOT_ID}/new-webhook?${queryString}`;

    const bbResponse = await fetch(targetUrl);
    const rawData = await bbResponse.text();

    try {
      const jsonData = JSON.parse(rawData);
      return res.status(200).json(jsonData);
    } catch (e) {
      return res.status(200).send(rawData);
    }
  } catch (error) {
    return res.status(500).json({ error: "Gateway Error: " + error.message });
  }
}
