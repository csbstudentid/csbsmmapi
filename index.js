const https = require('https');
const url = require('url');

module.exports = (req, res) => {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.writeHead(200);
    return res.end();
  }

  // 🔒 বটের গোপন ক্রেডেনশিয়াল
  const BOT_ID = "2890129";
  const PUBLIC_TOKEN = "cfab0a2692a9ba1b3712a6af4e031ad6";
  const COMMAND = "child_handler";

  try {
    const parsedUrl = url.parse(req.url, true);
    const queryParams = Object.assign({}, parsedUrl.query, req.query || {}, req.body || {});
    queryParams.command = COMMAND;
    queryParams.public_user_token = PUBLIC_TOKEN;

    const queryString = new URLSearchParams(queryParams).toString();
    const targetUrl = `https://api.bots.business/v1/bots/${BOT_ID}/new-webhook?${queryString}`;

    https.get(targetUrl, (apiRes) => {
      let rawData = '';
      apiRes.on('data', (chunk) => { rawData += chunk; });
      apiRes.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (typeof res.status === 'function') {
          res.status(200).send(rawData);
        } else {
          res.writeHead(200);
          res.end(rawData);
        }
      });
    }).on('error', (err) => {
      res.setHeader('Content-Type', 'application/json');
      const errJson = JSON.stringify({ error: "Gateway Error: " + err.message });
      if (typeof res.status === 'function') {
        res.status(500).send(errJson);
      } else {
        res.writeHead(500);
        res.end(errJson);
      }
    });
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    const errJson = JSON.stringify({ error: "Server Error: " + err.message });
    if (typeof res.status === 'function') {
      res.status(500).send(errJson);
    } else {
      res.writeHead(500);
      res.end(errJson);
    }
  }
};
