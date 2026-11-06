// src/api/backup.js
// 完整备份：导出/恢复「域名列表 + 通知设置」。
// 与 /api/notify-config 不同，备份导出包含完整 Bot Token（否则备份无法恢复），
// 因此只在已鉴权的 /api/* 路由下调用（见 src/index.js），切勿改为公开端点。

import { getDomainsFromKV, setDomainsToKV } from './domains';
import { getNotifyConfig, saveNotifyConfig } from './notify';

const BACKUP_APP = 'domain-check';
const BACKUP_VERSION = 1;

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 校验备份中的通知设置并补齐缺省字段（缺省取当前有效配置）；不合法返回 { error }
function buildRestoredNotify(n, current) {
    const cfg = {
        enabled: n.enabled !== undefined ? Boolean(n.enabled) : current.enabled,
        tgChatId: n.tgChatId !== undefined ? String(n.tgChatId ?? '') : (current.tgChatId || ''),
        tgBotToken: n.tgBotToken !== undefined ? String(n.tgBotToken ?? '') : (current.tgBotToken || ''),
        days: current.days,
        notifyExpired: n.notifyExpired !== undefined ? Boolean(n.notifyExpired) : current.notifyExpired
    };
    if (n.days !== undefined && n.days !== null && n.days !== '') {
        const days = Number(n.days);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            return { error: '备份中的提前提醒天数必须是 1~365 的整数' };
        }
        cfg.days = days;
    }
    return { cfg };
}

// GET /api/backup —— 导出完整备份；PUT/POST /api/backup —— 恢复备份
export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'GET') {
        const domains = await getDomainsFromKV(env);
        // 导出有效配置（面板配置优先、环境变量兜底），迁移到新部署时开箱即用
        const effective = await getNotifyConfig(env);
        const backup = {
            app: BACKUP_APP,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            domains,
            notify: {
                enabled: effective.enabled,
                tgChatId: effective.tgChatId,
                tgBotToken: effective.tgBotToken,
                days: effective.days,
                notifyExpired: effective.notifyExpired
            }
        };
        const date = new Date().toISOString().split('T')[0];
        return new Response(JSON.stringify(backup, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="domain-check_backup_${date}.json"`
            }
        });
    }

    if (request.method === 'PUT' || request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ success: false, error: '无效的 JSON 格式' }, 400);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return jsonResponse({ success: false, error: '备份格式错误：应为包含 domains 数组的对象（旧版纯域名文件请走导入域名的 PUT /api/domains）' }, 400);
        }
        if (!Array.isArray(body.domains)) {
            return jsonResponse({ success: false, error: '备份格式错误：缺少 domains 数组' }, 400);
        }
        for (const d of body.domains) {
            if (!d || typeof d !== 'object' || typeof d.domain !== 'string' || !d.domain.trim()) {
                return jsonResponse({ success: false, error: '备份格式错误：domains 中存在缺少 domain 字段的条目' }, 400);
            }
        }

        // 先把通知设置校验完再写任何数据，避免恢复一半才报错
        let restoredNotify = null;
        if (body.notify !== undefined && body.notify !== null) {
            if (typeof body.notify !== 'object' || Array.isArray(body.notify)) {
                return jsonResponse({ success: false, error: '备份格式错误：notify 应为对象' }, 400);
            }
            const current = await getNotifyConfig(env);
            const built = buildRestoredNotify(body.notify, current);
            if (built.error) {
                return jsonResponse({ success: false, error: built.error }, 400);
            }
            restoredNotify = built.cfg;
        }

        await setDomainsToKV(env, body.domains);
        let notifyRestored = false;
        if (restoredNotify) {
            await saveNotifyConfig(env, restoredNotify);
            notifyRestored = true;
        }

        return jsonResponse({
            success: true,
            domainsCount: body.domains.length,
            notifyRestored
        });
    }

    return new Response('Method Not Allowed', { status: 405 });
}
