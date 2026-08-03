const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";

// আপনার বটের দেওয়া API Key এবং টেলিগ্রাম আইডি ম্যাপিং 
const API_USERS = {
  "csbsmm60479639342aldqzucehxdg7avodorz": {
    telegramid: "6047963934",
    // এখানে আপনার রিয়াল ব্যালেন্স বসিয়ে দিতে পারেন অথবা বটের প্রপার্টি থেকে সিংক হবে
    balance: 965.00 
  }
};

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
      const response = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const services = await response.json();
      return res.json(services);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch services" });
    }
  }

  // ৩. অর্ডার প্লে করা এবং ব্যালেন্স কাটা (action=add)
  if (action === "add") {
    const serviceId = parseInt(service);
    const qty = parseInt(quantity);

    if (!serviceId || !link || isNaN(qty)) {
      return res.status(400).json({ error: "Missing required parameters (service, link, quantity)" });
    }

    try {
      // SMMGEN থেকে সার্ভিসের রেট বের করা
      const sRes = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const sData = await sRes.json();
      const targetService = sData.find(s => s.service === serviceId);

      if (!targetService) {
        return res.status(400).json({ error: "Service not found" });
      }

      // মোট খরচ হিসাব (প্রতি ১০০০ এর দাম অনুযায়ী)
      const totalCost = (qty / 1000) * targetService.rate;

      // ব্যালেন্স চেক: পর্যাপ্ত ব্যালেন্স না থাকলে অর্ডার হবে না
      if (userData.balance < totalCost) {
        return res.status(400).json({ 
          status: "error", 
          error: "Insufficient balance! Your balance is " + userData.balance + " but required is " + totalCost 
        });
      }

      // SMMGEN প্যানেলে অর্ডার হিট করা
      const targetUrl = `${SMM_API_URL}?key=${SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${qty}`;
      const smmResponse = await fetch(targetUrl);
      const smmData = await smmResponse.json();

      if (smmData.order) {
        // সফলভাবে অর্ডার হলে ইউজারের ব্যালেন্স কেটে নেওয়া হবে
        userData.balance -= totalCost;

        return res.json({
          status: "success",
          order: smmData.order,
          deducted_balance: totalCost,
          remaining_balance: userData.balance
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

module.exports = app;
