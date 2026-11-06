# 域名到期监控系统

基于 Cloudflare Worker 和 Worker KV 构建的域名到期监控仪表盘，支持自动 WHOIS 查询（含 RDAP 回退）、分组管理、到期提醒等功能。

- 界面预览

<img width="1894" height="879" alt="image" src="https://b2qq.24811213.xyz/2025-11/1763455544-image.webp" />

## 功能特性

- ✅ **双模式访问**：`/` 公开页面（只读、域名脱敏）和 `/admin` 管理页面（需密码、完整操作）
- ✅ **域名管理**：支持一级和二级域名的添加、编辑、删除、克隆
- ✅ **批量操作**：复选框多选、全选、批量删除
- 🔍 **WHOIS 自动查询**：一级域名自动获取注册和到期信息（主源 ip.sb + 备用 RDAP）
- 📊 **可视化仪表盘**：域名状态概览、进度条、分组展示
- 🔐 **密码保护**：Cookie 鉴权，7 天有效期，退出登录不删除 Cookie
- 💾 **KV 存储**：每个域名独立 key 存储，无并发竞态
- 💾 **完整备份**：一键导出/恢复域名列表与通知设置（含 Bot Token，请妥善保管备份文件）；导入兼容旧版纯域名文件
- 📱 **Telegram 通知**：可在管理面板可视化填写 Bot Token / Chat ID / 提醒天数，支持测试推送；定时检查把已过期与即将到期域名合并为一条汇总推送，并做每日防重复
- 🎨 **响应式设计**：支持移动端和桌面端访问
- 🖼️ **精美模态框**：替换浏览器原生 alert/confirm，毛玻璃效果

## 🆕 更新日志

### 2026-11-06
- 🔔 **TG 通知面板化**：管理页新增「通知」设置弹窗，可视化填写启用开关、Bot Token（脱敏回显、留空不修改、可清除）、Chat ID、提前提醒天数与「已过期也提醒」，保存前可一键测试推送并透传 Telegram 真实报错；面板配置存 KV 并优先于环境变量，TGID/TGTOKEN 降为可选兜底
- 📩 **cron 汇总推送**：到期检查改为合并一条汇总消息（已过期 / 即将到期分组），新增每日防重复（同一天相同域名集合不重复发送，`/cron?force=1` 可强制重发），手动触发 `/cron` 在设置密码后需鉴权
- 🔐 **登录加固**：登录 Cookie 改为密码的 SHA-256 哈希（旧 Cookie 失效，需重新登录一次）；后端通知字段与前端渲染全面 HTML 转义，公开页注入数据防 `</script>` 逃逸，HTML 响应新增 nosniff / Referrer-Policy 响应头
- 💾 **完整备份**：「导出」升级为完整备份（域名列表 + 通知设置，含 Bot Token），换账号/换 KV 一键恢复；「导入」同时兼容新版备份与旧版纯域名文件，恢复前会整体校验、校验失败不写入
- 🚀 **部署不再绑账号**：`wrangler.toml` 去掉 `{CF_KV_ID}` / `{CF_CRONS}` 占位符，KV 只写 binding、首次部署自动创建并绑定，Cron 写默认时间；CF 后台直连 GitHub 部署不再报 10042。Actions 流程改为可选注入：设了 `CF_KV_ID` 才绑已有 KV，设了 `CF_CRONS` 才覆盖默认时间

### 2025-07-04
- ✨ **新增续期功能**：域名卡片新增「续期」按钮，支持年/月续费，自动更新到期时间并记录续费周期
- 💎 **全面毛玻璃化**：所有模态框（编辑弹窗、续费弹窗、消息弹窗）统一半透明毛玻璃效果，降低透明度
- 🏷️ **分组标签系统**：域名卡片分组显示为彩色标签；编辑弹窗分组改为标签选择器（下拉选择+自定义输入+空格添加+标签删除）
- 🔽 **智能下拉选择**：注册商名称、注册商地址、注册账号 增加基于已有数据的自动补全下拉选择器
- 🔧 其他 UI 细节优化：卡片间距、标签间距、续费弹窗布局等

## 路由架构

