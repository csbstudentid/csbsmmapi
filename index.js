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
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/properties?api_key=${BB_API_KEY}&name=${encodeURIComponent(propName)}`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data ? res.data.value : null;
    } catch (e) {
        return null;
    }
}

// Helper: BotsBusiness Property Write
async function setBBProperty(propName, value) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/properties?api_key=${BB_API_KEY}&name=${encodeURIComponent(propName)}&value=${encodeURIComponent(value)}`;
        await axios.post(url, {}, { timeout: 8000 });
        return true;
    } catch (e) {
        return false;
    }
}

// Helper: Get User Live Balance (With Multi-level Fallback)
async function getBBUserBalance(telegramId) {
    try {
        // ১. প্রপার্টি থেকে রিড করা (সবচেয়ে নির্ভরযোগ্য)
        let propVal = await getBBProperty("user_balance_" + telegramId);
        if (propVal !== null && propVal !== undefined && propVal !== "") {
            return parseFloat(propVal || 0);
        }

        // ২. রিসোর্স API থেকে ট্রাই করা
        let url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance?api_key=${BB_API_KEY}&telegram_id=${telegramId}`;
        let res = await axios.get(url, { timeout: 8000 });
        if (res.data && res.data.value !== undefined && res.data.value !== null) {
            let val = parseFloat(res.data.value || 0);
            await setBBProperty("user_balance_" + telegramId, val.toString());
            return val;
        }

        return 0;
    } catch (e) {
        return 0;
    }
}

// Helper: BotsBusiness User Points Deduct
async function deductBBUserPoints(telegramId, amount) {
    try {
        let currentBalance = await getBBUserBalance(telegramId);
        let newBalance = currentBalance - amount;
        if (newBalance < 0) newBalance = 0;

        await setBBProperty("user_balance_" + telegramId, newBalance.toString());

        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance/add?api_key=${BB_API_KEY}&telegram_id=${telegramId}&value=-${amount}`;
        await axios.post(url, {}, { timeout: 8000 });

        return true;
    } catch (e) {
        return true;
    }
}

// Helper: Save Order Details to Bot Database
async function saveOrderToBot(telegramId, orderId, serviceId, link, quantity, pointsCost) {
    try {
        const orderData = {
            order_id: orderId,
            service: serviceId,
            link: link,
            quantity: quantity,
            cost: pointsCost,
            date: new Date().toISOString()
        };

        await setBBProperty("last_order_" + telegramId, JSON.stringify(orderData));

        let totalOrders = await getBBProperty("total_api_orders") || "0";
        let newCount = parseInt(totalOrders, 10) + 1;
        await setBBProperty("total_api_orders", newCount.toString());

        return true;
    } catch (e) {
        return false;
    }
}

// Helper: Dynamic Service Rate Fetcher
async function getDynamicServiceRate(serviceId) {
    try {
        let singleRate = await getBBProperty("rate_" + serviceId);
        if (!singleRate) {
            singleRate = await getBBProperty("service_rate_" + serviceId);
        }
        if (singleRate) {
            return parseFloat(singleRate);
        }

        const rawConfigs = await getBBProperty("service_configs");
        if (rawConfigs) {
            let configs = typeof rawConfigs === 'string' ? JSON.parse(rawConfigs) : rawConfigs;
            if (configs[serviceId]) {
                let sObj = configs[serviceId];
                let r = sObj.rate || sObj.point || sObj.price;
                if (r) return parseFloat(r);
            }
        }

        const rawList = await getBBProperty("services_list");
        if (rawList) {
            let list = typeof rawList === 'string' ? JSON.parse(rawList) : rawList;
            if (Array.isArray(list)) {
                let match = list.find(s => s.id == serviceId || s.service_id == serviceId || s.service == serviceId);
                if (match) {
                    let r = match.rate || match.point || match.price;
                    if (r) return parseFloat(r);
                }
            }
        }
    } catch (e) {}

    return 100; // ডিফল্ট ব্যাকআপ রেট
}

// Helper: Upstream Provider SMMGen Call
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

        // 🔑 1. Extract Owner Telegram ID from Key
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

            const currentPoints = await getBBUserBalance(ownerTelegramID);
            const rateInPoints = await getDynamicServiceRate(serviceId);
            const totalPointsCost = (rateInPoints / 1000) * quantity;

            // পয়েন্ট কম থাকলে ব্লক
            if (currentPoints < totalPointsCost) {
                return res.json({ error: "Not enough balance (Points)" });
            }

            // প্রোভাইডারে অর্ডার সেন্ড
            const providerRes = await callUpstreamApi('add', {
                service: serviceId,
                link: link,
                quantity: quantity
            });

            if (providerRes && providerRes.order) {
                await deductBBUserPoints(ownerTelegramID, totalPointsCost);
                await saveOrderToBot(ownerTelegramID, providerRes.order, serviceId, link, quantity, totalPointsCost);
                return res.json({ order: providerRes.order });
            } else {
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
