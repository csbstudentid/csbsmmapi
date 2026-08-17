const https = require('https');

module.exports = (req, res) => {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔒 বটের গোপন ক্রেডেনশিয়াল
  const BOT_ID = "2890129";
  const PUBLIC_TOKEN = "cfab0a2692a9ba1b3712a6af4e031ad6";
  const COMMAND = "child_handler";

  // প্যারামিটার সংগ্রহ
  const queryParams = Object.assign({}, req.query || {}, req.body || {});
  queryParams.command = COMMAND;
  queryParams.public_user_token = PUBLIC_TOKEN;

  const queryString = new URLSearchParams(queryParams).toString();
  const targetUrl = `https://api.bots.business/v1/bots/${BOT_ID}/new-webhook?${queryString}`;

  // নেটিভ HTTPS কল (জিরো ক্র্যাশ রেট)
  https.get(targetUrl, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const json = JSON.parse(data);
        res.status(200).json(json);
      } catch (e) {
        res.status(200).send(data);
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ error: "Gateway Connection Error: " + err.message });
  });
};
