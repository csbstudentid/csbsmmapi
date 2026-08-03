const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// আপনার বটের সিক্রেট API Key এবং টেলিগ্রাম আইডি ম্যাপিং (প্রয়োজন অনুযায়ী এখানে বা ডাটাবেসে রাখতে পারেন)
const API_USERS = {
  "csbsmm60479639342aldqzucehxdg7avodorz": {
    telegramid: "6047963934",
    balance: 500, // অথবা আপনার বটের ব্যালেন্স সিস্টেম এখানে কানেক্ট করতে পারেন
    isReseller: true
  }
};

// এস এম এম প্রোভাইডার ডিটেইলস (SMMGEN)
const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";

// মূল API রাউট
app.get('/api', async (req, res) => {
  const { key, action, service, link, quantity } = req.query;

  if (!key || !API_USERS[key]) {
    return res.status(401).json({ error: "Invalid or Missing API Key" });
  }

  const userData = API_USERS[key];

  // ১. ব্যালেন্স চেক (action=balance)
  if (action === "balance") {
    return res.json({
      status: "success",
      balance: userData.balance,
      currency: "Points"
    });
  }

  // ২. সার্ভিস লিস্ট চেক (action=services)
  if (action === "services") {
    try {
      // SMMGEN থেকে সরাসরি লাইভ সার্ভিস লিস্ট ফেচ করা
      const response = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const services = await response.json();
      
      return res.json(services);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch services" });
    }
  }

  // ৩. অর্ডার প্লে করা (action=add)
  if (action === "add") {
    if (!service || !link || !quantity) {
      return res.status(400).json({ error: "Missing required parameters (service, link, quantity)" });
    }

    try {
      // SMMGEN প্রোভাইডারে অর্ডার হিট করা
      const targetUrl = `${SMM_API_URL}?key=${SMM_API_KEY}&action=add&service=${service}&link=${encodeURIComponent(link)}&quantity=${quantity}`;
      const smmResponse = await fetch(targetUrl);
      const smmData = await smmResponse.json();

      if (smmData.order) {
        return res.json({
          status: "success",
          order: smmData.order
        });
      } else {
        return res.status(400).json({ error: smmData.error || "Order failed from provider" });
      }
    } catch (error) {
      return res.status(500).json({ error: "Internal Server Error during order processing" });
    }
  }

  return res.status(400).json({ error: "Invalid action parameter" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Bridge running on port ${PORT}`);
});

module.exports = app;
