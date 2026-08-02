const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Configs
const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "2e53b57414dc722db3e2e2f9aaf723dc";
const BOT_ID = "2968405";

// Helper: Upstream Provider Call (Form Data POST - 404 Fixed)
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
        if (err.response) {
            return { error: `Provider Error (${err.response.status}): ${JSON.stringify(err.response.data)}` };
        }
        return { error: "Provider Connection Failed: " + err.message };
    }
}

app.all('/api/v2', async (req, res) => {
    try {
        const request = req.method === 'POST' ? (req.body || {}) : (req.query || {});

        const apiKey = (request.key || '').toString().trim();
        const action = (request.action || '').toString().trim();

        if (!apiKey || !action) {
            return res.json({ status: "error", message: "Invalid API key or Action missing" });
        }

        // 💰 1. CHECK BALANCE
        if (action === "balance") {
            try {
                const checkUrl = `https://api.bots.business/v1/bots/${BOT_ID}/web_app?command=check_and_deduct&key=${encodeURIComponent(apiKey)}&action=balance`;
                const checkRes = await axios.get(checkUrl, { timeout: 8000 });
                const data = checkRes.data;

                if (data && data.status === "success") {
                    return res.json({
                        status: "success",
                        balance: parseFloat(data.balance || 0).toFixed(2),
                        currency: "USD"
                    });
                } else {
                    return res.json({ status: "error", message: data?.message || "Incorrect API key" });
                }
            } catch (err) {
                return res.json({ status: "error", message: "Failed to fetch balance from bot" });
            }
        }

        // 📦 2. SERVICES LIST
        if (action === "services") {
            const upstreamServices = await callUpstreamApi('services');
            return res.json(upstreamServices);
        }

        // 🛒 3. ADD NEW ORDER
        if (action === "add") {
            const rawService = (request.service || '').toString().trim();
            const link = (request.link || '').toString().trim();
            const quantity = parseInt(request.quantity || 0, 10);

            // CSBSMM- টেক্সট ফিল্টার করে বিশুদ্ধ সার্ভিস আইডি (যেমন: 12409) বের করা
            const serviceId = rawService.replace(/\D/g, "");

            if (!serviceId || !link || isNaN(quantity) || quantity <= 0) {
                return res.json({ status: "error", message: "Invalid parameters (check service, link, or quantity)" });
            }

            try {
                // ১. BotsBusiness থেকে পয়েন্ট ও কি ভ্যালিডেশন
                const checkUrl = `https://api.bots.business/v1/bots/${BOT_ID}/web_app?command=check_and_deduct`
                              + `&key=${encodeURIComponent(apiKey)}`
                              + `&service=${serviceId}`
                              + `&quantity=${quantity}`;

                const checkRes = await axios.get(checkUrl, { timeout: 10000 });
                const checkData = checkRes.data;

                if (!checkData || checkData.status !== "success") {
                    return res.json({ status: "error", message: checkData?.message || "Not enough balance or Invalid Key" });
                }

                // ২. SMMGen-এ অর্ডার পাঠানো
                const providerRes = await callUpstreamApi('add', {
                    service: serviceId,
                    link: link,
                    quantity: quantity
                });

                if (providerRes && providerRes.order) {
                    return res.json({
                        status: "success",
                        order: providerRes.order,
                        cost_points: checkData.cost,
                        remaining_balance: checkData.remaining_balance
                    });
                } else {
                    return res.json({ 
                        status: "error", 
                        message: providerRes?.error || providerRes?.message || "Failed to place order on SMMGen" 
                    });
                }

            } catch (error) {
                return res.json({ status: "error", message: "Transaction failed: " + error.message });
            }
        }

        // 🔍 4. ORDER STATUS
        if (action === "status") {
            const orderId = parseInt(request.order || 0, 10);
            if (isNaN(orderId) || orderId <= 0) {
                return res.json({ status: "error", message: "Invalid Order ID" });
            }
            const statusRes = await callUpstreamApi('status', { order: orderId });
            return res.json(statusRes);
        }

        return res.json({ status: "error", message: "Invalid Action" });

    } catch (globalErr) {
        return res.json({ status: "error", message: "Internal Error: " + globalErr.message });
    }
});

module.exports = app;
