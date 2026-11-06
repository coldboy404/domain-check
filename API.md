# API 接口

## BASE_URL

```
https://your-domain-check.workers.dev
```

## GET /api/config —— 获取项目全局配置

- 请求示例（无需鉴权）

```bash
curl -X GET https://your-domain-check.workers.dev/api/config
```

- 返回示例

```json
{
  "siteName": "域名到期监控",
  "siteIcon": "https://pan.811520.xyz/icon/domain-check.png",
  "bgimgURL": "https://pan.811520.xyz/icon/bg_light.webp",
  "githubURL": "https://github.com/yutian81/domain-check",
  "blogURL": "https://blog.811520.xyz/post/2025/04/domain-autocheck/",
  "blogName": "QingYun Blog",
  "days": 30
}
```

## GET /api/notify-config —— 获取 TG 通知配置（脱敏）

- 请求示例（需要鉴权）

```bash
curl -X GET https://your-domain-check.workers.dev/api/notify-config \
     -H "Cookie: auth=<登录 Cookie>"
```

- 返回示例（`tokenMasked` 只露末 4 位，接口绝不返回完整 Token）

```json
{
  "enabled": true,
  "tgChatId": "123456789",
  "days": 30,
  "notifyExpired": true,
  "source": "kv",
  "hasToken": true,
  "tokenMasked": "****1234"
}
```

字段说明：`source` 为 Token/Chat ID 的来源，`kv` = 面板配置、`env` = 环境变量兜底、`none` = 未配置。

## PUT /api/notify-config —— 保存 TG 通知配置到 KV

- 请求示例（需要鉴权）。`tgBotToken` 为空字符串或缺省时保留已存 Token；传 `clearToken: true` 显式清除；`days` 须为 1~365 的整数，缺省保留旧值；`tgChatId` 传空串表示清空。

```bash
curl -X PUT https://your-domain-check.workers.dev/api/notify-config \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<登录 Cookie>" \
     -d '{
            "enabled": true,
            "tgChatId": "123456789",
            "tgBotToken": "",
            "days": 30,
            "notifyExpired": true
          }'
```

- 返回示例：与 GET 相同的脱敏视图，并带 `"success": true`。

## POST /api/notify-test —— 发送 TG 测试推送

- 请求示例（需要鉴权，仅允许 POST）。优先使用请求体中表单当前填写的 `tgChatId` / `tgBotToken`（Token 为空则用已存的），保存前即可测试；缺 Token/Chat ID 时返回 400 说明缺什么。

```bash
curl -X POST https://your-domain-check.workers.dev/api/notify-test \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<登录 Cookie>" \
     -d '{ "tgChatId": "123456789", "tgBotToken": "" }'
```

- 返回示例

```json
{ "success": true }
```

```json
{ "success": false, "error": "Telegram 返回 401: Unauthorized" }
```

失败时 `error` 透传 Telegram 的 HTTP 状态与 description，不会假报成功。

## GET 或 POST /cron —— 手动检查域名到期情况

- 鉴权：已设置 `PASSWORD` 时需携带登录 Cookie（与 `/api/*` 一致）；未设置密码时公开。定时触发器（scheduled）不受此限制。
- 参数：`?force=1` 绕过每日防重复，强制重新发送汇总通知。

- 请求示例

```
curl -X GET "https://your-domain-check.workers.dev/cron" -H "Cookie: auth=<登录 Cookie>"
# 强制重发：
curl -X GET "https://your-domain-check.workers.dev/cron?force=1" -H "Cookie: auth=<登录 Cookie>"
# 或
curl -X POST https://your-domain-check.workers.dev/cron -H "Cookie: auth=<登录 Cookie>"
```

- 返回示例（`domains` 含即将到期与已过期域名，汇总通知只发一条；`notified` 表示本次是否实际发送，跳过时有 `skippedReason`，发送失败时有 `notifyError`）

