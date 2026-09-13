'use strict';

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginAlert = document.getElementById('loginAlert');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const btnRefreshClients = document.getElementById('btnRefreshClients');

// Nav & User
const navUserName = document.getElementById('navUserName');
const navUserRole = document.getElementById('navUserRole');
const globalStatusBadge = document.getElementById('globalStatusBadge');

// Quick Stats
const statAppStatus = document.getElementById('statAppStatus');
const statActiveClients = document.getElementById('statActiveClients');
const statLatestVersion = document.getElementById('statLatestVersion');
const statLastUpdated = document.getElementById('statLastUpdated');

// Inputs: Master Kill Switch
const chkAppEnabled = document.getElementById('chkAppEnabled');
const txtAppEnabledStatus = document.getElementById('txtAppEnabledStatus');
const maintenanceTitle = document.getElementById('maintenanceTitle');
const maintenanceContact = document.getElementById('maintenanceContact');
const maintenanceMessage = document.getElementById('maintenanceMessage');

// Inputs: Version
const latestVersion = document.getElementById('latestVersion');
const minSupportedVersion = document.getElementById('minSupportedVersion');
const chkForceUpdate = document.getElementById('chkForceUpdate');
const txtForceUpdateStatus = document.getElementById('txtForceUpdateStatus');
const downloadUrl = document.getElementById('downloadUrl');
const releaseNotes = document.getElementById('releaseNotes');

// Inputs: Broadcast
const chkBroadcastEnabled = document.getElementById('chkBroadcastEnabled');
const txtBroadcastStatus = document.getElementById('txtBroadcastStatus');
const broadcastType = document.getElementById('broadcastType');
const broadcastMessage = document.getElementById('broadcastMessage');

// Clients Table
const clientsTableBody = document.getElementById('clientsTableBody');
const toastContainer = document.getElementById('toastContainer');

let currentUser = null;
let currentConfig = null;
let clientsInterval = null;

// Toast Helper
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Time elapsed formatter
function formatTimeAgo(diffSec) {
  if (diffSec < 10) return 'เมื่อสักครู่';
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  return `${hours} ชั่วโมงที่แล้ว`;
}

// Check session on load
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.user) {
        currentUser = data.user;
        showDashboard();
        return;
      }
    }
  } catch (err) {}
  showLogin();
}

function showLogin() {
  if (clientsInterval) clearInterval(clientsInterval);
  loginScreen.classList.remove('hidden');
  dashboardScreen.classList.add('hidden');
}

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.remove('hidden');

  navUserName.textContent = currentUser.name || currentUser.username;
  navUserRole.textContent = currentUser.role || 'ผู้ดูแลระบบ';

  loadConfig();
  loadClients();

  if (clientsInterval) clearInterval(clientsInterval);
  clientsInterval = setInterval(loadClients, 10000); // Polling clients every 10s
}

// Login Handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginAlert.classList.add('hidden');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const btnText = btnLogin.querySelector('.btn-text');
  const btnSpinner = btnLogin.querySelector('.btn-spinner');
  btnLogin.disabled = true;
  btnText.textContent = 'กำลังตรวจสอบสิทธิ์...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      currentUser = data.user;
      showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + (currentUser.name || currentUser.username));
      showDashboard();
    } else {
      loginAlert.textContent = data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      loginAlert.classList.remove('hidden');
    }
  } catch (err) {
    loginAlert.textContent = 'ไม่สามารถเชื่อมต่อ Server ได้: ' + err.message;
    loginAlert.classList.remove('hidden');
  } finally {
    btnLogin.disabled = false;
    btnText.textContent = 'เข้าสู่ระบบควบคุม';
  }
});

// Logout Handler
btnLogout.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  currentUser = null;
  showToast('ออกจากระบบเรียบร้อยแล้ว');
  showLogin();
});

// Load Config
async function loadConfig() {
  try {
    const res = await fetch('/api/admin/config');
    const data = await res.json();
    if (res.ok && data.ok) {
      currentConfig = data.config;
      renderConfig(currentConfig);
    }
  } catch (err) {
    showToast('โหลดการตั้งค่าไม่สำเร็จ: ' + err.message, 'error');
  }
}

