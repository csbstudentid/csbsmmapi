const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// 🔒 CONFIGURATIONS
// ============================================================
const SMM_API_URL = process.env.SMM_API_URL || "https://my.smmgen.com/api/v2";
const SMM_API_KEY = process.env.SMM_API_KEY || "29e3cdfcbdce836e667f5c6473e6fb3f";

const BB_BOT_ID = process.env.BB_BOT_ID || "2968405";
const BB_API_KEY = process.env.BB_API_KEY || "SZ5agaaNJX1kWJiaoK7BK3Aqm-1PJ9WtrkNdGv7n";

// Helper: Read BotsBusiness Property (Fixed & Safe)
async function getBBProperty(propName) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/properties?api_key=${BB_API_KEY}&name=${encodeURIComponent(propName)}`;
        const res = await axios.get(url, { timeout: 8000 });
        if (res.data) {
            if (res.data.value !== undefined && res.data.value !== null) {
                return res.data.value;
            }
            if (typeof res.data === 'string') {
                return res.data;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Helper: Write BotsBusiness Property
async function setBBProperty(propName, value) {
    try {
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/properties?api_key=${BB_API_KEY}&name=${encodeURIComponent(propName)}&value=${encodeURIComponent(value)}`;
        await axios.post(url, {}, { timeout: 8000 });
        return true;
    } catch (e) {
        return false;
    }
}

// FIX: EXTRACT TELEGRAM ID DIRECTLY FROM API KEY
function extractTelegramIdFromKey(apiKey) {
    if (!apiKey) return null;
    
    // Format: CSB_<TELEGRAM_ID>_<RANDOM_CHARS>
    if (apiKey.startsWith("CSB_")) {
        const parts = apiKey.split("_");
        if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
            return parts[1];
        }
    }
    return null;
}

// FIX: FETCH REAL LIVE BALANCE DIRECTLY (ULTIMATE FIX)
async function getBBUserBalance(telegramId) {
    try {
        // ১. প্রথমে প্রপার্টি চেক করা
        const propVal = await getBBProperty("user_balance_" + telegramId);
        if (propVal !== null && propVal !== undefined && propVal !== "" && !isNaN(propVal)) {
            return parseFloat(propVal);
        }

        // ২. প্রপার্টি না পেলে সরাসরি রিসোর্স এপিআই কল করা
        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources?api_key=${BB_API_KEY}&telegram_id=${telegramId}`;
        const res = await axios.get(url, { timeout: 8000 });
        
        if (res.data) {
            if (Array.isArray(res.data)) {
                const balRes = res.data.find(r => r.name === "balance" || r.resource === "balance");
                if (balRes && balRes.value !== undefined) {
                    return parseFloat(balRes.value || 0);
                }
            } else if (typeof res.data === 'object') {
                if (res.data.balance !== undefined) return parseFloat(res.data.balance);
                if (res.data.value !== undefined) return parseFloat(res.data.value);
            }
        }

        return 0;
    } catch (e) {
        return 0;
    }
}

// FIX: ORDER BALANCE DEDUCTION
async function deductBBUserPoints(telegramId, amount) {
    try {
        const currentBalance = await getBBUserBalance(telegramId);
        const newBal = Math.max(0, currentBalance - amount);
        await setBBProperty("user_balance_" + telegramId, newBal.toString());

        const url = `https://api.bots.business/v1/bots/${BB_BOT_ID}/resources/balance/add?api_key=${BB_API_KEY}&telegram_id=${telegramId}&value=-${amount}`;
        await axios.post(url, {}, { timeout: 8000 });

        return true;
    } catch (e) {
        return false;
    }
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

// FIX: SERVICES RATE FETCHING (UPDATED & SECURE)
async function getDynamicServiceRate(serviceId) {
    try {
        // ১. প্রথমে সরাসরি নির্দিষ্ট সার্ভিসের রেট চেক করা
        let singleRate = await getBBProperty("rate_" + serviceId);
        if (!singleRate) {
            singleRate = await getBBProperty("service_rate_" + serviceId);
        }
        if (singleRate) return parseFloat(singleRate);

        // ২. বটের ফুল ক্যাটালগ প্রপার্টি থেকে সার্ভিস খুঁজে বের করা
        const rawCatalog = await getBBProperty("bot_full_catalog");
        if (rawCatalog) {
            let catalog = typeof rawCatalog === 'string' ? JSON.parse(rawCatalog) : rawCatalog;
            for (let cat in catalog) {
                let list = catalog[cat];
                if (Array.isArray(list)) {
                    let match = list.find(s => String(s.id) === String(serviceId) || String(s.service_id) === String(serviceId));
                    if (match) {
                        let r = match.rate || match.reseller_rate || match.price;
                        if (r) return parseFloat(r);
                    }
                }
            }
        }

        // ৩. অন্যান্য কনফিগ বা লিস্ট চেক করা
        const rawConfigs = await getBBProperty("service_configs");
        if (rawConfigs) {
            let configs = typeof rawConfigs === 'string' ? JSON.parse(rawConfigs) : rawConfigs;
            if (configs[serviceId]) {
                let sObj = configs[serviceId];
                let r = sObj.rate || sObj.point || sObj.price;
                if (r) return parseFloat(r);
            }
        }
    } catch (e) {}

    return null;
}

// Helper: Save Order Details
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

// ============================================================
// 🚀 ROUTE HANDLER /api/v2
// ============================================================
app.all('/api/v2', async (req, res) => {
    try {
        const request = req.method === 'POST' ? (req.body || {}) : (req.query || {});
        const apiKey = (request.key || '').toString().trim();
        const action = (request.action || '').toString().trim();

        if (!apiKey || !action) {
            return res.json({ error: "Invalid API key or Action missing" });
        }

        // 🔒 Extract Telegram ID from Key
        const ownerTelegramID = extractTelegramIdFromKey(apiKey);
        if (!ownerTelegramID) {
            return res.json({ error: "Incorrect API key" });
        }

        // FIX: LIVE BALANCE
        if (action === "balance") {
            const userPoints = await getBBUserBalance(ownerTelegramID);
            return res.json({
                balance: userPoints.toFixed(2),
                currency: "Points"
            });
        }

        // FIX: SERVICES
        if (action === "services") {
            const providerServices = await callUpstreamApi('services');

            if (!Array.isArray(providerServices)) {
                return res.json(providerServices);
            }

            const mappedServices = [];
            for (const item of providerServices) {
                const sId = item.service;
                const botRate = await getDynamicServiceRate(sId);

                mappedServices.push({
                    service: sId,
                    name: item.name,
                    type: item.type || "Default",
                    category: item.category,
                    rate: botRate !== null ? botRate.toFixed(2) : (parseFloat(item.rate) || 0).toFixed(2),
                    min: item.min,
                    max: item.max,
                    dripfeed: item.dripfeed || false,
                    refill: item.refill || false
                });
            }

            return res.json(mappedServices);
        }

        // FIX: ADD ORDER
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

            if (rateInPoints === null) {
                return res.json({ error: "Service rate not configured in system" });
            }

            const totalPointsCost = (rateInPoints / 1000) * quantity;

            if (currentPoints < totalPointsCost) {
                return res.json({ error: "Not enough balance (Points)" });
            }

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
                return res.json({ error: providerRes?.error || "Failed to place order on SMM Provider" });
            }
        }

        // FIX: STATUS
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
