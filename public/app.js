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

// Sidebar & Topbar
const sidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const topbarTitle = document.getElementById('topbarTitle');
const topbarSubtitle = document.getElementById('topbarSubtitle');
const navItems = document.querySelectorAll('.nav-item');
const viewPanels = document.querySelectorAll('.view-panel');
const badgeClientCount = document.getElementById('badgeClientCount');
const wsIndicatorDot = document.getElementById('wsIndicatorDot');
const wsIndicatorText = document.getElementById('wsIndicatorText');

// Nav & User
const navUserName = document.getElementById('navUserName');
const globalStatusBadge = document.getElementById('globalStatusBadge');

// Quick Stats
const statAppStatus = document.getElementById('statAppStatus');
const statActiveClients = document.getElementById('statActiveClients');
const statLatestVersion = document.getElementById('statLatestVersion');
const statLastUpdated = document.getElementById('statLastUpdated');

// Inputs: Master Kill Switch
const chkAppEnabled = document.getElementById('chkAppEnabled');
const txtAppEnabledStatus = document.getElementById('txtAppEnabledStatus');
const chkAppEnabledQuick = document.getElementById('chkAppEnabledQuick');
const txtAppEnabledStatusQuick = document.getElementById('txtAppEnabledStatusQuick');
const maintenanceTitle = document.getElementById('maintenanceTitle');
const maintenanceContact = document.getElementById('maintenanceContact');
const maintenanceMessage = document.getElementById('maintenanceMessage');

// Emergency Kick All & Quick Navigation Buttons
const btnQuickKickAll = document.getElementById('btnQuickKickAll');
const btnKickAllNow = document.getElementById('btnKickAllNow');
const btnGoToControl = document.getElementById('btnGoToControl');
const btnSaveControl = document.getElementById('btnSaveControl');
const btnSaveVersion = document.getElementById('btnSaveVersion');
const btnSaveBroadcast = document.getElementById('btnSaveBroadcast');

// Live Simulation Elements
const simTitle = document.getElementById('simTitle');
const simMsg = document.getElementById('simMsg');
const simContact = document.getElementById('simContact');
const simBroadcastBanner = document.getElementById('simBroadcastBanner');
const simBroadcastText = document.getElementById('simBroadcastText');

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

// Clients Table & Search
const txtSearchClients = document.getElementById('txtSearchClients');
const clientsTableBody = document.getElementById('clientsTableBody');
const toastContainer = document.getElementById('toastContainer');

let currentUser = null;
let currentConfig = null;
let cachedClients = [];
let adminWs = null;
let wsReconnectTimer = null;

const VIEW_METADATA = {
  overview: {
    title: 'ภาพรวมระบบ (Overview)',
    subtitle: 'ตรวจสอบสถานะเซิร์ฟเวอร์ คำสั่งการทำงาน และเครื่อง Desktop ที่กำลังออนไลน์'
  },
  control: {
    title: 'สั่งการ & ล็อกเครื่อง (Control & Kill-Switch)',
    subtitle: 'ควบคุมการเปิด/ปิดระบบ สั่งดีดผู้ใช้ทันที และกำหนดข้อความหน้าจอปิดปรับปรุง'
  },
  version: {
    title: 'เวอร์ชัน & บังคับอัปเดต (Version Management)',
    subtitle: 'กำหนดเวอร์ชันล่าสุด เวอร์ชันขั้นต่ำที่ยอมรับ และบังคับอัปเดตเครื่องทั่วประเทศ'
  },
  broadcast: {
    title: 'ประกาศข้อความด่วน (Broadcast Announcement)',
    subtitle: 'ส่งแถบข้อความประกาศเด้งขึ้นด้านบนสุดของทุกเครื่องที่กำลังเปิดโปรแกรมอยู่'
  },
  clients: {
    title: 'เครื่องที่กำลังออนไลน์ (Connected Clients)',
    subtitle: 'ตรวจสอบเครื่อง Desktop ที่กำลังเปิดโปรแกรมและเชื่อมต่อ WebSocket / Telemetry'
  },
  security: {
    title: 'ความปลอดภัย & รหัสผ่านผู้ควบคุม (Master Security)',
    subtitle: 'เปลี่ยนชื่อผู้ใช้และรหัสผ่านส่วนตัวสำหรับเข้าหน้าควบคุมนี้ (PBKDF2/SHA-512)'
  }
};

