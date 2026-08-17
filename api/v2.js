const https = require('https');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const BOT_ID = "2890129";
  const PUBLIC_TOKEN = "cfab0a2692a9ba1b3712a6af4e031ad6";
  const COMMAND = "child_handler";

  const queryParams = Object.assign({}, req.query || {}, req.body || {});
  queryParams.command = COMMAND;
  queryParams.public_user_token = PUBLIC_TOKEN;

  const queryString = new URLSearchParams(queryParams).toString();
  const targetUrl = `https://api.bots.business/v1/bots/${BOT_ID}/new-webhook?${queryString}`;

  https.get(targetUrl, (apiRes) => {
    let rawData = '';

    apiRes.on('data', (chunk) => {
      rawData += chunk;
    });

    apiRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const json = JSON.parse(rawData);
        res.status(200).json(json);
      } catch (e) {
        res.status(200).send(rawData);
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ error: "Gateway Error: " + err.message });
  });
};