```json
{
  "success": true,
  "message": "2 个域名即将到期或已过期",
  "expiringCount": 2,
  "domains": [
    {
      "domain": "example1.com",
      "expirationDate": "2025-01-01",
      "daysRemaining": 15
    }
  ],
  "notified": true
}
```

## GET /api/domains —— 获取所有域名列表

- 请求示例（需要鉴权）

```bash
curl -X GET https://your-domain-check.workers/api/domains \
     -H "Cookie: auth=<PASSWORD>"
```

- 返回示例

```json
[
  {
    "domain": "site-a.com",
    "registrationDate": "2022-10-01",
    "expirationDate": "2025-10-01",
    "system": "Cloudflare",
    "systemURL": "https://cloudflare.com",
    "registerAccount": "admin@site-a.com",
    "groups": "主要"
  },
  {
    "domain": "backup-b.net",
    "registrationDate": "2023-01-15",
    "expirationDate": "2026-01-15",
    "system": "Aliyun",
    "systemURL": "https://aliyun.com",
    "registerAccount": "backup@b.net",
    "groups": "备份, 测试"
  }
]
```

## POST /api/domains —— 添加或编辑域名

- 请求示例（需要鉴权）

```bash
curl -X POST https://your-domain-check.workers.dev/api/domains \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<PASSWORD>" \
     -d '{
            "domain": "new-domain.com",
            "registrationDate": "2023-08-08",
            "expirationDate": "2026-08-08",
            "system": "GoDaddy",
            "systemURL": "https://godaddy.com",
            "registerAccount": "contact@new-domain.com",
            "groups": "新购"
          }'
```

- 返回示例

```json
{
  "success": true, 
  "domain": "example.com"
}
```

## PUT /api/domains —— 批量更新域名列表（用于编辑）

- 请求示例

```bash
curl -X PUT https://your-domain-check.workers.dev/api/domains \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<PASSWORD>" \
     -d '[
            { "domain": "site-a.com", "expirationDate": "2025-10-01", "groups": "主要" },
            { "domain": "site-c-new.net", "expirationDate": "2026-08-08", "groups": "次要" }
         ]'
```


- 返回示例

```json
{
  "success": true, 
  "count": 2
}
```

## DELETE /api/domains —— 删除域名

- 请求示例：删除单个域名

```bash
curl -X DELETE https://your-domain-check.workers.dev/api/domains \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<PASSWORD>" \
     -d '{ "domain": "domain-to-delete.com" }'
```

- 返回示例：删除单个域名

```json
{
  "success": true, 
  "message": "域名 domain-to-delete.com 已删除"
}
```

- 请求示例：删除多个域名

```bash
curl -X DELETE https://your-domain-check.workers.dev/api/domains \
     -H "Content-Type: application/json" \
     -H "Cookie: auth=<PASSWORD>" \
     -d '["domain-to-delete-1.com", "domain-to-delete-2.net", "domain-to-delete-3.io"]'
```

- 返回示例：删除多个域名

```json
{
  "success": true,
  "message": "成功删除 2 个域名。",
  "deletedCount": 2
}
```

## GET /api/whois —— whois查询（仅支持一级域名）

- 请求示例（无需鉴权）

```bash
curl -X GET https://your-domain-check.workers/api/whois/<要查询的域名>
```

- 返回示例

```json
{
  "success": true,
  "data": {
    "domain": "github.com",
    "creationDate": "2007-10-09T18:20:50Z",
    "updatedDate": "2024-09-07T09:16:32Z",
    "expiryDate": "2026-10-09T18:20:50Z",
    "registrar": "MarkMonitor",
    "registrarUrl": "http://www.markmonitor.com",
    "nameServers": [
      "dns1.p08.nsone.net",
      "dns2.p08.nsone.net",
      "dns3.p08.nsone.net",
      "dns4.p08.nsone.net",
      "ns-1283.awsdns-32.org",
      "ns-1707.awsdns-21.co.uk",
      "ns-421.awsdns-52.com",
      "ns-520.awsdns-01.net"
    ]
  }
}
```