// Toast Helper
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> <span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Time Format Helpers
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

// ==== SPA VIEW ROUTING ====
function switchView(viewName) {
  navItems.forEach(item => {
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  viewPanels.forEach(panel => {
    if (panel.id === `view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  const meta = VIEW_METADATA[viewName] || VIEW_METADATA.overview;
  if (topbarTitle) topbarTitle.textContent = meta.title;
  if (topbarSubtitle) topbarSubtitle.textContent = meta.subtitle;

  closeSidebarMobile();
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    if (target) switchView(target);
  });
});

if (btnGoToControl) {
  btnGoToControl.addEventListener('click', () => switchView('control'));
}

// Mobile Sidebar Drawer
function openSidebarMobile() {
  sidebar?.classList.add('open');
  sidebarBackdrop?.classList.add('active');
}

function closeSidebarMobile() {
  sidebar?.classList.remove('open');
  sidebarBackdrop?.classList.remove('active');
}

btnToggleSidebar?.addEventListener('click', openSidebarMobile);
btnCloseSidebar?.addEventListener('click', closeSidebarMobile);
sidebarBackdrop?.addEventListener('click', closeSidebarMobile);

// ==== REAL-TIME WEBSOCKET (ADMIN) ====
function connectAdminWebSocket() {
  if (adminWs) {
    try { adminWs.close(); } catch (e) {}
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/admin`;

  try {
    adminWs = new WebSocket(wsUrl);

    adminWs.onopen = () => {
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot online';
      if (wsIndicatorText) wsIndicatorText.textContent = '⚡ Realtime: เชื่อมต่อแล้ว';
    };

    adminWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'INIT') {
          if (msg.config) {
            currentConfig = msg.config;
            renderConfig(currentConfig);
          }
          if (msg.clients) {
            cachedClients = msg.clients;
            renderClientsTable(cachedClients, msg.totalOnline || 0);
          }
        } else if (msg.type === 'CLIENTS_UPDATED') {
          cachedClients = msg.clients || [];
          renderClientsTable(cachedClients, msg.totalOnline || 0);
        } else if (msg.type === 'CONFIG_UPDATED') {
          currentConfig = msg.config;
          renderConfig(currentConfig);
        }
      } catch (err) {
        console.error('Error parsing admin ws message:', err);
      }
    };

    adminWs.onclose = () => {
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot offline';
      if (wsIndicatorText) wsIndicatorText.textContent = '❌ กำลังเชื่อมต่อใหม่...';
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(connectAdminWebSocket, 3000);
    };

    adminWs.onerror = () => {
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot offline';
      if (wsIndicatorText) wsIndicatorText.textContent = '❌ ออฟไลน์';
    };
  } catch (e) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectAdminWebSocket, 3000);
  }
}

// ==== AUTHENTICATION ====
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
  loginScreen.classList.remove('hidden');
  dashboardScreen.classList.add('hidden');
  if (adminWs) {
    try { adminWs.close(); } catch (e) {}
  }
}

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.remove('hidden');

  if (navUserName && currentUser) {
    navUserName.textContent = currentUser.username || currentUser.name || 'admin';
  }

  loadConfig();
  loadClients();
  connectAdminWebSocket();
}

// Login Form Submit
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.classList.add('hidden');
    btnLogin.disabled = true;
    const btnText = btnLogin.querySelector('.btn-text');
    const btnSpinner = btnLogin.querySelector('.btn-spinner');
    if (btnText) btnText.textContent = 'กำลังตรวจสอบสิทธิ์...';
    if (btnSpinner) btnSpinner.classList.remove('hidden');

    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        currentUser = data.user;
        showDashboard();
        showToast(`ยินดีต้อนรับคุณ ${data.user.username} เข้าสู่ศูนย์ควบคุมระบบ`);
      } else {
        loginAlert.textContent = data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        loginAlert.classList.remove('hidden');
      }
    } catch (err) {
      loginAlert.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + err.message;
      loginAlert.classList.remove('hidden');
    } finally {
      btnLogin.disabled = false;
      if (btnText) btnText.textContent = '🚀 เข้าสู่ศูนย์ควบคุมระบบ';
      if (btnSpinner) btnSpinner.classList.add('hidden');
    }
  });
}

