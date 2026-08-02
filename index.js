const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/api/v2', async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    
    const apiKey = params.key;
    const action = params.action;
    const rawService = params.service;
    const link = params.link;
    const quantity = parseInt(params.quantity);

    if (!apiKey) {
        return res.json({ status: "error", message: "API Key is required" });
    }

    const botId = "2968405";

    // 💰 ১. ব্যালেন্স চেক
    if (action === "balance") {
        try {
            const checkUrl = `https://api.bots.business/v1/bots/${botId}/web_app?command=check_and_deduct&key=${encodeURIComponent(apiKey)}&action=balance`;
            const checkRes = await axios.get(checkUrl);
            return res.json(checkRes.data);
        } catch (err) {
            return res.json({ status: "error", message: "Failed to fetch balance" });
        }
    }

    // 🛒 ২. নতুন অর্ডার প্রসেস
    if (action === "add") {
        if (!rawService || !link || !quantity || isNaN(quantity)) {
            return res.json({ status: "error", message: "Missing required parameters (service, link, quantity)" });
        }

        const cleanedServiceId = rawService.toString().replace(/\D/g, "");

        if (!cleanedServiceId) {
            return res.json({ status: "error", message: "Invalid Service ID format" });
        }

        try {
            // ১. BotsBusiness থেকে ব্যালেন্স ডিডাকশন
            const checkUrl = `https://api.bots.business/v1/bots/${botId}/web_app?command=check_and_deduct`
                          + `&key=${encodeURIComponent(apiKey)}`
                          + `&service=${cleanedServiceId}`
                          + `&quantity=${quantity}`;

            const checkRes = await axios.get(checkUrl);
            const checkData = checkRes.data;

            if (checkData.status !== "success") {
                return res.json(checkData); // ব্যালেন্স কম বা ভুল API Key থাকলে রিটার্ন করবে
            }

            // ২. SMMGen-এ POST রিকোয়েস্ট পাঠানো (404 Error ফিক্স)
            const providerApiKey = "2e53b57414dc722db3e2e2f9aaf723dc";
            const providerUrl = "https://my.smmgen.com/api/v2";

            const providerRes = await axios.post(providerUrl, new URLSearchParams({
                key: providerApiKey,
                action: 'add',
                service: cleanedServiceId,
                link: link,
                quantity: quantity
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            return res.json({
                status: "success",
                order: providerRes.data.order || checkData.order_id,
                cost_points: checkData.cost,
                remaining_balance: checkData.remaining_balance
            });

        } catch (error) {
            return res.json({ 
                status: "error", 
                message: "Provider Error: " + (error.response ? JSON.stringify(error.response.data) : error.message) 
            });
        }
    }

    return res.json({ status: "error", message: "Invalid action" });
});

module.exports = app;