| 路径 | 权限 | 说明 |
|------|------|------|
| `/` | 🔓 公开 | 域名/账号脱敏展示，不可操作 |
| `/admin` | 🔒 需密码 | 完整管理页面，所有操作按钮 |
| `/login` | 🔓 公开 | 登录页，成功后跳转 `/admin` |
| `/logout` | 🔓 公开 | 跳转回首页，不删除 Cookie |
| `/api/domains` | 🔒 全部需鉴权 | 域名 CRUD API |
| `/api/notify-config` | 🔒 需鉴权 | TG 通知配置读写（Token 脱敏返回） |
| `/api/notify-test` | 🔒 需鉴权 | TG 测试推送（仅 POST） |
| `/api/whois/<domain>` | 🔓 公开 | WHOIS 查询 |
| `/api/config` | 🔓 公开 | 前端配置（非敏感字段） |
| `/cron` | 🔒 已设置密码时需鉴权 | 手动触发到期检查，`?force=1` 绕过每日防重复 |

## 公开页 `/` 特性

- 域名用 `*****` 隐藏前缀，只保留后缀（`example.com` → `*****.com`）
- 注册账号用 `***********` 隐藏
- 无任何操作按钮（添加/编辑/删除/导出/导入）
- 右上角「登录」按钮跳转 `/admin`
- 数据由服务端脱敏后直接嵌入 HTML，前端不调用 API

## 管理页 `/admin` 特性

- 域名卡片右上角复选框，支持多选
- 「全选」按钮切换勾选/取消当前页所有卡片
- 「删除」删除所有勾选的域名
- 「克隆」按钮：以该卡片信息预填充添加表单（域名留空），快速添加同注册商域名
- 「导出」下载完整备份（域名 + 通知设置），「导入」恢复备份（旧版纯域名文件也可导入，只恢复域名）
- 「退出」跳回首页（Cookie 保留 7 天，下次直接进入）

## 通知设置

- **入口**：登录管理页 `/admin`，点击右上角「通知」按钮打开设置弹窗
- **可填项**：启用通知开关、Bot Token、Chat ID、提前提醒天数（1~365）、已过期也提醒开关
- **Token 安全**：Token 只脱敏回显（仅末 4 位），输入框留空保存表示不修改；点「清除已存 Token」并保存可显式清除
- **测试推送**：点「测试推送」会用表单当前填写的值（Token 留空则用已存的）立即发一条测试消息，失败时显示 Telegram 返回的真实错误，保存前即可验证配置
- **配置优先级**：面板配置存入 KV（`settings:notify`），优先生效；环境变量 `TGID`/`TGTOKEN`/`DAYS` 仅作兜底
- **推送行为**：定时检查把「已过期」（需开启对应开关）与「即将到期」域名合并为一条汇总消息发送；同一天内相同域名集合只发送一次（每日防重复），手动触发 `/cron?force=1` 可绕过防重复强制重发

## KV 存储说明

- 每个域名存储为独立 key：`domain:<域名>`
- 旧版单一 key (`DOMAIN_LIST`) 数据在首次访问时**自动迁移**到新格式
- 添加/删除/编辑均为原子操作，无读写竞态

## 部署平台：Cloudflare Workers

> [!TIP]
> 两种部署方式都可以：**GitHub Actions**（下方流程）或 **CF 后台直接连接 GitHub 部署**。  
> `wrangler.toml` 不写死任何账号的 KV id（只写 binding），首次部署时 Wrangler 会自动在目标账号创建 KV 命名空间并绑定，后续部署自动沿用，不会丢绑定；Cron 触发时间也直接写在 `wrangler.toml` 里（默认北京时间 9:00 / 21:00）。

