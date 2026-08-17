module.exports = async (req, res) => {
  // CORS হেডার কনফিগারেশন
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // প্রি-ফ্লাইট রিকোয়েস্ট হ্যান্ডলিং
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔒 বটের গোপন ক্রেডেনশিয়াল
  const BOT_ID = "2890129";
  const PUBLIC_TOKEN = "cfab0a2692a9ba1b3712a6af4e031ad6";
  const COMMAND = "child_handler";

  try {
    const queryParams = req.query || {};
    let bodyParams = {};

    if (req.body) {
      try {
        bodyParams = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        bodyParams = req.body;
      }
    }

    // ইউজারের প্যারামিটারের সাথে বটের সিক্রেট ডাটা মার্জ করা
    const mergedParams = Object.assign({}, queryParams, bodyParams);
    mergedParams.command = COMMAND;
    mergedParams.public_user_token = PUBLIC_TOKEN;

    // Bots.Business Webhook URL তৈরি
    const targetUrl = new URL(`https://api.bots.business/v1/bots/${BOT_ID}/new-webhook`);
    for (const key in mergedParams) {
      if (mergedParams[key] !== undefined && mergedParams[key] !== null) {
        targetUrl.searchParams.set(key, String(mergedParams[key]));
      }
    }

    // ব্যাকগ্রাউন্ডে কল করা
    const bbResponse = await fetch(targetUrl.toString(), { 
      method: 'GET',
      headers: { 'User-Agent': 'CSB-SMM-Gateway/1.0' }
    });
    
    const textData = await bbResponse.text();

    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (err) {
      jsonData = { response: textData };
    }

    return res.status(200).json(jsonData);
  } catch (error) {
    return res.status(500).json({ error: "API Gateway Error: " + error.message });
  }
};
