// src/cron.js

import { getConfig, sendtgMessage, escapeTelegramHtml } from './utils';
import { getDomainsFromKV } from './api/domains';
import { getNotifyConfig } from './api/notify';

const LAST_NOTIFY_KEY = 'notify:last';
const MAX_DOMAINS_IN_MESSAGE = 40; // 单条消息最多列出的域名数（TG 单条上限 4096 字符）

// 封装获取域名列表的函数
export async function getDomainsList(env) {
    try {
        return await getDomainsFromKV(env);
    } catch (e) {
        console.error('从 KV 获取域名列表失败:', e.message);
        return [];
    }
}

// 简单稳定哈希（djb2），用于每日防重复的集合指纹
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

// 北京时间 YYYY-MM-DD
function beijingToday() {
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return beijingNow.toISOString().split('T')[0];
}

// 组装汇总消息：已过期与即将到期分组列出，字段插入前做 HTML 转义
function buildSummaryMessage(config, todayStr, expired, expiring) {
    const lines = [];
    lines.push(`<b>🚨 域名到期提醒 — ${escapeTelegramHtml(config.siteName)}</b>`);
    lines.push(`📅 日期: ${todayStr}`);

    const total = expired.length + expiring.length;
    let listed = 0;

    if (expired.length > 0) {
        lines.push('');
        lines.push(`<b>⛔ 已过期（${expired.length} 个）</b>`);
        for (const d of expired) {
            if (listed >= MAX_DOMAINS_IN_MESSAGE) break;
            lines.push(`• <code>${escapeTelegramHtml(d.domain)}</code> 已过期 <b>${Math.abs(d.daysRemaining)}天</b>｜到期: ${escapeTelegramHtml(d.expirationDate)}｜注册商: ${escapeTelegramHtml(d.system || 'N/A')}｜账号: <code>${escapeTelegramHtml(d.registerAccount || 'N/A')}</code>`);
            listed++;
        }
    }

    if (expiring.length > 0) {
        lines.push('');
        lines.push(`<b>⏰ 即将到期（${expiring.length} 个）</b>`);
        for (const d of expiring) {
            if (listed >= MAX_DOMAINS_IN_MESSAGE) break;
            lines.push(`• <code>${escapeTelegramHtml(d.domain)}</code> 剩余 <b>${d.daysRemaining}天</b>｜到期: ${escapeTelegramHtml(d.expirationDate)}｜注册商: ${escapeTelegramHtml(d.system || 'N/A')}｜账号: <code>${escapeTelegramHtml(d.registerAccount || 'N/A')}</code>`);
            listed++;
        }
    }

    if (total > listed) {
        lines.push('');
        lines.push(`……另有 ${total - listed} 个域名未列出，请到面板查看。`);
    }

    let message = lines.join('\n');
    // 兜底：仍超长时截断到 TG 上限内
    if (message.length > 4000) {
        message = message.slice(0, 4000) + '\n……消息过长已截断，请到面板查看全部。';
    }
    return message;
}

// 检查到期域名并（按需）合并发送一条 Telegram 汇总通知
// options: { force: false } —— force=true 时绕过每日防重复
// 返回 { domains, notified, notifyError?, skippedReason?, notifySkipped?, dedup? }
// domains 含即将到期与（开启提醒时的）已过期域名
export async function checkDomainsScheduled(env, options = {}) {
    const force = Boolean(options && options.force);
    const config = getConfig(env);
    const notifyCfg = await getNotifyConfig(env);
    const allDomains = await getDomainsList(env);

    const result = {
        domains: [],
        notified: false,
        notifyError: undefined,
        skippedReason: undefined,
        notifySkipped: undefined,
        dedup: false
    };

    if (allDomains.length === 0) {
        console.log("KV中没有域名数据，跳过定时检查");
        result.skippedReason = '没有域名数据';
        result.notifySkipped = result.skippedReason;
        return result;
    }

    const now = new Date();
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    const expiring = [];
    const expired = [];

    for (const domainInfo of allDomains) {
        const expirationUTC = Date.parse(domainInfo.expirationDate);
        if (isNaN(expirationUTC)) {
            console.warn(`跳过无效日期 (${domainInfo.domain}): ${domainInfo.expirationDate}`);
            continue;
        }
        const timeDiff = expirationUTC - todayUTC;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        const entry = {
            domain: domainInfo.domain,
            expirationDate: domainInfo.expirationDate,
            daysRemaining: daysRemaining,
            system: domainInfo.system,
            systemURL: domainInfo.systemURL,
            registerAccount: domainInfo.registerAccount || 'N/A',
            groups: domainInfo.groups || 'N/A'
        };

        if (daysRemaining > 0 && daysRemaining <= notifyCfg.days) {
            expiring.push(entry);
        } else if (daysRemaining <= 0 && notifyCfg.notifyExpired) {
            expired.push(entry);
        }
    }

    result.domains = [...expired, ...expiring];

    if (result.domains.length === 0) {
        result.skippedReason = '没有需要通知的域名';
        result.notifySkipped = result.skippedReason;
        return result;
    }

    // 通知开关 / 配置完整性检查：跳过发送但仍返回到期列表
    if (!notifyCfg.enabled) {
        result.skippedReason = 'disabled: 通知已关闭';
        result.notifySkipped = result.skippedReason;
        return result;
    }
    if (!notifyCfg.tgBotToken || !notifyCfg.tgChatId) {
        const missing = !notifyCfg.tgBotToken && !notifyCfg.tgChatId
            ? 'Bot Token 和 Chat ID'
            : (!notifyCfg.tgBotToken ? 'Bot Token' : 'Chat ID');
        result.skippedReason = `missing-config: 缺少 ${missing}`;
        result.notifySkipped = result.skippedReason;
        return result;
    }

    // 每日防重复：同一天、相同域名集合只发一次（force 时绕过）
    const todayStr = beijingToday();
    const stableSet = result.domains
        .map(d => `${d.domain}:${d.daysRemaining}`)
        .sort()
        .join(',');
    const hash = simpleHash(stableSet);

    if (!force && env.DOMAIN_KV) {
        try {
            const last = await env.DOMAIN_KV.get(LAST_NOTIFY_KEY, { type: 'json' });
            if (last && last.date === todayStr && last.hash === hash) {
                result.dedup = true;
                result.skippedReason = 'dedup: 今日已发送相同通知，已跳过重复发送';
                result.notifySkipped = result.skippedReason;
                console.log('今日已发送相同到期通知，跳过重复发送 (dedup)');
                return result;
            }
        } catch (e) {
            console.error('读取 notify:last 失败:', e);
        }
    }

    const message = buildSummaryMessage(config, todayStr, expired, expiring);
    const sendResult = await sendtgMessage(message, notifyCfg.tgChatId, notifyCfg.tgBotToken);

    if (!sendResult.ok) {
        result.notified = false;
        result.notifyError = sendResult.status
            ? `Telegram 返回 ${sendResult.status}: ${sendResult.error}`
            : (sendResult.error || '发送失败');
        console.error('到期汇总通知发送失败:', result.notifyError);
        return result;
    }

    result.notified = true;
    console.log(`已发送到期汇总通知，共 ${result.domains.length} 个域名。`);

    // 发送成功才写防重复记录
    if (env.DOMAIN_KV) {
        try {
            await env.DOMAIN_KV.put(LAST_NOTIFY_KEY, JSON.stringify({ date: todayStr, hash }));
        } catch (e) {
            console.error('写入 notify:last 失败:', e);
        }
    }

    return result;
}
