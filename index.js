const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/api/v2', async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    
    const apiKey = params.key;
    const action = params.action;
    const rawService = params.service; // উদাহরণ: "CSBSMM-12409"
    const link = params.link;
    const quantity = parseInt(params.quantity);

    if (!apiKey) {
        return res.json({ status: "error", message: "API Key is required" });
    }

    // 🛒 ১. নতুন অর্ডার প্রসেস
    if (action === "add") {
        if (!rawService || !link || !quantity || isNaN(quantity)) {
            return res.json({ status: "error", message: "Missing required parameters (service, link, quantity)" });
        }

        // 🧹 CSBSMM- এবং যেকোনো অ-সংখ্যানুক্রমিক ক্যারেক্টার অটো ফিল্টার করে শুধু সংখ্যা নেওয়া (যেমন: "12409")
        const cleanedServiceId = rawService.toString().replace(/\D/g, "");

        if (!cleanedServiceId) {
            return res.json({ status: "error", message: "Invalid Service ID format" });
        }

        try {
            // 💰 ২. BotsBusiness থেকে API Key ভ্যালিডেশন ও ব্যালেন্স ডিডাকশন
            const botId = "2968405";
            const checkUrl = `https://api.bots.business/v1/bots/${botId}/web_app?command=check_and_deduct`
                          + `&key=${encodeURIComponent(apiKey)}`
                          + `&service=${cleanedServiceId}`
                          + `&quantity=${quantity}`;

            const checkRes = await axios.get(checkUrl);
            const checkData = checkRes.data;

            if (checkData.status !== "success") {
                return res.json(checkData); // ব্যালেন্স কম বা API Key ভুল হলে এরর রিটার্ন করবে
            }

            // 🚀 ৩. ব্যালেন্স ঠিক থাকলে মূল SMM Provider (SMMGen) এ অর্ডার ফরওয়ার্ড
            const providerApiKey = "2e53b57414dc722db3e2e2f9aaf723dc";
            const providerUrl = `https://my.smmgen.com/api/v2?key=${providerApiKey}&action=add&service=${cleanedServiceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`;

            const providerRes = await axios.get(providerUrl);
            
            // সাকসেস হলে রিসেলারকে ফাইনাল রেসপন্স পাঠানো
            return res.json({
                status: "success",
                order: checkData.order_id || providerRes.data.order,
                cost_points: checkData.cost,
                remaining_balance: checkData.remaining_balance
            });

        } catch (error) {
            return res.json({ status: "error", message: "Transaction failed: " + error.message });
        }
    }

    return res.json({ status: "error", message: "Invalid action" });
});

module.exports = app;
