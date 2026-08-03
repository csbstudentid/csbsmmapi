const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const BOT_ID = "8987402645";

app.get('/api', async (req, res) => {
  const { key, action, service, link, quantity } = req.query;

  if (!key) {
    return res.status(401).json({ error: "API Key is required" });
  }

  try {
    // সরাসরি Bots.Business বটের নিজস্ব হ্যান্ডলারের কাছে রিকোয়েস্ট পাঠিয়ে ডাটা নিয়ে আসা
    const botWebhookUrl = `https://bot.bots.business/v1/bots/${BOT_ID}/webhook?command=api_handler&key=${key}&action=${action}&service=${service || ''}&link=${encodeURIComponent(link || '')}&quantity=${quantity || ''}`;
    
    const response = await fetch(botWebhookUrl);
    const data = await response.json();

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to connect with bot server" });
  }
});

module.exports = app;