// Render Config values to Form
function renderConfig(cfg) {
  // App Enabled
  chkAppEnabled.checked = Boolean(cfg.appEnabled);
  updateAppEnabledUI(cfg.appEnabled);

  // Maintenance
  maintenanceTitle.value = cfg.maintenance?.title || '';
  maintenanceContact.value = cfg.maintenance?.contact || '';
  maintenanceMessage.value = cfg.maintenance?.message || '';

  // Version
  latestVersion.value = cfg.version?.latestVersion || '';
  minSupportedVersion.value = cfg.version?.minSupportedVersion || '';
  chkForceUpdate.checked = Boolean(cfg.version?.forceUpdate);
  updateForceUpdateUI(cfg.version?.forceUpdate);
  downloadUrl.value = cfg.version?.downloadUrl || '';
  releaseNotes.value = cfg.version?.releaseNotes || '';

  // Broadcast
  chkBroadcastEnabled.checked = Boolean(cfg.broadcast?.enabled);
  updateBroadcastUI(cfg.broadcast?.enabled);
  broadcastType.value = cfg.broadcast?.type || 'info';
  broadcastMessage.value = cfg.broadcast?.message || '';

  // Quick Stats
  statLatestVersion.textContent = 'v' + (cfg.version?.latestVersion || '3.5.2');
  if (cfg.updatedAt) {
    const d = new Date(cfg.updatedAt);
    statLastUpdated.textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' (' + (cfg.updatedBy || 'admin') + ')';
  }
}

// UI State Helpers
function updateAppEnabledUI(enabled) {
  if (enabled) {
    txtAppEnabledStatus.textContent = 'เปิดใช้งานปกติ';
    txtAppEnabledStatus.className = 'toggle-status-label text-success';
    statAppStatus.textContent = 'เปิดใช้งาน';
    statAppStatus.className = 'stat-value text-success';
    globalStatusBadge.className = 'status-pill online';
    globalStatusBadge.innerHTML = '<span class="pulse-dot"></span><span class="status-label">ระบบเปิดใช้งานปกติ</span>';
  } else {
    txtAppEnabledStatus.textContent = 'ปิดปรับปรุง / ล็อกเครื่อง';
    txtAppEnabledStatus.className = 'toggle-status-label text-danger';
    statAppStatus.textContent = 'ปิดปรับปรุง (ล็อก)';
    statAppStatus.className = 'stat-value text-danger';
    globalStatusBadge.className = 'status-pill maintenance';
    globalStatusBadge.innerHTML = '<span class="pulse-dot"></span><span class="status-label">ระบบปิดปรับปรุง (ล็อกหน้าจอ)</span>';
  }
}

function updateForceUpdateUI(forced) {
  txtForceUpdateStatus.textContent = forced ? 'บังคับอัปเดต' : 'ไม่บังคับ';
  txtForceUpdateStatus.className = forced ? 'toggle-status-label text-danger' : 'toggle-status-label text-muted';
}

function updateBroadcastUI(enabled) {
  txtBroadcastStatus.textContent = enabled ? 'เปิดประกาศ' : 'ปิดประกาศ';
  txtBroadcastStatus.className = enabled ? 'toggle-status-label text-accent' : 'toggle-status-label text-muted';
}

// Switch Listeners
chkAppEnabled.addEventListener('change', () => {
  updateAppEnabledUI(chkAppEnabled.checked);
});

chkForceUpdate.addEventListener('change', () => {
  updateForceUpdateUI(chkForceUpdate.checked);
});

chkBroadcastEnabled.addEventListener('change', () => {
  updateBroadcastUI(chkBroadcastEnabled.checked);
});

// Save Config
btnSaveConfig.addEventListener('click', async () => {
  btnSaveConfig.disabled = true;
  const btnText = btnSaveConfig.querySelector('.btn-text');
  btnText.textContent = '⏳ กำลังบันทึก...';

  const payload = {
    appEnabled: chkAppEnabled.checked,
    maintenance: {
      title: maintenanceTitle.value.trim(),
      contact: maintenanceContact.value.trim(),
      message: maintenanceMessage.value.trim()
    },
    version: {
      latestVersion: latestVersion.value.trim(),
      minSupportedVersion: minSupportedVersion.value.trim(),
      forceUpdate: chkForceUpdate.checked,
      downloadUrl: downloadUrl.value.trim(),
      releaseNotes: releaseNotes.value.trim()
    },
    broadcast: {
      enabled: chkBroadcastEnabled.checked,
      type: broadcastType.value,
      message: broadcastMessage.value.trim()
    }
  };

  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      currentConfig = data.config;
      renderConfig(currentConfig);
      showToast('บันทึกคำสั่งและส่งผลไปยังทุกเครื่องเรียบร้อยแล้ว!');
    } else {
      showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
  } finally {
    btnSaveConfig.disabled = false;
    btnText.textContent = '💾 บันทึกการเปลี่ยนแปลง (Save)';
  }
});

