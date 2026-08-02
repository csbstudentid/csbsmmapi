const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "29e3cdfcbdce836e667f5c6473e6fb3f";
const BOT_WEBHOOK_URL = "https://api.bots.business/v1/bots/2968405/new-webhook?command=%2Fon_api_request&public_user_token=6f943e36950e8fe78a3dff7524d9e521";

async function callUpstreamApi(action, params = {}) {
    try {
        const formData = new URLSearchParams();
        formData.append('key', SMM_API_KEY);
        formData.append('action', action);

        for (const [k, v] of Object.entries(params)) {
            formData.append(k, v);
        }

        const res = await axios.post(SMM_API_URL, formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        });

        return res.data || { error: "Failed to receive response" };
    } catch (err) {
        return { error: err.message };
    }
}

app.all('/api/v2', async (req, res) => {
    const request = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const apiKey = (request.key || '').toString().trim();
    const action = (request.action || '').toString().trim();

    if (!apiKey || !action) {
        return res.json({ error: "Invalid API key or Action missing" });
    }

    // 💰 CHECK BALANCE
    if (action === "balance") {
        try {
            const checkRes = await axios.get(`${BOT_WEBHOOK_URL}&key=${encodeURIComponent(apiKey)}&action=balance`);
            if (checkRes.data && checkRes.data.balance !== undefined) {
                return res.json({ balance: checkRes.data.balance, currency: "USD" });
            }
            return res.json({ error: checkRes.data?.error || "Incorrect API key" });
        } catch (e) {
            return res.json({ error: "Webhook Error" });
        }
    }

    // 🛒 PLACE ORDER
    if (action === "add") {
        const service = (request.service || '').toString().trim();
        const link = (request.link || '').toString().trim();
        const quantity = parseInt(request.quantity || 0, 10);
        const serviceId = service.replace(/\D/g, "");

        try {
            // ১. BotsBusiness এ JSON ভ্যালিডেশন ও ব্যালেন্স ডিডাকশন
            const botRes = await axios.get(`${BOT_WEBHOOK_URL}&key=${encodeURIComponent(apiKey)}&action=add&service=${serviceId}&quantity=${quantity}`);

            if (!botRes.data || botRes.data.status !== "success") {
                return res.json({ error: botRes.data?.error || "Not enough balance or Invalid Service" });
            }

            // ২. মূল SMMGen প্রোভাইডারে অর্ডার পাঠানো
            const providerRes = await callUpstreamApi('add', {
                service: serviceId,
                link: link,
                quantity: quantity
            });

            if (providerRes && providerRes.order) {
                return res.json({ order: providerRes.order });
            } else {
                return res.json({ error: providerRes?.error || "Upstream provider error" });
            }

        } catch (err) {
            return res.json({ error: "Transaction error: " + err.message });
        }
    }

    // 🔍 STATUS
    if (action === "status") {
        const orderId = parseInt(request.order || 0, 10);
        const statusRes = await callUpstreamApi('status', { order: orderId });
        return res.json(statusRes);
    }

    return res.json({ error: "Invalid Action" });
});

module.exports = app;
