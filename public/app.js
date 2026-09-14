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

// File Upload Elements
const fileInstallerUpload = document.getElementById('fileInstallerUpload');
const btnTriggerUpload = document.getElementById('btnTriggerUpload');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressText = document.getElementById('uploadProgressText');
const uploadProgressPercent = document.getElementById('uploadProgressPercent');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const fileDatabaseBadge = document.getElementById('fileDatabaseBadge');
const lblDbFileName = document.getElementById('lblDbFileName');
const lblDbFileSize = document.getElementById('lblDbFileSize');
const lblDbFileDate = document.getElementById('lblDbFileDate');

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
let wsPingTimer = null;
const DRAFT_KEY = 'nk_admin_form_draft_v1';
let hasUnsavedEdits = false;

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

  // Show Topbar Save button ONLY on views that actually edit system settings!
  const settingsViews = ['control', 'version', 'broadcast'];
  if (btnSaveConfig) {
    btnSaveConfig.style.display = settingsViews.includes(viewName) ? 'inline-flex' : 'none';
  }

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
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/admin`;

  try {
    adminWs = new WebSocket(wsUrl);

    adminWs.onopen = () => {
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot online';
      if (wsIndicatorText) wsIndicatorText.textContent = '⚡ Realtime: เชื่อมต่อแล้ว';

      // Keepalive heartbeat ping every 15s to keep Railway proxy alive
      if (wsPingTimer) clearInterval(wsPingTimer);
      wsPingTimer = setInterval(() => {
        if (adminWs && adminWs.readyState === WebSocket.OPEN) {
          try { adminWs.send(JSON.stringify({ type: 'PING' })); } catch (e) {}
        }
      }, 15000);
    };

    adminWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'PONG') {
          return; // Keepalive ack
        }
        if (msg.type === 'PING') {
          try { adminWs.send(JSON.stringify({ type: 'PONG' })); } catch (e) {}
          return;
        }
        if (msg.type === 'INIT') {
          if (msg.config) {
            currentConfig = msg.config;
            renderConfig(currentConfig, false); // false = do NOT overwrite what user is typing!
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
          renderConfig(currentConfig, false);
        }
      } catch (err) {
        console.error('Error parsing admin ws message:', err);
      }
    };

    adminWs.onclose = () => {
      if (wsPingTimer) {
        clearInterval(wsPingTimer);
        wsPingTimer = null;
      }
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot offline';
      if (wsIndicatorText) wsIndicatorText.textContent = '❌ กำลังเชื่อมต่อใหม่...';
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(connectAdminWebSocket, 2500);
    };

    adminWs.onerror = () => {
      if (wsPingTimer) {
        clearInterval(wsPingTimer);
        wsPingTimer = null;
      }
      if (wsIndicatorDot) wsIndicatorDot.className = 'ws-dot offline';
      if (wsIndicatorText) wsIndicatorText.textContent = '❌ ออฟไลน์';
    };
  } catch (e) {
    if (wsPingTimer) {
      clearInterval(wsPingTimer);
      wsPingTimer = null;
    }
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectAdminWebSocket, 2500);
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
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }
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

  loadConfig(true); // Initial load: force = true
  loadClients();
  checkInstallerInfo();
  connectAdminWebSocket();

  // Restore any unsaved drafts if user refreshed the page while typing
  setTimeout(() => {
    if (restoreFormDraft()) {
      showToast('กู้คืนข้อความที่คุณพิมพ์ค้างไว้ให้เรียบร้อยแล้ว', 'info');
    }
  }, 150);
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
async function loadConfig(force = false) {
  try {
    const res = await fetch('/api/admin/config');
    const data = await res.json();
    if (res.ok && data.ok) {
      currentConfig = data.config;
      renderConfig(currentConfig, force);
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function setInputSafe(el, val, force) {
  if (!el) return;
  const newVal = val !== undefined && val !== null ? String(val) : '';
  if (force) {
    el.value = newVal;
    return;
  }
  // If user is currently typing/focused in this element, NEVER overwrite!
  if (document.activeElement === el) return;
  // If user has unsaved edits in progress, do not overwrite with old server value!
  if (hasUnsavedEdits && el.value.trim() !== '') return;
  el.value = newVal;
}

function setCheckboxSafe(el, checked, force) {
  if (!el) return;
  if (force) {
    el.checked = Boolean(checked);
    return;
  }
  if (document.activeElement === el) return;
  if (hasUnsavedEdits) return;
  el.checked = Boolean(checked);
}

function saveFormDraft() {
  hasUnsavedEdits = true;
  const draft = {
    maintenanceTitle: maintenanceTitle?.value || '',
    maintenanceContact: maintenanceContact?.value || '',
    maintenanceMessage: maintenanceMessage?.value || '',
    latestVersion: latestVersion?.value || '',
    minSupportedVersion: minSupportedVersion?.value || '',
    chkForceUpdate: Boolean(chkForceUpdate?.checked),
    downloadUrl: downloadUrl?.value || '',
    releaseNotes: releaseNotes?.value || '',
    chkBroadcastEnabled: Boolean(chkBroadcastEnabled?.checked),
    broadcastType: broadcastType?.value || 'info',
    broadcastMessage: broadcastMessage?.value || '',
    time: Date.now()
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {}
}

function restoreFormDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft) return false;

    let restored = false;
    if (draft.downloadUrl && downloadUrl) { downloadUrl.value = draft.downloadUrl; restored = true; }
    if (draft.releaseNotes && releaseNotes) { releaseNotes.value = draft.releaseNotes; restored = true; }
    if (draft.latestVersion && latestVersion) { latestVersion.value = draft.latestVersion; restored = true; }
    if (draft.minSupportedVersion && minSupportedVersion) { minSupportedVersion.value = draft.minSupportedVersion; restored = true; }
    if (draft.chkForceUpdate !== undefined && chkForceUpdate) {
      chkForceUpdate.checked = draft.chkForceUpdate;
      updateForceUpdateUI(draft.chkForceUpdate);
    }
    if (draft.maintenanceTitle && maintenanceTitle) { maintenanceTitle.value = draft.maintenanceTitle; restored = true; }
    if (draft.maintenanceContact && maintenanceContact) { maintenanceContact.value = draft.maintenanceContact; restored = true; }
    if (draft.maintenanceMessage && maintenanceMessage) { maintenanceMessage.value = draft.maintenanceMessage; restored = true; }
    if (draft.chkBroadcastEnabled !== undefined && chkBroadcastEnabled) {
      chkBroadcastEnabled.checked = draft.chkBroadcastEnabled;
      updateBroadcastUI(draft.chkBroadcastEnabled);
    }
    if (draft.broadcastType && broadcastType) broadcastType.value = draft.broadcastType;
    if (draft.broadcastMessage && broadcastMessage) { broadcastMessage.value = draft.broadcastMessage; restored = true; }

    updateMaintenanceSimulation();
    updateBroadcastSimulation();
    if (restored) hasUnsavedEdits = true;
    return restored;
  } catch (e) {
    return false;
  }
}

function clearFormDraft() {
  hasUnsavedEdits = false;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}

function renderConfig(cfg, force = false) {
  if (!cfg) return;

  // App Enabled
  const enabled = Boolean(cfg.appEnabled);
  setCheckboxSafe(chkAppEnabled, enabled, force);
  setCheckboxSafe(chkAppEnabledQuick, enabled, force);
  updateAppEnabledUI(enabled);

  // Maintenance
  setInputSafe(maintenanceTitle, cfg.maintenance?.title || '', force);
  setInputSafe(maintenanceContact, cfg.maintenance?.contact || '', force);
  setInputSafe(maintenanceMessage, cfg.maintenance?.message || '', force);
  if (force || (document.activeElement !== maintenanceTitle && document.activeElement !== maintenanceMessage)) {
    updateMaintenanceSimulation();
  }

  // Version
  setInputSafe(latestVersion, cfg.version?.latestVersion || '3.6.0', force);
  setInputSafe(minSupportedVersion, cfg.version?.minSupportedVersion || '3.5.0', force);
  setCheckboxSafe(chkForceUpdate, cfg.version?.forceUpdate, force);
  updateForceUpdateUI(chkForceUpdate ? chkForceUpdate.checked : cfg.version?.forceUpdate);
  setInputSafe(downloadUrl, cfg.version?.downloadUrl || '', force);
  setInputSafe(releaseNotes, cfg.version?.releaseNotes || '', force);

  // Broadcast
  setCheckboxSafe(chkBroadcastEnabled, cfg.broadcast?.enabled, force);
  updateBroadcastUI(chkBroadcastEnabled ? chkBroadcastEnabled.checked : cfg.broadcast?.enabled);
  if (force || (broadcastType && document.activeElement !== broadcastType && !hasUnsavedEdits)) {
    if (broadcastType) broadcastType.value = cfg.broadcast?.type || 'info';
  }
  setInputSafe(broadcastMessage, cfg.broadcast?.message || '', force);
  if (force || document.activeElement !== broadcastMessage) {
    updateBroadcastSimulation();
  }

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
  if (simBroadcastBanner) {
    simBroadcastBanner.className = `sim-banner ${type}`;
  }
  if (simBroadcastText) {
    simBroadcastText.textContent = msg;
  }
}

// Real-time Input Listeners
maintenanceTitle?.addEventListener('input', updateMaintenanceSimulation);
maintenanceContact?.addEventListener('input', updateMaintenanceSimulation);
maintenanceMessage?.addEventListener('input', updateMaintenanceSimulation);

broadcastType?.addEventListener('change', updateBroadcastSimulation);
broadcastMessage?.addEventListener('input', updateBroadcastSimulation);

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
  const allSaveBtns = [btnSaveConfig, btnSaveControl, btnSaveVersion, btnSaveBroadcast].filter(Boolean);
  allSaveBtns.forEach(btn => btn.disabled = true);

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
      clearFormDraft();
      renderConfig(currentConfig, true); // Force UI update to newly saved config
      showToast('บันทึกคำสั่งและส่งผล Real-time ไปยังทุกเครื่องเรียบร้อยแล้ว!');
    } else {
      showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
  } finally {
    allSaveBtns.forEach(btn => btn.disabled = false);
  }
}

// Auto-save form draft whenever user types so inputs are NEVER lost
[
  maintenanceTitle, maintenanceContact, maintenanceMessage,
  latestVersion, minSupportedVersion, downloadUrl, releaseNotes,
  broadcastMessage
].forEach(el => {
  el?.addEventListener('input', saveFormDraft);
});

[chkAppEnabled, chkAppEnabledQuick, chkForceUpdate, chkBroadcastEnabled, broadcastType].forEach(el => {
  el?.addEventListener('change', saveFormDraft);
});

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
        renderConfig(currentConfig, true);
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

// ==== INSTALLER FILE UPLOAD & DATABASE STORAGE ====
async function checkInstallerInfo() {
  try {
    const res = await fetch('/api/admin/installer-info');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.hasFile) {
        if (fileDatabaseBadge) fileDatabaseBadge.classList.remove('hidden');
        if (lblDbFileName) lblDbFileName.textContent = data.filename;
        if (lblDbFileSize) lblDbFileSize.textContent = `${data.sizeMb} MB`;
        if (lblDbFileDate && data.uploadedAt) {
          const d = new Date(data.uploadedAt);
          lblDbFileDate.textContent = d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        }
      } else {
        if (fileDatabaseBadge) fileDatabaseBadge.classList.add('hidden');
      }
    }
  } catch (err) {}
}

if (btnTriggerUpload && fileInstallerUpload) {
  btnTriggerUpload.addEventListener('click', () => {
    fileInstallerUpload.click();
  });

  fileInstallerUpload.addEventListener('change', () => {
    const file = fileInstallerUpload.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    const ok = confirm(`ต้องการอัปโหลดไฟล์ "${file.name}" (${sizeMb} MB) ไปบันทึกเก็บไว้ในฐานข้อมูล PostgreSQL หรือไม่?`);
    if (!ok) {
      fileInstallerUpload.value = '';
      return;
    }

    uploadInstallerFile(file);
  });
}

function uploadInstallerFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  if (btnTriggerUpload) btnTriggerUpload.disabled = true;
  if (uploadProgressContainer) uploadProgressContainer.classList.remove('hidden');
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
  if (uploadProgressPercent) uploadProgressPercent.textContent = '0%';
  if (uploadProgressText) uploadProgressText.textContent = `⏳ กำลังอัปโหลด ${file.name}...`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/admin/upload-installer', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      if (uploadProgressBar) uploadProgressBar.style.width = percent + '%';
      if (uploadProgressPercent) uploadProgressPercent.textContent = percent + '%';
      if (uploadProgressText) uploadProgressText.textContent = `⏳ กำลังบันทึกไฟล์เข้าฐานข้อมูล PostgreSQL... ${percent}%`;
    }
  };

  xhr.onload = () => {
    if (btnTriggerUpload) btnTriggerUpload.disabled = false;
    fileInstallerUpload.value = '';
    setTimeout(() => {
      if (uploadProgressContainer) uploadProgressContainer.classList.add('hidden');
    }, 2500);

    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status === 200 && data.ok) {
        showToast(data.message || 'อัปโหลดและบันทึกลงฐานข้อมูลสำเร็จ!');
        if (downloadUrl && data.downloadUrl) {
          downloadUrl.value = data.downloadUrl;
        }
        if (data.config) {
          currentConfig = data.config;
          clearFormDraft();
          renderConfig(currentConfig, true);
        }
        checkInstallerInfo();
      } else {
        showToast(data.error || 'อัปโหลดไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการประมวลผลคำตอบจากเซิร์ฟเวอร์', 'error');
    }
  };

  xhr.onerror = () => {
    if (btnTriggerUpload) btnTriggerUpload.disabled = false;
    if (uploadProgressContainer) uploadProgressContainer.classList.add('hidden');
    fileInstallerUpload.value = '';
    showToast('การเชื่อมต่อล้มเหลวระหว่างอัปโหลด กรุณาลองใหม่อีกครั้ง', 'error');
  };

  xhr.send(formData);
}

// Initial Launch
checkAuth();