// Load Connected Clients
async function loadClients() {
  try {
    const res = await fetch('/api/admin/clients');
    const data = await res.json();
    if (res.ok && data.ok) {
      renderClientsTable(data.clients || [], data.totalOnline || 0);
    }
  } catch (err) {
    console.error('Error fetching clients:', err);
  }
}

btnRefreshClients.addEventListener('click', loadClients);

function renderClientsTable(clients, totalOnline) {
  statActiveClients.textContent = `${totalOnline} เครื่อง`;

  if (clients.length === 0) {
    clientsTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted" style="text-align: center; padding: 30px;">
          ยังไม่มีเครื่อง Desktop เปิดใช้งานในขณะนี้
        </td>
      </tr>
    `;
    return;
  }

  clientsTableBody.innerHTML = clients.map(client => {
    let statusBadge = '';
    if (client.status === 'online') {
      statusBadge = '<span class="client-badge online"><span class="pulse-dot"></span> ออนไลน์</span>';
    } else if (client.status === 'idle') {
      statusBadge = '<span class="client-badge idle">⏸️ ไม่มีความเคลื่อนไหว</span>';
    } else {
      statusBadge = '<span class="client-badge offline">⚪ ออฟไลน์</span>';
    }

    const deviceIdDisplay = client.deviceUuid 
      ? `<code title="${escapeHtml(client.deviceUuid)}" style="font-size: 11px; background: rgba(0,242,254,0.08); color: var(--accent-cyan); padding: 2px 6px; border-radius: 4px;">${escapeHtml(client.deviceUuid.length > 18 ? client.deviceUuid.substring(0, 18) + '...' : client.deviceUuid)}</code>`
      : `<span class="text-muted">-</span>`;

    const uptimeDisplay = formatUptime(client.uptimeSeconds);
    const hostOsDisplay = `${escapeHtml(client.hostname || 'desktop')} <span class="text-muted" style="font-size: 11px;">(${escapeHtml(client.os || 'win32')}/${escapeHtml(client.arch || 'x64')})</span>`;

    return `
      <tr>
        <td>${statusBadge}</td>
        <td><strong>${escapeHtml(client.username || 'นิรนาม')}</strong></td>
        <td><span class="badge badge-site">${escapeHtml(client.siteName || 'ไม่ระบุเว็บ')}</span></td>
        <td><code style="font-weight: 600; color: #38ef7d;">v${escapeHtml(client.version || '3.6.0')}</code></td>
        <td>${deviceIdDisplay}</td>
        <td>${hostOsDisplay}</td>
        <td style="font-size: 12px; color: var(--text-secondary);">${uptimeDisplay}</td>
        <td class="text-muted" style="font-size: 12px;">${formatTimeAgo(client.diffSec)}</td>
        <td><code>${escapeHtml(client.ip || '-')}</code></td>
      </tr>
    `;
  }).join('');
}

function formatTimeAgo(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s < 5) return 'เมื่อสักครู่';
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  return `${Math.floor(s / 3600)} ชม. ที่แล้ว`;
}

function formatUptime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s <= 0) return 'เพิ่งเริ่ม';
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m} นาที ${remS} วิ`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h} ชม. ${remM} นาที`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Change Master Password Handler
const changePasswordForm = document.getElementById('changePasswordForm');
if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('changeCurrentPassword').value;
    const newUsername = document.getElementById('changeNewUsername').value.trim();
    const newPassword = document.getElementById('changeNewPassword').value;
    const confirmPassword = document.getElementById('changeConfirmPassword').value;
    const btn = document.getElementById('btnChangePassword');

    if (newPassword !== confirmPassword) {
      showToast('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน', 'error');
      return;
    }

    if (newPassword.length < 4) {
      showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>⏳ กำลังบันทึก...</span>';

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newUsername, newPassword })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        showToast('เปลี่ยนรหัสผ่านผู้ควบคุมสำเร็จเรียบร้อยแล้ว!');
        changePasswordForm.reset();
        if (data.username) {
          currentUser.username = data.username;
          navUserName.textContent = data.username;
        }
      } else {
        showToast(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🔑 บันทึกรหัสผ่านใหม่</span>';
    }
  });
}

// Start
checkAuth();
