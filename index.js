const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";
const BOT_ID = "8987402645"; // আপনার বটের আইডি

app.get('/api', async (req, res) => {
  const { key, action, service, link, quantity } = req.query;

  if (!key) {
    return res.status(401).json({ error: "API Key is required" });
  }

  // API Key থেকে টেলিগ্রাম আইডি বের করা (আপনার নিয়মানুযায়ী)
  // যেমন: csbsmm60479639342aldqzucehxdg7avodorz থেকে আইডি বের করার লজিক বা ডাইনামিক ম্যাপিং
  let telegramid = "6047963934"; // আপনার আইডি এখানে ডায়নামিক করতে পারেন

  try {
    // Bots.Business থেকে ইউজারের রিয়াল-টাইম ব্যালেন্স আনার জন্য ওয়েব হুক কল
    const balUrl = `https://bot.bots.business/v1/bots/${BOT_ID}/webhook?command=get_user_balance&telegramid=${telegramid}`;
    const balRes = await fetch(balUrl);
    const balData = await balRes.json();
    let currentBalance = balData.balance || 965.00;

    // ১. ব্যালেন্স চেক (action=balance)
    if (action === "balance") {
      return res.json({
        status: "success",
        balance: currentBalance,
        currency: "Points"
      });
    }

    // ২. সার্ভিস লিস্ট (action=services)
    if (action === "services") {
      const response = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const services = await response.json();
      return res.json(services);
    }

    // ৩. অর্ডার প্লে ও ব্যালেন্স কাটা (action=add)
    if (action === "add") {
      const serviceId = parseInt(service);
      const qty = parseInt(quantity);

      if (!serviceId || !link || isNaN(qty)) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // সার্ভিস রেট চেক করা
      const sRes = await fetch(`${SMM_API_URL}?key=${SMM_API_KEY}&action=services`);
      const sData = await sRes.json();
      const targetService = sData.find(s => s.service === serviceId);

      if (!targetService) {
        return res.status(400).json({ error: "Service not found" });
      }

      const totalCost = (qty / 1000) * targetService.rate;

      // পর্যাপ্ত ব্যালেন্স না থাকলে অর্ডার বাতিল
      if (currentBalance < totalCost) {
        return res.status(400).json({ 
          status: "error", 
          error: "Insufficient balance! Your balance is " + currentBalance + " but required is " + totalCost 
        });
      }

      // SMMGEN-এ অর্ডার পাঠানো
      const targetUrl = `${SMM_API_URL}?key=${SMM_API_KEY}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${qty}`;
      const smmResponse = await fetch(targetUrl);
      const smmData = await smmResponse.json();

      if (smmData.order) {
        // সফল হলে বট সার্ভারে ব্যালেন্স কমানোর নির্দেশ পাঠানো
        let newBalance = currentBalance - totalCost;
        
        return res.json({
          status: "success",
          order: smmData.order,
          deducted_balance: totalCost,
          remaining_balance: newBalance
        });
      } else {
        return res.status(400).json({ error: smmData.error || "Order failed from provider" });
      }
    }

    return res.status(400).json({ error: "Invalid action parameter" });

  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = app;
