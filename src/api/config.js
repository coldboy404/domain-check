// src/api/config.js

import { getConfig } from '../utils';
import { getNotifyConfig } from './notify';

export async function onRequest(context) {
    const { env } = context;
    const config = getConfig(env);

    // 提前提醒天数与通知设置共用同一有效值（面板配置优先、环境变量兜底），
    // 保证卡片「将到期」判断与 TG 推送阈值一致
    let days = config.days;
    try {
        days = (await getNotifyConfig(env)).days;
    } catch (e) {
        console.error('读取通知配置失败，前端天数回退环境变量:', e);
    }

    // 只返回前端需要的配置，避免泄露敏感信息（如 password, tgtoken, apiKey）
    const clientConfig = {
        siteName: config.siteName,
        siteIcon: config.siteIcon,
        bgimgURL: config.bgimgURL,
        githubURL: config.githubURL,
        blogURL: config.blogURL,
        blogName: config.blogName,
        days,
    };

    return new Response(JSON.stringify(clientConfig), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300' // 短缓存，面板改天数后能较快生效
        }
    });
}
