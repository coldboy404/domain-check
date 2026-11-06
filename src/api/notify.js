// src/api/notify.js
// Telegram 通知的面板配置：KV key `settings:notify` 优先，环境变量兜底。
// 对外（前端）只返回脱敏视图，绝不返回完整 Bot Token。

import { getConfig, sendtgMessage, escapeTelegramHtml } from '../utils';

const NOTIFY_KEY = 'settings:notify';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 解析天数：1~365 的整数才有效，无效返回 null
function parseDays(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 365) return null;
    return n;
}

// 保存面板配置到 KV（供通知设置与备份恢复共用）
export async function saveNotifyConfig(env, cfg) {
    if (!env.DOMAIN_KV) throw new Error('未配置 KV 命名空间 DOMAIN_KV');
    await env.DOMAIN_KV.put(NOTIFY_KEY, JSON.stringify(cfg));
}

// 读取 KV 中保存的面板配置（原始对象，可能为 null）
export async function getStoredNotify(env) {
    if (!env.DOMAIN_KV) return null;
    try {
        const stored = await env.DOMAIN_KV.get(NOTIFY_KEY, { type: 'json' });
        if (!stored) return null;
        return typeof stored === 'string' ? JSON.parse(stored) : stored;
    } catch (e) {
        console.error('读取通知配置失败:', e);
        return null;
    }
}

// 获取有效通知配置：KV 逐字段优先，缺失字段回退环境变量
export async function getNotifyConfig(env) {
    const stored = await getStoredNotify(env);
    const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

    // Chat ID：KV 中存在该字段（含空串 = 已清空）则用 KV，否则回退 env
    const chatFromKv = has(stored, 'tgChatId');
    const tgChatId = chatFromKv
        ? String(stored.tgChatId || '')
        : String(env.TGID || env.TG_CHAT_ID || '');

    // Bot Token：同上
    const tokenFromKv = has(stored, 'tgBotToken');
    const tgBotToken = tokenFromKv
        ? String(stored.tgBotToken || '')
        : String(env.TGTOKEN || env.TG_BOT_TOKEN || '');

    // 提前提醒天数：KV → env.DAYS → 30
    const days = parseDays(has(stored, 'days') ? stored.days : undefined)
        ?? parseDays(env.DAYS)
        ?? 30;

    // 是否开启：KV 未设置时，有 token+id 就算开启
    const enabled = has(stored, 'enabled')
        ? Boolean(stored.enabled)
        : Boolean(tgChatId && tgBotToken);

    // 已过期是否提醒：默认 true
    const notifyExpired = has(stored, 'notifyExpired')
        ? Boolean(stored.notifyExpired)
        : true;

    // 配置来源（指 token/id 的来源）
    let source;
    if (!tgChatId && !tgBotToken) {
        source = 'none';
    } else if ((chatFromKv && tgChatId) || (tokenFromKv && tgBotToken)) {
        source = 'kv';
    } else {
        source = 'env';
    }

    return { enabled, tgChatId, tgBotToken, days, notifyExpired, source };
}

// 脱敏视图：绝不包含完整 token，只露末 4 位
function toPublicView(cfg) {
    const token = cfg.tgBotToken || '';
    return {
        enabled: cfg.enabled,
        tgChatId: cfg.tgChatId || '',
        days: cfg.days,
        notifyExpired: cfg.notifyExpired,
        source: cfg.source,
        hasToken: Boolean(token),
        tokenMasked: token ? `****${token.slice(-4)}` : ''
    };
}

// GET /api/notify-config —— 返回脱敏配置；PUT —— 保存配置
export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'GET') {
        const cfg = await getNotifyConfig(env);
        return jsonResponse(toPublicView(cfg));
    }

    if (request.method === 'PUT') {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ success: false, error: '无效的 JSON 格式' }, 400);
        }
        if (!body || typeof body !== 'object') {
            return jsonResponse({ success: false, error: '请求体必须是 JSON 对象' }, 400);
        }

        const current = await getNotifyConfig(env);

        // days：提供时必须是 1~365 的整数，缺省保留旧值
        let days = current.days;
        if (body.days !== undefined && body.days !== null && body.days !== '') {
            const parsed = parseDays(body.days);
            if (parsed === null) {
                return jsonResponse({ success: false, error: '提前提醒天数必须是 1~365 的整数' }, 400);
            }
            days = parsed;
        }

        // tgBotToken：空字符串或缺省 = 保留已存 token；clearToken:true = 显式清除
        let tgBotToken = current.tgBotToken || '';
        if (body.clearToken === true) {
            tgBotToken = '';
        } else if (typeof body.tgBotToken === 'string' && body.tgBotToken.trim() !== '') {
            tgBotToken = body.tgBotToken.trim();
        }

        const next = {
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
            tgChatId: body.tgChatId !== undefined ? String(body.tgChatId ?? '').trim() : (current.tgChatId || ''),
            tgBotToken,
            days,
            notifyExpired: body.notifyExpired !== undefined ? Boolean(body.notifyExpired) : current.notifyExpired
        };

        if (!env.DOMAIN_KV) {
            return jsonResponse({ success: false, error: '未配置 KV 命名空间 DOMAIN_KV' }, 500);
        }
        await saveNotifyConfig(env, next);

        const saved = await getNotifyConfig(env);
        return jsonResponse({ success: true, ...toPublicView(saved) });
    }

    return new Response('Method Not Allowed', { status: 405 });
}

// POST /api/notify-test —— 用表单当前值发送测试消息，透传 Telegram 真实结果
export async function onRequestTest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    const stored = await getNotifyConfig(env);

    // 优先用请求体里表单当前填的值；token 为空则用已存的，方便保存前测试
    const tgChatId = (typeof body.tgChatId === 'string' && body.tgChatId.trim() !== '')
        ? body.tgChatId.trim()
        : (stored.tgChatId || '');
    const tgBotToken = (typeof body.tgBotToken === 'string' && body.tgBotToken.trim() !== '')
        ? body.tgBotToken.trim()
        : (stored.tgBotToken || '');

    if (!tgBotToken && !tgChatId) {
        return jsonResponse({ success: false, error: '缺少 Bot Token 和 Chat ID，请先填写' }, 400);
    }
    if (!tgBotToken) {
        return jsonResponse({ success: false, error: '缺少 Bot Token，请先填写' }, 400);
    }
    if (!tgChatId) {
        return jsonResponse({ success: false, error: '缺少 Chat ID，请先填写' }, 400);
    }

    const config = getConfig(env);
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const timestamp = beijingNow.toISOString().replace('T', ' ').slice(0, 19);
    const message = `<b>🔔 测试推送</b>\n站点: ${escapeTelegramHtml(config.siteName)}\n时间: ${timestamp} (北京时间)\n这是一条来自域名到期监控面板的测试消息，收到即表示通知配置正确。`;

    const result = await sendtgMessage(message, tgChatId, tgBotToken);
    if (result.ok) {
        return jsonResponse({ success: true });
    }
    const statusText = result.status ? `Telegram 返回 ${result.status}: ` : '';
    return jsonResponse({ success: false, error: `${statusText}${result.error || '发送失败'}` });
}
