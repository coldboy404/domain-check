// src/utils.js

// 从环境变量读取配置
export function getConfig(env) {
    const parsedDays = Number(env.DAYS || 30);
    return {
        siteName: env.SITENAME || "域名到期监控",
        siteIcon: env.ICON || 'https://pan.811520.xyz/icon/domain-check.png',
        bgimgURL: env.BGIMG || 'https://pan.811520.xyz/icon/bg_light.webp',
        githubURL: env.GITHUB_URL || 'https://github.com/yutian81/domain-check',
        blogURL: env.BLOG_URL || 'https://blog.notett.com/post/2025/11/251118-domain-check/',
        blogName: env.BLOG_NAME || 'QingYun Blog',
        password: env.PASSWORD || "123123",
        days: Number.isNaN(parsedDays) || parsedDays <= 0 ? 30 : parsedDays, // 用于前端即将到期判断，解析失败回退 30
        tgid: env.TGID || env.TG_CHAT_ID,
        tgtoken: env.TGTOKEN || env.TG_BOT_TOKEN
    };
}

// 格式化日期为北京时间 YYYY-MM-DD
export function formatDateToBeijing(dateStr) {
    const date = new Date(dateStr);
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().split('T')[0];
}

// 判断是否为一级域名（返回布尔值）
export function isPrimaryDomain(domain) {
    const parts = domain.split('.');
    return parts.length <= 2;
}

// HTML 转义（后端拼消息/页面时使用，防止字段中的特殊字符破坏结构）
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Telegram HTML parse_mode 专用转义：域名/注册商/账号等字段插入消息前必须转义 & < >
export function escapeTelegramHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// TG通知函数：返回发送结果，不再静默吞错
// 成功 { ok: true }；失败 { ok: false, status, error }
export async function sendtgMessage(message, tgid, tgtoken) {
    if (!tgid || !tgtoken) {
        return { ok: false, status: 0, error: '缺少 Telegram Chat ID 或 Bot Token，未发送' };
    }
    const url = `https://api.telegram.org/bot${tgtoken}/sendMessage`;
    const params = {
        chat_id: tgid,
        text: message,
        parse_mode: "HTML"
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        let data = null;
        try { data = await response.json(); } catch (e) { /* 响应非 JSON 时忽略 */ }
        if (response.ok && (!data || data.ok !== false)) {
            return { ok: true };
        }
        const description = (data && (data.description || data.error)) || `Telegram 请求失败 (HTTP ${response.status})`;
        console.error('Telegram 消息推送失败:', response.status, description);
        return { ok: false, status: response.status, error: description };
    } catch (error) {
        console.error('Telegram 消息推送失败:', error);
        return { ok: false, status: 0, error: error.message || String(error) };
    }
}
