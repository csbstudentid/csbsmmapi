const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// আপনার Firebase Realtime Database URL
const FIREBASE_DB_URL = "https://smm-2c0ad-default-rtdb.firebaseio.com";

const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";

app.get('/api', async (req, res) => {
  const { key, action, service, link, quantity } = req.query;

  if (!key) {
    return res.status(401).json({ error: "API Key is required" });
  }

  // ফায়ারবেস থেকে API Key দিয়ে ইউজারের টেলিগ্রাম আইডি খুঁজে বের করা
  let userMapRes = await fetch(`${FIREBASE_DB_URL}/api_keys/${key}.json`);
  let telegramId = await userMapRes.json();

  if (!telegramId) {
    return res.status(401).json({ error: "Invalid API Key" });
  }

  // ওই ইউজারের রিয়াল-টাইম ব্যালেন্স ফায়ারবেস থেকে আনা
  let userBalRes = await fetch(`${FIREBASE_DB_URL}/users/${telegramId}/balance.json`);
  let currentBalance = await userBalRes.json();
  currentBalance = currentBalance !== null ? parseFloat(currentBalance) : 0;

  // ১. রিয়াল-টাইম ব্যালেন্স চেক (action=balance)
  if (action === "balance") {
    return res.json({
      status: "success",
      balance: currentBalance,
      currency: "Points"
    });
  }

  // ২. সার্ভিস লিস্ট চেক
  if (action === "services") {
    try {
      const response = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const services = await response.json();
      return res.json(services);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch services" });
    }
  }

  // ৩. অর্ডার প্লে ও রিয়াল-টাইম ব্যালেন্স কাটা (action=add)
  if (action === "add") {
    const serviceId = parseInt(service);
    const qty = parseInt(quantity);

    if (!serviceId || !link || isNaN(qty)) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      // সার্ভিস রেট ফেচ করা
      const sRes = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const sData = await sRes.json();
      const targetService = sData.find(s => s.service === serviceId);

      if (!targetService) {
        return res.status(400).json({ error: "Service not found" });
      }

      const totalCost = (qty / 1000) * targetService.rate;

      // ব্যালেন্স পর্যাপ্ত আছে কি না চেক
      if (currentBalance < totalCost) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // SMMGEN প্যানেলে অর্ডার হিট করা
      const targetUrl = `${SMM_API_URL}?key=${SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${qty}`;
      const smmResponse = await fetch(targetUrl);
      const smmData = await smmResponse.json();

      if (smmData.order) {
        // নতুন ব্যালেন্স হিসাব করা
        const newBalance = currentBalance - totalCost;

        // ফায়ারবেসে ইউজারের ব্যালেন্স রিয়াল-টাইম আপডেট করে দেওয়া
        await fetch(`${FIREBASE_DB_URL}/users/${telegramId}/balance.json`, {
          method: 'PUT',
          body: JSON.stringify(newBalance)
        });

        return res.json({
          status: "success",
          order: smmData.order,
          remaining_balance: newBalance
        });
      } else {
        return res.status(400).json({ error: smmData.error || "Order failed from provider" });
      }
    } catch (error) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  return res.status(400).json({ error: "Invalid action parameter" });
});

module.exports = app;
