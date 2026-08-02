const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= Configs =================
const SMM_API_URL = "https://my.smmgen.com/api/v2";
const SMM_API_KEY = "29e3cdfcbdce836e667f5c6473e6fb3f";

const BB_BOT_ID = "2968405";
// 🔑 BotsBusiness Account Settings থেকে নেওয়া Master API Key টি এখানে বসান
const BB_API_KEY = "YOUR_BOTSBUSINESS_MASTER_API_KEY"; 
// ===========================================

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

// Helper: BotsBusiness Resource (Balance) Read
async function getBBUserBalance(telegramId) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance?api_key=${BB_API_KEY}&telegram_id=${telegramId}`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data ? parseFloat(res.data.value || 0) : 0;
    } catch (e) {
        return 0;
    }
}

// Helper: BotsBusiness Resource (Balance) Deduct/Add
async function deductBBUserBalance(telegramId, amount) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance/add?api_key=${BB_API_KEY}&telegram_id=${telegramId}&value=-${amount}`;
        const res = await axios.post(url, {}, { timeout: 8000 });
        return res.data && res.data.status === "success";
    } catch (e) {
        return false;
    }
}

// Helper: SMMGen Call
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

        // 🔑 1. Validate API Key Directly from BotsBusiness Property
        const ownerTelegramID = await getBBProperty("apikey_owner_" + apiKey);

        if (!ownerTelegramID) {
            return res.json({ error: "Incorrect API key" });
        }

        // 💰 2. ACTION: BALANCE
        if (action === "balance") {
            const balance = await getBBUserBalance(ownerTelegramID);
            return res.json({
                balance: balance.toFixed(2),
                currency: "USD"
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

            // (ক) ইউজারের ব্যালেন্স চেক
            const currentBalance = await getBBUserBalance(ownerTelegramID);
            
            // (খ) সার্ভিস প্রাইস হিসাব (ক্যাটালগ/কনফিগ থেকে)
            const rawConfigs = await getBBProperty("service_configs");
            let rate = 1;
            if (rawConfigs) {
                try {
                    const configs = typeof rawConfigs === 'string' ? JSON.parse(rawConfigs) : rawConfigs;
                    if (configs[serviceId] && configs[serviceId].rate) {
                        rate = parseFloat(configs[serviceId].rate);
                    }
                } catch(e) {}
            }

            const totalCost = (rate / 1000) * quantity;

            if (currentBalance < totalCost) {
                return res.json({ error: "Not enough balance" });
            }

            // (গ) পয়েন্ট কেটে নেওয়া
            const deducted = await deductBBUserBalance(ownerTelegramID, totalCost);
            if (!deducted) {
                return res.json({ error: "Failed to deduct balance from bot account" });
            }

            // (ঘ) SMMGen-এ আসল অর্ডার প্লেস করা
            const providerRes = await callUpstreamApi('add', {
                service: serviceId,
                link: link,
                quantity: quantity
            });

            if (providerRes && providerRes.order) {
                return res.json({ order: providerRes.order });
            } else {
                // কোনো কারণে প্রোভাইডারে অর্ডার ফেল করলে কেটে নেওয়া পয়েন্ট ফেরত দেওয়া
                await deductBBUserBalance(ownerTelegramID, -totalCost);
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