### 前置条件
- 先给把本项目点个⭐，再 Fork，[点击直达](https://github.com/yutian81/domain-check/fork)
- 无需提前创建 KV：首次部署自动创建并绑定
- （可选）如要绑定**已有**的 KV 命名空间：记下它的 ID，Actions 部署填到 `CF_KV_ID` secret；直连部署则在 `wrangler.toml` 的 `binding = "DOMAIN_KV"` 下方手动加一行 `id = "你的KV_ID"`

### 方式二：CF 后台直连 GitHub 部署（简易）

- 在 [Cloudflare](https://dash.cloudflare.com) → Workers & Pages → 创建 → 连接 GitHub 仓库，构建设置保持默认（部署命令 `npx wrangler deploy`）直接部署
- 部署成功后进入该 Worker 的「设置 → 变量和机密」，添加 `PASSWORD`（管理页密码）后重新部署/等待生效；TG 通知直接到管理面板「通知」里设置，不用再配环境变量

### 方式一：设置仓库 action（GitHub Actions 部署）

- 点开仓库 `settings` → `Secrets and variables` → `Actions`
- 设置如下 `secrets`:
  - **CF_API_TOKEN**: 必须，需要 worker 和 kv 权限
  - **CF_KV_ID**: 可选，仅绑定已有 KV 时填写；不填则部署时自动创建新 KV
  - **PASSWORD**: 必须，访问管理页的密码，默认为 `123123`
  - **TGID**: 可选兜底，tg机器人ID。优先在管理面板「通知」设置中填写，面板配置优先生效
  - **TGTOKEN**: 可选兜底，tg机器人token。优先在管理面板「通知」设置中填写，面板配置优先生效
- 转到 `variables` 选项卡，设置以下变量:
  - **CF_ACCOUNT_ID**: 必须，CF的账户ID，**是ID不是邮箱账号**
  - **CF_CRONS**: 可选，用于定时检查域名到期情况以发送tg通知

### 运行 action

- 点击仓库 `actions` → `all workerflows` → `自动部署到 CF worker`
- 点击 `run workflow`
- 等待 action 运行，查看运行日志，点击输出的 `worker 管理后台` 链接

### 设置 CF worker

- 进入 CF worker管理后台，给项目绑定一个自定义域名
- 在 worker 的环境变量中，还可设置以下可选变量

| 变量名 | 说明 | 默认值/示例值 | 必填 |
|--------|------|--------|------|
| `DAYS` | 到期提醒天数（兜底值，已可在管理面板「通知」设置中修改，面板优先） | `30` | ❌ |
| `TGID` / `TG_CHAT_ID` | TG Chat ID（兜底值，面板配置优先） | — | ❌ |
| `TGTOKEN` / `TG_BOT_TOKEN` | TG Bot Token（兜底值，面板配置优先） | — | ❌ |
| `SITENAME` | 网站名称 | `域名到期监控` | ❌ |
| `ICON` | 网站图标 | `https://example.com/icon.png` | ❌ |
| `BGIMG` | 背景图片 | `https://example.com/bg.png` | ❌ |
| `GITHUB_URL` | GitHub 链接 | `https://github.com/yutian81/domain-check` | ❌ |
| `BLOG_URL` | 博客链接 | `https://blog.notett.com` | ❌ |
| `BLOG_NAME` | 博客名称 | `QingYun Blog` | ❌ |

## 前端开发

前端代码模块化在 `frontend/src/` 目录下：

```
frontend/
├── build.js        ← 构建脚本
├── index.js        ← HTML 模板
├── style.js        ← CSS 样式
├── script.js       ← 构建产物（不手动编辑）
└── src/
    ├── 00-config.js   — 常量和全局状态
    ├── 01-utils.js    — 工具函数（含脱敏函数）
    ├── 07-modal.js    — 自定义模态框
    ├── 02-api.js      — 数据操作
    ├── 03-ui.js       — 渲染函数
    ├── 04-form.js     — 表单逻辑
    ├── 05-filters.js  — 筛选搜索
    ├── 09-notify.js   — TG 通知设置面板
    └── 06-init.js     — 初始化事件绑定
```

修改后运行 `node frontend/build.js` 重新生成 `script.js`。

## 本项目 API 接口

https://github.com/yutian81/domain-check/blob/main/API.md

---

## 感谢 YXVM 与 ZMTO 赞助免费服务器

<a href="https://yxvm.com/aff.php?aff=891">
  <img src="https://github.com/user-attachments/assets/33ad6d6e-e159-4840-b6a3-f1ea3faa9df9" width="48%">
</a>
<a href="https://console.zmto.com/?affid=1598">
  <img src="https://github.com/user-attachments/assets/02a0d439-0283-43fe-a028-1212412b324e" width="48%">
</a>
 
## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## ⭐ Star 星星走起
[![Star History Chart](https://api.star-history.com/svg?repos=yutian81/domain-check&type=date&legend=top-left)](https://www.star-history.com/#yutian81/domain-check&type=date&legend=top-left)
