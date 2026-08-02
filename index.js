const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";

// 🔗 আপনার সুনির্দিষ্ট BotsBusiness Webhook URL
const BOT_WEBHOOK_URL = "https://api.bots.business/v1/bots/2968405/new-webhook?command=%2Fon_api_request&public_user_token=6f943e36950e8fe78a3dff7524d9e521";

async function callUpstreamApi(action, params = {}) {
    try {
        const formData = new URLSearchParams();
        formData.append('key', SMM_API_KEY);
        formData.append('action', action);

        for (const [key, value] of Object.entries(params)) {
            formData.append(key, value);
        }

        const res = await axios.post(SMM_API_URL, formData.toString(), {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 15000
        });

        return res.data || { error: "Empty response from provider" };
    } catch (err) {
        return { error: err.response?.data?.error || err.message };
    }
}

app.all('/api/v2', async (req, res) => {
    try {
        const request = req.method === 'POST' ? (req.body || {}) : (req.query || {});
        const apiKey = (request.key || '').toString().trim();
        const action = (request.action || '').toString().trim();

        if (!apiKey || !action) {
            return res.json({ error: "Invalid API key or Action missing" });
        }

        // 💰 ১. ব্যালেন্স চেক (action=balance)
        if (action === "balance") {
            try {
                const checkRes = await axios.get(`${BOT_WEBHOOK_URL}&key=${encodeURIComponent(apiKey)}&action=balance`);
                if (checkRes.data && checkRes.data.status === "success") {
                    return res.json({
                        balance: checkRes.data.balance,
                        currency: "USD"
                    });
                } else {
                    return res.json({ error: checkRes.data?.message || "Incorrect API key" });
                }
            } catch (err) {
                return res.json({ error: "Failed to connect to Bot Webhook" });
            }
        }

        // 🛒 ২. নতুন অর্ডার প্রসেস (action=add)
        if (action === "add") {
            const rawService = (request.service || '').toString().trim();
            const link = (request.link || '').toString().trim();
            const quantity = parseInt(request.quantity || 0, 10);
            const serviceId = rawService.replace(/\D/g, "");

            if (!serviceId || !link || isNaN(quantity) || quantity <= 0) {
                return res.json({ error: "Invalid parameters" });
            }

            try {
                // BotsBusiness Webhook-এ পয়েন্ট চেক ও ডিডাকশন
                const checkRes = await axios.get(`${BOT_WEBHOOK_URL}&key=${encodeURIComponent(apiKey)}&action=add&service=${serviceId}&quantity=${quantity}`);
                
                if (!checkRes.data || checkRes.data.status !== "success") {
                    return res.json({ error: checkRes.data?.message || "Not enough balance or Invalid Key" });
                }

                // মূল SMM Provider (SMMGen) এ অর্ডার পাঠানো
                const providerRes = await callUpstreamApi('add', {
                    service: serviceId,
                    link: link,
                    quantity: quantity
                });

                if (providerRes && providerRes.order) {
                    return res.json({ order: providerRes.order });
                } else {
                    return res.json({ error: providerRes?.error || "Failed to place order upstream" });
                }

            } catch (error) {
                return res.json({ error: "Transaction failed: " + error.message });
            }
        }

        // 🔍 ৩. অর্ডার স্ট্যাটাস (action=status)
        if (action === "status") {
            const orderId = parseInt(request.order || 0, 10);
            if (isNaN(orderId) || orderId <= 0) {
                return res.json({ error: "Invalid Order ID" });
            }
            const statusRes = await callUpstreamApi('status', { order: orderId });
            return res.json(statusRes);
        }

        return res.json({ error: "Invalid Action" });

    } catch (globalErr) {
        return res.json({ error: "Internal Error: " + globalErr.message });
    }
});

module.exports = app;