// Logout
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    currentUser = null;
    showLogin();
    showToast('ออกจากระบบผู้ควบคุมเรียบร้อยแล้ว');
  });
}

// ==== CONFIG & FORM SYNC ====
async function loadConfig() {
  try {
    const res = await fetch('/api/admin/config');
    const data = await res.json();
    if (res.ok && data.ok) {
      currentConfig = data.config;
      renderConfig(currentConfig);
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function renderConfig(cfg) {
  if (!cfg) return;

  // App Enabled
  const enabled = Boolean(cfg.appEnabled);
  if (chkAppEnabled) chkAppEnabled.checked = enabled;
  if (chkAppEnabledQuick) chkAppEnabledQuick.checked = enabled;
  updateAppEnabledUI(enabled);

  // Maintenance
  if (maintenanceTitle) maintenanceTitle.value = cfg.maintenance?.title || '';
  if (maintenanceContact) maintenanceContact.value = cfg.maintenance?.contact || '';
  if (maintenanceMessage) maintenanceMessage.value = cfg.maintenance?.message || '';
  updateMaintenanceSimulation();

  // Version
  if (latestVersion) latestVersion.value = cfg.version?.latestVersion || '3.6.0';
  if (minSupportedVersion) minSupportedVersion.value = cfg.version?.minSupportedVersion || '3.5.0';
  if (chkForceUpdate) chkForceUpdate.checked = Boolean(cfg.version?.forceUpdate);
  updateForceUpdateUI(cfg.version?.forceUpdate);
  if (downloadUrl) downloadUrl.value = cfg.version?.downloadUrl || '';
  if (releaseNotes) releaseNotes.value = cfg.version?.releaseNotes || '';

  // Broadcast
  if (chkBroadcastEnabled) chkBroadcastEnabled.checked = Boolean(cfg.broadcast?.enabled);
  updateBroadcastUI(cfg.broadcast?.enabled);
  if (broadcastType) broadcastType.value = cfg.broadcast?.type || 'info';
  if (broadcastMessage) broadcastMessage.value = cfg.broadcast?.message || '';
  updateBroadcastSimulation();

  // Quick Stats
  if (statLatestVersion) {
    statLatestVersion.textContent = 'v' + (cfg.version?.latestVersion || '3.6.0');
  }
  if (cfg.updatedAt && statLastUpdated) {
    const d = new Date(cfg.updatedAt);
    statLastUpdated.textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' (' + (cfg.updatedBy || 'admin') + ')';
  }
}

function updateAppEnabledUI(enabled) {
  const text = enabled ? 'เปิดใช้งานปกติ' : 'ปิดปรับปรุง / ล็อกเครื่อง';
  const cls = enabled ? 'toggle-status-label text-success' : 'toggle-status-label text-danger';

  if (txtAppEnabledStatus) {
    txtAppEnabledStatus.textContent = text;
    txtAppEnabledStatus.className = cls;
  }
  if (txtAppEnabledStatusQuick) {
    txtAppEnabledStatusQuick.textContent = text;
    txtAppEnabledStatusQuick.className = cls;
  }
  if (statAppStatus) {
    statAppStatus.textContent = enabled ? 'เปิดใช้งาน' : 'ปิดปรับปรุง (ล็อก)';
    statAppStatus.className = enabled ? 'stat-value text-success' : 'stat-value text-danger';
  }
  if (globalStatusBadge) {
    globalStatusBadge.className = enabled ? 'status-pill online' : 'status-pill maintenance';
    globalStatusBadge.innerHTML = enabled
      ? '<span class="pulse-dot"></span><span class="status-label">ระบบเปิดใช้งานปกติ</span>'
      : '<span class="pulse-dot"></span><span class="status-label">ระบบปิดปรับปรุง (ล็อกเครื่อง)</span>';
  }
}

function updateForceUpdateUI(forced) {
  if (txtForceUpdateStatus) {
    txtForceUpdateStatus.textContent = forced ? 'บังคับอัปเดต' : 'ไม่บังคับ';
    txtForceUpdateStatus.className = forced ? 'toggle-status-label text-danger' : 'toggle-status-label text-muted';
  }
}

function updateBroadcastUI(enabled) {
  if (txtBroadcastStatus) {
    txtBroadcastStatus.textContent = enabled ? 'เปิดประกาศ' : 'ปิดประกาศ';
    txtBroadcastStatus.className = enabled ? 'toggle-status-label text-accent' : 'toggle-status-label text-muted';
  }
}

// Live Simulations
function updateMaintenanceSimulation() {
  if (simTitle) simTitle.textContent = maintenanceTitle?.value?.trim() || 'ระบบปิดปรับปรุงชั่วคราว';
  if (simMsg) simMsg.textContent = maintenanceMessage?.value?.trim() || 'ขณะนี้ระบบ NK Helper อยู่ระหว่างการปรับปรุงระบบเพื่อความเสถียร กรุณารอสักครู่หรือติดต่อผู้ดูแลระบบ';
  if (simContact) simContact.textContent = 'ติดต่อ: ' + (maintenanceContact?.value?.trim() || 'ผู้ดูแลระบบ');
}

function updateBroadcastSimulation() {
  const type = broadcastType?.value || 'info';
  const msg = broadcastMessage?.value?.trim() || 'ตัวอย่างข้อความประกาศจะแสดงขึ้นที่นี่...';
  if (simBroadcastBanner) simBroadcastBanner.className = `sim-banner ${type}`;
  if (simBroadcastText) simBroadcastText.textContent = msg;
}

// Real-time Input Listeners
[maintenanceTitle, maintenanceContact, maintenanceMessage].forEach(el => {
  el?.addEventListener('input', updateMaintenanceSimulation);
});

[broadcastType, broadcastMessage].forEach(el => {
  el?.addEventListener('input', updateBroadcastSimulation);
});

// Sync toggles between views
chkAppEnabled?.addEventListener('change', () => {
  if (chkAppEnabledQuick) chkAppEnabledQuick.checked = chkAppEnabled.checked;
  updateAppEnabledUI(chkAppEnabled.checked);
});

chkAppEnabledQuick?.addEventListener('change', () => {
  if (chkAppEnabled) chkAppEnabled.checked = chkAppEnabledQuick.checked;
  updateAppEnabledUI(chkAppEnabledQuick.checked);
});

chkForceUpdate?.addEventListener('change', () => {
  updateForceUpdateUI(chkForceUpdate.checked);
});

chkBroadcastEnabled?.addEventListener('change', () => {
  updateBroadcastUI(chkBroadcastEnabled.checked);
});

// ==== SAVE CONFIGURATION ====
async function saveConfig() {
  const saveBtn = btnSaveConfig;
  if (saveBtn) saveBtn.disabled = true;

  const payload = {
    appEnabled: chkAppEnabled ? chkAppEnabled.checked : true,
    maintenance: {
      title: maintenanceTitle?.value?.trim() || '',
      contact: maintenanceContact?.value?.trim() || '',
      message: maintenanceMessage?.value?.trim() || ''
    },
    version: {
      latestVersion: latestVersion?.value?.trim() || '3.6.0',
      minSupportedVersion: minSupportedVersion?.value?.trim() || '3.5.0',
      forceUpdate: chkForceUpdate ? chkForceUpdate.checked : false,
      downloadUrl: downloadUrl?.value?.trim() || '',
      releaseNotes: releaseNotes?.value?.trim() || ''
    },
    broadcast: {
      enabled: chkBroadcastEnabled ? chkBroadcastEnabled.checked : false,
      type: broadcastType?.value || 'info',
      message: broadcastMessage?.value?.trim() || ''
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
      showToast('บันทึกคำสั่งและส่งผล Real-time ไปยังทุกเครื่องเรียบร้อยแล้ว!');
    } else {
      showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

[btnSaveConfig, btnSaveControl, btnSaveVersion, btnSaveBroadcast].forEach(btn => {
  btn?.addEventListener('click', saveConfig);
});

// ==== EMERGENCY KICK ALL ====
async function triggerEmergencyKickAll() {
  const confirmAction = confirm('⚠️ ยืนยันการสั่งดีดผู้ใช้งานทุกคนออกจากระบบทันทีหรือไม่?\n\nเครื่อง Desktop ทุกเครื่องทั่วประเทศจะถูกตัดเซสชันและล็อกหน้าจอเป็นสีแดงทันทีในเสี้ยววินาที!');
  if (!confirmAction) return;

  try {
    const res = await fetch('/api/admin/kick-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.config) {
        currentConfig = data.config;
        renderConfig(currentConfig);
      }
      showToast('🚨 สั่งดีดผู้ใช้ทุกคนออกจากระบบและล็อกหน้าจอเรียบร้อยแล้ว!');
    } else {
      showToast(data.error || 'คำสั่งล้มเหลว', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
}

btnQuickKickAll?.addEventListener('click', triggerEmergencyKickAll);
btnKickAllNow?.addEventListener('click', triggerEmergencyKickAll);

// ==== CLIENTS TABLE & SEARCH ====
async function loadClients() {
  try {
    const res = await fetch('/api/admin/clients');
    const data = await res.json();
    if (res.ok && data.ok) {
      cachedClients = data.clients || [];
      renderClientsTable(cachedClients, data.totalOnline || 0);
    }
  } catch (err) {
    console.error('Error fetching clients:', err);
  }
}

btnRefreshClients?.addEventListener('click', loadClients);

txtSearchClients?.addEventListener('input', () => {
  renderClientsTable(cachedClients);
});

function renderClientsTable(clients = cachedClients, totalOnline = null) {
  // STRICT FILTER: Only show clients that are currently online!
  const onlineClients = (clients || []).filter(c => c.status === 'online');

  const activeCount = onlineClients.length;
  if (statActiveClients) statActiveClients.textContent = `${activeCount} เครื่อง`;
  if (badgeClientCount) badgeClientCount.textContent = `${activeCount}`;

  const query = txtSearchClients?.value?.trim().toLowerCase() || '';
  const filtered = query
    ? onlineClients.filter(c => 
        (c.username && c.username.toLowerCase().includes(query)) ||
        (c.siteName && c.siteName.toLowerCase().includes(query)) ||
        (c.deviceUuid && c.deviceUuid.toLowerCase().includes(query)) ||
        (c.hostname && c.hostname.toLowerCase().includes(query)) ||
        (c.ip && c.ip.toLowerCase().includes(query))
      )
    : onlineClients;

  if (filtered.length === 0) {
    clientsTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted" style="text-align: center; padding: 36px;">
          ${query ? 'ไม่พบเครื่อง Desktop ที่ตรงกับคำค้นหา' : 'ยังไม่มีเครื่อง Desktop ออนไลน์ในขณะนี้'}
        </td>
      </tr>
    `;
    return;
  }

  clientsTableBody.innerHTML = filtered.map(client => {
    let statusBadge = '';
    if (client.status === 'online') {
      statusBadge = '<span class="client-badge online"><span class="pulse-dot"></span> ออนไลน์</span>';
    } else if (client.status === 'idle') {
      statusBadge = '<span class="client-badge idle">⏸️ ไม่มีความเคลื่อนไหว</span>';
    } else {
      statusBadge = '<span class="client-badge offline">⚪ ออฟไลน์</span>';
    }

    const deviceIdDisplay = client.deviceUuid 
      ? `<code title="${escapeHtml(client.deviceUuid)}" style="font-size: 11px; background: rgba(59,130,246,0.12); color: #93c5fd; padding: 2px 6px; border-radius: 4px;">${escapeHtml(client.deviceUuid.length > 18 ? client.deviceUuid.substring(0, 18) + '...' : client.deviceUuid)}</code>`
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
        <td style="font-size: 12px; color: var(--text-muted);">${uptimeDisplay}</td>
        <td class="text-muted" style="font-size: 12px;">${formatTimeAgo(client.diffSec)}</td>
        <td><code>${escapeHtml(client.ip || '-')}</code></td>
      </tr>
    `;
  }).join('');
}

// ==== CHANGE MASTER PASSWORD ====
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
          if (navUserName) navUserName.textContent = data.username;
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

// Initial Launch
checkAuth();
