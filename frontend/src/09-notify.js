// 09-notify.js — Telegram 通知设置面板

const NOTIFY_CONFIG_API = '/api/notify-config';
const NOTIFY_TEST_API = '/api/notify-test';
let notifyClearTokenPending = false; // 「清除已存 Token」待提交标记

// 配置来源文案
function notifySourceText(source) {
    if (source === 'kv') return '当前配置来源：面板配置';
    if (source === 'env') return '当前配置来源：环境变量（TGID/TGTOKEN 兜底）';
    return '当前配置来源：未配置';
}

// 按脱敏视图更新 Token 占位提示与来源提示
function updateNotifyView(data) {
    const tokenInput = document.getElementById('notifyToken');
    if (tokenInput) {
        if (data.hasToken) {
            tokenInput.placeholder = '已配置（' + (data.tokenMasked || '****') + '），留空不修改';
        } else {
            tokenInput.placeholder = '例如 123456:ABC-...';
        }
    }
    const hint = document.getElementById('notifySourceHint');
    if (hint) hint.textContent = notifySourceText(data.source);
}

// 打开通知设置弹窗并加载当前配置（Token 不回填明文）
async function openNotifyModal() {
    const modal = document.getElementById('notifyModal');
    if (!modal) return;
    notifyClearTokenPending = false;
    try {
        const response = await fetch(NOTIFY_CONFIG_API);
        if (!response.ok) throw new Error('获取通知配置失败');
        const data = await response.json();
        document.getElementById('notifyEnabled').checked = Boolean(data.enabled);
        document.getElementById('notifyChatId').value = data.tgChatId || '';
        document.getElementById('notifyDays').value = data.days || 30;
        document.getElementById('notifyExpired').checked = Boolean(data.notifyExpired);
        const tokenInput = document.getElementById('notifyToken');
        tokenInput.value = '';
        updateNotifyView(data);
    } catch (error) {
        console.error('获取通知配置失败:', error);
        showError('获取通知配置失败: ' + error.message);
        return;
    }
    modal.style.display = 'block';
}

// 点击「清除已存 Token」：置标记并更新提示，保存时带 clearToken
function handleClearNotifyToken() {
    notifyClearTokenPending = true;
    const tokenInput = document.getElementById('notifyToken');
    if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = '已标记清除，保存后生效；如需取消请关闭弹窗重新打开';
    }
    showAlert('已标记清除已存 Token，点击「保存设置」后生效');
}

// 收集当前表单值
function collectNotifyForm() {
    const daysValue = parseInt(document.getElementById('notifyDays').value, 10);
    return {
        enabled: document.getElementById('notifyEnabled').checked,
        tgChatId: document.getElementById('notifyChatId').value.trim(),
        tgBotToken: document.getElementById('notifyToken').value.trim(),
        days: isNaN(daysValue) ? undefined : daysValue,
        notifyExpired: document.getElementById('notifyExpired').checked,
        clearToken: notifyClearTokenPending
    };
}

// 保存通知设置
async function submitNotifyForm(e) {
    e.preventDefault();
    const payload = collectNotifyForm();
    if (payload.days !== undefined && (payload.days < 1 || payload.days > 365)) {
        showError('提前提醒天数必须是 1~365 的整数');
        return;
    }
    try {
        const response = await fetch(NOTIFY_CONFIG_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || response.statusText || '保存失败');
        notifyClearTokenPending = false;
        document.getElementById('notifyToken').value = '';
        updateNotifyView(data);
        showSuccess('通知设置已保存！');
    } catch (error) {
        console.error('保存通知设置失败:', error);
        showError('保存通知设置失败: ' + error.message);
    }
}

// 测试推送：带当前表单值发送，保存前也能测
async function testNotify() {
    const btn = document.getElementById('notifyTestBtn');
    if (btn) btn.disabled = true;
    try {
        const payload = collectNotifyForm();
        const response = await fetch(NOTIFY_TEST_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
            showSuccess('测试推送成功，请检查 Telegram 是否收到消息！');
        } else {
            showError('测试推送失败: ' + (data.error || response.statusText || '未知错误'));
        }
    } catch (error) {
        console.error('测试推送失败:', error);
        showError('测试推送失败: ' + error.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}
