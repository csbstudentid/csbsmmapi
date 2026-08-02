const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= CONFIGURATIONS =================
const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "29e3cdfcbdce836e667f5c6473e6fb3f";

const BB_BOT_ID = "2968405";
const BB_API_KEY = "SZ5agaaNJX1kWJiaoK7BK3Aqm-1PJ9WtrkNdGv7n"; 
// ===================================================

// Helper: BotsBusiness Property Read
async function getBBProperty(propName) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/properties?api_key=${BB_API_KEY}&name=${propName}`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data ? res.data.value : null;
    } catch (e) {
        return null;
    }
}

// Helper: BotsBusiness User Balance (Points) Read
async function getBBUserBalance(telegramId) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance?api_key=${BB_API_KEY}&telegram_id=${telegramId}`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data ? parseFloat(res.data.value || 0) : 0;
    } catch (e) {
        return 0;
    }
}

// Helper: BotsBusiness User Points Deduct/Refund
async function deductBBUserPoints(telegramId, amount) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance/add?api_key=${BB_API_KEY}&telegram_id=${telegramId}&value=-${amount}`;
        const res = await axios.post(url, {}, { timeout: 8000 });
        return res.data && res.data.status === "success";
    } catch (e) {
        return false;
    }
}

// Helper: SMMGen Provider Call
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

        return res.data || { error: "No response from SMM provider" };
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

        // 🔑 1. Validate API Key
        let ownerTelegramID = await getBBProperty("apikey_owner_" + apiKey);

        if (!ownerTelegramID && apiKey.startsWith("CSB_")) {
            const parts = apiKey.split("_");
            if (parts.length >= 2) {
                ownerTelegramID = parts[1];
            }
        }

        if (!ownerTelegramID) {
            return res.json({ error: "Incorrect API key" });
        }

        // 💰 2. ACTION: BALANCE
        if (action === "balance") {
            const userPoints = await getBBUserBalance(ownerTelegramID);
            
            return res.json({
                balance: userPoints.toFixed(2),
                currency: "Points"
            });
        }

        // 🛒 3. ACTION: ADD ORDER
        if (action === "add") {
            const rawService = (request.service || '').toString().trim();
            const link = (request.link || '').toString().trim();
            const quantity = parseInt(request.quantity || 0, 10);
            const serviceId = rawService.replace(/\D/g, "");

            if (!serviceId || !link || isNaN(quantity) || quantity <= 0) {
                return res.json({ error: "Invalid parameters" });
            }

            // (ক) ইউজারের পয়েন্ট ব্যালেন্স চেক
            const currentPoints = await getBBUserBalance(ownerTelegramID);
            
            // (খ) সার্ভিস প্রাইস (পয়েন্টে হিসাব)
            const rawConfigs = await getBBProperty("service_configs");
            let rateInPoints = 1500; // ডিফল্ট ১০০০ কোয়ান্টিটিতে ১৫০০ পয়েন্ট
            if (rawConfigs) {
                try {
                    const configs = typeof rawConfigs === 'string' ? JSON.parse(rawConfigs) : rawConfigs;
                    if (configs[serviceId] && configs[serviceId].rate) {
                        rateInPoints = parseFloat(configs[serviceId].rate);
                    }
                } catch(e) {}
            }

            const totalPointsCost = (rateInPoints / 1000) * quantity;

            if (currentPoints < totalPointsCost) {
                return res.json({ error: "Not enough balance (Points)" });
            }

            // (গ) পয়েন্ট কেটে নেওয়া
            const deducted = await deductBBUserPoints(ownerTelegramID, totalPointsCost);
            if (!deducted) {
                return res.json({ error: "Failed to deduct points from bot account" });
            }

            // (ঘ) SMMGen-এ অর্ডার প্লেস করা
            const providerRes = await callUpstreamApi('add', {
                service: serviceId,
                link: link,
                quantity: quantity
            });

            if (providerRes && providerRes.order) {
                return res.json({ order: providerRes.order });
            } else {
                // অর্ডার ফেল করলে পয়েন্ট ফেরত
                await deductBBUserPoints(ownerTelegramID, -totalPointsCost);
                return res.json({ error: providerRes?.error || "Failed to place order on SMMGen" });
            }
        }

        // 🔍 4. ACTION: STATUS
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
