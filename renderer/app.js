'use strict';

// Elements
const btnMinimize = document.getElementById('btnMinimize');
const btnMaximize = document.getElementById('btnMaximize');
const btnCloseApp = document.getElementById('btnCloseApp');
const btnLogout = document.getElementById('btnLogout');
const sessionDot = document.getElementById('sessionDot');
const sessionText = document.getElementById('sessionText');
const masterSwitch = document.getElementById('masterSwitch');

// Window Controls
btnMinimize.addEventListener('click', () => window.nkAPI.minimizeWindow());
btnMaximize.addEventListener('click', () => window.nkAPI.maximizeWindow());
btnCloseApp.addEventListener('click', () => window.nkAPI.closeWindow());

// Theme Toggle (Dark / Light Mode)
const btnThemeToggle = document.getElementById('btnThemeToggle');
const setDarkMode = document.getElementById('setDarkMode');
const btnWebThemeToggle = document.getElementById('btnWebThemeToggle');
const boWebview = document.getElementById('boWebview');

// Sync Dynamic Version Tag from Electron app
if (window.nkAPI?.getAppVersion) {
  window.nkAPI.getAppVersion().then(v => {
    const el = document.getElementById('appVersionTag');
    if (el && v) el.textContent = `v${v}`;
  });
}

// ==========================================
// MODERN DIALOG SYSTEM (Alert & Confirm Replacement)
// ==========================================
window.showConfirmDialog = function(options = {}) {
  const opts = typeof options === 'string' ? { message: options } : options;
  const {
    title = 'ยืนยันการทำรายการ',
    message = '',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    type = 'warning', // 'warning' | 'danger' | 'info' | 'success'
    icon = null
  } = opts;

  return new Promise((resolve) => {
    const modal = document.getElementById('modalModernDialog');
    if (!modal) {
      resolve(true);
      return;
    }

    const iconWrap = document.getElementById('modernDialogIconWrap');
    const iconEl = document.getElementById('modernDialogIcon');
    const titleEl = document.getElementById('modernDialogTitle');
    const msgEl = document.getElementById('modernDialogMessage');
    const btnCancel = document.getElementById('btnModernDialogCancel');
    const btnConfirm = document.getElementById('btnModernDialogConfirm');
    const glowEl = document.getElementById('modernDialogGlow');

    if (titleEl) titleEl.textContent = title;

    if (msgEl) {
      if (typeof message === 'string') {
        const lines = message.split('\n');
        msgEl.innerHTML = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '<div style="height:6px;"></div>';
          const escaped = trimmed
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<p style="margin: 4px 0;">${escaped}</p>`;
        }).join('');
      } else {
        msgEl.textContent = String(message || '');
      }
    }

    const themes = {
      danger: {
        icon: '🗑️',
        iconBg: 'rgba(239, 68, 68, 0.15)',
        iconBorder: 'rgba(239, 68, 68, 0.45)',
        glow: 'rgba(239, 68, 68, 0.35)',
        confirmBg: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(239, 68, 68, 0.45)'
      },
      warning: {
        icon: '⚠️',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        iconBorder: 'rgba(245, 158, 11, 0.45)',
        glow: 'rgba(245, 158, 11, 0.35)',
        confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
        confirmColor: '#000000',
        confirmShadow: '0 4px 16px rgba(245, 158, 11, 0.4)'
      },
      success: {
        icon: '✅',
        iconBg: 'rgba(16, 185, 129, 0.15)',
        iconBorder: 'rgba(16, 185, 129, 0.45)',
        glow: 'rgba(16, 185, 129, 0.35)',
        confirmBg: 'linear-gradient(135deg, #10b981, #047857)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
      },
      info: {
        icon: 'ℹ️',
        iconBg: 'rgba(56, 189, 248, 0.15)',
        iconBorder: 'rgba(56, 189, 248, 0.45)',
        glow: 'rgba(56, 189, 248, 0.35)',
        confirmBg: 'linear-gradient(135deg, #38bdf8, #2563eb)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(56, 189, 248, 0.4)'
      }
    };

    const t = themes[type] || themes.warning;

    if (iconWrap) {
      iconWrap.style.background = t.iconBg;
      iconWrap.style.border = `1.5px solid ${t.iconBorder}`;
      iconWrap.style.boxShadow = `0 0 25px ${t.glow}`;
    }
    if (glowEl) {
      glowEl.style.background = `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`;
    }
    if (iconEl) {
      iconEl.textContent = icon || t.icon;
    }

    if (btnConfirm) {
      btnConfirm.textContent = confirmText;
      btnConfirm.style.background = t.confirmBg;
      btnConfirm.style.color = t.confirmColor;
      btnConfirm.style.boxShadow = t.confirmShadow;
    }

    if (btnCancel) {
      btnCancel.style.display = 'inline-flex';
      btnCancel.textContent = cancelText;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      try { btnConfirm?.focus(); } catch (e) {}
    }, 50);

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm?.removeEventListener('click', onConfirm);
      btnCancel?.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKey, { capture: true });
      modal.removeEventListener('click', onBackdrop);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        if (document.activeElement !== btnCancel) {
          e.preventDefault();
          e.stopPropagation();
          onConfirm();
        }
      }
    };

    const onBackdrop = (e) => {
      if (e.target === modal) {
        onCancel();
      }
    };

    btnConfirm?.addEventListener('click', onConfirm);
    btnCancel?.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKey, { capture: true });
    modal.addEventListener('click', onBackdrop);
  });
};

window.showAlertDialog = function(options = {}) {
  let opts = options;
  if (typeof options === 'string') {
    let autoType = 'info';
    let autoIcon = 'ℹ️';
    if (options.includes('✅') || options.includes('สำเร็จ')) {
      autoType = 'success';
      autoIcon = '✅';
    } else if (options.includes('⚠️') || options.includes('กรุณา')) {
      autoType = 'warning';
      autoIcon = '⚠️';
    } else if (options.includes('ผิดพลาด') || options.includes('ไม่สำเร็จ') || options.includes('ล้มเหลว') || options.includes('เกิดข้อผิดพลาด') || options.includes('❌')) {
      autoType = 'danger';
      autoIcon = '❌';
    }
    opts = { message: options, title: 'แจ้งเตือน', type: autoType, icon: autoIcon };
  }

  const {
    title = 'แจ้งเตือน',
    message = '',
    buttonText = 'ตกลง',
    type = 'info',
    icon = null
  } = opts;

  return new Promise((resolve) => {
    const modal = document.getElementById('modalModernDialog');
    if (!modal) {
      resolve();
      return;
    }

    const iconWrap = document.getElementById('modernDialogIconWrap');
    const iconEl = document.getElementById('modernDialogIcon');
    const titleEl = document.getElementById('modernDialogTitle');
    const msgEl = document.getElementById('modernDialogMessage');
    const btnCancel = document.getElementById('btnModernDialogCancel');
    const btnConfirm = document.getElementById('btnModernDialogConfirm');
    const glowEl = document.getElementById('modernDialogGlow');

    if (titleEl) titleEl.textContent = title;

    if (msgEl) {
      if (typeof message === 'string') {
        const lines = message.split('\n');
        msgEl.innerHTML = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '<div style="height:6px;"></div>';
          const escaped = trimmed
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<p style="margin: 4px 0;">${escaped}</p>`;
        }).join('');
      } else {
        msgEl.textContent = String(message || '');
      }
    }

    const themes = {
      danger: {
        icon: '❌',
        iconBg: 'rgba(239, 68, 68, 0.15)',
        iconBorder: 'rgba(239, 68, 68, 0.45)',
        glow: 'rgba(239, 68, 68, 0.35)',
        confirmBg: 'linear-gradient(135deg, #ef4444, #b91c1c)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(239, 68, 68, 0.45)'
      },
      warning: {
        icon: '⚠️',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        iconBorder: 'rgba(245, 158, 11, 0.45)',
        glow: 'rgba(245, 158, 11, 0.35)',
        confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
        confirmColor: '#000000',
        confirmShadow: '0 4px 16px rgba(245, 158, 11, 0.4)'
      },
      success: {
        icon: '✅',
        iconBg: 'rgba(16, 185, 129, 0.15)',
        iconBorder: 'rgba(16, 185, 129, 0.45)',
        glow: 'rgba(16, 185, 129, 0.35)',
        confirmBg: 'linear-gradient(135deg, #10b981, #047857)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
      },
      info: {
        icon: 'ℹ️',
        iconBg: 'rgba(56, 189, 248, 0.15)',
        iconBorder: 'rgba(56, 189, 248, 0.45)',
        glow: 'rgba(56, 189, 248, 0.35)',
        confirmBg: 'linear-gradient(135deg, #38bdf8, #2563eb)',
        confirmColor: '#ffffff',
        confirmShadow: '0 4px 16px rgba(56, 189, 248, 0.4)'
      }
    };

    const t = themes[type] || themes.info;

    if (iconWrap) {
      iconWrap.style.background = t.iconBg;
      iconWrap.style.border = `1.5px solid ${t.iconBorder}`;
      iconWrap.style.boxShadow = `0 0 25px ${t.glow}`;
    }
    if (glowEl) {
      glowEl.style.background = `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`;
    }
    if (iconEl) {
      iconEl.textContent = icon || t.icon;
    }

    if (btnCancel) {
      btnCancel.style.display = 'none';
    }

    if (btnConfirm) {
      btnConfirm.textContent = buttonText;
      btnConfirm.style.background = t.confirmBg;
      btnConfirm.style.color = t.confirmColor;
      btnConfirm.style.boxShadow = t.confirmShadow;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      try { btnConfirm?.focus(); } catch (e) {}
    }, 50);

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm?.removeEventListener('click', onClose);
      window.removeEventListener('keydown', onKey, { capture: true });
      modal.removeEventListener('click', onBackdrop);
    };

    const onClose = () => {
      cleanup();
      resolve();
    };

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const onBackdrop = (e) => {
      if (e.target === modal) {
        onClose();
      }
    };

    btnConfirm?.addEventListener('click', onClose);
    window.addEventListener('keydown', onKey, { capture: true });
    modal.addEventListener('click', onBackdrop);
  });
};

// Global overrides: Stop using native OS popups across the whole system!
window.alert = function(msg) {
  return window.showAlertDialog(msg);
};
window.confirm = function(msg) {
  return window.showConfirmDialog({ message: msg });
};

// Authoritative loader for BackOffice Webview
async function ensureBackofficeWebviewLoaded(force = false) {
  const wv = document.getElementById('boWebview');
  if (!wv) return;

  let targetUrl = '';
  try {
    const user = await window.nkAPI.getUser();
    targetUrl = user?.backofficeUrl;
  } catch (e) {}

  if (!targetUrl) {
    try {
      const s = await window.nkAPI.getSettings();
      targetUrl = s?.backofficeUrl;
    } catch (e) {}
  }

  if (!targetUrl) {
    try {
      targetUrl = await window.nkAPI.getStore('apiBusinessContext.backofficeUrl', '');
    } catch (e) {}
  }

  if (!targetUrl || !targetUrl.startsWith('http')) return;

  let currentUrl = '';
  try {
    if (typeof wv.getURL === 'function') currentUrl = wv.getURL();
  } catch (e) {}
  if (!currentUrl) {
    currentUrl = wv.getAttribute('src') || wv.src || '';
  }

  if (force || !currentUrl || currentUrl === 'about:blank' || currentUrl === 'about:blank/' || currentUrl === '') {
    try {
      if (typeof wv.loadURL === 'function') {
        wv.loadURL(targetUrl);
      } else {
        wv.src = targetUrl;
      }
    } catch (err) {
      wv.src = targetUrl;
    }
  }
}

const BACKOFFICE_DARK_CSS = `
/*
 * NK BackOffice Helper — Global Dark Mode
 * นำมาจาก Chrome Extension ต้นฉบับ 100%
 */
html.nk-global-dark {
  color-scheme: dark;
  --nk-bg: #0b1220;
  --nk-surface: #111827;
  --nk-surface-2: #172033;
  --nk-surface-3: #1e293b;
  --nk-line: #2b3a50;
  --nk-text: #e8eef7;
  --nk-text-2: #cbd5e1;
  --nk-muted: #94a3b8;
  --nk-input: #101a2b;
  --nk-shadow: rgba(0, 0, 0, .38);
}

html.nk-global-dark,
html.nk-global-dark body,
html.nk-global-dark #__nuxt,
html.nk-global-dark #app {
  background: var(--nk-bg) !important;
  color: var(--nk-text) !important;
}

/* Nuxt UI / Tailwind surfaces */
html.nk-global-dark .bg-default,
html.nk-global-dark .bg-white {
  background-color: var(--nk-surface) !important;
}
html.nk-global-dark .bg-elevated,
html.nk-global-dark .bg-gray-50,
html.nk-global-dark .bg-slate-50 {
  background-color: var(--nk-surface-2) !important;
}
html.nk-global-dark .bg-muted,
html.nk-global-dark .bg-gray-100,
html.nk-global-dark .bg-slate-100 {
  background-color: var(--nk-surface-3) !important;
}

/* Header / sidebar / navigation areas */
html.nk-global-dark header,
html.nk-global-dark aside,
html.nk-global-dark nav {
  background-color: var(--nk-surface) !important;
  border-color: var(--nk-line) !important;
}

/* Keep the selected orange menu/action colors readable */
html.nk-global-dark .bg-primary,
html.nk-global-dark .bg-primary-500,
html.nk-global-dark [class~="bg-warning"],
html.nk-global-dark [class*="bg-warning/"] {
  color: #fff !important;
}

/* Standard text */
html.nk-global-dark .text-highlighted,
html.nk-global-dark .text-default,
html.nk-global-dark .text-gray-950,
html.nk-global-dark .text-gray-900,
html.nk-global-dark .text-slate-900 {
  color: var(--nk-text) !important;
}
html.nk-global-dark .text-gray-800,
html.nk-global-dark .text-gray-700,
html.nk-global-dark .text-gray-600,
html.nk-global-dark .text-slate-800,
html.nk-global-dark .text-slate-700,
html.nk-global-dark .text-slate-600 {
  color: var(--nk-text-2) !important;
}
html.nk-global-dark .text-muted,
html.nk-global-dark .text-dimmed,
html.nk-global-dark .text-gray-500,
html.nk-global-dark .text-gray-400,
html.nk-global-dark .text-slate-500,
html.nk-global-dark .text-slate-400 {
  color: var(--nk-muted) !important;
}

/* Borders, rings and separators */
html.nk-global-dark .border-default,
html.nk-global-dark .border-gray-100,
html.nk-global-dark .border-gray-200,
html.nk-global-dark .border-gray-300,
html.nk-global-dark .border-slate-100,
html.nk-global-dark .border-slate-200,
html.nk-global-dark .border-slate-300,
html.nk-global-dark .ring-accented,
html.nk-global-dark .divide-gray-100 > :not([hidden]) ~ :not([hidden]),
html.nk-global-dark .divide-gray-200 > :not([hidden]) ~ :not([hidden]) {
  border-color: var(--nk-line) !important;
  --tw-ring-color: var(--nk-line) !important;
}

/* Inputs / select / textarea / date fields */
html.nk-global-dark input:not([type="checkbox"]):not([type="radio"]),
html.nk-global-dark textarea,
html.nk-global-dark select {
  background-color: var(--nk-input) !important;
  color: var(--nk-text) !important;
  border-color: var(--nk-line) !important;
  caret-color: #f8fafc;
}
html.nk-global-dark input::placeholder,
html.nk-global-dark textarea::placeholder {
  color: #718096 !important;
  opacity: 1;
}
html.nk-global-dark input[type="date"]::-webkit-calendar-picker-indicator,
html.nk-global-dark input[type="datetime-local"]::-webkit-calendar-picker-indicator {
  filter: invert(.9);
}

/* Table: every report/member/withdraw page inherits this automatically */
html.nk-global-dark .table-custom,
html.nk-global-dark table {
  background-color: var(--nk-surface) !important;
  color: var(--nk-text-2) !important;
}
html.nk-global-dark .table-custom thead,
html.nk-global-dark table thead {
  background-color: var(--nk-surface-2) !important;
}
html.nk-global-dark .table-custom th,
html.nk-global-dark table th {
  background-color: var(--nk-surface-2) !important;
  color: #b8c4d6 !important;
  border-color: var(--nk-line) !important;
}
html.nk-global-dark .table-custom td,
html.nk-global-dark table td {
  background-color: transparent !important;
  border-color: var(--nk-line) !important;
}
html.nk-global-dark .table-custom tbody tr,
html.nk-global-dark table tbody tr {
  background-color: var(--nk-surface) !important;
  border-color: var(--nk-line) !important;
}
html.nk-global-dark .table-custom tbody tr:hover,
html.nk-global-dark table tbody tr:hover {
  background-color: #18253a !important;
}

/* Common popover/modal/menu surfaces created later by Vue/Teleport */
html.nk-global-dark [role="dialog"],
html.nk-global-dark [role="menu"],
html.nk-global-dark [role="listbox"],
html.nk-global-dark [data-headlessui-portal] > div,
html.nk-global-dark [data-reka-popper-content-wrapper] > div {
  color: var(--nk-text) !important;
}
html.nk-global-dark [role="dialog"] > div,
html.nk-global-dark [role="menu"],
html.nk-global-dark [role="listbox"] {
  background-color: var(--nk-surface-2) !important;
  border-color: var(--nk-line) !important;
  box-shadow: 0 22px 55px var(--nk-shadow) !important;
}

/* Typical rounded cards/panels from Nuxt UI */
html.nk-global-dark .shadow-sm.bg-default,
html.nk-global-dark .shadow.bg-default,
html.nk-global-dark .rounded-lg.bg-default,
html.nk-global-dark .rounded-xl.bg-default,
html.nk-global-dark .rounded-2xl.bg-default {
  background-color: var(--nk-surface) !important;
  border-color: var(--nk-line) !important;
  box-shadow: 0 6px 22px var(--nk-shadow) !important;
}

/* Scrollbars */
html.nk-global-dark * {
  scrollbar-color: #475569 #111827;
}
html.nk-global-dark *::-webkit-scrollbar { width: 10px; height: 10px; }
html.nk-global-dark *::-webkit-scrollbar-track { background: #111827; }
html.nk-global-dark *::-webkit-scrollbar-thumb { background: #475569; border-radius: 999px; border: 2px solid #111827; }

/* Preserve semantic colors */
html.nk-global-dark .text-success,
html.nk-global-dark .text-green-500,
html.nk-global-dark .text-green-600 { color: #4ade80 !important; }
html.nk-global-dark .text-error,
html.nk-global-dark .text-red-500,
html.nk-global-dark .text-red-600 { color: #fb7185 !important; }
html.nk-global-dark .text-warning,
html.nk-global-dark .text-orange-500,
html.nk-global-dark .text-orange-600 { color: #fbbf24 !important; }
html.nk-global-dark .text-primary,
html.nk-global-dark .text-blue-500,
html.nk-global-dark .text-blue-600 { color: #60a5fa !important; }

/* Preserve bank/provider logos and images */
html.nk-global-dark img,
html.nk-global-dark svg,
html.nk-global-dark video,
html.nk-global-dark canvas {
  filter: none !important;
}
`;

function applyThemeToWebview(isDark) {
  const wv = boWebview || document.getElementById('boWebview');
  if (!wv) return;

  const script = `
    (function() {
      const STYLE_ID = 'nk-global-dark-mode-style';
      const ROOT_CLASS = 'nk-global-dark';
      const isDark = ${Boolean(isDark)};
      const root = document.documentElement;
      if (!root) return;

      root.classList.toggle(ROOT_CLASS, isDark);
      root.dataset.nkTheme = isDark ? 'dark' : 'light';

      let styleEl = document.getElementById(STYLE_ID);
      if (!isDark) {
        if (styleEl) styleEl.remove();
        return;
      }

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        (document.head || root).appendChild(styleEl);
      }
      styleEl.textContent = ${JSON.stringify(BACKOFFICE_DARK_CSS)};

      if (!window.__NK_DARK_OBSERVER__) {
        window.__NK_DARK_OBSERVER__ = new MutationObserver(() => {
          if (root.classList.contains(ROOT_CLASS)) {
            const s = document.getElementById(STYLE_ID);
            if (!s) {
              const newStyle = document.createElement('style');
              newStyle.id = STYLE_ID;
              newStyle.textContent = ${JSON.stringify(BACKOFFICE_DARK_CSS)};
              (document.head || root).appendChild(newStyle);
            }
          }
        });
        window.__NK_DARK_OBSERVER__.observe(root, { attributes: true, attributeFilter: ['class'], childList: true });
      }
    })();
  `;

  wv.executeJavaScript(script).catch(() => {});
}

function syncWebviewTheme() {
  const isDark = !document.body.classList.contains('light-theme');
  applyThemeToWebview(isDark);
}

function setAppTheme(isDark, persist = true) {
  document.body.classList.toggle('light-theme', !isDark);
  if (btnThemeToggle) {
    btnThemeToggle.textContent = isDark ? '🌙' : '☀️';
    btnThemeToggle.title = isDark ? 'เปลี่ยนเป็นโหมดสว่าง (กลางวัน)' : 'เปลี่ยนเป็นโหมดมืด (กลางคืน)';
  }
  if (btnWebThemeToggle) {
    btnWebThemeToggle.textContent = isDark ? '🌙 โหมดเว็บ' : '☀️ โหมดเว็บ';
    btnWebThemeToggle.title = isDark ? 'เปลี่ยนเป็นโหมดสว่าง (กลางวัน)' : 'เปลี่ยนเป็นโหมดมืด (กลางคืน)';
  }
  if (setDarkMode && setDarkMode.checked !== isDark) {
    setDarkMode.checked = isDark;
  }
  if (persist) {
    window.nkAPI.toggleDarkMode(isDark);
  }
  applyThemeToWebview(isDark);
}

(async function initAppTheme() {
  try {
    const isDark = await window.nkAPI.getStore('darkMode', true);
    setAppTheme(isDark !== false, false);
  } catch (e) {}
})();

if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', () => {
    const isCurrentlyDark = !document.body.classList.contains('light-theme');
    setAppTheme(!isCurrentlyDark, true);
  });
}

if (btnWebThemeToggle) {
  btnWebThemeToggle.addEventListener('click', () => {
    const isCurrentlyDark = !document.body.classList.contains('light-theme');
    setAppTheme(!isCurrentlyDark, true);
  });
}

if (setDarkMode) {
  setDarkMode.addEventListener('change', (e) => {
    setAppTheme(e.target.checked, true);
  });
}

btnLogout.addEventListener('click', async () => {
  const ok = await window.showConfirmDialog({
    title: 'ออกจากระบบ',
    message: 'คุณต้องการออกจากระบบ NK Helper ใช่หรือไม่?',
    confirmText: 'ออกจากระบบ',
    cancelText: 'ยกเลิก',
    type: 'warning',
    icon: '🚪'
  });
  if (ok) {
    await window.nkAPI.logout();
  }
});


// Navigation Router
window.navTo = function(viewName) {
  if (viewName === 'reset-password' || viewName === 'points') {
    viewName = 'member';
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  document.querySelectorAll('.view-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const webviewSection = document.getElementById('view-webview');
  if (viewName === 'webview') {
    webviewSection.classList.add('active');
    syncWebviewTheme();
    ensureBackofficeWebviewLoaded();
    injectSessionIntoWebview();
    attemptWebviewAutoLogin();
  } else {
    webviewSection.classList.remove('active');
  }

  const spWebviewSection = document.getElementById('view-swiftpay-webview');
  const spWebview = document.getElementById('spWebview');
  const txtSpWebUrl = document.getElementById('txtSpWebUrl');
  if (viewName === 'swiftpay-webview') {
    if (spWebviewSection) spWebviewSection.classList.add('active');
    if (spWebview && (!spWebview.src || spWebview.src.includes('about:blank'))) {
      window.nkAPI.getStore('swiftpayPortalUrl', '').then(savedUrl => {
        let target = savedUrl;
        if (!target || target.includes('about:blank')) {
          target = 'https://userswiftpay.kcta.app/#/dashboard/workbench';
        }
        if (txtSpWebUrl) txtSpWebUrl.value = target;
        spWebview.src = target;
        // Fix the store if it was corrupted
        if (savedUrl && savedUrl.includes('about:blank')) {
           window.nkAPI.setStore('swiftpayPortalUrl', target);
        }
      });
    }
  } else {
    if (spWebviewSection) spWebviewSection.classList.remove('active');
  }

  const agWebviewSection = document.getElementById('view-agent-webview');
  const agWebview = document.getElementById('agWebview');
  const txtAgWebUrl = document.getElementById('txtAgWebUrl');
  if (viewName === 'agent-webview') {
    if (agWebviewSection) agWebviewSection.classList.add('active');
    if (agWebview && (!agWebview.src || agWebview.src.includes('about:blank'))) {
      window.nkAPI.getStore('agentPortalUrl', '').then(savedUrl => {
        let target = savedUrl;
        if (!target || target.includes('about:blank')) {
          target = 'https://ag.ismgaming6.com/';
        }
        if (txtAgWebUrl) txtAgWebUrl.value = target;
        agWebview.src = target;
        if (savedUrl && savedUrl.includes('about:blank')) {
          window.nkAPI.setStore('agentPortalUrl', target);
        }
      });
    }
  } else {
    if (agWebviewSection) agWebviewSection.classList.remove('active');
  }

  if (viewName !== 'webview' && viewName !== 'swiftpay-webview' && viewName !== 'agent-webview') {
    const targetPane = document.getElementById(`view-${viewName}`);
    if (targetPane) targetPane.classList.add('active');
  }

  if (viewName === 'dashboard') {
    if (typeof loadDailyReportTable === 'function') {
      loadDailyReportTable(false);
    }
  }

  if (viewName === 'cohort') {
    if (typeof initCohortMonths === 'function') {
      initCohortMonths();
    }
  }

  if (viewName === 'notifications') {
    loadNotificationLogs();
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }

  if (viewName === 'analyzer') {
    loadAnalyzerData();
  }

  if (viewName === 'forms') {
    if (typeof fetchForms === 'function') {
      fetchForms();
    }
  }
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    window.navTo(item.dataset.view);
  });
});

// User profile
async function loadUserProfile() {
  const user = await window.nkAPI.getUser();
  if (user) {
    document.getElementById('txtUserName').textContent = user.name || user.username || 'ผู้ดูแลระบบ';
    const roleEl = document.getElementById('txtUserRole');
    if (roleEl) roleEl.textContent = user.role || 'ผู้ดูแลระบบ';
    const siteEl = document.getElementById('txtUserSite');
    if (siteEl) siteEl.textContent = user.siteName || '-';
    if (document.getElementById('lblTargetSiteName')) {
      document.getElementById('lblTargetSiteName').textContent = user.siteName || '-';
    }
    if (document.getElementById('lblTargetWebsiteId')) {
      document.getElementById('lblTargetWebsiteId').textContent = user.websiteId ? `(Website ID: ${user.websiteId})` : '';
    }
    if (document.getElementById('lblTargetBackofficeUrl')) {
      document.getElementById('lblTargetBackofficeUrl').textContent = user.backofficeUrl || '-';
    }
    if (document.getElementById('thDailySiteTitle')) {
      document.getElementById('thDailySiteTitle').textContent = user.siteName ? user.siteName.replace(/\s+/g, '').toUpperCase() : '-';
    }
    if (document.getElementById('txtDailyReportTitle')) {
      document.getElementById('txtDailyReportTitle').textContent = user.siteName ? `ตารางสรุปยอดรายวัน (${user.siteName})` : 'ตารางสรุปยอดรายวัน';
    }
    ensureBackofficeWebviewLoaded();
  }
}
loadUserProfile();

// Strict Thailand Timezone (Asia/Bangkok, UTC+7) helpers
function getBangkokDateParts(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const p = {};
  for (const x of parts) {
    if (x.type !== 'literal') p[x.type] = x.value;
  }
  if (p.hour === '24') p.hour = '00';
  return p;
}

function getBangkokDateString(dateInput = new Date()) {
  const p = getBangkokDateParts(dateInput);
  return `${p.year}-${p.month}-${p.day}`;
}

function todayDateString() {
  return getBangkokDateString(new Date());
}

function yesterdayDateString() {
  return getBangkokDateString(new Date(Date.now() - 86400000));
}

function firstOfMonthString() {
  const p = getBangkokDateParts(new Date());
  return `${p.year}-${p.month}-01`;
}

// Set default dates in reports (safe — elements may not exist if section was removed)
const _elDepStart = document.getElementById('repDepositStart');
const _elDepEnd = document.getElementById('repDepositEnd');
if (_elDepStart && !_elDepStart.value) _elDepStart.value = firstOfMonthString();
if (_elDepEnd && !_elDepEnd.value) _elDepEnd.value = todayDateString();

// ==========================================
// 1. REALTIME STATE SYNC & DASHBOARD
// ==========================================
async function syncAppState() {
  try {
    const store = await window.nkAPI.getAllStore();

    // Session status
    const session = store.apiSession;
    if (session && session.headers && Object.keys(session.headers).length) {
      sessionDot.className = 'status-dot online';
      sessionText.textContent = 'API พร้อมใช้งาน';
    } else {
      sessionDot.className = 'status-dot';
      sessionText.textContent = 'ยังไม่มี Session';
    }

    // Master switch
    if (store.masterEnabled !== undefined) {
      masterSwitch.checked = store.masterEnabled !== false;
    }

    // Withdraw State
    const withdrawSt = store.withdrawState || {};
    const withdrawCfg = store.withdrawConfig || {};
    const pendingCount = withdrawSt.pendingCount || 0;
    const crsCount = withdrawSt.crsCount || 0;

    document.getElementById('dashPendingCount').textContent = pendingCount;
    document.getElementById('dashCrsCount').textContent = crsCount;

    const badge = document.getElementById('withdrawBadge');
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    const dashAuto = document.getElementById('dashAutoStatus');
    const dashAutoDesc = document.getElementById('dashAutoDesc');
    const bankOn = Boolean(withdrawCfg.bankAutoApprove !== undefined ? withdrawCfg.bankAutoApprove : withdrawCfg.autoApprove);
    const walletOn = Boolean(withdrawCfg.walletAutoApprove);
    const bankProv = String(withdrawCfg.bankProvider || withdrawCfg.provider || 'crs').toUpperCase();
    const walletProv = String(withdrawCfg.walletProvider || 'crs').toUpperCase();

    if (bankOn && walletOn) {
      dashAuto.textContent = `เปิด Auto (ธนาคาร & Wallet)`;
      dashAuto.style.color = 'var(--success)';
      dashAutoDesc.textContent = `ธนาคาร ➔ ${bankProv} | TrueMoney ➔ ${walletProv}`;
    } else if (bankOn) {
      dashAuto.textContent = `เปิด Auto (ธนาคาร ➔ ${bankProv})`;
      dashAuto.style.color = 'var(--success)';
      dashAutoDesc.textContent = `ยอด ฿${Number(withdrawCfg.bankMinAmount || 0).toLocaleString('th-TH')} - ฿${Number(withdrawCfg.bankMaxAmount || 5000).toLocaleString('th-TH')}`;
    } else if (walletOn) {
      dashAuto.textContent = `เปิด Auto (Wallet ➔ ${walletProv})`;
      dashAuto.style.color = 'var(--success)';
      dashAutoDesc.textContent = `ยอด ฿${Number(withdrawCfg.walletMinAmount || 0).toLocaleString('th-TH')} - ฿${Number(withdrawCfg.walletMaxAmount || 5000).toLocaleString('th-TH')}`;
    } else {
      dashAuto.textContent = 'ปิดอยู่';
      dashAuto.style.color = 'var(--text-dim)';
      dashAutoDesc.textContent = 'Standby ตรวจจับอย่างเดียว (ปิด Auto)';
    }

    // Withdraw Controls View
    const btnToggle = document.getElementById('btnWithdrawToggle');
    const statusText = document.getElementById('withdrawStatusText');

    // 1. Bank inputs
    const inputBankMin = document.getElementById('withdrawBankMinAmount');
    const inputBankMax = document.getElementById('withdrawBankMaxAmount');
    const selectBankProv = document.getElementById('withdrawBankProvider');
    const toggleBank = document.getElementById('withdrawBankAutoToggle');

    if (inputBankMin && document.activeElement !== inputBankMin) {
      inputBankMin.value = withdrawCfg.bankMinAmount !== undefined ? withdrawCfg.bankMinAmount : (withdrawCfg.minAmount ?? 0);
    }
    if (inputBankMax && document.activeElement !== inputBankMax) {
      inputBankMax.value = withdrawCfg.bankMaxAmount !== undefined ? withdrawCfg.bankMaxAmount : (withdrawCfg.maxAmount ?? 5000);
    }
    if (selectBankProv && document.activeElement !== selectBankProv) {
      selectBankProv.value = withdrawCfg.bankProvider || withdrawCfg.provider || 'crs';
    }
    if (toggleBank) toggleBank.checked = bankOn;

    // 2. TrueMoney inputs
    const inputWalletMin = document.getElementById('withdrawWalletMinAmount');
    const inputWalletMax = document.getElementById('withdrawWalletMaxAmount');
    const selectWalletProv = document.getElementById('withdrawWalletProvider');
    const toggleWallet = document.getElementById('withdrawWalletAutoToggle');

    if (inputWalletMin && document.activeElement !== inputWalletMin) {
      inputWalletMin.value = withdrawCfg.walletMinAmount !== undefined ? withdrawCfg.walletMinAmount : 0;
    }
    if (inputWalletMax && document.activeElement !== inputWalletMax) {
      inputWalletMax.value = withdrawCfg.walletMaxAmount !== undefined ? withdrawCfg.walletMaxAmount : 5000;
    }
    if (selectWalletProv && document.activeElement !== selectWalletProv) {
      selectWalletProv.value = withdrawCfg.walletProvider || 'crs';
    }
    if (toggleWallet) toggleWallet.checked = walletOn;

    // Legacy mirror
    const autoToggle = document.getElementById('withdrawAutoApproveToggle');
    if (autoToggle) autoToggle.checked = Boolean(bankOn || walletOn);

    if (withdrawCfg.active) {
      btnToggle.textContent = '⏹ หยุด Standby';
      btnToggle.className = 'btn btn-danger';
      statusText.innerHTML = `<span>สถานะ: ${withdrawSt.message || 'กำลังตรวจจับ (เรียลไทม์)...'}</span>`;
    } else {
      btnToggle.textContent = '▶ เริ่ม Standby';
      btnToggle.className = 'btn btn-accent';
      statusText.innerHTML = `<span>สถานะ: ${withdrawSt.message || 'หยุดอยู่'}</span>`;
    }

    // Render Withdraw Tables
    renderWithdrawTables(withdrawSt.currentItems || [], withdrawSt.crsItems || []);

    // Observer State
    const obsState = store.globalObserverState || {};
    const dashObsStatus = document.getElementById('dashObserverStatus');
    if (dashObsStatus) {
      dashObsStatus.textContent = obsState.enabled ? 'กำลังเฝ้าดู' : 'ปิดอยู่';
      dashObsStatus.style.color = obsState.enabled ? 'var(--success)' : 'var(--text-dim)';
    }
    const obsStatusVal = document.getElementById('obsStatusValue');
    if (obsStatusVal) obsStatusVal.textContent = obsState.enabled ? 'กำลังเฝ้าดู' : 'ปิดอยู่';
    const obsStatusMsg = document.getElementById('obsStatusMsg');
    if (obsStatusMsg) obsStatusMsg.textContent = obsState.message || '-';
    const obsDetCount = document.getElementById('obsDetectedCount');
    if (obsDetCount) obsDetCount.textContent = obsState.detectedCount || 0;

    // Observer History
    renderObserverHistory(store.analyzerHistory || []);
  } catch (err) {
    console.error('State sync error:', err);
  }
}

let lastPendingItemsSig = '';
let lastCrsItemsSig = '';

function renderWithdrawTables(pendingItems, crsItems) {
  const pendingSig = (pendingItems || []).map(i => `${i.id}|${i.amount}|${i.note}|${i.isPaymentReturned}|${i.riskFlags?.level}|${i.riskFlags?.badge}`).join(';');
  const crsSig = (crsItems || []).map(i => `${i.id}|${i.amount}|${i.rawStatus}`).join(';');

  if (pendingSig !== lastPendingItemsSig) {
    lastPendingItemsSig = pendingSig;
    const tbodyPending = document.querySelector('#tablePendingWithdraw tbody');
    if (!pendingItems.length) {
      tbodyPending.innerHTML = '<tr><td colspan="6" class="empty-state">ยังไม่มีรายการรอดำเนินการ</td></tr>';
    } else {
      tbodyPending.innerHTML = pendingItems.map(item => {
        const rf = item.riskFlags;
        let riskBadgeHtml = '<span class="badge-risk-normal">✓ ปกติ</span>';
        if (rf?.level === 'critical') {
          riskBadgeHtml = `<span class="badge-risk-high" title="${rf.summary}">⚠️ เพิ่งเปลี่ยนบัญชี</span>`;
        } else if (rf?.isLargeAmount) {
          riskBadgeHtml = `<span class="badge-risk-warning" title="${rf.summary}">⚠️ ถอนยอดใหญ่</span>`;
        } else if (rf?.isRapidRepeat) {
          riskBadgeHtml = `<span class="badge-risk-warning" title="${rf.summary}">⚠️ ถอนถี่</span>`;
        } else if (rf?.sharedIp) {
          riskBadgeHtml = `<span class="badge-risk-warning" title="${rf.summary}">⚠️ IP ซ้ำ</span>`;
        } else if (rf?.isPaymentReturned || item.isPaymentReturned) {
          riskBadgeHtml = `<span class="badge-risk-warning" style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe;" title="${rf?.paymentReturnReason || item.note || 'Payment ปฏิเสธ'}">🔄 เปเม้นส่งกลับ</span>`;
        }

        const isWallet = item.isWallet || /TRUE|WALLET/i.test(item.bankCode || '') || (item.bankCode === 'TRUEMONEY' || item.bankCode === 'TRUEWALLET');
        const channelBadge = isWallet
          ? '<span style="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700; color:#ea580c; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.3); padding:1px 6px; border-radius:4px;">🟠 TrueMoney</span>'
          : `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700; color:#3b82f6; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); padding:1px 6px; border-radius:4px;">🏦 ${item.bankCode || 'ธนาคาร'}</span>`;

        const bankInfo = (item.bankCode ? `${item.bankCode} ` : '') + (item.bankNumber || '');
        const noteHtml = item.note ? `<div style="font-size:11px; color:#4f46e5; margin-top:2px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.note}">💬 ${item.note}</div>` : '';

        return `
          <tr>
            <td><strong>#${item.id}</strong></td>
            <td>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-weight:700; color:var(--text-main);">${item.username}</span>
                ${channelBadge}
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${bankInfo || '-'}</div>
              ${noteHtml}
            </td>
            <td>${item.name}</td>
            <td style="color:var(--warning); font-weight:700; font-size:13.5px;">฿${Number(item.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            <td>${riskBadgeHtml}</td>
            <td>
              <div class="actions-cell">
                <button type="button" class="btn-action-audit" data-id="${item.id}" data-mid="${item.memberId || ''}" data-user="${item.username}">🔍 เช็คเทิร์น</button>
                <button type="button" class="btn-action-approve" data-id="${item.id}" data-user="${item.username}" data-name="${item.name}" data-amt="${item.amount}" data-bank="${bankInfo}" data-risk="${rf?.level || 'normal'}" data-riskmsg="${rf?.summary || ''}">✓ อนุมัติ</button>
                <button type="button" class="btn-action-reject" data-id="${item.id}" data-user="${item.username}" data-amt="${item.amount}">✕ ปฏิเสธ</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tbodyPending.querySelectorAll('.btn-action-audit').forEach(btn => {
        btn.addEventListener('click', () => {
          openAuditModal(btn.dataset.mid, btn.dataset.user, btn.dataset.id);
        });
      });

      tbodyPending.querySelectorAll('.btn-action-approve').forEach(btn => {
        btn.addEventListener('click', () => {
          openApproveModal({
            id: btn.dataset.id,
            username: btn.dataset.user,
            name: btn.dataset.name,
            amount: Number(btn.dataset.amt || 0),
            bank: btn.dataset.bank,
            riskLevel: btn.dataset.risk,
            riskSummary: btn.dataset.riskmsg
          });
        });
      });

      tbodyPending.querySelectorAll('.btn-action-reject').forEach(btn => {
        btn.addEventListener('click', () => {
          openRejectModal({
            id: btn.dataset.id,
            username: btn.dataset.user,
            amount: Number(btn.dataset.amt || 0)
          });
        });
      });
    }
  }

  if (crsSig !== lastCrsItemsSig) {
    lastCrsItemsSig = crsSig;
    const tbodyCrs = document.querySelector('#tableCrsWithdraw tbody');
    if (!crsItems.length) {
      tbodyCrs.innerHTML = '<tr><td colspan="5" class="empty-state">ไม่มีรายการที่กำลังส่งต่อ CRS</td></tr>';
    } else {
      tbodyCrs.innerHTML = crsItems.map(item => {
        const isPaygateSent = item.rawStatus === 'PAYGATE_SENT' || item.rawStatus === 'PAYGATE_UNKNOWN';
        const statusBadge = isPaygateSent
          ? '<span class="badge-status pending" style="background:#e0e7ff; color:#3730a3;">⏳ รอเปเม้นจ่ายเงิน</span>'
          : '<span class="badge-status success">ส่งต่อ CRS แล้ว</span>';
        const isWalletCrs = item.isWallet || /TRUE|WALLET/i.test(item.bankCode || '') || (item.bankCode === 'TRUEMONEY' || item.bankCode === 'TRUEWALLET');
        const channelBadgeCrs = isWalletCrs
          ? '<span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:700; color:#ea580c; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.3); padding:1px 5px; border-radius:4px;">🟠 Wallet</span>'
          : `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:700; color:#3b82f6; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); padding:1px 5px; border-radius:4px;">🏦 ${item.bankCode || 'Bank'}</span>`;

        return `
          <tr>
            <td><strong>#${item.id}</strong></td>
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <span>${item.username}</span>
                ${channelBadgeCrs}
              </div>
            </td>
            <td>${item.name}</td>
            <td style="color:var(--success); font-weight:700;">฿${Number(item.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

let lastObserverHistorySig = '';

function renderObserverHistory(history) {
  const topHistory = (history || []).slice(0, 30);
  const sig = topHistory.map(h => `${h.at}|${h.detail}`).join(';');
  if (sig === lastObserverHistorySig) return;
  lastObserverHistorySig = sig;

  const tbody = document.querySelector('#tableObserverHistory tbody');
  if (!topHistory.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">กำลังรอเหตุการณ์ใหม่จาก Server...</td></tr>';
  } else {
    tbody.innerHTML = topHistory.map(h => {
      const timeStr = new Date(h.at).toLocaleTimeString('th-TH');
      return `
        <tr>
          <td>${timeStr}</td>
          <td><span class="badge-status pending">${h.category || '-'}</span></td>
          <td>${h.detail || h.endpointId || '-'}</td>
          <td>${h.source || '-'}</td>
        </tr>
      `;
    }).join('');
  }
}

// ==========================================
// 1.8 SWIFTPAY GATEWAY DASHBOARD & PORTAL
// ==========================================
let lastSwiftPaySync = 0;
let isSwiftPayLoading = false;

async function loadSwiftPayData(force = false) {
  if (isSwiftPayLoading && !force) return;
  const refreshBtn = document.getElementById('btnRefreshSwiftPay');
  const refreshIcon = document.getElementById('spRefreshIcon');

  if (refreshIcon) {
    refreshIcon.style.display = 'inline-block';
    refreshIcon.style.animation = 'spin 0.8s linear infinite';
  }
  if (refreshBtn) refreshBtn.disabled = true;

  isSwiftPayLoading = true;
  try {
    // 1. SwiftPay Merchant Portal Wallet Balance (from local store)
    let portalBal = null;
    try {
      portalBal = await window.nkAPI.getStore('swiftpayPortalBalance', {
        total: 35801.54,
        available: 35801.54,
        pending: 0,
        held: 0,
        merchantName: 'SP09 - jga88'
      });
    } catch (e) {}

    const availAmt = Number(portalBal?.available ?? portalBal?.total ?? 35801.54);
    const totalAmt = Number(portalBal?.total ?? portalBal?.available ?? 35801.54);
    const pendingAmt = Number(portalBal?.pending || 0);
    const heldAmt = Number(portalBal?.held || 0);
    const merchantName = portalBal?.merchantName || 'SP09 - jga88';

    // Top Stat Card (Wallet Balance)
    const dashAmountEl = document.getElementById('dashSwiftPayAmount');
    const dashCountEl = document.getElementById('dashSwiftPayCount');
    const dashStatusEl = document.getElementById('dashSwiftPayStatusBadge');

    if (dashAmountEl) {
      dashAmountEl.textContent = `฿${availAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (dashCountEl) {
      dashCountEl.textContent = `ยอดรวม: ฿${totalAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (dashStatusEl) {
      dashStatusEl.className = 'badge-status-pill success';
      dashStatusEl.textContent = `● พอร์ทัล ${merchantName.split(' ')[0] || 'SP09'}`;
    }

    // Detail Panel (Wallet 4-Box Grid)
    const spMerchantLabel = document.getElementById('spMerchantLabel');
    if (spMerchantLabel) spMerchantLabel.textContent = merchantName;

    const spPortalLastSync = document.getElementById('spPortalLastSync');
    if (spPortalLastSync) {
      if (portalBal?.updatedAt) {
        const dt = new Date(portalBal.updatedAt);
        const pad = n => String(n).padStart(2, '0');
        spPortalLastSync.textContent = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())} น.`;
      } else {
        spPortalLastSync.textContent = 'เรียลไทม์';
      }
    }

    const spAvailBalance = document.getElementById('spAvailBalance');
    if (spAvailBalance) {
      spAvailBalance.textContent = `฿${availAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const spTotalBalance = document.getElementById('spTotalBalance');
    if (spTotalBalance) {
      spTotalBalance.textContent = `฿${totalAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const spPendingBalance = document.getElementById('spPendingBalance');
    if (spPendingBalance) {
      spPendingBalance.textContent = `฿${pendingAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const spHeldBalance = document.getElementById('spHeldBalance');
    if (spHeldBalance) {
      spHeldBalance.textContent = `฿${heldAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 2. Fetch BackOffice Webhook Summary
    const res = await window.nkAPI.getSwiftPaySummary();
    if (!res || !res.ok) {
      console.warn('SwiftPay summary fetch failed:', res?.error);
      return;
    }

    const { stats, config, recentTransactions } = res;
    const boDailyAmount = Number(stats?.amount || 0);
    const boDailyCount = Number(stats?.count || 0);

    // Detail Widget Metadata
    const spStatusBadge = document.getElementById('spStatusBadge');
    if (spStatusBadge) {
      if (!config?.enable) {
        spStatusBadge.className = 'badge-status danger';
        spStatusBadge.textContent = '● ปิดใช้งานในระบบ';
      } else if (config?.isMaintenance) {
        spStatusBadge.className = 'badge-status warning';
        spStatusBadge.textContent = `● ช่วงปิดปรับปรุง (${config.maintenanceStart} - ${config.maintenanceEnd})`;
      } else {
        spStatusBadge.className = 'badge-status success';
        spStatusBadge.textContent = '● เปิดใช้งานปกติ';
      }
    }

    const spLastUpdated = document.getElementById('spLastUpdated');
    if (spLastUpdated) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      spLastUpdated.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} น.`;
    }

    const spChannels = document.getElementById('spChannels');
    if (spChannels) {
      const chs = (config?.channels || []).map(c => {
        if (c === 'PROMPTPAY') return '📱 PromptPay';
        if (c === 'BANK_CARD') return '💳 Bank Card (เศษสตางค์)';
        return c;
      });
      spChannels.textContent = chs.length ? chs.join(', ') : 'PromptPay, Bank Card';
    }

    const spLimits = document.getElementById('spLimits');
    if (spLimits) {
      const min = Number(config?.minDeposit || 200).toLocaleString('th-TH');
      const max = Number(config?.maxDeposit || 50000).toLocaleString('th-TH');
      spLimits.textContent = `฿${min} - ฿${max} / บิล`;
    }

    const spMaintenance = document.getElementById('spMaintenance');
    if (spMaintenance) {
      spMaintenance.textContent = `${config?.maintenanceStart || '22:30'} - ${config?.maintenanceEnd || '02:30'} น.`;
    }

    const spDailyTotal = document.getElementById('spDailyTotal');
    if (spDailyTotal) {
      spDailyTotal.textContent = `฿${boDailyAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${boDailyCount.toLocaleString('th-TH')} รายการ)`;
    }

    // 3. Transactions Table
    const tbody = document.getElementById('swiftPayTableBody');
    const countLabel = document.getElementById('spTxCountLabel');
    if (countLabel) {
      countLabel.textContent = recentTransactions?.length ? `${recentTransactions.length} รายการล่าสุด` : '0 รายการ';
    }

    if (tbody) {
      if (!recentTransactions || !recentTransactions.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:24px;">ไม่พบประวัติรายการฝาก SwiftPay ในวันนี้</td></tr>';
      } else {
        tbody.innerHTML = recentTransactions.map(tx => {
          let timeFormatted = '-';
          if (tx.createdAt) {
            const dt = new Date(tx.createdAt);
            if (!isNaN(dt.getTime())) {
              const pad = n => String(n).padStart(2, '0');
              timeFormatted = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())} น.`;
            }
          }

          let channelBadge = '<span class="badge-status-pill warning">QR</span>';
          if (tx.channelCode === 'PROMPTPAY') {
            channelBadge = '<span class="badge-status-pill success" style="font-size:10.5px;">📱 PromptPay</span>';
          } else if (tx.channelCode === 'BANK_CARD') {
            channelBadge = '<span class="badge-status-pill warning" style="font-size:10.5px;">💳 Bank Card</span>';
          }

          let statusBadge = '<span class="badge-status-pill success">✓ สำเร็จ</span>';
          const st = String(tx.status || '').toLowerCase();
          if (st === 'rejected' || st === 'cancelled' || st === 'failed') {
            statusBadge = '<span class="badge-status-pill danger">✕ ยกเลิก</span>';
          } else if (st === 'pending' || st === 'waiting') {
            statusBadge = '<span class="badge-status-pill warning">⏳ รอยืนยัน</span>';
          }

          const receiverParts = [];
          if (tx.receiverBank && tx.receiverBank !== '-') receiverParts.push(tx.receiverBank);
          if (tx.receiverAccount && tx.receiverAccount !== '-') receiverParts.push(tx.receiverAccount);
          if (tx.receiverName && tx.receiverName !== '-') receiverParts.push(`(${tx.receiverName})`);
          const receiverText = receiverParts.length ? receiverParts.join(' ') : '-';

          const amtStr = `฿${Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          return `
            <tr>
              <td style="font-size:12px; color:var(--text-muted);">${timeFormatted}</td>
              <td style="font-family:monospace; font-size:11.5px; color:var(--text-main);">
                <div>${tx.orderNumber || '-'}</div>
                ${tx.systemOrderNumber && tx.systemOrderNumber !== '-' ? `<div style="font-size:10px; color:var(--text-dim);">${tx.systemOrderNumber}</div>` : ''}
              </td>
              <td>${channelBadge}</td>
              <td style="font-weight:700; color:#38bdf8; font-size:12.5px;">${amtStr}</td>
              <td style="font-size:11.5px; color:var(--text-muted); max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${receiverText}">
                ${receiverText}
              </td>
              <td style="text-align:center;">${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error in loadSwiftPayData:', err);
  } finally {
    isSwiftPayLoading = false;
    if (refreshBtn) refreshBtn.disabled = false;
    if (refreshIcon) {
      refreshIcon.style.animation = '';
    }
  }
}

const btnRefreshSwiftPay = document.getElementById('btnRefreshSwiftPay');
if (btnRefreshSwiftPay) {
  btnRefreshSwiftPay.addEventListener('click', () => loadSwiftPayData(true));
}

// ------------------------------------------
// SwiftPay Manual Balance Edit Modal
// ------------------------------------------
const btnEditSpBalance = document.getElementById('btnEditSpBalance');
if (btnEditSpBalance) {
  btnEditSpBalance.addEventListener('click', async () => {
    let portalBal = null;
    try {
      portalBal = await window.nkAPI.getStore('swiftpayPortalBalance', {
        total: 35801.54,
        available: 35801.54,
        pending: 0,
        held: 0,
        merchantName: 'SP09 - jga88'
      });
    } catch (e) {}

    const inAvail = document.getElementById('inputSpAvail');
    const inTotal = document.getElementById('inputSpTotal');
    const inPending = document.getElementById('inputSpPending');
    const inHeld = document.getElementById('inputSpHeld');
    const inMerchant = document.getElementById('inputSpMerchant');

    if (inAvail) inAvail.value = portalBal?.available ?? 35801.54;
    if (inTotal) inTotal.value = portalBal?.total ?? 35801.54;
    if (inPending) inPending.value = portalBal?.pending ?? 0;
    if (inHeld) inHeld.value = portalBal?.held ?? 0;
    if (inMerchant) inMerchant.value = portalBal?.merchantName ?? 'SP09 - jga88';

    window.openModal('modalSetSwiftPayBalance');
  });
}

const btnSaveSpBalanceManual = document.getElementById('btnSaveSpBalanceManual');
if (btnSaveSpBalanceManual) {
  btnSaveSpBalanceManual.addEventListener('click', async () => {
    const avail = parseFloat(document.getElementById('inputSpAvail')?.value) || 0;
    const total = parseFloat(document.getElementById('inputSpTotal')?.value) || avail;
    const pending = parseFloat(document.getElementById('inputSpPending')?.value) || 0;
    const held = parseFloat(document.getElementById('inputSpHeld')?.value) || 0;
    const merchant = document.getElementById('inputSpMerchant')?.value?.trim() || 'SP09 - jga88';

    const newBalance = {
      ok: true,
      available: avail,
      total: total,
      pending: pending,
      held: held,
      merchantName: merchant,
      updatedAt: Date.now()
    };

    await window.nkAPI.setStore('swiftpayPortalBalance', newBalance);
    window.closeModal('modalSetSwiftPayBalance');
    await loadSwiftPayData(true);
    showToast({
      type: 'success',
      badge: 'SwiftPay',
      title: 'บันทึกยอดเงินกระเป๋าสำเร็จ',
      detail: `ยอดที่ใช้ได้: ฿${avail.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${merchant})`,
      badgeColor: '#38bdf8'
    });
  });
}

// ------------------------------------------
// SwiftPay Portal Webview & Auto-Scraper
// ------------------------------------------
const spWebview = document.getElementById('spWebview');
const txtSpWebUrl = document.getElementById('txtSpWebUrl');
const btnSpWebGo = document.getElementById('btnSpWebGo');
const btnSpWebBack = document.getElementById('btnSpWebBack');
const btnSpWebForward = document.getElementById('btnSpWebForward');
const btnSpWebReload = document.getElementById('btnSpWebReload');
const btnSpSyncBalance = document.getElementById('btnSpSyncBalance');
const btnToggleSpFullscreen = document.getElementById('btnToggleSpFullscreen');

if (btnSpWebBack && spWebview) {
  btnSpWebBack.addEventListener('click', () => {
    if (spWebview.canGoBack()) spWebview.goBack();
  });
}

if (btnSpWebForward && spWebview) {
  btnSpWebForward.addEventListener('click', () => {
    if (spWebview.canGoForward()) spWebview.goForward();
  });
}

if (btnSpWebReload && spWebview) {
  btnSpWebReload.addEventListener('click', () => {
    spWebview.reload();
  });
}

if (btnSpWebGo && spWebview && txtSpWebUrl) {
  const navigateSp = () => {
    let url = txtSpWebUrl.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      txtSpWebUrl.value = url;
    }
    spWebview.src = url;
    window.nkAPI.setStore('swiftpayPortalUrl', url);
  };
  btnSpWebGo.addEventListener('click', navigateSp);
  txtSpWebUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateSp();
  });
}

if (btnToggleSpFullscreen) {
  btnToggleSpFullscreen.addEventListener('click', () => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;
    const isFull = mainLayout.classList.toggle('fullscreen-webview');
    btnToggleSpFullscreen.innerHTML = isFull ? '🗗 ย่อหน้าต่าง' : '⛶ ขยายเต็ม';
    btnToggleSpFullscreen.title = isFull ? 'ย่อหน้าต่างกลับเป็นปกติ (Esc)' : 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
  });
}

// ------------------------------------------
// Agent Portal Webview (ag.ismgaming6.com)
// ------------------------------------------
const agWebview = document.getElementById('agWebview');
const txtAgWebUrl = document.getElementById('txtAgWebUrl');
const btnAgWebGo = document.getElementById('btnAgWebGo');
const btnAgWebBack = document.getElementById('btnAgWebBack');
const btnAgWebForward = document.getElementById('btnAgWebForward');
const btnAgWebReload = document.getElementById('btnAgWebReload');
const btnToggleAgFullscreen = document.getElementById('btnToggleAgFullscreen');

if (btnAgWebBack && agWebview) {
  btnAgWebBack.addEventListener('click', () => {
    if (agWebview.canGoBack()) agWebview.goBack();
  });
}

if (btnAgWebForward && agWebview) {
  btnAgWebForward.addEventListener('click', () => {
    if (agWebview.canGoForward()) agWebview.goForward();
  });
}

if (btnAgWebReload && agWebview) {
  btnAgWebReload.addEventListener('click', () => {
    agWebview.reload();
  });
}

if (btnAgWebGo && agWebview && txtAgWebUrl) {
  const navigateAg = () => {
    let url = txtAgWebUrl.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      txtAgWebUrl.value = url;
    }
    agWebview.src = url;
    window.nkAPI.setStore('agentPortalUrl', url);
  };
  btnAgWebGo.addEventListener('click', navigateAg);
  txtAgWebUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateAg();
  });
}

if (btnToggleAgFullscreen) {
  btnToggleAgFullscreen.addEventListener('click', () => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;
    const isFull = mainLayout.classList.toggle('fullscreen-webview');
    btnToggleAgFullscreen.innerHTML = isFull ? '🗗 ย่อหน้าต่าง' : '⛶ ขยายเต็ม';
    btnToggleAgFullscreen.title = isFull ? 'ย่อหน้าต่างกลับเป็นปกติ (Esc)' : 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
  });
}

if (agWebview && txtAgWebUrl) {
  agWebview.addEventListener('did-navigate', (e) => {
    if (e && e.url && !e.url.includes('about:blank')) {
      txtAgWebUrl.value = e.url;
    }
  });
  agWebview.addEventListener('did-navigate-in-page', (e) => {
    if (e && e.url && !e.url.includes('about:blank')) {
      txtAgWebUrl.value = e.url;
    }
  });
}

async function scrapeSwiftPayBalance(manual = false) {
  if (!spWebview) return;
  if (!spWebview.src || spWebview.src.includes('about:blank')) {
    if (manual) {
      showToast({
        type: 'warning',
        badge: 'SwiftPay',
        title: 'ยังไม่ได้เปิดหน้าเว็บพอร์ทัล',
        detail: 'กรุณาใส่ลิงก์เว็บ SwiftPay Portal หรือเปิดเข้าหน้า Dashboard ก่อน',
        badgeColor: '#f59e0b'
      });
    }
    return;
  }

  const scrapeScript = `
    (function() {
      try {
        const text = (document.body ? document.body.innerText : '') + ' ' + (document.body ? document.body.textContent : '');
        if (!text || text.trim().length === 0) return null;

        const findNumber = (patterns) => {
          for (const p of patterns) {
            const m = text.match(p);
            if (m && m[1]) {
              const cleaned = m[1].replace(/,/g, '');
              const num = parseFloat(cleaned);
              if (!isNaN(num)) return num;
            }
          }
          return null;
        };

        // 1. Direct inspection of Workbench DOM spans (WorkbenchHeader.vue)
        let spanTotal = null;
        let spanAvail = null;
        let spanPending = null;
        let spanHeld = null;

        const allSpans = document.querySelectorAll('span, p, div');
        for (const el of allSpans) {
          const st = (el.innerText || el.textContent || '').trim();
          if (!st) continue;
          if (spanTotal === null && /(ยอดเงินรวม|ยอดรวม|Total\\s*Balance)[:\\s]+([0-9,]+\\.?[0-9]*)/i.test(st)) {
            const m = st.match(/(ยอดเงินรวม|ยอดรวม|Total\\s*Balance)[:\\s]+([0-9,]+\\.?[0-9]*)/i);
            if (m && m[2]) spanTotal = parseFloat(m[2].replace(/,/g, ''));
          }
          if (spanAvail === null && /(ยอดเงินที่ใช้ได้|ยอดที่ใช้ได้|Available\\s*Balance)[:\\s]+([0-9,]+\\.?[0-9]*)/i.test(st)) {
            const m = st.match(/(ยอดเงินที่ใช้ได้|ยอดที่ใช้ได้|Available\\s*Balance)[:\\s]+([0-9,]+\\.?[0-9]*)/i);
            if (m && m[2]) spanAvail = parseFloat(m[2].replace(/,/g, ''));
          }
          if (spanPending === null && /(ยอดเงินที่ยังไม่ถึงบัญชี|Pending)[:\\s]+([0-9,]+\\.?[0-9]*)/i.test(st)) {
            const m = st.match(/(ยอดเงินที่ยังไม่ถึงบัญชี|Pending)[:\\s]+([0-9,]+\\.?[0-9]*)/i);
            if (m && m[2]) spanPending = parseFloat(m[2].replace(/,/g, ''));
          }
          if (spanHeld === null && /(ยอดเงินที่ถูกระงับ|Frozen|Held)[:\\s]+([0-9,]+\\.?[0-9]*)/i.test(st)) {
            const m = st.match(/(ยอดเงินที่ถูกระงับ|Frozen|Held)[:\\s]+([0-9,]+\\.?[0-9]*)/i);
            if (m && m[2]) spanHeld = parseFloat(m[2].replace(/,/g, ''));
          }
        }

        // 2. Fallback to global regex matching
        const total = spanTotal !== null ? spanTotal : findNumber([
          /ยอดเงินรวม[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /Total\\s*Balance[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /ยอดรวม[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i
        ]);

        const available = spanAvail !== null ? spanAvail : findNumber([
          /ยอดเงินที่ใช้ได้[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /Available\\s*Balance[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /ยอดที่ใช้ได้[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i
        ]);

        const pending = spanPending !== null ? spanPending : (findNumber([
          /ยอดเงินที่ยังไม่ถึงบัญชี[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /Pending[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i
        ]) || 0);

        const held = spanHeld !== null ? spanHeld : (findNumber([
          /ยอดเงินที่ถูกระงับ[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i,
          /Frozen|Held[:\\s\\n]+([0-9,]+\\.?[0-9]*)/i
        ]) || 0);

        const merchantMatch = text.match(/(SP\\d+\\s*[-–]\\s*[a-zA-Z0-9_-]+)/i) ||
                             text.match(/(SP\\d+)/i);
        const merchantName = merchantMatch ? merchantMatch[1].trim() : '';

        if (total !== null || available !== null) {
          return {
            ok: true,
            total: total !== null ? total : available,
            available: available !== null ? available : total,
            pending: pending,
            held: held,
            merchantName: merchantName || 'SP09 - jga88',
            updatedAt: Date.now()
          };
        }
        return { ok: false, error: 'ไม่พบรูปแบบตัวเลขยอดเงินในหน้าเว็บ' };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    })();
  `;

  try {
    const res = await spWebview.executeJavaScript(scrapeScript);
    if (res && res.ok) {
      await window.nkAPI.setStore('swiftpayPortalBalance', res);
      await loadSwiftPayData(true);
      if (manual) {
        showToast({
          type: 'success',
          badge: 'SwiftPay',
          title: 'ดึงยอดเงินสำเร็จ!',
          detail: `ยอดที่ใช้ได้: ฿${Number(res.available).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${res.merchantName})`,
          badgeColor: '#10b981'
        });
      }
    } else if (manual) {
      showToast({
        type: 'warning',
        badge: 'SwiftPay',
        title: 'ตรวจไม่พบยอดเงินในหน้านี้',
        detail: 'โปรดเข้าสู่ระบบและเปิดหน้า "โต๊ะทำงาน" หรือ "Dashboard" ของ SwiftPay แล้วลองอีกครั้ง',
        badgeColor: '#f59e0b'
      });
    }
  } catch (err) {
    if (manual) {
      showToast({
        type: 'warning',
        badge: 'SwiftPay',
        title: 'เกิดข้อผิดพลาดในการอ่านหน้าเว็บ',
        detail: String(err.message || err),
        badgeColor: '#ef4444'
      });
    }
  }
}

if (btnSpSyncBalance) {
  btnSpSyncBalance.addEventListener('click', () => scrapeSwiftPayBalance(true));
}

if (spWebview) {
  spWebview.addEventListener('did-navigate', (e) => {
    if (e.url && !e.url.includes('about:blank')) {
      if (txtSpWebUrl) txtSpWebUrl.value = e.url;
      window.nkAPI.setStore('swiftpayPortalUrl', e.url);
    }
  });
  spWebview.addEventListener('did-navigate-in-page', (e) => {
    if (e.url && !e.url.includes('about:blank')) {
      if (txtSpWebUrl) txtSpWebUrl.value = e.url;
    }
  });
  spWebview.addEventListener('dom-ready', () => {
    if (typeof currentSpZoom !== 'undefined' && currentSpZoom !== 1.0) {
      try { spWebview.setZoomFactor(currentSpZoom); } catch (e) {}
    }
    scrapeSwiftPayBalance(false);
  });
  spWebview.addEventListener('did-finish-load', () => {
    if (typeof currentSpZoom !== 'undefined' && currentSpZoom !== 1.0) {
      try { spWebview.setZoomFactor(currentSpZoom); } catch (e) {}
    }
  });
}

// Master switch event
masterSwitch.addEventListener('change', async () => {
  await window.nkAPI.setStore('masterEnabled', masterSwitch.checked);
});

// Periodic state poller
setInterval(syncAppState, 3000);
syncAppState();

// ==========================================
// 2. WITHDRAW STANDBY CONTROLS (Dual Channel: Bank & TrueMoney)
// ==========================================
document.getElementById('btnWithdrawToggle').addEventListener('click', async () => {
  const store = await window.nkAPI.getAllStore();
  const cfg = store.withdrawConfig || {};
  if (cfg.active) {
    await window.nkAPI.stopWithdraw();
  } else {
    const bankMinAmount = Number(document.getElementById('withdrawBankMinAmount')?.value) || 0;
    const bankMaxAmount = Number(document.getElementById('withdrawBankMaxAmount')?.value) || 5000;
    const bankProvider = document.getElementById('withdrawBankProvider')?.value || 'crs';
    const bankAutoApprove = document.getElementById('withdrawBankAutoToggle')?.checked || false;

    const walletMinAmount = Number(document.getElementById('withdrawWalletMinAmount')?.value) || 0;
    const walletMaxAmount = Number(document.getElementById('withdrawWalletMaxAmount')?.value) || 5000;
    const walletProvider = document.getElementById('withdrawWalletProvider')?.value || 'crs';
    const walletAutoApprove = document.getElementById('withdrawWalletAutoToggle')?.checked || false;

    await window.nkAPI.startWithdraw({
      intervalSec: 5,
      bankMinAmount,
      bankMaxAmount,
      bankProvider,
      bankAutoApprove,
      walletMinAmount,
      walletMaxAmount,
      walletProvider,
      walletAutoApprove
    });
  }
  syncAppState();
});

// Bank settings change
const onBankLimitsChanged = async () => {
  const bankMinAmount = Number(document.getElementById('withdrawBankMinAmount')?.value) || 0;
  const bankMaxAmount = Number(document.getElementById('withdrawBankMaxAmount')?.value) || 5000;
  const bankProvider = document.getElementById('withdrawBankProvider')?.value || 'crs';
  if (window.nkAPI.updateWithdrawConfig) {
    await window.nkAPI.updateWithdrawConfig({ bankMinAmount, bankMaxAmount, bankProvider });
  }
  syncAppState();
};
document.getElementById('withdrawBankMinAmount')?.addEventListener('change', onBankLimitsChanged);
document.getElementById('withdrawBankMaxAmount')?.addEventListener('change', onBankLimitsChanged);
document.getElementById('withdrawBankProvider')?.addEventListener('change', onBankLimitsChanged);

// Bank Auto Approve toggle
document.getElementById('withdrawBankAutoToggle')?.addEventListener('change', async (e) => {
  const minAmount = Number(document.getElementById('withdrawBankMinAmount')?.value) || 0;
  const maxAmount = Number(document.getElementById('withdrawBankMaxAmount')?.value) || 5000;
  const provider = document.getElementById('withdrawBankProvider')?.value || 'crs';
  const res = await window.nkAPI.setWithdrawAutoApprove('bank', e.target.checked, { minAmount, maxAmount, provider });
  if (!res.ok && res.error) {
    await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: res.error, type: 'danger' });
    e.target.checked = false;
  }
  syncAppState();
});

// TrueMoney settings change
const onWalletLimitsChanged = async () => {
  const walletMinAmount = Number(document.getElementById('withdrawWalletMinAmount')?.value) || 0;
  const walletMaxAmount = Number(document.getElementById('withdrawWalletMaxAmount')?.value) || 5000;
  const walletProvider = document.getElementById('withdrawWalletProvider')?.value || 'crs';
  if (window.nkAPI.updateWithdrawConfig) {
    await window.nkAPI.updateWithdrawConfig({ walletMinAmount, walletMaxAmount, walletProvider });
  }
  syncAppState();
};
document.getElementById('withdrawWalletMinAmount')?.addEventListener('change', onWalletLimitsChanged);
document.getElementById('withdrawWalletMaxAmount')?.addEventListener('change', onWalletLimitsChanged);
document.getElementById('withdrawWalletProvider')?.addEventListener('change', onWalletLimitsChanged);

// TrueMoney Auto Approve toggle
document.getElementById('withdrawWalletAutoToggle')?.addEventListener('change', async (e) => {
  const minAmount = Number(document.getElementById('withdrawWalletMinAmount')?.value) || 0;
  const maxAmount = Number(document.getElementById('withdrawWalletMaxAmount')?.value) || 5000;
  const provider = document.getElementById('withdrawWalletProvider')?.value || 'crs';
  const res = await window.nkAPI.setWithdrawAutoApprove('wallet', e.target.checked, { minAmount, maxAmount, provider });
  if (!res.ok && res.error) {
    await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: res.error, type: 'danger' });
    e.target.checked = false;
  }
  syncAppState();
});

document.getElementById('btnWithdrawTick').addEventListener('click', async () => {
  document.getElementById('withdrawStatusText').textContent = 'กำลังตรวจสอบเดี๋ยวนี้...';
  await window.nkAPI.pollWithdrawNow();
  syncAppState();
});

// ==========================================
// 3. MEMBER NOTE
// ==========================================
// 3. UNIFIED MEMBER MANAGEMENT (Note, Reset Password, Points)
// ==========================================
// Search Elements
const formMemberSearch = document.getElementById('formMemberSearch');
const inputMemberSearch = document.getElementById('inputMemberSearch');
const btnClearMemberSearch = document.getElementById('btnClearMemberSearch');
const btnMemberSearchSubmit = document.getElementById('btnMemberSearchSubmit');
const memberSearchIcon = document.getElementById('memberSearchIcon');
const memberSearchText = document.getElementById('memberSearchText');
const btnMemberClearAll = document.getElementById('btnMemberClearAll');

// Reset Password Elements
const formDoReset = document.getElementById('formDoReset');
const inputNewPass = document.getElementById('inputNewPass');
const btnGenRandomPass = document.getElementById('btnGenRandomPass');
const btnSubmitReset = document.getElementById('btnSubmitReset');

// Note Elements
const noteContent = document.getElementById('noteContent');
const btnCopyNote = document.getElementById('btnCopyNote');

// Right Column Profile Elements
const cardMemberProfile = document.getElementById('cardMemberProfile');
const memberProfileStatus = document.getElementById('memberProfileStatus');
const profUsername = document.getElementById('profUsername');
const profName = document.getElementById('profName');
const profPhone = document.getElementById('profPhone');
const profBank = document.getElementById('profBank');
const profReferrer = document.getElementById('profReferrer');
const profMemberId = document.getElementById('profMemberId');

// Right Column Points Elements
const ptsSyncTime = document.getElementById('ptsSyncTime');
const ptsCurrentBalance = document.getElementById('ptsCurrentBalance');
const ptsUserLabel = document.getElementById('ptsUserLabel');
const ptsSpent = document.getElementById('ptsSpent');
const ptsCreditReceived = document.getElementById('ptsCreditReceived');
const ptsTxCount = document.getElementById('ptsTxCount');
const tablePointsHistoryBody = document.querySelector('#tablePointsHistory tbody');

let currentResetMemberId = null;
let currentMemberData = null;
let memberSearchSequence = 0;

// Search Input: show/hide mini clear button
if (inputMemberSearch && btnClearMemberSearch) {
  inputMemberSearch.addEventListener('input', () => {
    btnClearMemberSearch.style.display = inputMemberSearch.value.trim() ? 'block' : 'none';
  });
  btnClearMemberSearch.addEventListener('click', () => {
    inputMemberSearch.value = '';
    btnClearMemberSearch.style.display = 'none';
    inputMemberSearch.focus();
  });
}

// Clear All button
function resetUnifiedMemberView() {
  memberSearchSequence++;
  if (inputMemberSearch) {
    inputMemberSearch.value = '';
    inputMemberSearch.disabled = false;
  }
  if (btnClearMemberSearch) btnClearMemberSearch.style.display = 'none';

  currentResetMemberId = null;
  currentMemberData = null;

  // Reset Profile
  if (memberProfileStatus) memberProfileStatus.style.display = 'none';
  if (profUsername) profUsername.textContent = '-';
  if (profName) profName.textContent = '-';
  if (profPhone) profPhone.textContent = '-';
  if (profBank) profBank.textContent = '-';
  if (profReferrer) profReferrer.textContent = '-';
  if (profMemberId) profMemberId.textContent = '-';

  // Reset Note
  if (noteContent) {
    noteContent.innerHTML = '<span style="color:var(--text-dim); font-size:12px;">ค้นหาสมาชิกเพื่อสร้าง Note อัตโนมัติ</span>';
  }
  if (btnCopyNote) btnCopyNote.disabled = true;

  // Reset Password form
  if (inputNewPass) {
    inputNewPass.value = '';
    inputNewPass.disabled = true;
  }
  if (btnGenRandomPass) btnGenRandomPass.disabled = true;
  if (btnSubmitReset) btnSubmitReset.disabled = true;

  // Reset Points
  if (ptsSyncTime) ptsSyncTime.textContent = '-';
  if (ptsCurrentBalance) ptsCurrentBalance.textContent = '0';
  if (ptsUserLabel) ptsUserLabel.textContent = '-';
  if (ptsSpent) ptsSpent.textContent = '0';
  if (ptsCreditReceived) ptsCreditReceived.textContent = '฿0';
  if (ptsTxCount) ptsTxCount.textContent = '0 รายการ';
  if (tablePointsHistoryBody) {
    tablePointsHistoryBody.innerHTML = '<tr><td colspan="6" class="empty-state">ยังไม่มีข้อมูลประวัติแต้ม (ค้นหาสมาชิกเพื่อดูข้อมูล)</td></tr>';
  }

  try {
    window.nkAPI.clearPointsHistory();
  } catch (e) {}

  setTimeout(() => {
    if (inputMemberSearch) {
      inputMemberSearch.focus();
      inputMemberSearch.select();
    }
  }, 30);
}

if (btnMemberClearAll) {
  btnMemberClearAll.addEventListener('click', (e) => {
    e.preventDefault();
    resetUnifiedMemberView();
  });
}

// Generate Random Password
if (btnGenRandomPass) {
  btnGenRandomPass.addEventListener('click', () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (inputNewPass) {
      inputNewPass.value = pass;
      inputNewPass.focus();
    }
  });
}

// Copy Note to Clipboard
if (btnCopyNote) {
  btnCopyNote.addEventListener('click', () => {
    const text = noteContent ? noteContent.textContent : '';
    if (!text || !text.trim() || text.includes('ค้นหาสมาชิกเพื่อสร้าง Note')) return;
    navigator.clipboard.writeText(text);
    btnCopyNote.textContent = '✓ คัดลอกแล้ว!';
    setTimeout(() => { btnCopyNote.textContent = '📄 คัดลอก Note'; }, 2000);
  });
}

// Submit Search (Unified - Progressive Rendering)
if (formMemberSearch) {
  formMemberSearch.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = inputMemberSearch.value.trim();
    if (!query) return;

    const searchId = ++memberSearchSequence;

    // 0. Update submit button
    if (btnMemberSearchSubmit) btnMemberSearchSubmit.disabled = true;
    if (memberSearchIcon) memberSearchIcon.textContent = '⏳';
    if (memberSearchText) memberSearchText.textContent = 'กำลังดึงรายการ...';

    // 1. Set progressive loading states on all sections
    // Profile Box
    if (memberProfileStatus) {
      memberProfileStatus.style.display = 'inline-block';
      memberProfileStatus.className = 'badge-status pending';
      memberProfileStatus.textContent = '⏳ กำลังดึงรายการ...';
    }
    if (profUsername) profUsername.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';
    if (profName) profName.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';
    if (profPhone) profPhone.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';
    if (profBank) profBank.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';
    if (profReferrer) profReferrer.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';
    if (profMemberId) profMemberId.innerHTML = '<span class="loading-text">กำลังดึงรายการ...</span>';

    // Note Box
    if (noteContent) {
      noteContent.innerHTML = '<div class="loading-text" style="padding:10px 0;"><span style="animation:spin 1s infinite linear; display:inline-block;">⏳</span> <span>กำลังดึงรายการ Note...</span></div>';
    }
    if (btnCopyNote) btnCopyNote.disabled = true;

    // Reset Password form
    if (inputNewPass) {
      inputNewPass.value = '';
      inputNewPass.disabled = true;
    }
    if (btnGenRandomPass) btnGenRandomPass.disabled = true;
    if (btnSubmitReset) btnSubmitReset.disabled = true;

    // Points Box
    let isPointsLoaded = false;
    if (ptsSyncTime) ptsSyncTime.textContent = '⏳ กำลังดึงรายการ...';
    if (ptsCurrentBalance) ptsCurrentBalance.innerHTML = '<span class="loading-text" style="font-size:16px;">กำลังดึงรายการ...</span>';
    if (ptsUserLabel) ptsUserLabel.textContent = 'กำลังดึงรายการแต้มสะสม...';
    if (ptsSpent) ptsSpent.innerHTML = '<span class="loading-text" style="font-size:14px;">กำลังดึงรายการ...</span>';
    if (ptsCreditReceived) ptsCreditReceived.innerHTML = '<span class="loading-text" style="font-size:14px;">กำลังดึงรายการ...</span>';
    if (ptsTxCount) ptsTxCount.textContent = 'กำลังดึงรายการ...';
    if (tablePointsHistoryBody) {
      tablePointsHistoryBody.innerHTML = '<tr><td colspan="6" class="empty-state" style="padding:24px; color:var(--text-muted);"><span class="loading-text">⏳ กำลังดึงรายการประวัติแลกแต้ม...</span></td></tr>';
    }

    // 2. Dispatch Task A: Member Note & Profile (fast, ~300-800ms)
    const taskMemberNote = (async () => {
      try {
        const noteRes = await window.nkAPI.runMemberNote(query);
        if (searchId !== memberSearchSequence) return;

        if (noteRes?.ok && noteRes?.record) {
          const rec = noteRes.record;
          currentMemberData = rec;
          currentResetMemberId = rec.id || null;

          // Render Profile immediately
          if (profUsername) profUsername.textContent = rec.username || '-';
          if (profName) profName.textContent = rec.name || '-';
          if (profPhone) profPhone.textContent = rec.phone || '-';
          if (profBank) {
            profBank.textContent = rec.bankName ? `${rec.bankName} (${rec.account || '-'})` : (rec.account || '-');
          }
          if (profReferrer) profReferrer.textContent = rec.referrer || '-';
          if (profMemberId) profMemberId.textContent = rec.id ? `#${rec.id}` : '-';
          if (memberProfileStatus) {
            memberProfileStatus.style.display = 'inline-block';
            memberProfileStatus.className = 'badge-status success';
            memberProfileStatus.textContent = rec.status === 1 || rec.status === 'active' || !rec.status ? '● ใช้งานปกติ' : `● ${rec.status}`;
          }

          // Render Note immediately
          if (noteContent) {
            noteContent.textContent = noteRes.note || '';
          }
          if (btnCopyNote) btnCopyNote.disabled = false;

          // Unlock Reset Password form immediately
          if (inputNewPass) inputNewPass.disabled = false;
          if (btnGenRandomPass) btnGenRandomPass.disabled = false;
          if (btnSubmitReset) btnSubmitReset.disabled = false;

          // Early Points balance preview if points history is still loading
          if (!isPointsLoaded && Number.isFinite(Number(rec.point))) {
            if (ptsCurrentBalance) ptsCurrentBalance.textContent = Number(rec.point).toLocaleString('th-TH');
            if (ptsUserLabel) {
              const nameStr = rec.name || '';
              ptsUserLabel.textContent = nameStr ? `${rec.username} (${nameStr})` : (rec.username || '-');
            }
          }
        } else {
          const errMsg = noteRes?.message || 'ไม่พบข้อมูลสมาชิก';
          if (memberProfileStatus) {
            memberProfileStatus.style.display = 'inline-block';
            memberProfileStatus.className = 'badge-status danger';
            memberProfileStatus.textContent = '❌ ไม่พบข้อมูล';
          }
          if (profUsername) profUsername.textContent = '-';
          if (profName) profName.textContent = '-';
          if (profPhone) profPhone.textContent = '-';
          if (profBank) profBank.textContent = '-';
          if (profReferrer) profReferrer.textContent = '-';
          if (profMemberId) profMemberId.textContent = '-';
          if (noteContent) {
            noteContent.innerHTML = `<span style="color:#ef4444; font-size:12px;">❌ ${errMsg}</span>`;
          }
          if (btnCopyNote) btnCopyNote.disabled = true;
        }
      } catch (err) {
        if (searchId !== memberSearchSequence) return;
        const errMsg = err?.message || String(err);
        if (memberProfileStatus) {
          memberProfileStatus.style.display = 'inline-block';
          memberProfileStatus.className = 'badge-status danger';
          memberProfileStatus.textContent = '❌ ข้อผิดพลาด';
        }
        if (profUsername) profUsername.textContent = '-';
        if (profName) profName.textContent = '-';
        if (profPhone) profPhone.textContent = '-';
        if (profBank) profBank.textContent = '-';
        if (profReferrer) profReferrer.textContent = '-';
        if (profMemberId) profMemberId.textContent = '-';
        if (noteContent) {
          noteContent.innerHTML = `<span style="color:#ef4444; font-size:12px;">❌ ${errMsg}</span>`;
        }
        if (btnCopyNote) btnCopyNote.disabled = true;
      }
    })();

    // 3. Dispatch Task B: Points History (may take several seconds due to pagination)
    const taskPointsHistory = (async () => {
      try {
        const ptsRes = await window.nkAPI.runPointsHistory(query);
        if (searchId !== memberSearchSequence) return;
        isPointsLoaded = true;

        if (ptsRes?.ok) {
          const pts = ptsRes;
          const now = new Date();
          const pad = n => String(n).padStart(2, '0');

          if (ptsSyncTime) {
            ptsSyncTime.textContent = `อัปเดต ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} น.`;
          }
          if (ptsCurrentBalance) {
            ptsCurrentBalance.textContent = Number(pts.summary?.currentPoints || 0).toLocaleString('th-TH');
          }
          if (ptsUserLabel) {
            const userStr = pts.member?.username || currentMemberData?.username || '-';
            const nameStr = pts.member?.name || currentMemberData?.name || '';
            ptsUserLabel.textContent = nameStr ? `${userStr} (${nameStr})` : userStr;
          }
          if (ptsSpent) {
            ptsSpent.textContent = Number(pts.summary?.approvedPointsSpent || 0).toLocaleString('th-TH');
          }
          if (ptsCreditReceived) {
            ptsCreditReceived.textContent = `฿${Number(pts.summary?.approvedCreditReceived || 0).toLocaleString('th-TH')}`;
          }

          if (tablePointsHistoryBody) {
            if (!pts.records?.length) {
              tablePointsHistoryBody.innerHTML = '<tr><td colspan="6" class="empty-state">ไม่พบประวัติการแลกแต้มของสมาชิกนี้</td></tr>';
              if (ptsTxCount) ptsTxCount.textContent = '0 รายการ';
            } else {
              if (ptsTxCount) ptsTxCount.textContent = `${pts.records.length} รายการ`;
              tablePointsHistoryBody.innerHTML = pts.records.map(r => `
                <tr>
                  <td>${r.createdAt}</td>
                  <td><strong>${r.rewardName}</strong></td>
                  <td style="color:var(--accent); font-weight:700;">${Number(r.pointsUsed || 0).toLocaleString('th-TH')}</td>
                  <td style="color:var(--success); font-weight:700;">฿${Number(r.creditAmount || 0).toLocaleString('th-TH')}</td>
                  <td>${r.approvedBy || '-'}</td>
                  <td style="text-align:center;"><span class="badge-status ${r.approved ? 'success' : 'pending'}">${r.status}</span></td>
                </tr>
              `).join('');
            }
          }
        } else {
          fallbackPoints();
        }
      } catch (err) {
        if (searchId !== memberSearchSequence) return;
        isPointsLoaded = true;
        fallbackPoints();
      }
    })();

    function fallbackPoints() {
      if (ptsSyncTime) ptsSyncTime.textContent = 'ไม่มีข้อมูลประวัติแต้ม';
      if (currentMemberData && Number.isFinite(Number(currentMemberData.point))) {
        if (ptsCurrentBalance) ptsCurrentBalance.textContent = Number(currentMemberData.point).toLocaleString('th-TH');
        if (ptsUserLabel) ptsUserLabel.textContent = `${currentMemberData.username} (${currentMemberData.name})`;
      } else {
        if (ptsCurrentBalance) ptsCurrentBalance.textContent = '0';
      }
      if (ptsSpent) ptsSpent.textContent = '0';
      if (ptsCreditReceived) ptsCreditReceived.textContent = '฿0';
      if (ptsTxCount) ptsTxCount.textContent = '0 รายการ';
      if (tablePointsHistoryBody) {
        tablePointsHistoryBody.innerHTML = '<tr><td colspan="6" class="empty-state">ไม่พบข้อมูลประวัติแต้มสำหรับสมาชิกนี้</td></tr>';
      }
    }

    try {
      await Promise.allSettled([taskMemberNote, taskPointsHistory]);
    } finally {
      if (searchId === memberSearchSequence) {
        if (btnMemberSearchSubmit) btnMemberSearchSubmit.disabled = false;
        if (memberSearchIcon) memberSearchIcon.textContent = '🔍';
        if (memberSearchText) memberSearchText.textContent = 'ค้นหาข้อมูล';
      }
    }
  });
}

// Do Reset Password Form Submit
if (formDoReset) {
  formDoReset.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentResetMemberId) {
      await window.showAlertDialog({ title: 'แจ้งเตือน', message: 'กรุณาค้นหาสมาชิกก่อนทำการเปลี่ยนรหัสผ่าน', type: 'warning' });
      return;
    }

    const p1 = (inputNewPass ? inputNewPass.value : '').trim();
    if (!p1) {
      await window.showAlertDialog({ title: 'แจ้งเตือน', message: 'กรุณากรอกรหัสผ่านใหม่', type: 'warning' });
      return;
    }

    const targetName = (currentMemberData?.name || (profName ? profName.textContent : '') || '').trim();
    const targetUser = (currentMemberData?.username || (profUsername ? profUsername.textContent : '') || '').trim();

    const ok = await window.showConfirmDialog({
      title: 'ยืนยันการเปลี่ยนรหัสผ่าน',
      message: `ยืนยันการเปลี่ยนรหัสผ่านของสมาชิก:\n${targetName} (${targetUser})\n\nรหัสผ่านใหม่: "${p1}"\n\nต้องการดำเนินการต่อหรือไม่?`,
      confirmText: 'ยืนยันเปลี่ยนรหัส',
      cancelText: 'ยกเลิก',
      type: 'warning',
      icon: '🔒'
    });
    if (!ok) {
      return;
    }

    if (btnSubmitReset) {
      btnSubmitReset.disabled = true;
      btnSubmitReset.textContent = '⏳ กำลังบันทึก...';
    }

    try {
      const res = await window.nkAPI.resetMemberPassword({
        memberId: currentResetMemberId,
        password: p1
      });
      await window.showAlertDialog({ title: 'สำเร็จ', message: res.message || 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อย', type: 'success' });
      if (inputNewPass) inputNewPass.value = '';
    } catch (err) {
      await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + err.message, type: 'danger' });
    } finally {
      if (btnSubmitReset) {
        btnSubmitReset.disabled = false;
        btnSubmitReset.textContent = '🔒 ยืนยันเปลี่ยนรหัสผ่าน';
      }
    }
  });
}

// ==========================================
// 6. REPORTS & EXCEL EXPORTS (สรุปยอดก่อนส่งออก)
// ==========================================
(() => {
  const today = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const yyyy = today.getFullYear();
  const mm = pad2(today.getMonth() + 1);
  const dd = pad2(today.getDate());
  const startVal = `${yyyy}-${mm}-01`;
  const endVal = `${yyyy}-${mm}-${dd}`;

  const elDepStart = document.getElementById('repDepositStart');
  const elDepEnd = document.getElementById('repDepositEnd');
  const elRecStart = document.getElementById('repReconcileStart');
  const elRecEnd = document.getElementById('repReconcileEnd');

  if (elDepStart && !elDepStart.value) elDepStart.value = startVal;
  if (elDepEnd && !elDepEnd.value) elDepEnd.value = endVal;
  if (elRecStart && !elRecStart.value) elRecStart.value = startVal;
  if (elRecEnd && !elRecEnd.value) elRecEnd.value = endVal;
})();

// --- 1. รายงานฝาก (เมนู 3.1) ---
const btnFetchDepositReport = document.getElementById('btnFetchDepositReport') || document.getElementById('btnRunDepositReport');
if (btnFetchDepositReport) {
  btnFetchDepositReport.addEventListener('click', async () => {
    const startDate = document.getElementById('repDepositStart')?.value || '';
    const endDate = document.getElementById('repDepositEnd')?.value || '';
    const pageSize = document.getElementById('repDepositPageSize')?.value || 200;
    const statusEl = document.getElementById('statusDepositReport');
    const container = document.getElementById('containerDepositSummary');

    if (statusEl) statusEl.textContent = '⏳ กำลังดึงข้อมูลจาก API และคำนวณสรุปยอด...';
    btnFetchDepositReport.disabled = true;

    try {
      const res = await window.nkAPI.fetchDepositReport({ startDate, endDate, pageSize });
      if (res && res.ok && res.summary) {
        const s = res.summary;
        const sumDepositAmount = document.getElementById('sumDepositAmount');
        const sumDepositSuccessCount = document.getElementById('sumDepositSuccessCount');
        const sumDepositTotalRows = document.getElementById('sumDepositTotalRows');
        const sumDepositOtherCount = document.getElementById('sumDepositOtherCount');
        const depositBankBreakdown = document.getElementById('depositBankBreakdown');

        if (sumDepositAmount) {
          sumDepositAmount.textContent = '฿' + (s.totalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (sumDepositSuccessCount) {
          sumDepositSuccessCount.textContent = `สำเร็จ ${(s.successCount || 0).toLocaleString('th-TH')} รายการ (฿${(s.successAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        }
        if (sumDepositTotalRows) {
          sumDepositTotalRows.textContent = `${(s.totalRows || 0).toLocaleString('th-TH')} รายการ`;
        }
        if (sumDepositOtherCount) {
          sumDepositOtherCount.textContent = `อื่นๆ/รอดำเนินการ ${(s.otherCount || 0).toLocaleString('th-TH')} รายการ`;
        }

        if (depositBankBreakdown && s.byBank) {
          const banks = Object.entries(s.byBank).sort((a, b) => b[1].amount - a[1].amount);
          if (banks.length > 0) {
            depositBankBreakdown.innerHTML = '<span style="font-weight:600; margin-right:4px;">แยกตามธนาคาร:</span>' +
              banks.map(([bName, data]) =>
                `<span style="background:rgba(255,255,255,0.06); padding:3px 8px; border-radius:6px; border:1px solid var(--border-subtle);">${bName}: <b>฿${data.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</b> (${data.count.toLocaleString('th-TH')})</span>`
              ).join(' ');
          } else {
            depositBankBreakdown.innerHTML = '';
          }
        }

        if (container) container.style.display = 'block';
        if (statusEl) statusEl.textContent = `✅ ดึงสรุปยอดสำเร็จ ${s.totalRows.toLocaleString('th-TH')} รายการ`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '❌ ล้มเหลว: ' + (err?.message || err);
    } finally {
      btnFetchDepositReport.disabled = false;
    }
  });
}

// ปุ่มล้างค่ารายงานฝาก 3.1
const btnDepositClear = document.getElementById('btnDepositClear');
if (btnDepositClear) {
  btnDepositClear.addEventListener('click', () => {
    const today = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const yyyy = today.getFullYear();
    const mm = pad2(today.getMonth() + 1);
    const dd = pad2(today.getDate());
    const elDepStart = document.getElementById('repDepositStart');
    const elDepEnd = document.getElementById('repDepositEnd');
    const elPageSize = document.getElementById('repDepositPageSize');
    if (elDepStart) elDepStart.value = `${yyyy}-${mm}-01`;
    if (elDepEnd) elDepEnd.value = `${yyyy}-${mm}-${dd}`;
    if (elPageSize) elPageSize.value = '200';

    const statusEl = document.getElementById('statusDepositReport');
    if (statusEl) statusEl.textContent = '';

    const container = document.getElementById('containerDepositSummary');
    if (container) container.style.display = 'none';

    const sumDepositAmount = document.getElementById('sumDepositAmount');
    const sumDepositSuccessCount = document.getElementById('sumDepositSuccessCount');
    const sumDepositTotalRows = document.getElementById('sumDepositTotalRows');
    const sumDepositOtherCount = document.getElementById('sumDepositOtherCount');
    const depositBankBreakdown = document.getElementById('depositBankBreakdown');
    const statusExport = document.getElementById('statusExportDeposit');

    if (sumDepositAmount) sumDepositAmount.textContent = '฿0.00';
    if (sumDepositSuccessCount) sumDepositSuccessCount.textContent = 'สำเร็จ 0 รายการ';
    if (sumDepositTotalRows) sumDepositTotalRows.textContent = '0 รายการ';
    if (sumDepositOtherCount) sumDepositOtherCount.textContent = 'อื่นๆ/รอ 0 รายการ';
    if (depositBankBreakdown) depositBankBreakdown.innerHTML = '';
    if (statusExport) statusExport.textContent = 'พร้อมส่งออกข้อมูลที่ดึงไว้';
    updateDepositQuickDateUi();
  });
}

// ปุ่มกรอง วันนี้ / เมื่อวาน สำหรับรายงานฝาก (เมนู 3.1)
const btnDepositToday = document.getElementById('btnDepositToday');
const btnDepositYesterday = document.getElementById('btnDepositYesterday');

function updateDepositQuickDateUi() {
  const start = document.getElementById('repDepositStart')?.value;
  const end = document.getElementById('repDepositEnd')?.value;
  const today = todayDateString();
  const yesterday = yesterdayDateString();
  if (btnDepositToday && btnDepositYesterday) {
    if (start === today && end === today) {
      btnDepositToday.style.borderColor = 'var(--accent)';
      btnDepositToday.style.color = 'var(--accent)';
      btnDepositToday.style.background = 'rgba(245, 158, 11, 0.12)';
      btnDepositYesterday.style.borderColor = '';
      btnDepositYesterday.style.color = '';
      btnDepositYesterday.style.background = '';
    } else if (start === yesterday && end === yesterday) {
      btnDepositYesterday.style.borderColor = 'var(--accent)';
      btnDepositYesterday.style.color = 'var(--accent)';
      btnDepositYesterday.style.background = 'rgba(245, 158, 11, 0.12)';
      btnDepositToday.style.borderColor = '';
      btnDepositToday.style.color = '';
      btnDepositToday.style.background = '';
    } else {
      btnDepositToday.style.borderColor = '';
      btnDepositToday.style.color = '';
      btnDepositToday.style.background = '';
      btnDepositYesterday.style.borderColor = '';
      btnDepositYesterday.style.color = '';
      btnDepositYesterday.style.background = '';
    }
  }
}

if (btnDepositToday) {
  btnDepositToday.addEventListener('click', () => {
    const today = todayDateString();
    const elStart = document.getElementById('repDepositStart');
    const elEnd = document.getElementById('repDepositEnd');
    if (elStart) elStart.value = today;
    if (elEnd) elEnd.value = today;
    updateDepositQuickDateUi();
    const btnFetch = document.getElementById('btnFetchDepositReport');
    if (btnFetch && !btnFetch.disabled) btnFetch.click();
  });
}

if (btnDepositYesterday) {
  btnDepositYesterday.addEventListener('click', () => {
    const yest = yesterdayDateString();
    const elStart = document.getElementById('repDepositStart');
    const elEnd = document.getElementById('repDepositEnd');
    if (elStart) elStart.value = yest;
    if (elEnd) elEnd.value = yest;
    updateDepositQuickDateUi();
    const btnFetch = document.getElementById('btnFetchDepositReport');
    if (btnFetch && !btnFetch.disabled) btnFetch.click();
  });
}

document.getElementById('repDepositStart')?.addEventListener('change', updateDepositQuickDateUi);
document.getElementById('repDepositEnd')?.addEventListener('change', updateDepositQuickDateUi);
document.getElementById('repDepositStart')?.addEventListener('input', updateDepositQuickDateUi);
document.getElementById('repDepositEnd')?.addEventListener('input', updateDepositQuickDateUi);
updateDepositQuickDateUi();

// ปุ่มส่งออก Excel รายงานฝาก 3.1
const btnExportDepositExcel = document.getElementById('btnExportDepositExcel');
if (btnExportDepositExcel) {
  btnExportDepositExcel.addEventListener('click', async () => {
    const startDate = document.getElementById('repDepositStart')?.value || '';
    const endDate = document.getElementById('repDepositEnd')?.value || '';
    const pageSize = document.getElementById('repDepositPageSize')?.value || 200;
    const statusExport = document.getElementById('statusExportDeposit');

    const defaultFilename = `NK_รายงานฝาก_3.1_${startDate}_ถึง_${endDate}.xlsx`;
    const savePath = await window.nkAPI.selectSavePath(defaultFilename);
    if (!savePath) return;

    if (statusExport) statusExport.textContent = '⏳ กำลังบันทึกไฟล์ Excel...';
    btnExportDepositExcel.disabled = true;

    try {
      const res = await window.nkAPI.exportDepositReport(savePath, { startDate, endDate, pageSize });
      if (res && res.ok) {
        if (statusExport) {
          statusExport.innerHTML = `✅ บันทึกสำเร็จ: <a href="#" id="linkOpenDeposit" style="color:var(--accent); font-weight:700; text-decoration:underline;">เปิดไฟล์ Excel</a>`;
          document.getElementById('linkOpenDeposit')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.nkAPI.openFile(res.filePath);
          });
        }
      }
    } catch (err) {
      if (statusExport) statusExport.textContent = '❌ ส่งออกไม่สำเร็จ: ' + (err?.message || err);
    } finally {
      btnExportDepositExcel.disabled = false;
    }
  });
}

// =========================================================================
// --- 2. ดึงรายงานเติมเงิน, โบนัส & กระทบยอดเงินขาด-เกิน (Reconciliation & Audit Engine) ---
// =========================================================================
let currentReconcileRows = [];
let currentReconcileFilter = 'all';
let currentReconcileSearch = '';
let currentReconcileFindings = null;
let currentReconcileDiscrepancyTarget = 0;

// Set default dates for reconciliation inputs (1st of current month to today)
const repReconcileStart = document.getElementById('repReconcileStart');
const repReconcileEnd = document.getElementById('repReconcileEnd');
if (repReconcileStart && !repReconcileStart.value) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const startMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  repReconcileStart.value = startMonthStr;
  if (repReconcileEnd) repReconcileEnd.value = todayStr;
}

function escapeReconcileHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderReconcileTable() {
  const tbody = document.getElementById('tbodyReconcileList');
  const countEl = document.getElementById('lblReconcileTableCount');
  if (!tbody) return;

  let filtered = currentReconcileRows || [];

  // Apply tab filter
  if (currentReconcileFilter === 'target_match') {
    const T = currentReconcileDiscrepancyTarget;
    filtered = filtered.filter(r => Math.abs(Math.abs(Number(r.amount) || 0) - T) < 0.01);
  } else if (currentReconcileFilter === 'cash_in') {
    filtered = filtered.filter(r => r.flowGroup === 'cash_in');
  } else if (currentReconcileFilter === 'cash_out') {
    filtered = filtered.filter(r => r.flowGroup === 'cash_out');
  } else if (currentReconcileFilter === 'suspicious') {
    filtered = filtered.filter(r => r.sourceCategory === 'manual_deposit_nobank' || r.sourceCategory === 'adjust_increase' || r.sourceCategory === 'adjust_decrease');
  } else if (currentReconcileFilter === 'bonus_reward') {
    filtered = filtered.filter(r => r.sourceCategory === 'bonus' || r.sourceCategory === 'reward');
  }

  // Apply search query
  if (currentReconcileSearch) {
    const q = currentReconcileSearch.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.username || '').toLowerCase().includes(q) ||
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.phone || '').toLowerCase().includes(q) ||
      String(r.admin || '').toLowerCase().includes(q) ||
      String(r.bankInfo || '').toLowerCase().includes(q) ||
      String(r.note || '').toLowerCase().includes(q) ||
      String(r.typeLabel || '').toLowerCase().includes(q)
    );
  }

  if (countEl) {
    countEl.textContent = `แสดง ${Math.min(filtered.length, 150).toLocaleString('th-TH')} จาก ${filtered.length.toLocaleString('th-TH')} รายการ (ทั้งหมด ${currentReconcileRows.length.toLocaleString('th-TH')})`;
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-dim);">ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
    return;
  }

  const previewList = filtered.slice(0, 150);
  const T = currentReconcileDiscrepancyTarget;

  tbody.innerHTML = previewList.map((r, idx) => {
    const isTargetMatch = Math.abs(Math.abs(Number(r.amount) || 0) - T) < 0.01;
    const isCash = r.isRealCash;
    const isDeduct = Number(r.signedAmount || 0) < 0;
    const amtStr = (isDeduct ? '-' : '+') + '฿' + Math.abs(Number(r.amount) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    const amtColor = isTargetMatch ? '#a855f7' : (isDeduct ? '#ef4444' : (isCash ? '#10b981' : '#3b82f6'));

    const cashBadge = isCash
      ? `<span style="font-size:11px; background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); padding:2px 6px; border-radius:6px; font-weight:600;">🟢 เงินสดจริง</span>`
      : (r.sourceCategory === 'manual_deposit_nobank'
        ? `<span style="font-size:11px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.4); padding:2px 6px; border-radius:6px; font-weight:600;">⚠️ ไม่ระบุบัญชี</span>`
        : `<span style="font-size:11px; background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); padding:2px 6px; border-radius:6px; font-weight:600;">💨 เครดิตลม</span>`);

    const targetBadge = isTargetMatch
      ? `<span style="margin-left:4px; font-size:10px; background:#8b5cf6; color:#fff; padding:1px 5px; border-radius:8px; font-weight:700;">🎯 ยอดตรง</span>`
      : '';

    const rowBg = isTargetMatch ? 'rgba(139,92,246,0.08)' : (idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent');

    return `
      <tr style="border-bottom:1px solid var(--border-subtle); background:${rowBg};">
        <td style="padding:9px 10px; text-align:center; color:var(--text-dim);">${idx + 1}</td>
        <td style="padding:9px 10px; font-weight:600;">${escapeReconcileHtml(r.typeLabel)}${targetBadge}</td>
        <td style="padding:9px 10px;">${cashBadge}</td>
        <td style="padding:9px 10px; font-family:monospace; color:var(--accent); font-weight:600;">${escapeReconcileHtml(r.username)}</td>
        <td style="padding:9px 10px; font-weight:500;">${escapeReconcileHtml(r.name)}</td>
        <td style="padding:9px 10px; color:var(--text-muted); font-size:11.5px;">${escapeReconcileHtml(r.phone)}</td>
        <td style="padding:9px 10px; text-align:right; font-weight:700; color:${amtColor}; font-size:13px;">${amtStr}</td>
        <td style="padding:9px 10px; font-size:11.5px; color:var(--text-muted);">${escapeReconcileHtml(r.bankInfo)}</td>
        <td style="padding:9px 10px; color:var(--text-muted); font-size:11.5px;">${escapeReconcileHtml(r.admin)}</td>
        <td style="padding:9px 10px; color:var(--text-dim); font-size:11px;">${escapeReconcileHtml(r.createdAt)}</td>
        <td style="padding:9px 10px; color:var(--text-muted); font-size:11.5px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeReconcileHtml(r.note)}">${escapeReconcileHtml(r.note || '-')}</td>
      </tr>
    `;
  }).join('');
}

const btnFetchReconcile = document.getElementById('btnFetchReconcile');
if (btnFetchReconcile) {
  btnFetchReconcile.addEventListener('click', async () => {
    const startDate = document.getElementById('repReconcileStart')?.value || '';
    const endDate = document.getElementById('repReconcileEnd')?.value || '';
    const rawTarget = document.getElementById('repReconcileDiscrepancy')?.value;
    const hasTargetDiscrepancy = rawTarget != null && String(rawTarget).trim() !== '' && !isNaN(Number(rawTarget)) && Number(rawTarget) > 0;
    const targetDiscrepancy = hasTargetDiscrepancy ? Math.abs(Number(rawTarget)) : 0;
    currentReconcileDiscrepancyTarget = targetDiscrepancy;

    const statusEl = document.getElementById('statusReconcileReport');
    const container = document.getElementById('containerReconcileSummary');

    if (statusEl) statusEl.textContent = '⏳ กำลังเชื่อมต่อ API เพื่อดึงข้อมูลกระทบยอดเงินสด & ตรวจสอบเงินขาด...';
    btnFetchReconcile.disabled = true;

    try {
      const res = await window.nkAPI.fetchReconciliationReport({ startDate, endDate, targetDiscrepancy });
      if (res && res.ok && res.summary) {
        const s = res.summary;
        const f = res.findings || {};
        currentReconcileRows = res.rows || [];
        currentReconcileFindings = f;

        // 1. กล่องที่ 1: แมนนวล (เมนู 1.4 ฝาก-ถอนมือ)
        const manDepCount = (s.manualDepositWithBankCount || 0) + (s.manualDepositNoBankCount || 0);
        const manDepAmt = (s.manualDepositWithBankAmount || 0) + (s.manualDepositNoBankAmount || 0);
        const manWthCount = s.manualWithdrawCount || 0;
        const manWthAmt = s.manualWithdrawAmount || 0;
        const badgeManual = document.getElementById('badgeReconcileManualCount');
        const boxManDep = document.getElementById('boxManualDeposit');
        const boxManWth = document.getElementById('boxManualWithdraw');
        const boxManWithBank = document.getElementById('boxManualWithBank');
        const boxManNoBank = document.getElementById('boxManualNoBank');
        if (badgeManual) badgeManual.textContent = `${(manDepCount + manWthCount).toLocaleString('th-TH')} รายการ`;
        if (boxManDep) boxManDep.textContent = `${manDepCount.toLocaleString('th-TH')} รายการ (฿${manDepAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        if (boxManWth) boxManWth.textContent = `${manWthCount.toLocaleString('th-TH')} รายการ (-฿${manWthAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        if (boxManWithBank) boxManWithBank.textContent = `${(s.manualDepositWithBankCount || 0).toLocaleString('th-TH')} รายการ (฿${(s.manualDepositWithBankAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        if (boxManNoBank) boxManNoBank.textContent = `${(s.manualDepositNoBankCount || 0).toLocaleString('th-TH')} รายการ (฿${(s.manualDepositNoBankAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;

        // 2. กล่องที่ 2: ปรับมือ (ปรับยอดเครดิตหน้าสมาชิก)
        const adjIncCount = s.adjustIncreaseCount || 0;
        const adjIncAmt = s.adjustIncreaseAmount || 0;
        const adjDecCount = s.adjustDecreaseCount || 0;
        const adjDecAmt = s.adjustDecreaseAmount || 0;
        const badgeAdjust = document.getElementById('badgeReconcileAdjustCount');
        const boxAdjInc = document.getElementById('boxAdjustIncrease');
        const boxAdjDec = document.getElementById('boxAdjustDecrease');
        if (badgeAdjust) badgeAdjust.textContent = `${(adjIncCount + adjDecCount).toLocaleString('th-TH')} รายการ`;
        if (boxAdjInc) boxAdjInc.textContent = `${adjIncCount.toLocaleString('th-TH')} รายการ (+฿${adjIncAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        if (boxAdjDec) boxAdjDec.textContent = `${adjDecCount.toLocaleString('th-TH')} รายการ (-฿${adjDecAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;

        // 3. กล่องที่ 3: กิจกรรม (โบนัส & แลกแต้ม)
        const bonCount = s.bonusCount || 0;
        const bonAmt = s.bonusAmount || 0;
        const rewCount = s.rewardCount || 0;
        const rewAmt = s.rewardAmount || 0;
        const badgeActivity = document.getElementById('badgeReconcileActivityCount');
        const boxActBonus = document.getElementById('boxActivityBonus');
        const boxActReward = document.getElementById('boxActivityReward');
        if (badgeActivity) badgeActivity.textContent = `${(bonCount + rewCount).toLocaleString('th-TH')} รายการ`;
        if (boxActBonus) boxActBonus.textContent = `${bonCount.toLocaleString('th-TH')} รายการ (฿${bonAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
        if (boxActReward) boxActReward.textContent = `${rewCount.toLocaleString('th-TH')} รายการ (฿${rewAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;

        // 4. กล่องที่ 4: ยอดต้องสงสัย (ตามหาเงินขาด)
        const exactCount = f.exactMatches?.length || 0;
        const comboCount = f.combinationMatches?.length || 0;
        const noBankCount = s.manualDepositNoBankCount || 0;
        const noBankAmt = s.manualDepositNoBankAmount || 0;
        const lblTarget = document.getElementById('lblTargetDiscrepancy');
        const lblTargetTag = document.getElementById('lblTargetDiscrepancyTag');
        const badgeSuspect = document.getElementById('badgeReconcileSuspectCount');
        const boxSusExact = document.getElementById('boxSuspectExact');
        const boxSusCombo = document.getElementById('boxSuspectCombo');
        const boxSusNoBank = document.getElementById('boxSuspectNoBank');

        if (lblTargetTag) lblTargetTag.style.display = hasTargetDiscrepancy ? 'inline' : 'none';
        if (lblTarget) lblTarget.textContent = hasTargetDiscrepancy ? targetDiscrepancy.toLocaleString('th-TH') : '';

        const totalSuspectCount = (hasTargetDiscrepancy ? (exactCount + comboCount) : 0) + noBankCount;
        if (badgeSuspect) badgeSuspect.textContent = `${totalSuspectCount.toLocaleString('th-TH')} รายการ`;
        if (boxSusExact) {
          boxSusExact.textContent = hasTargetDiscrepancy ? `${exactCount.toLocaleString('th-TH')} รายการ` : '- (ไม่ได้ระบุยอด)';
        }
        if (boxSusCombo) {
          boxSusCombo.textContent = hasTargetDiscrepancy ? `${comboCount.toLocaleString('th-TH')} ชุด` : '- (ไม่ได้ระบุยอด)';
        }
        if (boxSusNoBank) boxSusNoBank.textContent = `${noBankCount.toLocaleString('th-TH')} รายการ (฿${noBankAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;

        // Target Discrepancy Findings Box
        const titleAudit = document.getElementById('titleDiscrepancyAudit');
        const badgeAudit = document.getElementById('badgeDiscrepancyStatus');
        const contentAudit = document.getElementById('contentDiscrepancyAudit');

        if (titleAudit) {
          titleAudit.textContent = hasTargetDiscrepancy
            ? `🎯 ผลการตรวจสอบยอดเงินขาด (เป้าหมาย ฿${targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`
            : `🎯 ผลการตรวจสอบยอดต้องสงสัย & รายการเสี่ยง`;
        }

        let auditHtml = '';
        let foundClue = false;

        if (!hasTargetDiscrepancy) {
          auditHtml += `
            <div style="background:rgba(255,255,255,0.03); border-left:4px solid var(--accent); padding:10px 12px; border-radius:6px; margin-bottom:8px;">
              <strong style="color:var(--accent);">ℹ️ ยังไม่ได้ระบุยอดเงินขาดที่ต้องการตรวจสอบ:</strong>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                หากต้องการตามหาเงินขาดเฉพาะยอด สามารถพิมพ์จำนวนเงินในช่อง <b>"ยอดเงินขาดที่ต้องการตรวจสอบ (บาท)"</b> ด้านบน เช่น <code>1092</code> แล้วกดดึงข้อมูลใหม่ ระบบจะช่วยสแกนจับคู่รายการที่ยอดตรง หรือจับคู่ผลรวมรายการให้โดยอัตโนมัติ
              </div>
            </div>
          `;
        } else {
          // Check exact match
          if (f.exactMatches && f.exactMatches.length > 0) {
            foundClue = true;
            auditHtml += `
              <div style="background:rgba(139,92,246,0.12); border-left:4px solid #8b5cf6; padding:10px 12px; border-radius:6px; margin-bottom:8px;">
                <strong style="color:#a78bfa;">🎯 ตรวจพบ ${f.exactMatches.length} รายการ ที่มียอดตรงกับ ฿${targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} พอดี 100%:</strong>
                <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                  ${f.exactMatches.map(m => `
                    <div style="font-size:12px;">
                      • <span style="font-weight:700; color:#c084fc;">[${escapeReconcileHtml(m.row.typeLabel)}]</span>
                      <b>฿${m.row.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</b>
                      ให้กับยูส <b>${escapeReconcileHtml(m.row.username)}</b>
                      โดย <b>${escapeReconcileHtml(m.row.admin)}</b>
                      เวลา <i>${escapeReconcileHtml(m.row.createdAt)}</i>
                      ${m.row.note && m.row.note !== '-' ? `(หมายเหตุ: ${escapeReconcileHtml(m.row.note)})` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }

          // Check combination matches
          if (f.combinationMatches && f.combinationMatches.length > 0) {
            foundClue = true;
            auditHtml += `
              <div style="background:rgba(16,185,129,0.12); border-left:4px solid #10b981; padding:10px 12px; border-radius:6px; margin-bottom:8px;">
                <strong style="color:#34d399;">🧩 ตรวจพบชุดรายการที่รวมกันได้ ฿${targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} พอดี (${f.combinationMatches.length} ชุด):</strong>
                <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                  ${f.combinationMatches.map(c => `
                    <div style="font-size:12px;">• ${escapeReconcileHtml(c.description)}</div>
                  `).join('')}
                </div>
              </div>
            `;
          }

          // Check Net Adjustment Match
          if (f.netAdjustmentMatch) {
            foundClue = true;
            auditHtml += `
              <div style="background:rgba(59,130,246,0.12); border-left:4px solid #3b82f6; padding:10px 12px; border-radius:6px; margin-bottom:8px;">
                <strong style="color:#60a5fa;">⚖️ ยอดปรับเพิ่ม (+) หักลบ ปรับลด (-) ในวันนั้น สุทธิเท่ากับ ฿${targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} พอดี!</strong>
                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">หมายความว่าแอดมินมีการปรับยอดเครดิตสุทธิเท่ากับจำนวนเงินที่ขาดไปพอดี</div>
              </div>
            `;
          }
        }

        // Check Manual Deposit without Bank
        if (s.manualDepositNoBankCount > 0) {
          auditHtml += `
            <div style="background:rgba(239,68,68,0.12); border-left:4px solid #ef4444; padding:10px 12px; border-radius:6px; margin-bottom:8px;">
              <strong style="color:#f87171;">⚠️ พบรายการฝากมือที่ไม่ระบุบัญชีธนาคาร ${s.manualDepositNoBankCount} รายการ (รวม ฿${s.manualDepositNoBankAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })})</strong>
              <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">เป็นรายการที่แอดมินกดฝากมือโดยไม่ได้เลือกช่องทางเงินเข้า ควรตรวจสอบ Statement แอปธนาคารว่าเงินเข้าจริงหรือไม่</div>
            </div>
          `;
        }

        if (hasTargetDiscrepancy && !foundClue && s.manualDepositNoBankCount === 0) {
          auditHtml += `
            <div style="color:var(--text-muted); padding:6px 0;">
              ℹ️ ไม่พบรายการเดี่ยวหรือคู่รายการที่ตรงกับ ฿${targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })} พอดีในระบบ
              แนะนำให้เปิดเทียบ <b>Statement แอปธนาคาร</b> กับแท็บ <b>"🟢 เงินสดรับจริง"</b> เพื่อตรวจเช็ครายการฝากมือและถอนมือทุกรายการ
            </div>
          `;
        }

        if (badgeAudit) {
          badgeAudit.textContent = foundClue ? '🎯 พบรายการที่ตรงกับยอดขาด' : 'วิเคราะห์เสร็จสิ้น';
          badgeAudit.style.background = foundClue ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)';
          badgeAudit.style.color = foundClue ? '#c084fc' : 'var(--text-muted)';
        }
        if (contentAudit) contentAudit.innerHTML = auditHtml;

        // Ratio badge & tab count numbers
        const badgeRatio = document.getElementById('badgeReconcileRatio');
        if (badgeRatio) {
          badgeRatio.innerHTML = `<span style="color:#10b981;">เงินสดรับจริง ฿${s.realCashInAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span> · <span style="color:#ef4444;">เงินสดจ่ายจริง ฿${s.realCashOutAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span> · <span style="color:#f59e0b;">เครดิตลม ฿${s.totalNonCashAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>`;
        }

        const cntAll = document.getElementById('cntFilterReconcileAll');
        const cntMatch = document.getElementById('cntFilterReconcileMatch');
        const cntCashIn = document.getElementById('cntFilterReconcileCashIn');
        const cntCashOut = document.getElementById('cntFilterReconcileCashOut');
        const cntSuspicious = document.getElementById('cntFilterReconcileSuspicious');
        const cntBonus = document.getElementById('cntFilterReconcileBonus');

        if (cntAll) cntAll.textContent = (s.totalRows || 0).toLocaleString('th-TH');
        if (cntMatch) cntMatch.textContent = (s.exactMatchesCount || 0).toLocaleString('th-TH');
        if (cntCashIn) cntCashIn.textContent = (s.realCashInCount || 0).toLocaleString('th-TH');
        if (cntCashOut) cntCashOut.textContent = (s.realCashOutCount || 0).toLocaleString('th-TH');
        if (cntSuspicious) cntSuspicious.textContent = ((s.manualDepositNoBankCount || 0) + (s.adjustIncreaseCount || 0) + (s.adjustDecreaseCount || 0)).toLocaleString('th-TH');
        if (cntBonus) cntBonus.textContent = ((s.bonusCount || 0) + (s.rewardCount || 0)).toLocaleString('th-TH');

        // Render preview table
        renderReconcileTable();

        if (container) container.style.display = 'block';
        if (statusEl) statusEl.textContent = `✅ ดึงข้อมูลสำเร็จ ${s.totalRows.toLocaleString('th-TH')} รายการ (เงินสดสุทธิในธนาคาร: ฿${s.netBankCashBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })} · เครดิตลม: ฿${s.totalNonCashAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '❌ ล้มเหลว: ' + (err?.message || err);
    } finally {
      btnFetchReconcile.disabled = false;
    }
  });
}

// ปุ่มล้างค่ารายงานกระทบยอด
const btnReconcileClear = document.getElementById('btnReconcileClear');
if (btnReconcileClear) {
  btnReconcileClear.addEventListener('click', () => {
    const today = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const yyyy = today.getFullYear();
    const mm = pad2(today.getMonth() + 1);
    const dd = pad2(today.getDate());
    const elRecStart = document.getElementById('repReconcileStart');
    const elRecEnd = document.getElementById('repReconcileEnd');
    const elDiscrepancy = document.getElementById('repReconcileDiscrepancy');
    const searchInput = document.getElementById('searchReconcileTable');

    if (elRecStart) elRecStart.value = `${yyyy}-${mm}-01`;
    if (elRecEnd) elRecEnd.value = `${yyyy}-${mm}-${dd}`;
    if (elDiscrepancy) elDiscrepancy.value = '';
    if (searchInput) searchInput.value = '';

    const statusEl = document.getElementById('statusReconcileReport');
    if (statusEl) statusEl.textContent = '';

    const container = document.getElementById('containerReconcileSummary');
    if (container) container.style.display = 'none';

    currentReconcileRows = [];
    currentReconcileFindings = null;
    currentReconcileFilter = 'all';
    currentReconcileSearch = '';

    const tbody = document.getElementById('tbodyReconcileList');
    if (tbody) tbody.innerHTML = '';

    const countEl = document.getElementById('lblReconcileTableCount');
    if (countEl) countEl.textContent = 'แสดง 0 รายการ';

    // Reset filter tabs to 'all'
    const reconcileFilterBtns = document.querySelectorAll('#tabsReconcileFilter .btn-reconcile-filter');
    reconcileFilterBtns.forEach((b) => {
      b.classList.remove('active');
      b.style.background = 'var(--bg-card)';
      b.style.color = 'var(--text-muted)';
      b.style.fontWeight = 'normal';
      b.style.borderColor = 'var(--border-subtle)';
      if (b.dataset.filter === 'all') {
        b.classList.add('active');
        b.style.background = 'var(--accent)';
        b.style.color = '#000';
        b.style.fontWeight = '600';
        b.style.borderColor = 'var(--accent)';
      }
    });
    updateReconcileQuickDateUi();
  });
}

// ปุ่มกรอง วันนี้ / เมื่อวาน สำหรับรายงานเติมเงิน, โบนัส & กระทบยอดเงินขาด-เกิน (เมนู 2)
const btnReconcileToday = document.getElementById('btnReconcileToday');
const btnReconcileYesterday = document.getElementById('btnReconcileYesterday');

function updateReconcileQuickDateUi() {
  const start = document.getElementById('repReconcileStart')?.value;
  const end = document.getElementById('repReconcileEnd')?.value;
  const today = todayDateString();
  const yesterday = yesterdayDateString();
  if (btnReconcileToday && btnReconcileYesterday) {
    if (start === today && end === today) {
      btnReconcileToday.style.borderColor = 'var(--accent)';
      btnReconcileToday.style.color = 'var(--accent)';
      btnReconcileToday.style.background = 'rgba(245, 158, 11, 0.12)';
      btnReconcileYesterday.style.borderColor = '';
      btnReconcileYesterday.style.color = '';
      btnReconcileYesterday.style.background = '';
    } else if (start === yesterday && end === yesterday) {
      btnReconcileYesterday.style.borderColor = 'var(--accent)';
      btnReconcileYesterday.style.color = 'var(--accent)';
      btnReconcileYesterday.style.background = 'rgba(245, 158, 11, 0.12)';
      btnReconcileToday.style.borderColor = '';
      btnReconcileToday.style.color = '';
      btnReconcileToday.style.background = '';
    } else {
      btnReconcileToday.style.borderColor = '';
      btnReconcileToday.style.color = '';
      btnReconcileToday.style.background = '';
      btnReconcileYesterday.style.borderColor = '';
      btnReconcileYesterday.style.color = '';
      btnReconcileYesterday.style.background = '';
    }
  }
}

if (btnReconcileToday) {
  btnReconcileToday.addEventListener('click', () => {
    const today = todayDateString();
    const elStart = document.getElementById('repReconcileStart');
    const elEnd = document.getElementById('repReconcileEnd');
    if (elStart) elStart.value = today;
    if (elEnd) elEnd.value = today;
    updateReconcileQuickDateUi();
    const btnFetch = document.getElementById('btnFetchReconcile');
    if (btnFetch && !btnFetch.disabled) btnFetch.click();
  });
}

if (btnReconcileYesterday) {
  btnReconcileYesterday.addEventListener('click', () => {
    const yest = yesterdayDateString();
    const elStart = document.getElementById('repReconcileStart');
    const elEnd = document.getElementById('repReconcileEnd');
    if (elStart) elStart.value = yest;
    if (elEnd) elEnd.value = yest;
    updateReconcileQuickDateUi();
    const btnFetch = document.getElementById('btnFetchReconcile');
    if (btnFetch && !btnFetch.disabled) btnFetch.click();
  });
}

document.getElementById('repReconcileStart')?.addEventListener('change', updateReconcileQuickDateUi);
document.getElementById('repReconcileEnd')?.addEventListener('change', updateReconcileQuickDateUi);
document.getElementById('repReconcileStart')?.addEventListener('input', updateReconcileQuickDateUi);
document.getElementById('repReconcileEnd')?.addEventListener('input', updateReconcileQuickDateUi);
updateReconcileQuickDateUi();

// Hook filter tab clicks for reconciliation preview table
const reconcileFilterButtons = document.querySelectorAll('#tabsReconcileFilter .btn-reconcile-filter');
reconcileFilterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    reconcileFilterButtons.forEach((b) => {
      b.classList.remove('active');
      b.style.background = 'var(--bg-card)';
      b.style.color = 'var(--text-muted)';
      b.style.fontWeight = 'normal';
      b.style.borderColor = 'var(--border-subtle)';
    });
    btn.classList.add('active');
    btn.style.background = 'var(--accent)';
    btn.style.color = '#000';
    btn.style.fontWeight = '600';
    btn.style.borderColor = 'var(--accent)';

    currentReconcileFilter = btn.dataset.filter || 'all';
    renderReconcileTable();
  });
});

// Hook live search for reconciliation preview table
const searchReconcileTable = document.getElementById('searchReconcileTable');
if (searchReconcileTable) {
  searchReconcileTable.addEventListener('input', (e) => {
    currentReconcileSearch = (e.target.value || '').trim();
    renderReconcileTable();
  });
}

// Hook export Excel button for reconciliation
const btnExportReconcileExcel = document.getElementById('btnExportReconcileExcel');
if (btnExportReconcileExcel) {
  btnExportReconcileExcel.addEventListener('click', async () => {
    const startDate = document.getElementById('repReconcileStart')?.value || '';
    const endDate = document.getElementById('repReconcileEnd')?.value || '';
    const rawTarget = document.getElementById('repReconcileDiscrepancy')?.value;
    const hasTarget = rawTarget != null && String(rawTarget).trim() !== '' && !isNaN(Number(rawTarget)) && Number(rawTarget) > 0;
    const targetDiscrepancy = hasTarget ? Math.abs(Number(rawTarget)) : 0;
    const statusExport = document.getElementById('statusExportReconcile');

    if (statusExport) statusExport.textContent = '⏳ กำลังสร้างไฟล์ Excel รายงานกระทบยอดการเงิน...';
    btnExportReconcileExcel.disabled = true;

    try {
      const discTag = hasTarget ? `_(ยอดขาด_${targetDiscrepancy}บ)` : '';
      const defaultFilename = `NK_กระทบยอดการเงิน_${startDate}_ถึง_${endDate}${discTag}.xlsx`;
      const savePath = await window.nkAPI.selectSavePath(defaultFilename);
      if (!savePath) {
        if (statusExport) statusExport.textContent = 'ยกเลิกการส่งออก';
        btnExportReconcileExcel.disabled = false;
        return;
      }

      const res = await window.nkAPI.exportReconciliationReport(savePath, { startDate, endDate, targetDiscrepancy });
      if (res && res.ok) {
        if (statusExport) {
          statusExport.innerHTML = `✅ บันทึกสำเร็จ (${res.rowCount.toLocaleString('th-TH')} รายการ): <a href="#" id="linkOpenReconcile" style="color:var(--accent); font-weight:700; text-decoration:underline;">เปิดไฟล์ Excel</a>`;
          document.getElementById('linkOpenReconcile')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.nkAPI.openFile(res.filePath);
          });
        }
      }
    } catch (err) {
      if (statusExport) statusExport.textContent = '❌ ส่งออกไม่สำเร็จ: ' + (err?.message || err);
    } finally {
      btnExportReconcileExcel.disabled = false;
    }
  });
}

// --- 4. รายงานจัดอันดับยอดฝากสูงสุด & เปรียบเทียบเดือนนี้ vs เดือนที่แล้ว แบ่งกลุ่มลูกค้า ---
let rankingMembersData = [];
let currentRankingTierFilter = 'all';

function renderRankingTable() {
  const tbody = document.getElementById('rankingTableBody');
  const infoEl = document.getElementById('rankingTableInfo');
  if (!tbody) return;

  const filtered = currentRankingTierFilter === 'all'
    ? rankingMembersData
    : rankingMembersData.filter(m => m.tierKey === currentRankingTierFilter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">ไม่พบข้อมูลลูกค้าในกลุ่มนี้</td></tr>`;
    if (infoEl) infoEl.textContent = `แสดง 0 รายการ (จากทั้งหมด ${rankingMembersData.length.toLocaleString('th-TH')} รายการ)`;
    return;
  }

  tbody.innerHTML = filtered.map((m, idx) => {
    let tierBadge = '';
    let rowBg = '';
    if (m.tierKey === 'vip') {
      tierBadge = `<span style="background:rgba(217,119,6,0.15); color:#f59e0b; border:1px solid rgba(217,119,6,0.35); padding:2px 8px; border-radius:12px; font-weight:700; font-size:11px;">🥇 VIP</span>`;
      rowBg = 'background:rgba(217,119,6,0.04);';
    } else if (m.tierKey === 'general') {
      tierBadge = `<span style="background:rgba(37,99,235,0.15); color:#38bdf8; border:1px solid rgba(37,99,235,0.35); padding:2px 8px; border-radius:12px; font-weight:700; font-size:11px;">🥈 ทั่วไป</span>`;
      rowBg = 'background:rgba(56,189,248,0.02);';
    } else {
      tierBadge = `<span style="background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); padding:2px 8px; border-radius:12px; font-weight:600; font-size:11px;">🥉 ใหม่</span>`;
      rowBg = '';
    }

    return `
      <tr style="${rowBg} border-bottom:1px solid var(--border-subtle);">
        <td style="text-align:right; padding:9px 12px; font-weight:800; color:#38bdf8; font-family:monospace;">฿${(m.totalDeposit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:center; padding:9px 10px; font-weight:600; color:var(--text-main); font-family:monospace;">${m.username}</td>
        <td style="text-align:center; padding:9px 10px; color:var(--text-dim); font-family:monospace;">${m.phone || '-'}</td>
        <td style="text-align:left; padding:9px 12px; color:var(--text-main);">${m.name || '-'}</td>
        <td style="text-align:center; padding:9px 10px; color:var(--text-muted); font-size:12px; font-family:monospace;">${m.lastOnline || '-'}</td>
        <td style="text-align:center; padding:9px 10px; color:var(--text-muted); font-size:12px; font-family:monospace;">${m.registeredAt || '-'}</td>
      </tr>
    `;
  }).join('');

  if (infoEl) {
    infoEl.textContent = `แสดง ${filtered.length.toLocaleString('th-TH')} รายการ (จากทั้งหมด ${rankingMembersData.length.toLocaleString('th-TH')} รายการ)`;
  }
}

// Hook tab clicks
document.querySelectorAll('#rankingTierFilters button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#rankingTierFilters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRankingTierFilter = btn.getAttribute('data-tier') || 'all';
    renderRankingTable();
  });
});

const btnCancelRanking = document.getElementById('btnCancelRanking');
if (btnCancelRanking) {
  btnCancelRanking.addEventListener('click', async () => {
    btnCancelRanking.disabled = true;
    btnCancelRanking.textContent = '⏳ กำลังหยุดและประมวลผลข้อมูล...';
    try {
      await window.nkAPI.cancelMonthlyRanking?.();
    } catch (e) {
      console.error(e);
    }
  });
}

if (window.nkAPI?.onMonthlyRankingProgress) {
  window.nkAPI.onMonthlyRankingProgress((data) => {
    const bar = document.getElementById('rankingProgressBarFill');
    const txt = document.getElementById('rankingProgressText');
    const pct = document.getElementById('rankingProgressPercent');
    if (bar && data.percent !== undefined) bar.style.width = `${Math.min(100, Math.max(0, data.percent))}%`;
    if (pct && data.percent !== undefined) pct.textContent = `${data.percent}%`;
    if (txt && data.message) txt.textContent = data.message;
  });
}

const btnFetchMonthlyRanking = document.getElementById('btnFetchMonthlyRanking');
if (btnFetchMonthlyRanking) {
  btnFetchMonthlyRanking.addEventListener('click', async () => {
    const statusEl = document.getElementById('statusMonthlyRanking');
    const container = document.getElementById('containerMonthlyRanking');
    const progressBox = document.getElementById('rankingProgressBarContainer');
    const progressBar = document.getElementById('rankingProgressBarFill');
    const progressText = document.getElementById('rankingProgressText');
    const progressPct = document.getElementById('rankingProgressPercent');

    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (progressText) progressText.textContent = '⏳ กำลังเริ่มดึงข้อมูลรายชื่อสมาชิกทั้งหมด...';
    if (btnCancelRanking) {
      btnCancelRanking.disabled = false;
      btnCancelRanking.textContent = '⏹️ หยุดดึงข้อมูล (แสดงเท่าที่ได้)';
    }

    if (statusEl) statusEl.textContent = '⏳ กำลังดึงข้อมูลยูสเซอร์ทั้งหมดผ่าน API และจัดอันดับยอดฝากรวม...';
    btnFetchMonthlyRanking.disabled = true;

    try {
      const res = await window.nkAPI.fetchMonthlyRanking({});

      if (res && res.ok && res.summary) {
        const s = res.summary;

        // Update Stat Cards
        const vipAmt = document.getElementById('rankStatVipAmount');
        const vipCnt = document.getElementById('rankStatVipCount');
        const genAmt = document.getElementById('rankStatGeneralAmount');
        const genCnt = document.getElementById('rankStatGeneralCount');
        const newAmt = document.getElementById('rankStatNewAmount');
        const newCnt = document.getElementById('rankStatNewCount');
        const totAmt = document.getElementById('rankStatTotalAmount');
        const totCnt = document.getElementById('rankStatTotalCount');

        if (vipAmt) vipAmt.textContent = '฿' + (s.vip.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
        if (vipCnt) vipCnt.textContent = `${s.vip.count} คน (เฉลี่ย ฿${(s.vip.avg || 0).toLocaleString('th-TH')})`;

        if (genAmt) genAmt.textContent = '฿' + (s.general.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
        if (genCnt) genCnt.textContent = `${s.general.count} คน (เฉลี่ย ฿${(s.general.avg || 0).toLocaleString('th-TH')})`;

        if (newAmt) newAmt.textContent = '฿' + (s.new.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
        if (newCnt) newCnt.textContent = `${s.new.count} คน (เฉลี่ย ฿${(s.new.avg || 0).toLocaleString('th-TH')})`;

        if (totAmt) totAmt.textContent = '฿' + (s.grandTotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
        if (totCnt) totCnt.textContent = `รวม ${s.totalMembers.toLocaleString('th-TH')} คน`;

        // Update tab badge counts
        const tabAll = document.getElementById('countTabAll');
        const tabVip = document.getElementById('countTabVip');
        const tabGen = document.getElementById('countTabGeneral');
        const tabNew = document.getElementById('countTabNew');
        if (tabAll) tabAll.textContent = s.totalMembers.toLocaleString('th-TH');
        if (tabVip) tabVip.textContent = s.vip.count.toLocaleString('th-TH');
        if (tabGen) tabGen.textContent = s.general.count.toLocaleString('th-TH');
        if (tabNew) tabNew.textContent = s.new.count.toLocaleString('th-TH');

        rankingMembersData = res.members || [];
        renderRankingTable();

        if (container) container.style.display = 'block';
        if (statusEl) {
          if (res.isCancelled) {
            statusEl.textContent = `⏹️ หยุดดึงข้อมูลตามคำสั่ง ดึงได้ทั้งหมด ${s.totalMembers.toLocaleString('th-TH')} คน (VIP: ${s.vip.count} คน, ทั่วไป: ${s.general.count} คน, ใหม่: ${s.new.count} คน) พร้อมส่งออก Excel ได้ทันที`;
          } else {
            statusEl.textContent = `✅ จัดอันดับสำเร็จ ${s.totalMembers.toLocaleString('th-TH')} คน (VIP: ${s.vip.count} คน, ทั่วไป: ${s.general.count} คน, ใหม่: ${s.new.count} คน)`;
          }
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '❌ ล้มเหลว: ' + (err?.message || err);
    } finally {
      if (progressBox) progressBox.style.display = 'none';
      btnFetchMonthlyRanking.disabled = false;
      if (btnCancelRanking) {
        btnCancelRanking.disabled = false;
        btnCancelRanking.textContent = '⏹️ หยุดดึงข้อมูล (แสดงเท่าที่ได้)';
      }
    }
  });
}

// ปุ่มล้างค่าจัดอันดับยอดฝากสูงสุด
const btnRankingClear = document.getElementById('btnRankingClear');
if (btnRankingClear) {
  btnRankingClear.addEventListener('click', () => {
    const statusEl = document.getElementById('statusMonthlyRanking');
    if (statusEl) statusEl.textContent = '';

    const progressBox = document.getElementById('rankingProgressBarContainer');
    if (progressBox) progressBox.style.display = 'none';

    const container = document.getElementById('containerMonthlyRanking');
    if (container) container.style.display = 'none';

    rankingMembersData = [];

    // Reset stat cards
    const vipAmt = document.getElementById('rankStatVipAmount');
    const vipCnt = document.getElementById('rankStatVipCount');
    const genAmt = document.getElementById('rankStatGeneralAmount');
    const genCnt = document.getElementById('rankStatGeneralCount');
    const newAmt = document.getElementById('rankStatNewAmount');
    const newCnt = document.getElementById('rankStatNewCount');
    const totAmt = document.getElementById('rankStatTotalAmount');
    const totCnt = document.getElementById('rankStatTotalCount');

    if (vipAmt) vipAmt.textContent = '฿0.00';
    if (vipCnt) vipCnt.textContent = '0 คน';
    if (genAmt) genAmt.textContent = '฿0.00';
    if (genCnt) genCnt.textContent = '0 คน';
    if (newAmt) newAmt.textContent = '฿0.00';
    if (newCnt) newCnt.textContent = '0 คน';
    if (totAmt) totAmt.textContent = '฿0.00';
    if (totCnt) totCnt.textContent = 'รวม 0 คน';

    // Reset tab badge counts
    const tabAll = document.getElementById('countTabAll');
    const tabVip = document.getElementById('countTabVip');
    const tabGen = document.getElementById('countTabGeneral');
    const tabNew = document.getElementById('countTabNew');
    if (tabAll) tabAll.textContent = '0';
    if (tabVip) tabVip.textContent = '0';
    if (tabGen) tabGen.textContent = '0';
    if (tabNew) tabNew.textContent = '0';

    const tbody = document.getElementById('rankingTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">กดปุ่ม "ดึงข้อมูลยูสเซอร์ทั้งหมด & จัดอันดับยอดฝากรวม" เพื่อดูข้อมูล</td></tr>';
    }

    const tableInfo = document.getElementById('rankingTableInfo');
    if (tableInfo) tableInfo.textContent = 'แสดง 0 รายการ';
  });
}

// Export Monthly Ranking to Excel
const btnExportMonthlyRankingExcel = document.getElementById('btnExportMonthlyRankingExcel');
if (btnExportMonthlyRankingExcel) {
  btnExportMonthlyRankingExcel.addEventListener('click', async () => {
    const statusExport = document.getElementById('statusExportRanking');

    const pad2 = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const defaultFilename = `NK_จัดอันดับยอดฝากทั้งหมด_${dateStr}.xlsx`;
    const savePath = await window.nkAPI.selectSavePath(defaultFilename);
    if (!savePath) return;

    if (statusExport) statusExport.textContent = '⏳ กำลังสร้างไฟล์ Excel แยกชีตและจัดกลุ่ม...';
    btnExportMonthlyRankingExcel.disabled = true;

    try {
      const res = await window.nkAPI.exportMonthlyRanking(savePath, {});

      if (res && res.ok) {
        if (statusExport) {
          statusExport.innerHTML = `✅ บันทึกสำเร็จ: <a href="#" id="linkOpenRanking" style="color:var(--accent); font-weight:700; text-decoration:underline;">เปิดไฟล์ Excel</a>`;
          document.getElementById('linkOpenRanking')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.nkAPI.openFile(res.filePath);
          });
        }
      }
    } catch (err) {
      if (statusExport) statusExport.textContent = '❌ ส่งออกไม่สำเร็จ: ' + (err?.message || err);
    } finally {
      btnExportMonthlyRankingExcel.disabled = false;
    }
  });
}

// ==========================================
// 3. ดึงรายงานลูกค้าฝากเดือนล่าสุด (LATEST MONTH DEPOSITORS)
// ==========================================
let latestMonthAllRows = [];
let latestMonthCurMonth = null;
let latestMonthPrevMonth = null;
let latestMonthFilterMode = 'both'; // 'both', 'cur', 'prev'
let latestMonthTierFilter = 'all'; // 'all', 'vip', 'general', 'new'
let latestMonthSearchQuery = '';

function updateLatestMonthDynamicLabels(refYm) {
  let curM = latestMonthCurMonth;
  let prevM = latestMonthPrevMonth;

  if (!curM || !prevM) {
    const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let now = new Date();
    if (refYm && /^\d{4}-\d{2}$/.test(refYm)) {
      const [y, m] = refYm.split('-').map(Number);
      now = new Date(y, m - 1, 15);
    }
    const cY = now.getFullYear();
    const cM = now.getMonth() + 1;
    let pM = cM - 1;
    let pY = cY;
    if (pM <= 0) {
      pM = 12;
      pY -= 1;
    }
    curM = {
      shortLabel: `${THAI_MONTHS[cM]} ${cY + 543}`,
      fullLabel: `เดือนนี้ (${THAI_MONTHS[cM]} ${cY + 543})`
    };
    prevM = {
      shortLabel: `${THAI_MONTHS[pM]} ${pY + 543}`,
      fullLabel: `เดือนที่แล้ว (${THAI_MONTHS[pM]} ${pY + 543})`
    };
  }

  // Dropdown options
  const optCur = document.getElementById('optFilterCur');
  const optPrev = document.getElementById('optFilterPrev');
  const optBoth = document.getElementById('optFilterBoth');
  if (optCur) optCur.textContent = `📅 1. ฝากเดือนนี้ (${curM.shortLabel})`;
  if (optPrev) optPrev.textContent = `⏪ 2. ฝากเดือนที่แล้ว (${prevM.shortLabel})`;
  if (optBoth) optBoth.textContent = `🌟 3. ฝากเดือนนี้ + เดือนที่แล้ว (${curM.shortLabel} + ${prevM.shortLabel})`;

  // Quick toggle buttons sublabels
  const subCur = document.getElementById('sublabelModeCur');
  const subPrev = document.getElementById('sublabelModePrev');
  const subBoth = document.getElementById('sublabelModeBoth');
  if (subCur) subCur.textContent = `(${curM.shortLabel})`;
  if (subPrev) subPrev.textContent = `(${prevM.shortLabel})`;
  if (subBoth) subBoth.textContent = `(${curM.shortLabel} + ${prevM.shortLabel})`;

  // Table column headers
  const thCur = document.getElementById('thColCurMonth');
  const thPrev = document.getElementById('thColPrevMonth');
  if (thCur) thCur.textContent = `ยอดฝาก (${curM.shortLabel})`;
  if (thPrev) thPrev.textContent = `ยอดฝาก (${prevM.shortLabel})`;
}

function setLatestMonthFilterMode(mode) {
  if (!['both', 'cur', 'prev'].includes(mode)) {
    mode = 'both';
  }
  latestMonthFilterMode = mode;

  // Sync select dropdown
  const selMode = document.getElementById('selLatestDepositFilterMode');
  if (selMode && selMode.value !== mode) {
    selMode.value = mode;
  }

  // Sync quick toggle buttons
  const buttons = document.querySelectorAll('.btn-mode-toggle[data-latest-mode]');
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.latestMode === mode);
  });

  if (latestMonthAllRows && latestMonthAllRows.length > 0) {
    renderLatestMonthView();
  }
}

function initLatestMonthControls() {
  const selMonthRef = document.getElementById('selLatestMonthRef');
  if (!selMonthRef) return;

  const now = new Date();
  const options = [];
  const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}${i === 0 ? ' (เดือนปัจจุบัน)' : ''}`;
    options.push({ ym, label });
  }

  selMonthRef.innerHTML = options.map((opt, idx) =>
    `<option value="${opt.ym}" ${idx === 0 ? 'selected' : ''}>${opt.label}</option>`
  ).join('');

  selMonthRef.addEventListener('change', () => {
    latestMonthCurMonth = null;
    latestMonthPrevMonth = null;
    updateLatestMonthDynamicLabels(selMonthRef.value);
  });

  // Mode change via dropdown
  const selMode = document.getElementById('selLatestDepositFilterMode');
  if (selMode) {
    selMode.addEventListener('change', () => {
      setLatestMonthFilterMode(selMode.value);
    });
  }

  // Mode change via quick toggle buttons
  const toggleGroup = document.querySelector('.latest-mode-toggle-group');
  if (toggleGroup) {
    toggleGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-mode-toggle');
      if (!btn || !btn.dataset.latestMode) return;
      setLatestMonthFilterMode(btn.dataset.latestMode);
    });
  }

  // Tier filters
  const tierContainer = document.getElementById('latestTierFilters');
  if (tierContainer) {
    tierContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-latest-tier]');
      if (!btn) return;
      tierContainer.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      latestMonthTierFilter = btn.dataset.latestTier || 'all';
      renderLatestMonthTable();
    });
  }

  // Search input
  const searchInput = document.getElementById('searchLatestMonthTable');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      latestMonthSearchQuery = e.target.value.trim().toLowerCase();
      renderLatestMonthTable();
    });
  }

  // Clear button
  const btnClear = document.getElementById('btnClearLatestMonthDepositors');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      latestMonthAllRows = [];
      const container = document.getElementById('containerLatestMonthResults');
      if (container) container.style.display = 'none';
      const progressBox = document.getElementById('latestMonthProgressBarContainer');
      if (progressBox) progressBox.style.display = 'none';
      const statusEl = document.getElementById('statusLatestMonth');
      if (statusEl) statusEl.textContent = '';
      const searchEl = document.getElementById('searchLatestMonthTable');
      if (searchEl) searchEl.value = '';
      latestMonthSearchQuery = '';
      latestMonthTierFilter = 'all';
      tierContainer?.querySelectorAll('button').forEach((b, idx) => {
        b.classList.toggle('active', idx === 0);
      });
    });
  }

  // Initial update of dynamic month names on options and pills
  updateLatestMonthDynamicLabels(selMonthRef.value);
}

// Progress listener
if (window.nkAPI && window.nkAPI.onLatestMonthDepositorsProgress) {
  window.nkAPI.onLatestMonthDepositorsProgress((data) => {
    const box = document.getElementById('latestMonthProgressBarContainer');
    const bar = document.getElementById('latestMonthProgressBarFill');
    const pct = document.getElementById('latestMonthProgressPercent');
    const txt = document.getElementById('latestMonthProgressText');
    if (box && box.style.display === 'none') box.style.display = 'block';
    if (bar && data.percent !== undefined) bar.style.width = `${Math.min(100, Math.max(0, data.percent))}%`;
    if (pct && data.percent !== undefined) pct.textContent = `${data.percent}%`;
    if (txt && data.message) txt.textContent = data.message;
  });
}

// Fetch Latest Month Depositors Click
const btnFetchLatestMonth = document.getElementById('btnFetchLatestMonthDepositors');
const btnCancelLatestMonth = document.getElementById('btnCancelLatestMonth');

if (btnFetchLatestMonth) {
  btnFetchLatestMonth.addEventListener('click', async () => {
    const statusEl = document.getElementById('statusLatestMonth');
    const container = document.getElementById('containerLatestMonthResults');
    const progressBox = document.getElementById('latestMonthProgressBarContainer');
    const progressBar = document.getElementById('latestMonthProgressBarFill');
    const progressText = document.getElementById('latestMonthProgressText');
    const progressPct = document.getElementById('latestMonthProgressPercent');
    const selMonthRef = document.getElementById('selLatestMonthRef');

    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (progressText) progressText.textContent = '⏳ กำลังเตรียมเชื่อมต่อข้อมูลประวัติการฝากเงิน...';
    if (btnCancelLatestMonth) {
      btnCancelLatestMonth.disabled = false;
      btnCancelLatestMonth.textContent = '⏹️ หยุดดึงข้อมูล (แสดงเท่าที่ได้)';
    }

    if (statusEl) statusEl.textContent = '⏳ กำลังดึงประวัติการฝากเงิน 2 เดือนและข้อมูลสมาชิกทั้งหมด...';
    btnFetchLatestMonth.disabled = true;

    try {
      const yearMonth = selMonthRef ? selMonthRef.value : undefined;
      const filterMode = latestMonthFilterMode || 'both';

      const res = await window.nkAPI.fetchLatestMonthDepositors({
        yearMonth,
        filterMode
      });

      if (res && res.ok) {
        latestMonthAllRows = res.rows || [];
        latestMonthCurMonth = res.curMonth;
        latestMonthPrevMonth = res.prevMonth;

        updateLatestMonthDynamicLabels(yearMonth);
        renderLatestMonthView();

        if (container) container.style.display = 'block';
        if (statusEl) {
          const bothCount = latestMonthAllRows.filter((r) => r.hasBothMonths).length;
          const curCount = latestMonthAllRows.filter((r) => r.hasCurDeposit).length;
          const prevCount = latestMonthAllRows.filter((r) => r.hasPrevDeposit).length;
          statusEl.textContent = `✅ ดึงข้อมูลสำเร็จ! รวมผู้ที่มียอดฝาก ${latestMonthAllRows.length.toLocaleString('th-TH')} คน (ฝากเดือนนี้: ${curCount.toLocaleString('th-TH')} คน, ฝากเดือนที่แล้ว: ${prevCount.toLocaleString('th-TH')} คน, ฝากทั้ง 2 เดือน: ${bothCount.toLocaleString('th-TH')} คน)`;
        }

        showToast({
          type: 'success',
          badge: 'รายงานลูกค้า',
          title: 'ดึงรายงานลูกค้าฝากล่าสุดสำเร็จ!',
          detail: `ประมวลผลสมาชิกเรียบร้อย พบผู้มียอดฝากรวม ${latestMonthAllRows.length.toLocaleString('th-TH')} คน`,
          badgeColor: '#10b981'
        });
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '❌ ล้มเหลว: ' + (err?.message || err);
      showToast({
        type: 'error',
        badge: 'Error',
        title: 'ดึงรายงานไม่สำเร็จ',
        detail: err?.message || String(err),
        badgeColor: '#ef4444'
      });
    } finally {
      if (progressBox) progressBox.style.display = 'none';
      btnFetchLatestMonth.disabled = false;
      if (btnCancelLatestMonth) {
        btnCancelLatestMonth.disabled = false;
        btnCancelLatestMonth.textContent = '⏹️ หยุดดึงข้อมูล (แสดงเท่าที่ได้)';
      }
    }
  });
}

if (btnCancelLatestMonth) {
  btnCancelLatestMonth.addEventListener('click', async () => {
    btnCancelLatestMonth.disabled = true;
    btnCancelLatestMonth.textContent = '⏳ กำลังหยุด...';
    try {
      await window.nkAPI.cancelLatestMonthDepositors();
    } catch (e) {}
  });
}

function renderLatestMonthView() {
  // 1. Filter rows by active filter mode
  let filteredRows = [];
  if (latestMonthFilterMode === 'cur') {
    filteredRows = latestMonthAllRows.filter((r) => r.hasCurDeposit);
    filteredRows.sort((a, b) => (b.curMonthDeposit || 0) - (a.curMonthDeposit || 0));
  } else if (latestMonthFilterMode === 'prev') {
    filteredRows = latestMonthAllRows.filter((r) => r.hasPrevDeposit);
    filteredRows.sort((a, b) => (b.prevMonthDeposit || 0) - (a.prevMonthDeposit || 0));
  } else {
    // both
    filteredRows = latestMonthAllRows.filter((r) => r.hasBothMonths);
    filteredRows.sort((a, b) => (b.recentTotalDeposit || 0) - (a.recentTotalDeposit || 0));
  }

  // 2. Compute stats for filtered set
  const vipList = filteredRows.filter((r) => r.tierKey === 'vip');
  const genList = filteredRows.filter((r) => r.tierKey === 'general');
  const newList = filteredRows.filter((r) => r.tierKey === 'new');

  let vipTot = 0;
  let genTot = 0;
  let newTot = 0;
  let grandTot = 0;

  if (latestMonthFilterMode === 'cur') {
    vipTot = vipList.reduce((s, r) => s + (r.curMonthDeposit || 0), 0);
    genTot = genList.reduce((s, r) => s + (r.curMonthDeposit || 0), 0);
    newTot = newList.reduce((s, r) => s + (r.curMonthDeposit || 0), 0);
    grandTot = filteredRows.reduce((s, r) => s + (r.curMonthDeposit || 0), 0);
  } else if (latestMonthFilterMode === 'prev') {
    vipTot = vipList.reduce((s, r) => s + (r.prevMonthDeposit || 0), 0);
    genTot = genList.reduce((s, r) => s + (r.prevMonthDeposit || 0), 0);
    newTot = newList.reduce((s, r) => s + (r.prevMonthDeposit || 0), 0);
    grandTot = filteredRows.reduce((s, r) => s + (r.prevMonthDeposit || 0), 0);
  } else {
    // both
    vipTot = vipList.reduce((s, r) => s + (r.recentTotalDeposit || 0), 0);
    genTot = genList.reduce((s, r) => s + (r.recentTotalDeposit || 0), 0);
    newTot = newList.reduce((s, r) => s + (r.recentTotalDeposit || 0), 0);
    grandTot = filteredRows.reduce((s, r) => s + (r.recentTotalDeposit || 0), 0);
  }

  const sumPrev = filteredRows.reduce((s, r) => s + (r.prevMonthDeposit || 0), 0);
  const sumCur = filteredRows.reduce((s, r) => s + (r.curMonthDeposit || 0), 0);

  // Update Stat Cards
  const elVipAmt = document.getElementById('statLatestVipAmount');
  const elVipCnt = document.getElementById('statLatestVipCount');
  const elGenAmt = document.getElementById('statLatestGeneralAmount');
  const elGenCnt = document.getElementById('statLatestGeneralCount');
  const elNewAmt = document.getElementById('statLatestNewAmount');
  const elNewCnt = document.getElementById('statLatestNewCount');
  const elTotAmt = document.getElementById('statLatestTotalAmount');
  const elTotCnt = document.getElementById('statLatestTotalCount');
  const elTotTitle = document.getElementById('statLatestTotalTitle');

  if (elVipAmt) elVipAmt.textContent = '฿' + vipTot.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  if (elVipCnt) elVipCnt.textContent = `${vipList.length.toLocaleString('th-TH')} คน`;

  if (elGenAmt) elGenAmt.textContent = '฿' + genTot.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  if (elGenCnt) elGenCnt.textContent = `${genList.length.toLocaleString('th-TH')} คน`;

  if (elNewAmt) elNewAmt.textContent = '฿' + newTot.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  if (elNewCnt) elNewCnt.textContent = `${newList.length.toLocaleString('th-TH')} คน`;

  if (elTotAmt) elTotAmt.textContent = '฿' + grandTot.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const prevL = latestMonthPrevMonth?.shortLabel || 'ด.ก่อน';
  const curL = latestMonthCurMonth?.shortLabel || 'ด.นี้';

  if (elTotCnt) {
    if (latestMonthFilterMode === 'cur') {
      elTotCnt.textContent = `${filteredRows.length.toLocaleString('th-TH')} คน (${curL}: ฿${grandTot.toLocaleString('th-TH', { maximumFractionDigits: 0 })})`;
    } else if (latestMonthFilterMode === 'prev') {
      elTotCnt.textContent = `${filteredRows.length.toLocaleString('th-TH')} คน (${prevL}: ฿${grandTot.toLocaleString('th-TH', { maximumFractionDigits: 0 })})`;
    } else {
      elTotCnt.textContent = `${filteredRows.length.toLocaleString('th-TH')} คน (${prevL}: ฿${sumPrev.toLocaleString('th-TH', { maximumFractionDigits: 0 })}, ${curL}: ฿${sumCur.toLocaleString('th-TH', { maximumFractionDigits: 0 })})`;
    }
  }

  if (elTotTitle) {
    if (latestMonthFilterMode === 'cur') {
      elTotTitle.textContent = `📅 สรุปยอด (1. ฝากเดือนนี้ - ${curL})`;
    } else if (latestMonthFilterMode === 'prev') {
      elTotTitle.textContent = `⏪ สรุปยอด (2. ฝากเดือนที่แล้ว - ${prevL})`;
    } else {
      elTotTitle.textContent = '🌟 สรุปยอด (3. ฝากเดือนนี้ + เดือนที่แล้ว)';
    }
  }

  // Update Tab Count Badges
  const tabAll = document.getElementById('countLatestTabAll');
  const tabVip = document.getElementById('countLatestTabVip');
  const tabGen = document.getElementById('countLatestTabGeneral');
  const tabNew = document.getElementById('countLatestTabNew');
  if (tabAll) tabAll.textContent = filteredRows.length.toLocaleString('th-TH');
  if (tabVip) tabVip.textContent = vipList.length.toLocaleString('th-TH');
  if (tabGen) tabGen.textContent = genList.length.toLocaleString('th-TH');
  if (tabNew) tabNew.textContent = newList.length.toLocaleString('th-TH');

  // Render Table
  renderLatestMonthTable();
}

function renderLatestMonthTable() {
  const tbody = document.getElementById('latestMonthTableBody');
  const infoEl = document.getElementById('latestMonthTableInfo');
  if (!tbody) return;

  // 1. Mode filter
  let list = [];
  if (latestMonthFilterMode === 'cur') {
    list = latestMonthAllRows.filter((r) => r.hasCurDeposit);
    list.sort((a, b) => (b.curMonthDeposit || 0) - (a.curMonthDeposit || 0));
  } else if (latestMonthFilterMode === 'prev') {
    list = latestMonthAllRows.filter((r) => r.hasPrevDeposit);
    list.sort((a, b) => (b.prevMonthDeposit || 0) - (a.prevMonthDeposit || 0));
  } else {
    // both
    list = latestMonthAllRows.filter((r) => r.hasBothMonths);
    list.sort((a, b) => (b.recentTotalDeposit || 0) - (a.recentTotalDeposit || 0));
  }

  // 2. Tier filter
  if (latestMonthTierFilter !== 'all') {
    list = list.filter((r) => r.tierKey === latestMonthTierFilter);
  }

  // 3. Search filter
  if (latestMonthSearchQuery) {
    const q = latestMonthSearchQuery;
    list = list.filter((r) =>
      r.username.toLowerCase().includes(q) ||
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.phone && r.phone.replace(/[^0-9]/g, '').includes(q))
    );
  }

  if (infoEl) {
    infoEl.textContent = `แสดง ${list.length.toLocaleString('th-TH')} รายการ (จากทั้งหมด ${latestMonthAllRows.length.toLocaleString('th-TH')} คน)`;
  }

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state" style="text-align:center; padding:30px; color:var(--text-dim);">ไม่พบข้อมูลสมาชิกตามเงื่อนไขที่เลือก</td></tr>';
    return;
  }

  const renderLimit = 150;
  const displayRows = list.slice(0, renderLimit);

  tbody.innerHTML = displayRows.map((m, idx) => {
    let tierBadge = '';
    if (m.tierKey === 'vip') {
      tierBadge = '<span style="background:rgba(217,119,6,0.18); color:#f59e0b; border:1px solid rgba(217,119,6,0.35); padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px;">🥇 VIP</span>';
    } else if (m.tierKey === 'general') {
      tierBadge = '<span style="background:rgba(37,99,235,0.18); color:#38bdf8; border:1px solid rgba(37,99,235,0.35); padding:2px 8px; border-radius:6px; font-weight:600; font-size:11px;">🥈 ทั่วไป</span>';
    } else {
      tierBadge = '<span style="background:rgba(16,185,129,0.18); color:#10b981; border:1px solid rgba(16,185,129,0.35); padding:2px 8px; border-radius:6px; font-weight:600; font-size:11px;">🥉 ใหม่</span>';
    }

    let statusBadge = '';
    if (m.hasBothMonths) {
      statusBadge = '<span style="background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.4); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">🌟 ฝากทั้ง 2 เดือน</span>';
    } else if (m.hasCurDeposit) {
      statusBadge = '<span style="background:rgba(59,130,246,0.18); color:#60a5fa; border:1px solid rgba(59,130,246,0.4); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">📅 ฝากเดือนนี้</span>';
    } else if (m.hasPrevDeposit) {
      statusBadge = '<span style="background:rgba(245,158,11,0.18); color:#fbbf24; border:1px solid rgba(245,158,11,0.4); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">⏪ ฝากเดือนที่แล้ว</span>';
    } else {
      statusBadge = '<span style="color:var(--text-dim); font-size:11px;">-</span>';
    }

    // Dynamic column highlighting based on active filter mode
    let colPrevStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:600; color:${m.prevMonthDeposit > 0 ? 'var(--text)' : 'var(--text-dim)'};`;
    let colCurStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:600; color:${m.curMonthDeposit > 0 ? '#10b981' : 'var(--text-dim)'};`;
    let colTotStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:700; color:#f59e0b;`;

    if (latestMonthFilterMode === 'prev') {
      colPrevStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:800; color:#38bdf8; background:rgba(56,189,248,0.1); border-radius:4px;`;
    } else if (latestMonthFilterMode === 'cur') {
      colCurStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:800; color:#34d399; background:rgba(16,185,129,0.12); border-radius:4px;`;
    } else {
      colTotStyle = `padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums; font-weight:800; color:#fbbf24; background:rgba(245,158,11,0.1); border-radius:4px;`;
    }

    return `
      <tr style="border-bottom:1px solid var(--border-subtle); height:38px;">
        <td style="padding:8px 8px; text-align:center; color:var(--text-dim); font-size:11px;">${idx + 1}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:700; color:var(--accent); font-family:monospace;">${m.username}</td>
        <td style="padding:8px 10px; text-align:left; color:var(--text);">${m.name || '-'}</td>
        <td style="padding:8px 10px; text-align:center; color:var(--text-muted); font-family:monospace;">${m.phone || '-'}</td>
        <td style="padding:8px 10px; text-align:center;">${tierBadge}</td>
        <td style="${colPrevStyle}">฿${(m.prevMonthDeposit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td style="${colCurStyle}">฿${(m.curMonthDeposit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td style="${colTotStyle}">฿${(m.recentTotalDeposit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 10px; text-align:center;">${statusBadge}</td>
        <td style="padding:8px 10px; text-align:center; font-size:11px; color:var(--text-dim);">${m.lastDepositAt || '-'}</td>
        <td style="padding:8px 10px; text-align:center; font-size:11px; color:var(--text-dim);">${m.registeredAt || '-'}</td>
      </tr>
    `;
  }).join('');
}

// Export Latest Month Depositors to Excel
const btnExportLatestMonthExcel = document.getElementById('btnExportLatestMonthExcel');
if (btnExportLatestMonthExcel) {
  btnExportLatestMonthExcel.addEventListener('click', async () => {
    if (!latestMonthAllRows || !latestMonthAllRows.length) {
      showToast({
        type: 'warning',
        badge: 'Excel',
        title: 'ไม่มีข้อมูลสำหรับส่งออก',
        detail: 'กรุณากดดึงรายงานลูกค้าฝากล่าสุดก่อนทำการส่งออกไฟล์',
        badgeColor: '#f59e0b'
      });
      return;
    }

    const pad2 = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const modeLabel = latestMonthFilterMode === 'both'
      ? 'ฝากทั้ง2เดือน'
      : (latestMonthFilterMode === 'cur' ? 'ฝากเดือนนี้' : 'ฝากเดือนที่แล้ว');
    const defaultFilename = `NK_รายงานลูกค้าฝากล่าสุด_${modeLabel}_${dateStr}.xlsx`;

    const savePath = await window.nkAPI.selectSavePath(defaultFilename);
    if (!savePath) return;

    const origHtml = btnExportLatestMonthExcel.innerHTML;
    btnExportLatestMonthExcel.disabled = true;
    btnExportLatestMonthExcel.innerHTML = '<span>⏳</span><span>กำลังสร้างไฟล์ Excel...</span>';

    try {
      const res = await window.nkAPI.exportLatestMonthDepositorsExcel(savePath, {
        filterMode: latestMonthFilterMode
      });

      if (res && res.ok) {
        showToast({
          type: 'success',
          badge: 'Excel',
          title: '📥 ส่งออกรายงานสำเร็จ!',
          detail: `บันทึกไฟล์เรียบร้อยที่: ${res.filePath}`,
          badgeColor: '#10b981'
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        badge: 'Excel',
        title: '❌ ส่งออกไฟล์ไม่สำเร็จ',
        detail: err?.message || String(err),
        badgeColor: '#ef4444'
      });
    } finally {
      btnExportLatestMonthExcel.disabled = false;
      btnExportLatestMonthExcel.innerHTML = origHtml;
    }
  });
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLatestMonthControls);
} else {
  initLatestMonthControls();
}

// ==========================================
// 6.5 CUSTOMER RETENTION & COHORT SEGMENTATION
// ==========================================
let cohortAllRows = [];
let cohortMonthsConfig = null;
let cohortCurrentGroupFilter = 'all';
let cohortCurrentReturnFilter = 'all';
let cohortSearchQuery = '';

// Initialize Cohort Month Labels & Load Cached State
async function initCohortMonths(refDateStr = null) {
  try {
    const months = await window.nkAPI?.getCohortMonths?.(refDateStr);
    if (!months) return;
    cohortMonthsConfig = months;

    const { current, chronological, latestHistorical } = months;

    // Update range description info
    const rangeInfo = document.getElementById('cohortRangeInfo');
    if (rangeInfo) {
      rangeInfo.textContent = `6 เดือนย้อนหลัง: ${chronological[0].shortLabel} ถึง ${latestHistorical.shortLabel}  ·  ติดตามการกลับมา: ${current.label}`;
    }

    // Update table headers for months
    chronological.forEach((m, idx) => {
      const th = document.getElementById(`thMonthM${6 - idx}`);
      if (th) th.textContent = m.shortLabel;
    });

    const thCurStatus = document.getElementById('thMonthCurStatus');
    if (thCurStatus) thCurStatus.textContent = `สถานะ ${current.shortLabel}`;

    const thCurDep = document.getElementById('thMonthCurDep');
    if (thCurDep) thCurDep.textContent = `ยอดฝาก ${current.shortLabel}`;

    // Check existing state from store
    const stateRes = await window.nkAPI?.getCohortState?.();
    if (stateRes?.cached?.rows?.length) {
      cohortAllRows = stateRes.cached.rows;
      renderCohortKpis(stateRes.cached.summary);
      renderCohortDailySummary(cohortAllRows);
      renderCohortTable();
      const kpiContainer = document.getElementById('cohortKpiContainer');
      if (kpiContainer) kpiContainer.style.display = 'block';
      const btnExport = document.getElementById('btnExportCohortExcel');
      if (btnExport) btnExport.style.display = 'inline-flex';
    }
  } catch (err) {
    console.warn('[Cohort] Error init months:', err);
  }
}

// Render KPI Cards
function renderCohortKpis(summary) {
  if (!summary) return;
  const { overall, parentGroups, subgroups } = summary;

  // Overall banner
  const rateEl = document.getElementById('kpiOverallReturnRate');
  const ratioEl = document.getElementById('kpiOverallRatio');
  const curDepEl = document.getElementById('kpiOverallCurrentDep');
  const histDepEl = document.getElementById('kpiOverallHistDep');

  if (rateEl) rateEl.textContent = `${overall.returnRate.toFixed(2)}%`;
  if (ratioEl) ratioEl.textContent = `กลับมา ${overall.returnCount.toLocaleString('th-TH')} จากทั้งหมด ${overall.totalCount.toLocaleString('th-TH')} คน`;
  if (curDepEl) curDepEl.textContent = '฿' + overall.currentDepositSum.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  if (histDepEl) histDepEl.textContent = '฿' + overall.historicalDepositSum.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  // Group 1
  const p1 = parentGroups['1'];
  const sg = subgroups;
  const g1Rate = document.getElementById('kpiG1Rate');
  const g1Tot = document.getElementById('kpiG1Total');
  const g1Ret = document.getElementById('kpiG1Return');
  if (g1Rate) g1Rate.textContent = `${p1.returnRate.toFixed(1)}%`;
  if (g1Tot) g1Tot.textContent = p1.totalCount.toLocaleString('th-TH');
  if (g1Ret) g1Ret.textContent = p1.returnCount.toLocaleString('th-TH');

  const g11Rate = document.getElementById('kpiG11Rate');
  const g11Tot = document.getElementById('kpiG11Total');
  const g11Ret = document.getElementById('kpiG11Return');
  if (g11Rate) g11Rate.textContent = `${sg['1.1'].returnRate.toFixed(1)}%`;
  if (g11Tot) g11Tot.textContent = sg['1.1'].totalCount.toLocaleString('th-TH');
  if (g11Ret) g11Ret.textContent = sg['1.1'].returnCount.toLocaleString('th-TH');

  const g12Rate = document.getElementById('kpiG12Rate');
  const g12Tot = document.getElementById('kpiG12Total');
  const g12Ret = document.getElementById('kpiG12Return');
  if (g12Rate) g12Rate.textContent = `${sg['1.2'].returnRate.toFixed(1)}%`;
  if (g12Tot) g12Tot.textContent = sg['1.2'].totalCount.toLocaleString('th-TH');
  if (g12Ret) g12Ret.textContent = sg['1.2'].returnCount.toLocaleString('th-TH');

  // Group 2
  const p2 = parentGroups['2'];
  const g2Rate = document.getElementById('kpiG2Rate');
  const g2Tot = document.getElementById('kpiG2Total');
  const g2Ret = document.getElementById('kpiG2Return');
  if (g2Rate) g2Rate.textContent = `${p2.returnRate.toFixed(1)}%`;
  if (g2Tot) g2Tot.textContent = p2.totalCount.toLocaleString('th-TH');
  if (g2Ret) g2Ret.textContent = p2.returnCount.toLocaleString('th-TH');

  const g21Rate = document.getElementById('kpiG21Rate');
  const g21Tot = document.getElementById('kpiG21Total');
  const g21Ret = document.getElementById('kpiG21Return');
  if (g21Rate) g21Rate.textContent = `${sg['2.1'].returnRate.toFixed(1)}%`;
  if (g21Tot) g21Tot.textContent = sg['2.1'].totalCount.toLocaleString('th-TH');
  if (g21Ret) g21Ret.textContent = sg['2.1'].returnCount.toLocaleString('th-TH');

  const g22Rate = document.getElementById('kpiG22Rate');
  const g22Tot = document.getElementById('kpiG22Total');
  const g22Ret = document.getElementById('kpiG22Return');
  if (g22Rate) g22Rate.textContent = `${sg['2.2'].returnRate.toFixed(1)}%`;
  if (g22Tot) g22Tot.textContent = sg['2.2'].totalCount.toLocaleString('th-TH');
  if (g22Ret) g22Ret.textContent = sg['2.2'].returnCount.toLocaleString('th-TH');

  // Group 3
  const p3 = parentGroups['3'];
  const g3Rate = document.getElementById('kpiG3Rate');
  const g3Tot = document.getElementById('kpiG3Total');
  const g3Ret = document.getElementById('kpiG3Return');
  if (g3Rate) g3Rate.textContent = `${p3.returnRate.toFixed(1)}%`;
  if (g3Tot) g3Tot.textContent = p3.totalCount.toLocaleString('th-TH');
  if (g3Ret) g3Ret.textContent = p3.returnCount.toLocaleString('th-TH');

  const g31Rate = document.getElementById('kpiG31Rate');
  const g31Tot = document.getElementById('kpiG31Total');
  const g31Ret = document.getElementById('kpiG31Return');
  if (g31Rate) g31Rate.textContent = `${sg['3.1'].returnRate.toFixed(1)}%`;
  if (g31Tot) g31Tot.textContent = sg['3.1'].totalCount.toLocaleString('th-TH');
  if (g31Ret) g31Ret.textContent = sg['3.1'].returnCount.toLocaleString('th-TH');

  const g32Rate = document.getElementById('kpiG32Rate');
  const g32Tot = document.getElementById('kpiG32Total');
  const g32Ret = document.getElementById('kpiG32Return');
  if (g32Rate) g32Rate.textContent = `${sg['3.2'].returnRate.toFixed(1)}%`;
  if (g32Tot) g32Tot.textContent = sg['3.2'].totalCount.toLocaleString('th-TH');
  if (g32Ret) g32Ret.textContent = sg['3.2'].returnCount.toLocaleString('th-TH');
}

// Render Cohort Table
function renderCohortDailySummary(rows, activeGroup = 'all') {
  const container = document.getElementById('cohortDailySummaryContainer');
  const head = document.getElementById('cohortDailySumHead');
  const bodyUsers = document.getElementById('cohortDailySumBodyUsers');
  const bodyDep = document.getElementById('cohortDailySumBodyDep');
  const titleEl = document.getElementById('cohortDailySumTitle');
  const statsEl = document.getElementById('cohortDailySumStats');
  if (!container || !head || !bodyUsers || !bodyDep) return;

  if (!cohortAllRows || cohortAllRows.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Use provided rows or default to cohortAllRows
  const targetRows = (rows && rows.length) ? rows : (activeGroup === 'all' ? cohortAllRows : []);

  // Aggregate by day 1 to 31
  const dailyUsersSet = {};
  const dailyDeps = {};
  for (let i = 1; i <= 31; i++) {
    dailyUsersSet[i] = new Set();
    dailyDeps[i] = 0;
  }

  const returnedUserSet = new Set();
  let totalReturnedDeposit = 0;

  targetRows.forEach(r => {
    const isReturned = Boolean(r.hasReturned || r.hasCurrentMonth || (Number(r.currentMonthDeposit) > 0));
    if (!isReturned) return;

    const curDepAmt = Number(r.currentMonthDeposit) || 0;
    returnedUserSet.add(r.username);
    totalReturnedDeposit += curDepAmt;

    // Check if row has detailed dailyDeposits object
    if (r.dailyDeposits && typeof r.dailyDeposits === 'object' && Object.keys(r.dailyDeposits).length > 0) {
      for (const [dayKey, amt] of Object.entries(r.dailyDeposits)) {
        const d = parseInt(dayKey, 10);
        if (d >= 1 && d <= 31) {
          dailyUsersSet[d].add(r.username);
          dailyDeps[d] += Number(amt) || 0;
        }
      }
      return;
    }

    // Fallback: Parse date from lastDepositAt, lastOnline, or lastOnlineStr
    const dateStr = r.lastDepositAt || r.lastOnline || r.lastOnlineStr;
    if (dateStr && dateStr !== '-') {
      let day = null;
      const mIso = String(dateStr).match(/^\d{4}[-/]\d{2}[-/](\d{1,2})/);
      const mSlash = String(dateStr).match(/^(\d{1,2})\/\d{1,2}\/\d{4}/);
      if (mIso) {
        day = parseInt(mIso[1], 10);
      } else if (mSlash) {
        day = parseInt(mSlash[1], 10);
      } else {
        try {
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) day = dt.getDate();
        } catch (e) {}
      }

      if (day && day >= 1 && day <= 31) {
        dailyUsersSet[day].add(r.username);
        dailyDeps[day] += curDepAmt;
      }
    }
  });

  const totalReturnedUsers = returnedUserSet.size;

  // Format currency helper
  function formatDailyAmt(amt) {
    if (!amt || amt <= 0) return '-';
    if (amt >= 1000000) return (amt / 1000000).toFixed(2) + 'M';
    if (amt >= 10000) return Math.round(amt / 1000) + 'k';
    if (amt >= 1000) return (amt / 1000).toFixed(1) + 'k';
    return Math.round(amt).toLocaleString('th-TH');
  }

  // Update title & badges
  const curMonthLabel = cohortMonthsConfig?.current?.shortLabel || 'เดือนติดตามผล';
  if (titleEl) {
    let groupText = 'ทุกกลุ่ม';
    if (activeGroup && activeGroup !== 'all') {
      groupText = `กลุ่ม ${activeGroup}`;
    }
    titleEl.textContent = `📅 สรุปการกลับมารายวัน · ${groupText} (${curMonthLabel})`;
  }
  if (statsEl) {
    statsEl.innerHTML = `
      <span style="background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); padding:3px 8px; border-radius:12px; font-weight:600;">
        👤 กลับมา ${totalReturnedUsers.toLocaleString('th-TH')} คน
      </span>
      <span style="background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.25); padding:3px 8px; border-radius:12px; font-weight:600;">
        💰 ฿${totalReturnedDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    `;
  }

  // Render Table Cells
  let ths = '<th style="padding:8px 6px; border:1px solid rgba(255,255,255,0.1); width:65px; background:rgba(255,255,255,0.03);">วันที่</th>';
  let tdUsers = '<td style="padding:8px 6px; border:1px solid rgba(255,255,255,0.1); color:var(--text-dim); font-weight:600;">ยูสเซอร์</td>';
  let tdDeps = '<td style="padding:8px 6px; border:1px solid rgba(255,255,255,0.1); color:var(--text-dim); font-weight:600;">ยอดฝาก</td>';

  const todayDate = new Date().getDate();

  for (let i = 1; i <= 31; i++) {
    const isToday = (i === todayDate);
    const todayStyle = isToday ? 'background:rgba(245,158,11,0.15); color:#f59e0b; font-weight:800;' : '';
    ths += `<th style="padding:6px 2px; border:1px solid rgba(255,255,255,0.1); min-width:28px; ${todayStyle}">${i}</th>`;

    const uCount = dailyUsersSet[i].size;
    if (uCount > 0) {
      tdUsers += `<td style="padding:6px 2px; border:1px solid rgba(255,255,255,0.1); background:rgba(56,189,248,0.08); color:#38bdf8; font-weight:700;" title="วันที่ ${i}: กลับมา ${uCount} คน">${uCount}</td>`;
    } else {
      tdUsers += `<td style="padding:6px 2px; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.15);">-</td>`;
    }

    const dAmt = dailyDeps[i];
    if (dAmt > 0) {
      tdDeps += `<td style="padding:6px 2px; border:1px solid rgba(255,255,255,0.1); background:rgba(16,185,129,0.08); color:#10b981; font-weight:600; font-size:11px;" title="วันที่ ${i}: ฿${dAmt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">${formatDailyAmt(dAmt)}</td>`;
    } else {
      tdDeps += `<td style="padding:6px 2px; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.15); font-size:10px;">-</td>`;
    }
  }

  // Add "รวม" (Total) column on the right
  ths += `<th style="padding:6px 10px; border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.15); color:#f59e0b; font-weight:700;">รวม</th>`;
  tdUsers += `<td style="padding:6px 10px; border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.08); font-weight:800; color:#f59e0b;">${totalReturnedUsers.toLocaleString('th-TH')}</td>`;
  tdDeps += `<td style="padding:6px 10px; border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.08); font-weight:800; color:#34d399; font-size:11px;" title="ยอดรวม: ฿${totalReturnedDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">${formatDailyAmt(totalReturnedDeposit)}</td>`;

  head.innerHTML = ths;
  bodyUsers.innerHTML = tdUsers;
  bodyDep.innerHTML = tdDeps;
  container.style.display = 'block';
}

function renderCohortTable() {
  const tbody = document.getElementById('cohortTableBody');
  const infoEl = document.getElementById('cohortTableInfo');
  if (!tbody) return;

  if (!cohortAllRows || !cohortAllRows.length) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:40px 20px; color:var(--text-muted);">ยังไม่มีข้อมูล กรุณากดปุ่ม <b>"⚡ ดึงข้อมูล & วิเคราะห์กลุ่มลูกค้า"</b> ด้านบน</td></tr>`;
    if (infoEl) infoEl.textContent = 'พร้อมแสดงข้อมูลหลังการดึง';
    return;
  }

  const chronological = cohortMonthsConfig?.chronological || [];

  // Filter
  const filtered = cohortAllRows.filter(r => {
    // Group filter
    if (cohortCurrentGroupFilter !== 'all') {
      if (['1', '2', '3'].includes(cohortCurrentGroupFilter)) {
        if (r.parentGroup !== cohortCurrentGroupFilter) return false;
      } else {
        if (r.groupKey !== cohortCurrentGroupFilter) return false;
      }
    }

    // Return status filter
    if (cohortCurrentReturnFilter === 'returned' && !r.hasReturned) return false;
    if (cohortCurrentReturnFilter === 'not_returned' && r.hasReturned) return false;

    // Search query
    if (cohortSearchQuery) {
      const q = cohortSearchQuery.toLowerCase();
      const matchU = r.username.toLowerCase().includes(q);
      const matchP = (r.phone || '').toLowerCase().includes(q);
      const matchN = (r.name || '').toLowerCase().includes(q);
      if (!matchU && !matchP && !matchN) return false;
    }

    return true;
  });

  renderCohortDailySummary(filtered, cohortCurrentGroupFilter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px 20px; color:var(--text-muted);">ไม่พบข้อมูลที่ตรงกับตัวกรอง</td></tr>`;
    if (infoEl) infoEl.textContent = `แสดง 0 รายการ (จากทั้งหมด ${cohortAllRows.length.toLocaleString('th-TH')} รายการ)`;
    return;
  }

  tbody.innerHTML = filtered.map((r, idx) => {
    // Group Badge
    let groupBadge = '';
    if (r.groupKey === '1.1') {
      groupBadge = `<span style="background:rgba(245,158,11,0.18); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); padding:2px 6px; border-radius:8px; font-weight:700; font-size:11px;">1.1 ขาประจำ</span>`;
    } else if (r.groupKey === '1.2') {
      groupBadge = `<span style="background:rgba(217,119,6,0.12); color:#d97706; border:1px solid rgba(217,119,6,0.3); padding:2px 6px; border-radius:8px; font-weight:700; font-size:11px;">1.2 เสี่ยงหลุด</span>`;
    } else if (r.groupKey === '2.1') {
      groupBadge = `<span style="background:rgba(59,130,246,0.18); color:#60a5fa; border:1px solid rgba(59,130,246,0.35); padding:2px 6px; border-radius:8px; font-weight:700; font-size:11px;">2.1 ทั่วไป</span>`;
    } else if (r.groupKey === '2.2') {
      groupBadge = `<span style="background:rgba(37,99,235,0.12); color:#3b82f6; border:1px solid rgba(37,99,235,0.3); padding:2px 6px; border-radius:8px; font-weight:700; font-size:11px;">2.2 หยุดเล่น</span>`;
    } else if (r.groupKey === '3.1') {
      groupBadge = `<span style="background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.35); padding:2px 6px; border-radius:8px; font-weight:700; font-size:11px;">3.1 ใหม่</span>`;
    } else {
      groupBadge = `<span style="background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.25); padding:2px 6px; border-radius:8px; font-weight:600; font-size:11px;">3.2 ครั้งเดียว</span>`;
    }

    // Return status badge
    let returnBadge = r.hasReturned
      ? `<span style="color:#10b981; font-weight:700;">✅ กลับมาแล้ว</span>`
      : `<span style="color:#ef4444; font-size:11px;">❌ ยังไม่มา</span>`;

    // Monthly deposit cells
    let monthCells = chronological.map(m => {
      const dep = r.monthlyDeposits[m.monthKey] || 0;
      if (dep > 0) {
        return `<td style="text-align:right; padding:8px 10px; font-family:monospace; font-weight:600; color:#38bdf8;">฿${dep.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
      }
      return `<td style="text-align:right; padding:8px 10px; font-family:monospace; color:rgba(255,255,255,0.2);">-</td>`;
    }).join('');

    const curDepStr = (r.currentMonthDeposit || 0) > 0
      ? `<span style="font-weight:800; color:#10b981;">฿${r.currentMonthDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
      : `<span style="color:var(--text-muted);">-</span>`;

    return `
      <tr style="border-bottom:1px solid var(--border-subtle);">
        <td style="text-align:center; padding:8px 6px; color:var(--text-dim); font-size:11px;">${idx + 1}</td>
        <td style="text-align:center; padding:8px 8px;">${groupBadge}</td>
        <td style="text-align:center; padding:8px 10px; font-weight:600; color:var(--text-main); font-family:monospace;">${r.username}</td>
        <td style="text-align:center; padding:8px 8px; color:var(--text-dim); font-family:monospace;">${r.phone || '-'}</td>
        <td style="text-align:left; padding:8px 10px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${r.name || '-'}</td>
        ${monthCells}
        <td style="text-align:center; padding:8px 8px; font-weight:700; color:#f1f5f9;">${r.activeMonthCount}/6</td>
        <td style="text-align:center; padding:8px 8px;">${returnBadge}</td>
        <td style="text-align:right; padding:8px 10px; font-family:monospace;">${curDepStr}</td>
        <td style="text-align:center; padding:8px 8px; color:var(--text-muted); font-size:11px; font-family:monospace;">${r.lastOnline || '-'}</td>
      </tr>
    `;
  }).join('');

  if (infoEl) {
    infoEl.textContent = `แสดง ${filtered.length.toLocaleString('th-TH')} รายการ (จากทั้งหมด ${cohortAllRows.length.toLocaleString('th-TH')} รายการ)`;
  }
}

// Cohort Tab Clicks
document.querySelectorAll('#cohortTierTabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cohortTierTabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cohortCurrentGroupFilter = btn.getAttribute('data-group') || 'all';
    renderCohortTable();
  });
});

const cohortReturnFilter = document.getElementById('cohortReturnFilter');
if (cohortReturnFilter) {
  cohortReturnFilter.addEventListener('change', () => {
    cohortCurrentReturnFilter = cohortReturnFilter.value;
    renderCohortTable();
  });
}

const cohortSearchInput = document.getElementById('cohortSearchInput');
if (cohortSearchInput) {
  cohortSearchInput.addEventListener('input', () => {
    cohortSearchQuery = cohortSearchInput.value.trim();
    renderCohortTable();
  });
}

// Progress listener from main process
if (window.nkAPI?.onCohortProgress) {
  window.nkAPI.onCohortProgress((data) => {
    const pContainer = document.getElementById('cohortProgressContainer');
    const pBar = document.getElementById('cohortProgressBar');
    const pTxt = document.getElementById('cohortProgressText');
    const pPct = document.getElementById('cohortProgressPercent');

    if (pContainer) pContainer.style.display = 'block';
    if (pBar && data.percent !== undefined) pBar.style.width = `${data.percent}%`;
    if (pPct && data.percent !== undefined) pPct.textContent = `${data.percent}%`;
    if (pTxt && data.message) pTxt.textContent = data.message;
  });
}

// Buttons: Fetch, Cancel, Export
const btnFetchCohort = document.getElementById('btnFetchCohort');
const btnCancelCohort = document.getElementById('btnCancelCohort');
const btnExportCohortExcel = document.getElementById('btnExportCohortExcel');
const btnCohortClear = document.getElementById('btnCohortClear');
const cohortTargetMonth = document.getElementById('cohortTargetMonth');

if (cohortTargetMonth) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  cohortTargetMonth.value = `${yyyy}-${mm}`;
  cohortTargetMonth.addEventListener('change', () => {
    initCohortMonths(cohortTargetMonth.value ? `${cohortTargetMonth.value}-28` : null);
  });
}

if (btnFetchCohort) {
  btnFetchCohort.addEventListener('click', async () => {
    const forceRefresh = document.getElementById('chkForceRefreshCohort')?.checked || false;
    const refMonth = document.getElementById('cohortTargetMonth')?.value;
    const refDate = refMonth ? `${refMonth}-28` : null;
    btnFetchCohort.disabled = true;
    if (btnCancelCohort) btnCancelCohort.style.display = 'inline-flex';
    if (btnExportCohortExcel) btnExportCohortExcel.style.display = 'none';
    if (btnCohortClear) btnCohortClear.style.display = 'none';

    const pContainer = document.getElementById('cohortProgressContainer');
    if (pContainer) pContainer.style.display = 'block';

    try {
      const res = await window.nkAPI.fetchCohortData({ forceRefreshAll: forceRefresh, refDate });
      if (res && res.ok) {
        cohortAllRows = res.rows || [];
        renderCohortKpis(res.summary);
        renderCohortDailySummary(cohortAllRows);
        renderCohortTable();
        const kpiContainer = document.getElementById('cohortKpiContainer');
        if (kpiContainer) kpiContainer.style.display = 'block';
        if (btnExportCohortExcel) btnExportCohortExcel.style.display = 'inline-flex';
        if (btnCohortClear) btnCohortClear.style.display = 'inline-flex';
      } else if (res && res.isCancelled) {
        // Cancelled gracefully
      }
    } catch (err) {
      await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลกลุ่มลูกค้า: ' + (err?.message || err), type: 'danger' });
    } finally {
      btnFetchCohort.disabled = false;
      if (btnCancelCohort) btnCancelCohort.style.display = 'none';
      setTimeout(() => {
        if (pContainer) pContainer.style.display = 'none';
      }, 1500);
    }
  });
}

if (btnCancelCohort) {
  btnCancelCohort.addEventListener('click', async () => {
    btnCancelCohort.disabled = true;
    btnCancelCohort.textContent = '⏳ กำลังหยุด...';
    try {
      await window.nkAPI.cancelCohortFetch();
    } catch (e) {
      console.error(e);
    }
  });
}

if (btnExportCohortExcel) {
  btnExportCohortExcel.addEventListener('click', async () => {
    btnExportCohortExcel.disabled = true;
    btnExportCohortExcel.textContent = '⏳ กำลังสร้างไฟล์ Excel...';
    try {
      const res = await window.nkAPI.exportCohortExcel({});
      if (res && res.ok && res.filePath) {
        window.nkAPI.openFile(res.filePath);
      }
    } catch (err) {
      await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: 'เกิดข้อผิดพลาดในการส่งออก Excel: ' + (err?.message || err), type: 'danger' });
    } finally {
      btnExportCohortExcel.disabled = false;
      btnExportCohortExcel.innerHTML = '<span>📥</span> ส่งออก Excel (.xlsx)';
    }
  });
}

if (btnCohortClear) {
  btnCohortClear.addEventListener('click', () => {
    cohortAllRows = [];
    cohortFilteredRows = [];
    const kpiContainer = document.getElementById('cohortKpiContainer');
    if (kpiContainer) kpiContainer.style.display = 'none';
    const sumContainer = document.getElementById('cohortDailySummaryContainer');
    if (sumContainer) sumContainer.style.display = 'none';
    if (btnExportCohortExcel) btnExportCohortExcel.style.display = 'none';
    btnCohortClear.style.display = 'none';

    const tbody = document.getElementById('cohortTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:40px 20px; color:var(--text-muted);">ยังไม่มีข้อมูล กรุณากดปุ่ม <b>"⚡ ดึงข้อมูล & วิเคราะห์กลุ่มลูกค้า"</b> ด้านบน</td></tr>';
    }
    const infoEl = document.getElementById('cohortTableInfo');
    if (infoEl) infoEl.textContent = 'พร้อมแสดงข้อมูลหลังการดึง';
    const summaryEl = document.getElementById('cohortTableSummary');
    if (summaryEl) summaryEl.textContent = '';
  });
}

// ==========================================
// 7. API ANALYZER & GLOBAL SERVER OBSERVER (v3.0.0)
// ==========================================
let analyzerState = {
  endpoints: {},
  history: [],
  meta: {},
  selectedId: '',
  currentTab: 'endpoints'
};

const uiAnalyzer = {
  endpointCount: document.getElementById('endpointCount'),
  requestCount: document.getElementById('requestCount'),
  categoryCount: document.getElementById('categoryCount'),
  lastSeen: document.getElementById('lastSeen'),
  search: document.getElementById('analyzerSearch'),
  categoryFilter: document.getElementById('analyzerCategoryFilter'),
  methodFilter: document.getElementById('analyzerMethodFilter'),
  endpointList: document.getElementById('endpointList'),
  historyList: document.getElementById('historyList'),
  detailPane: document.getElementById('detailPane'),
  btnExportJson: document.getElementById('btnExportAnalyzerJson'),
  btnObserverTick: document.getElementById('btnObserverTick'),
  btnClearAnalyzer: document.getElementById('btnClearAnalyzer')
};

const categoryLabels = {
  member_search: 'ค้นหาสมาชิก',
  member_profile: 'ข้อมูลสมาชิก',
  deposit_history: 'ประวัติฝาก',
  withdraw_approve: 'อนุมัติถอน',
  withdraw_history: 'ประวัติถอน',
  bonus_promotion: 'โบนัส / โปรโมชั่น',
  admin_activity: 'กิจกรรมแอดมิน',
  transaction_history: 'ประวัติรายการ',
  report_summary: 'รายงาน / สรุป',
  auth_session: 'เข้าสู่ระบบ / Session',
  other: 'อื่น ๆ'
};

function labelCategory(v) {
  return categoryLabels[v] || v || 'อื่น ๆ';
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatJson(val) {
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val ?? '');
  }
}

async function loadAnalyzerData() {
  try {
    const [endpoints, history, meta] = await Promise.all([
      window.nkAPI.getStore('analyzerEndpoints', {}),
      window.nkAPI.getStore('analyzerHistory', []),
      window.nkAPI.getStore('analyzerMeta', {})
    ]);

    analyzerState.endpoints = endpoints || {};
    analyzerState.history = history || [];
    analyzerState.meta = meta || {};

    renderAnalyzer();
  } catch (err) {
    console.error('Failed to load analyzer data:', err);
  }
}

function renderAnalyzer() {
  const eps = Object.values(analyzerState.endpoints || {});
  const categories = new Set(eps.map(x => x.category).filter(Boolean));

  if (uiAnalyzer.endpointCount) uiAnalyzer.endpointCount.textContent = eps.length.toLocaleString('th-TH');
  if (uiAnalyzer.requestCount) uiAnalyzer.requestCount.textContent = Number(analyzerState.meta?.totalRequests || 0).toLocaleString('th-TH');
  if (uiAnalyzer.categoryCount) uiAnalyzer.categoryCount.textContent = categories.size.toLocaleString('th-TH');
  if (uiAnalyzer.lastSeen) {
    uiAnalyzer.lastSeen.textContent = analyzerState.meta?.lastSeen ? new Date(analyzerState.meta.lastSeen).toLocaleTimeString('th-TH') : '-';
  }

  renderAnalyzerCategoryFilter(categories);

  if (analyzerState.currentTab === 'endpoints') {
    renderAnalyzerEndpoints();
  } else {
    renderAnalyzerHistory();
  }

  if (analyzerState.selectedId && analyzerState.endpoints[analyzerState.selectedId]) {
    renderAnalyzerDetail(analyzerState.endpoints[analyzerState.selectedId]);
  } else {
    if (uiAnalyzer.detailPane) {
      uiAnalyzer.detailPane.innerHTML = '<div class="empty-detail">เลือก API ทางด้านซ้ายเพื่อดูรายละเอียด</div>';
    }
  }
}

function renderAnalyzerCategoryFilter(categories) {
  if (!uiAnalyzer.categoryFilter) return;
  const currentVal = uiAnalyzer.categoryFilter.value;
  const opts = ['<option value="">ทุกหมวด</option>'];
  for (const c of [...categories].sort()) {
    opts.push(`<option value="${escapeHtml(c)}">${escapeHtml(labelCategory(c))}</option>`);
  }
  uiAnalyzer.categoryFilter.innerHTML = opts.join('');
  if ([...categories].includes(currentVal)) {
    uiAnalyzer.categoryFilter.value = currentVal;
  }
}

function matchesAnalyzerFilter(item) {
  const q = (uiAnalyzer.search?.value || '').trim().toLowerCase();
  const cat = uiAnalyzer.categoryFilter?.value || '';
  const method = uiAnalyzer.methodFilter?.value || '';

  if (cat && item.category !== cat) return false;
  if (method && item.method !== method) return false;
  if (!q) return true;

  const corpus = [
    item.method,
    item.host,
    item.pathTemplate,
    item.exampleUrl,
    item.category,
    labelCategory(item.category),
    item.purpose,
    ...(item.queryKeys || []),
    ...(item.responseKeys || []),
    ...(item.requestKeys || [])
  ].join(' ').toLowerCase();

  return corpus.includes(q);
}

function renderAnalyzerEndpoints() {
  if (!uiAnalyzer.endpointList) return;
  uiAnalyzer.endpointList.style.display = 'flex';
  if (uiAnalyzer.historyList) uiAnalyzer.historyList.style.display = 'none';

  const rows = Object.values(analyzerState.endpoints || {})
    .filter(matchesAnalyzerFilter)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

  if (!rows.length) {
    uiAnalyzer.endpointList.innerHTML = '<div class="empty-list" style="padding:40px; text-align:center; color:var(--text-dim); font-size:12px;">ยังไม่พบ API ตามตัวกรอง</div>';
    return;
  }

  uiAnalyzer.endpointList.innerHTML = rows.map((item) => `
    <div class="endpoint-row ${analyzerState.selectedId === item.id ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
      <span class="method ${escapeHtml(item.method)}">${escapeHtml(item.method)}</span>
      <div class="row-main">
        <div class="path">${escapeHtml(item.host ? item.host + item.pathTemplate : item.pathTemplate)}</div>
        <div class="meta">
          <span class="category">${escapeHtml(labelCategory(item.category))}</span>
          <span>สถานะ ${escapeHtml(String(item.lastStatus || 200))}</span>
          <span>${Math.round(Number(item.avgMs || 0))} ms</span>
          <span>${item.lastSeen ? new Date(item.lastSeen).toLocaleTimeString('th-TH') : '-'}</span>
          <span>🌐 Server</span>
        </div>
      </div>
      <span class="count">×${Number(item.count || 1).toLocaleString('th-TH')}</span>
    </div>
  `).join('');

  uiAnalyzer.endpointList.querySelectorAll('.endpoint-row').forEach((el) => {
    el.addEventListener('click', () => {
      analyzerState.selectedId = el.dataset.id;
      uiAnalyzer.endpointList.querySelectorAll('.endpoint-row').forEach(r => r.classList.remove('active'));
      el.classList.add('active');
      if (analyzerState.endpoints[analyzerState.selectedId]) {
        renderAnalyzerDetail(analyzerState.endpoints[analyzerState.selectedId]);
      }
    });
  });
}

function renderAnalyzerHistory() {
  if (!uiAnalyzer.historyList) return;
  uiAnalyzer.historyList.style.display = 'flex';
  if (uiAnalyzer.endpointList) uiAnalyzer.endpointList.style.display = 'none';

  const rows = (analyzerState.history || [])
    .filter((h) => {
      const q = (uiAnalyzer.search?.value || '').trim().toLowerCase();
      if (!q) return true;
      return (h.pathTemplate || h.endpointId || h.detail || '').toLowerCase().includes(q);
    })
    .slice(0, 300);

  if (!rows.length) {
    uiAnalyzer.historyList.innerHTML = '<div class="empty-list" style="padding:40px; text-align:center; color:var(--text-dim); font-size:12px;">ยังไม่มีประวัติ Request</div>';
    return;
  }

  uiAnalyzer.historyList.innerHTML = rows.map((item) => `
    <div class="history-row" data-id="${escapeHtml(item.endpointId || '')}">
      <span class="method ${escapeHtml(item.method || 'GET')}">${escapeHtml(item.method || 'GET')}</span>
      <div class="row-main">
        <div class="path">${escapeHtml(item.pathTemplate || item.endpointId || '-')}</div>
        <div class="meta">
          <span class="category">${escapeHtml(labelCategory(item.category))}</span>
          <span>HTTP ${escapeHtml(String(item.status || 200))}</span>
          <span>${Math.round(Number(item.durationMs || 0))} ms</span>
          <span>${item.at ? new Date(item.at).toLocaleTimeString('th-TH') : '-'}</span>
          <span>${escapeHtml(item.detail || '')}</span>
        </div>
      </div>
      <span class="count">${escapeHtml(item.transport || 'GET')}</span>
    </div>
  `).join('');

  uiAnalyzer.historyList.querySelectorAll('.history-row').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (id && analyzerState.endpoints[id]) {
        analyzerState.selectedId = id;
        analyzerState.currentTab = 'endpoints';
        document.querySelectorAll('.analyzer-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'endpoints'));
        renderAnalyzer();
      }
    });
  });
}

function renderAnalyzerDetail(item) {
  if (!uiAnalyzer.detailPane) return;
  const chips = (arr) => arr?.length ? arr.map(v => `<span class="chip">${escapeHtml(v)}</span>`).join('') : '<span class="chip">-</span>';

  uiAnalyzer.detailPane.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(item.method)} ${escapeHtml(item.origin ? item.origin + item.pathTemplate : item.pathTemplate)}</h2>
        <div class="meta">
          <span class="category">${escapeHtml(labelCategory(item.category))}</span>
          <span style="font-size:11px; color:var(--text-muted);">ความมั่นใจ 100%</span>
        </div>
      </div>
      <span class="count">×${Number(item.count || 1).toLocaleString('th-TH')}</span>
    </div>

    <div class="purpose-box">${escapeHtml(item.purpose || 'เรียนรู้โครงสร้างและข้อมูลของ API อัตโนมัติ')}</div>

    <div class="detail-grid">
      <div class="kv">
        <span>Host</span>
        <strong>${escapeHtml(item.host || '-')}</strong>
      </div>
      <div class="kv">
        <span>ตัวอย่าง URL</span>
        <strong>${escapeHtml(item.exampleUrl || item.examplePath || '-')}</strong>
      </div>
      <div class="kv">
        <span>สถานะล่าสุด</span>
        <strong style="color:var(--success);">HTTP ${escapeHtml(String(item.lastStatus || 200))}</strong>
      </div>
      <div class="kv">
        <span>ตรวจพบล่าสุด</span>
        <strong>${item.lastSeen ? new Date(item.lastSeen).toLocaleTimeString('th-TH') : '-'}</strong>
      </div>
      <div class="kv">
        <span>ตรวจพบครั้งแรก</span>
        <strong>${item.firstSeen ? new Date(item.firstSeen).toLocaleTimeString('th-TH') : '-'}</strong>
      </div>
      <div class="kv">
        <span>เวลาเฉลี่ย</span>
        <strong>${Number(item.avgMs || 0).toFixed(1)} ms</strong>
      </div>
    </div>

    <div class="detail-section">
      <h3>แหล่งที่เรียนรู้</h3>
      <div class="chips">${chips(['🌐 Global Server Observer'])}</div>
    </div>

    <div class="detail-section">
      <h3>Query Parameters</h3>
      <div class="chips">${chips(item.queryKeys)}</div>
    </div>

    <div class="detail-section">
      <h3>Query ตัวอย่าง</h3>
      <pre class="code-box">${escapeHtml(formatJson(item.querySample || {}))}</pre>
    </div>

    <div class="detail-section">
      <h3>Response Fields</h3>
      <div class="chips">${chips(item.responseKeys)}</div>
    </div>

    <div class="detail-section">
      <h3>Response ตัวอย่าง (Sample Payload)</h3>
      <pre class="code-box">${escapeHtml(formatJson(item.responseSample || {}))}</pre>
    </div>
  `;
}

// Analyzer Tabs
document.querySelectorAll('.analyzer-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.analyzer-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    analyzerState.currentTab = btn.dataset.tab;
    if (analyzerState.currentTab === 'endpoints') {
      renderAnalyzerEndpoints();
    } else {
      renderAnalyzerHistory();
    }
  });
});

// Analyzer Search and Filters
[uiAnalyzer.search, uiAnalyzer.categoryFilter, uiAnalyzer.methodFilter].forEach((el) => {
  if (!el) return;
  el.addEventListener(el === uiAnalyzer.search ? 'input' : 'change', () => {
    if (analyzerState.currentTab === 'endpoints') {
      renderAnalyzerEndpoints();
    } else {
      renderAnalyzerHistory();
    }
  });
});

// Analyzer Export JSON
if (uiAnalyzer.btnExportJson) {
  uiAnalyzer.btnExportJson.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      appVersion: '3.0.0',
      meta: analyzerState.meta,
      endpoints: Object.values(analyzerState.endpoints || {}),
      history: analyzerState.history || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NK_API_Analyzer_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

// Observer Refresh Tick
if (uiAnalyzer.btnObserverTick) {
  uiAnalyzer.btnObserverTick.addEventListener('click', async () => {
    uiAnalyzer.btnObserverTick.disabled = true;
    uiAnalyzer.btnObserverTick.textContent = '⏳ กำลังตรวจ...';
    try {
      await window.nkAPI.tickObserverNow();
      await loadAnalyzerData();
    } finally {
      uiAnalyzer.btnObserverTick.disabled = false;
      uiAnalyzer.btnObserverTick.textContent = '↻ ตรวจ Server ตอนนี้';
    }
  });
}

// Clear Analyzer Data
if (uiAnalyzer.btnClearAnalyzer) {
  uiAnalyzer.btnClearAnalyzer.addEventListener('click', async () => {
    const ok = await window.showConfirmDialog({
      title: 'ล้างข้อมูล API Analyzer',
      message: 'ยืนยันการล้าง API ที่เรียนรู้และประวัติ Request ทั้งหมดหรือไม่?',
      confirmText: 'ล้างข้อมูล',
      cancelText: 'ยกเลิก',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;
    await window.nkAPI.clearAnalyzer();
    analyzerState.selectedId = '';
    await loadAnalyzerData();
  });
}

// ==========================================
// 8. EMBEDDED WEBVIEW (Session Capture & Controls)
// ==========================================
const webview = document.getElementById('boWebview');
document.getElementById('btnWebBack')?.addEventListener('click', () => webview?.goBack());
document.getElementById('btnWebForward')?.addEventListener('click', () => webview?.goForward());
document.getElementById('btnWebReload')?.addEventListener('click', () => {
  const wv = document.getElementById('boWebview');
  let currentUrl = '';
  try {
    if (typeof wv?.getURL === 'function') currentUrl = wv.getURL();
  } catch (e) {}
  if (!currentUrl || currentUrl.includes('about:blank')) {
    ensureBackofficeWebviewLoaded(true);
  } else {
    wv?.reload();
  }
});

// Fullscreen / Expand Webview Toggle
const btnToggleWebviewFullscreen = document.getElementById('btnToggleWebviewFullscreen');
if (btnToggleWebviewFullscreen) {
  btnToggleWebviewFullscreen.addEventListener('click', () => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;
    const isFull = mainLayout.classList.toggle('fullscreen-webview');
    btnToggleWebviewFullscreen.innerHTML = isFull ? '🗗 ย่อหน้าต่าง' : '⛶ ขยายเต็ม';
    btnToggleWebviewFullscreen.title = isFull ? 'ย่อหน้าต่างกลับเป็นปกติ (Esc)' : 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
  });
}

// ------------------------------------------
// Webview Zoom & Screenshot Capture Controls
// ------------------------------------------
let currentBoZoom = 1.0;
let currentSpZoom = 1.0;
let currentAgZoom = 1.0;

function updateBoZoomUI() {
  const lbl = document.getElementById('btnWebZoomReset');
  if (lbl) {
    lbl.textContent = Math.round(currentBoZoom * 100) + '%';
    lbl.style.color = Math.round(currentBoZoom * 100) === 100 ? 'var(--text-main)' : 'var(--accent)';
  }
  const btnFit = document.getElementById('btnWebZoomFit');
  if (btnFit) {
    const is80 = Math.abs(currentBoZoom - 0.80) < 0.02;
    btnFit.classList.toggle('active', is80);
  }
}

function updateSpZoomUI() {
  const lbl = document.getElementById('btnSpZoomReset');
  if (lbl) {
    lbl.textContent = Math.round(currentSpZoom * 100) + '%';
    lbl.style.color = Math.round(currentSpZoom * 100) === 100 ? 'var(--text-main)' : 'var(--accent)';
  }
  const btnFit = document.getElementById('btnSpZoomFit');
  if (btnFit) {
    const is80 = Math.abs(currentSpZoom - 0.80) < 0.02;
    btnFit.classList.toggle('active', is80);
  }
}

function updateAgZoomUI() {
  const lbl = document.getElementById('btnAgZoomReset');
  if (lbl) {
    lbl.textContent = Math.round(currentAgZoom * 100) + '%';
    lbl.style.color = Math.round(currentAgZoom * 100) === 100 ? 'var(--text-main)' : 'var(--accent)';
  }
  const btnFit = document.getElementById('btnAgZoomFit');
  if (btnFit) {
    const is80 = Math.abs(currentAgZoom - 0.80) < 0.02;
    btnFit.classList.toggle('active', is80);
  }
}

function applyBoZoom(factor, persist = true) {
  factor = Math.max(0.5, Math.min(1.5, Math.round(factor * 100) / 100));
  currentBoZoom = factor;
  if (webview) {
    try { webview.setZoomFactor(factor); } catch (e) {}
  }
  updateBoZoomUI();
  if (persist && window.nkAPI?.setStore) {
    window.nkAPI.setStore('boWebviewZoom', factor);
  }
}

function applySpZoom(factor, persist = true) {
  factor = Math.max(0.5, Math.min(1.5, Math.round(factor * 100) / 100));
  currentSpZoom = factor;
  const targetSp = document.getElementById('spWebview');
  if (targetSp) {
    try { targetSp.setZoomFactor(factor); } catch (e) {}
  }
  updateSpZoomUI();
  if (persist && window.nkAPI?.setStore) {
    window.nkAPI.setStore('spWebviewZoom', factor);
  }
}

function applyAgZoom(factor, persist = true) {
  factor = Math.max(0.5, Math.min(1.5, Math.round(factor * 100) / 100));
  currentAgZoom = factor;
  const targetAg = document.getElementById('agWebview');
  if (targetAg) {
    try { targetAg.setZoomFactor(factor); } catch (e) {}
  }
  updateAgZoomUI();
  if (persist && window.nkAPI?.setStore) {
    window.nkAPI.setStore('agWebviewZoom', factor);
  }
}

// Load saved zoom factors on initialization
(async function initWebviewZooms() {
  try {
    if (window.nkAPI?.getStore) {
      const savedBo = await window.nkAPI.getStore('boWebviewZoom', 1.0);
      if (savedBo && savedBo >= 0.5 && savedBo <= 1.5) {
        currentBoZoom = Number(savedBo);
      }
      const savedSp = await window.nkAPI.getStore('spWebviewZoom', 1.0);
      if (savedSp && savedSp >= 0.5 && savedSp <= 1.5) {
        currentSpZoom = Number(savedSp);
      }
      const savedAg = await window.nkAPI.getStore('agWebviewZoom', 1.0);
      if (savedAg && savedAg >= 0.5 && savedAg <= 1.5) {
        currentAgZoom = Number(savedAg);
      }
    }
  } catch (e) {}
  updateBoZoomUI();
  updateSpZoomUI();
  updateAgZoomUI();
})();

// Listen for Chromium native zoom change events inside webviews
webview?.addEventListener('did-zoom-changed', (e) => {
  if (e && typeof e.newZoomFactor === 'number') {
    currentBoZoom = Math.round(e.newZoomFactor * 100) / 100;
    updateBoZoomUI();
    window.nkAPI?.setStore('boWebviewZoom', currentBoZoom);
  }
});

const spWebviewTag = document.getElementById('spWebview');
spWebviewTag?.addEventListener('did-zoom-changed', (e) => {
  if (e && typeof e.newZoomFactor === 'number') {
    currentSpZoom = Math.round(e.newZoomFactor * 100) / 100;
    updateSpZoomUI();
    window.nkAPI?.setStore('spWebviewZoom', currentSpZoom);
  }
});

const agWebviewTag = document.getElementById('agWebview');
agWebviewTag?.addEventListener('did-zoom-changed', (e) => {
  if (e && typeof e.newZoomFactor === 'number') {
    currentAgZoom = Math.round(e.newZoomFactor * 100) / 100;
    updateAgZoomUI();
    window.nkAPI?.setStore('agWebviewZoom', currentAgZoom);
  }
});

// Wire BackOffice Zoom buttons
document.getElementById('btnWebZoomOut')?.addEventListener('click', () => {
  applyBoZoom(currentBoZoom - 0.05);
});
document.getElementById('btnWebZoomIn')?.addEventListener('click', () => {
  applyBoZoom(currentBoZoom + 0.05);
});
document.getElementById('btnWebZoomReset')?.addEventListener('click', () => {
  applyBoZoom(1.0);
});
document.getElementById('btnWebZoomFit')?.addEventListener('click', () => {
  // Toggle between 0.80 and 1.0
  if (Math.abs(currentBoZoom - 0.80) < 0.02) {
    applyBoZoom(1.0);
  } else {
    applyBoZoom(0.80);
  }
});

// Wire SwiftPay Zoom buttons
document.getElementById('btnSpZoomOut')?.addEventListener('click', () => {
  applySpZoom(currentSpZoom - 0.05);
});
document.getElementById('btnSpZoomIn')?.addEventListener('click', () => {
  applySpZoom(currentSpZoom + 0.05);
});
document.getElementById('btnSpZoomReset')?.addEventListener('click', () => {
  applySpZoom(1.0);
});
document.getElementById('btnSpZoomFit')?.addEventListener('click', () => {
  if (Math.abs(currentSpZoom - 0.80) < 0.02) {
    applySpZoom(1.0);
  } else {
    applySpZoom(0.80);
  }
});

// Wire Agent Zoom buttons
document.getElementById('btnAgZoomOut')?.addEventListener('click', () => {
  applyAgZoom(currentAgZoom - 0.05);
});
document.getElementById('btnAgZoomIn')?.addEventListener('click', () => {
  applyAgZoom(currentAgZoom + 0.05);
});
document.getElementById('btnAgZoomReset')?.addEventListener('click', () => {
  applyAgZoom(1.0);
});
document.getElementById('btnAgZoomFit')?.addEventListener('click', () => {
  if (Math.abs(currentAgZoom - 0.80) < 0.02) {
    applyAgZoom(1.0);
  } else {
    applyAgZoom(0.80);
  }
});

// ----------------------------------------------------
// Capture Handler for Webviews (Cropped to Dashboard)
// ----------------------------------------------------
const HIDE_SCROLLBARS_SCRIPT = `
  (() => {
    try {
      const id = '__nk_hide_scrollbar_capture__';
      let st = document.getElementById(id);
      if (!st) {
        st = document.createElement('style');
        st.id = id;
        st.textContent = \`
          *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
          * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
          html, body, main, section, div { scrollbar-width: none !important; }
        \`;
        document.head.appendChild(st);
      }
    } catch (e) {}
  })()
`;

const REMOVE_SCROLLBARS_SCRIPT = `
  (() => {
    try {
      const el = document.getElementById('__nk_hide_scrollbar_capture__');
      if (el) el.remove();
    } catch (e) {}
  })()
`;

const getDashboardCropScript = `
  (() => {
    try {
      const all = Array.from(document.querySelectorAll('*'));
      
      // 0. Ensure page and scroll containers are at the very top before measuring
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll('.el-main, main, .app-main, .main-container, .content, section').forEach(el => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });

      // 1. Locate Sidebar boundary
      let sidebarRight = 0;
      const sidebarEl = document.querySelector('.sidebar-container, .sidebar, aside, .el-aside, [class*="sidebar"], [class*="aside"]');
      if (sidebarEl) {
        const sr = sidebarEl.getBoundingClientRect();
        if (sr.width > 40 && sr.width < 350 && sr.left < 50) {
          sidebarRight = sr.right;
        }
      }

      // 2. Locate Topbar boundary
      let topbarBottom = 0;
      const topbarEl = document.querySelector('.navbar, header, .el-header, [class*="header"], [class*="navbar"]');
      if (topbarEl) {
        const tr = topbarEl.getBoundingClientRect();
        if (tr.height > 25 && tr.height < 150 && tr.top < 30) {
          topbarBottom = tr.bottom;
        }
      }

      // 3. Locate Title "Dashboard" or "ภาพรวมยอดฝาก-ถอน"
      let titleEl = all.find(el => 
        el.children.length === 0 && 
        (el.textContent.includes('ภาพรวมยอดฝาก-ถอน') || el.textContent.trim() === 'Dashboard') &&
        el.getBoundingClientRect().top > 25 &&
        el.getBoundingClientRect().width > 0
      );

      if (titleEl && titleEl.textContent.includes('ภาพรวมยอดฝาก-ถอน')) {
        let p = titleEl.parentElement;
        for (let i = 0; i < 4 && p && p !== document.body; i++) {
          const dTitle = Array.from(p.querySelectorAll('h1, h2, h3, h4, div, span, strong')).find(
            e => e.children.length === 0 && e.textContent.trim() === 'Dashboard' && e.getBoundingClientRect().top > 25
          );
          if (dTitle) {
            titleEl = dTitle;
            break;
          }
          p = p.parentElement;
        }
      }

      // Helper: walk up DOM to find the nearest card container
      function findCardContainer(el) {
        let curr = el.parentElement;
        for (let i = 0; i < 10 && curr && curr !== document.body; i++) {
          const cr = curr.getBoundingClientRect();
          const cls = (curr.className || '').toString();
          if (cls.includes('el-card') || cls.includes('box-card') || 
              (cls.includes('card') && !cls.includes('cards')) ||
              (cr.width > 100 && cr.width < 700 && cr.height > 50 && cr.height < 340)) {
            return curr;
          }
          curr = curr.parentElement;
        }
        return null;
      }

      // 4. Locate Row 5 circular cards to determine the ABSOLUTE stop line (ceiling of lower section)
      let row5Top = Infinity;
      const stopWords = ['สมาชิกทั้งหมด', 'สมาชิกใหม่วันนี้', 'ยอดฝาก (วันนี้)', 'ยอดถอน (วันนี้)', 'กำไรสุทธิ', 'คืนยอดเสีย/แนะนำเพื่อน'];
      for (const sw of stopWords) {
        const m = all.find(e => e.children.length === 0 && e.textContent.trim().startsWith(sw) && e.getBoundingClientRect().width > 0);
        if (m) {
          const c = findCardContainer(m) || m;
          const cr = c.getBoundingClientRect();
          if (cr.top > 80) {
            row5Top = Math.min(row5Top, cr.top);
          }
        }
      }

      // 5. Find Row 4 cards (สมัครฝาก / สมัครสมาชิก) to determine bottom of summary cards
      let row4Bottom = 0;
      const r4Keywords = ['สมัครฝาก', 'สมัครสมาชิก'];
      for (const rk of r4Keywords) {
        const matches = all.filter(e => {
          if (e.children.length !== 0) return false;
          const t = e.textContent.trim();
          if (!t.startsWith(rk)) return false;
          if (t.includes('(วันนี้)') || t.includes('(เมื่อวาน)')) return false;
          return e.getBoundingClientRect().width > 0;
        });
        for (const m of matches) {
          const c = findCardContainer(m);
          if (c) {
            const cr = c.getBoundingClientRect();
            if (cr.top < row5Top) {
              row4Bottom = Math.max(row4Bottom, cr.bottom);
            }
          }
        }
      }

      // 6. Collect only cards strictly belonging to rows 1-4 (above row5Top)
      const keywords = [
        'ยอดฝาก', 'ยอดถอน', 'กำไร', 'ฝากแมนนวล', 'ถอนแมนนวล', 
        'คืนยอดเสีย', 'กงล้อนำโชค',
        'ปรับยอด', 'ฝากโบนัส', 'แนะนำเพื่อน', 'แลกรีวอร์ด', 'แลกรางวัล', 'ยอดฝากแรก',
        'สมัครฝาก', 'สมัครสมาชิก'
      ];
      const cardNodes = [];

      for (const kw of keywords) {
        const matches = all.filter(el => {
          if (el.children.length !== 0) return false;
          const txt = el.textContent.trim();
          if (!txt.startsWith(kw)) return false;
          if (txt.includes('(วันนี้)') || txt.includes('(เมื่อวาน)')) return false;
          return el.getBoundingClientRect().width > 0;
        });
        for (const m of matches) {
          const card = findCardContainer(m);
          if (card) {
            const cr = card.getBoundingClientRect();
            // Strictly exclude anything that reaches row 5 or below
            if (cr.top < row5Top && cr.bottom <= row5Top + 10 && !cardNodes.includes(card)) {
              cardNodes.push(card);
            }
          }
        }
      }

      if (cardNodes.length > 0) {
        let minCardX = Infinity, minCardY = Infinity, maxCardX = -Infinity, maxCardY = -Infinity;

        for (const card of cardNodes) {
          const cr = card.getBoundingClientRect();
          minCardX = Math.min(minCardX, cr.left);
          minCardY = Math.min(minCardY, cr.top);
          maxCardX = Math.max(maxCardX, cr.right);
          maxCardY = Math.max(maxCardY, cr.bottom);
        }

        let titleTop = 0;
        let titleLeft = 0;
        if (titleEl) {
          const tr = titleEl.getBoundingClientRect();
          titleTop = tr.top;
          titleLeft = tr.left;
        }

        // Left boundary: right after sidebar
        let minX = 0;
        if (sidebarRight > 0) {
          minX = sidebarRight + 2;
        } else if (titleLeft > 0) {
          minX = Math.max(0, Math.min(minCardX, titleLeft) - 8);
        } else {
          minX = Math.max(0, minCardX - 8);
        }

        // Top boundary: include Dashboard title
        let minY = 0;
        if (titleTop > 0) {
          minY = Math.max(topbarBottom > 0 ? topbarBottom + 2 : 0, titleTop - 8);
        } else {
          minY = Math.max(topbarBottom > 0 ? topbarBottom + 2 : 0, minCardY - 12);
        }

        // Right boundary
        let maxX = Math.min(window.innerWidth - 14, maxCardX + 6);

        // Bottom boundary: end neatly after row 4, guaranteed above row 5
        let maxY = maxCardY + 14;
        if (row4Bottom > 0) {
          maxY = row4Bottom + 14;
        }
        if (row5Top < Infinity) {
          maxY = Math.min(maxY, row5Top - 8);
        }

        return {
          found: true,
          x: Math.max(0, minX),
          y: Math.max(0, minY),
          width: Math.max(100, maxX - minX),
          height: Math.max(100, maxY - minY)
        };
      }

      // Fallback: check main or app-main
      const mainEl = document.querySelector('main, .main-content, .app-main, section.el-main');
      if (mainEl) {
        const mr = mainEl.getBoundingClientRect();
        return {
          found: true,
          x: Math.max(0, Math.floor(mr.left)),
          y: Math.max(0, Math.floor(mr.top)),
          width: Math.max(100, Math.floor(mr.width) - 18),
          height: Math.max(100, Math.floor(mr.height))
        };
      }

      return { found: false };
    } catch (e) {
      return { found: false, error: e.message };
    }
  })()
`;

async function handleWebviewCapture(targetWv, { defaultFilename = 'NK_BackOffice_Dashboard' } = {}) {
  if (!targetWv) return;

  const isBo = (targetWv === webview);
  const isSp = (targetWv === document.getElementById('spWebview'));
  const isAg = (targetWv === document.getElementById('agWebview'));
  const btnCapture = isBo ? document.getElementById('btnWebCapture') : (isSp ? document.getElementById('btnSpCapture') : document.getElementById('btnAgCapture'));
  const originalHtml = btnCapture ? btnCapture.innerHTML : '';

  try {
    if (btnCapture) {
      btnCapture.disabled = true;
      btnCapture.innerHTML = '<span>⏳</span><span>กำลังแคป...</span>';
    }

    const origZoom = (isBo ? currentBoZoom : (isSp ? currentSpZoom : currentAgZoom)) || 1.0;
    let needAutoFit = false;
    let captureZoom = origZoom;

    // Hide scrollbars completely inside the webview before capture
    try {
      await targetWv.executeJavaScript(HIDE_SCROLLBARS_SCRIPT);
    } catch (e) {}

    let cropRect = null;
    if (isBo) {
      try {
        // Use a fixed capture zoom for consistent, readable results
        captureZoom = 0.78;
        if (Math.abs(captureZoom - origZoom) > 0.02) {
          needAutoFit = true;
          targetWv.setZoomFactor(captureZoom);
          await new Promise(r => setTimeout(r, 200));
        }

        // Scroll content containers to top so dashboard cards are visible
        await targetWv.executeJavaScript(`
          (() => {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            document.querySelectorAll('.el-main, main, .app-main, .main-container, .content, section').forEach(el => {
              el.scrollTop = 0;
              el.scrollLeft = 0;
            });
          })()
        `);
        await new Promise(r => setTimeout(r, 150));

        // Measure crop bounds at current zoom
        cropRect = await targetWv.executeJavaScript(getDashboardCropScript);
      } catch (e) {
        console.error('Capture crop measurement error:', e);
      }
    }

    // Capture the rendered image
    const fullNativeImg = await targetWv.capturePage();

    // Clean up injected scrollbar style and restore original user zoom
    try {
      await targetWv.executeJavaScript(REMOVE_SCROLLBARS_SCRIPT);
    } catch (e) {}

    if (needAutoFit) {
      targetWv.setZoomFactor(origZoom);
    }

    if (!fullNativeImg || fullNativeImg.isEmpty()) {
      showToast({
        type: 'warning',
        badge: 'Capture',
        title: '⚠️ ไม่สามารถจับภาพหน้าจอได้',
        detail: 'กรุณาลองใหม่อีกครั้ง หรือตรวจสอบว่าหน้าเว็บกำลังแสดงผลอยู่หรือไม่',
        badgeColor: '#f59e0b'
      });
      return;
    }

    let finalDataUrl = null;
    const fullSize = fullNativeImg.getSize();
    const scaleX = fullSize.width / targetWv.clientWidth;
    const scaleY = fullSize.height / targetWv.clientHeight;

    if (cropRect && cropRect.found && cropRect.width > 80 && cropRect.height > 80) {
      // Note: cropRect returned from executeJavaScript is in CSS pixels.
      // Must multiply by captureZoom to get webview DIP pixels, then scaleX for physical bitmap coordinates!
      const dipX = cropRect.x * captureZoom;
      const dipY = cropRect.y * captureZoom;
      const dipW = cropRect.width * captureZoom;
      const dipH = cropRect.height * captureZoom;

      const cx = Math.max(0, Math.round(dipX * scaleX));
      const cy = Math.max(0, Math.round(dipY * scaleY));
      const cw = Math.min(fullSize.width - cx, Math.round(dipW * scaleX));
      const ch = Math.min(fullSize.height - cy, Math.round(dipH * scaleY));

      if (cw > 100 && ch > 100) {
        const croppedImg = fullNativeImg.crop({ x: cx, y: cy, width: cw, height: ch });
        finalDataUrl = croppedImg.toDataURL();
      }
    }

    if (!finalDataUrl) {
      finalDataUrl = fullNativeImg.toDataURL();
    }

    // Open Annotation Popup Modal
    openCaptureAnnotationModal(finalDataUrl, defaultFilename);

  } catch (err) {
    console.error('Capture error:', err);
    showToast({
      type: 'error',
      badge: 'Capture',
      title: '❌ เกิดข้อผิดพลาดในการแคปภาพ',
      detail: err.message,
      badgeColor: '#ef4444'
    });
  } finally {
    if (btnCapture) {
      btnCapture.innerHTML = originalHtml;
      btnCapture.disabled = false;
    }
  }
}

// Wire Capture buttons
document.getElementById('btnWebCapture')?.addEventListener('click', () => {
  handleWebviewCapture(webview, { defaultFilename: 'NK_BackOffice_Dashboard' });
});
document.getElementById('btnWebSaveCapture')?.addEventListener('click', () => {
  handleWebviewCapture(webview, { defaultFilename: 'NK_BackOffice_Dashboard' });
});
document.getElementById('btnSpCapture')?.addEventListener('click', () => {
  const targetSp = document.getElementById('spWebview');
  handleWebviewCapture(targetSp, { defaultFilename: 'SwiftPay_Workbench' });
});
document.getElementById('btnAgCapture')?.addEventListener('click', () => {
  const targetAg = document.getElementById('agWebview');
  handleWebviewCapture(targetAg, { defaultFilename: 'Agent_Portal' });
});

// ----------------------------------------------------
// CAPTURE ANNOTATION MODAL (Interactive Red Rectangles)
// ----------------------------------------------------
let annoImageObj = null;
let annoRectangles = [];
let annoIsDrawing = false;
let annoRectStart = null;
let annoCurrentRect = null;
let annoStrokeWidth = 3;
let annoDefaultFilename = 'NK_BackOffice_Dashboard';

function openCaptureAnnotationModal(dataUrl, defaultFilename = 'NK_BackOffice_Dashboard') {
  annoDefaultFilename = defaultFilename;
  annoRectangles = [];
  annoIsDrawing = false;
  annoRectStart = null;
  annoCurrentRect = null;
  annoStrokeWidth = 3;

  const modal = document.getElementById('modalCaptureAnnotation');
  const canvas = document.getElementById('annotationCanvas');
  if (!modal || !canvas) return;

  const txtCount = document.getElementById('txtAnnoRectCount');
  if (txtCount) txtCount.textContent = 'จำนวนกรอบที่วาด: 0';

  updateStrokeBtnUI();

  annoImageObj = new Image();
  annoImageObj.onload = () => {
    canvas.width = annoImageObj.naturalWidth;
    canvas.height = annoImageObj.naturalHeight;
    redrawAnnotationCanvas();
    modal.style.display = 'flex';
  };
  annoImageObj.src = dataUrl;
}

function updateStrokeBtnUI() {
  const btn3 = document.getElementById('btnAnnoStroke3');
  const btn5 = document.getElementById('btnAnnoStroke5');
  if (btn3) btn3.classList.toggle('active', annoStrokeWidth === 3);
  if (btn5) btn5.classList.toggle('active', annoStrokeWidth === 5);
}

function redrawAnnotationCanvas() {
  const canvas = document.getElementById('annotationCanvas');
  if (!canvas || !annoImageObj) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw base screenshot
  ctx.drawImage(annoImageObj, 0, 0);

  // 2. Draw committed red rectangles - OUTLINE ONLY, NO FILL
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const r of annoRectangles) {
    ctx.lineWidth = r.strokeWidth || annoStrokeWidth;
    ctx.strokeStyle = '#ef4444'; // Bright vivid red
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  // 3. Draw rectangle currently being dragged - OUTLINE ONLY, NO FILL
  if (annoCurrentRect && annoCurrentRect.w > 0 && annoCurrentRect.h > 0) {
    ctx.lineWidth = annoStrokeWidth;
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(annoCurrentRect.x, annoCurrentRect.y, annoCurrentRect.w, annoCurrentRect.h);
  }

  const txtCount = document.getElementById('txtAnnoRectCount');
  if (txtCount) {
    txtCount.textContent = `จำนวนกรอบที่วาด: ${annoRectangles.length}`;
  }
}

function getCanvasMousePos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// Mouse events on canvas for drawing red rectangles
const annoCanvas = document.getElementById('annotationCanvas');
if (annoCanvas) {
  annoCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    annoIsDrawing = true;
    annoRectStart = getCanvasMousePos(e, annoCanvas);
    annoCurrentRect = null;
  });

  window.addEventListener('mousemove', (e) => {
    if (!annoIsDrawing || !annoRectStart) return;
    const pos = getCanvasMousePos(e, annoCanvas);
    annoCurrentRect = {
      x: Math.min(annoRectStart.x, pos.x),
      y: Math.min(annoRectStart.y, pos.y),
      w: Math.abs(pos.x - annoRectStart.x),
      h: Math.abs(pos.y - annoRectStart.y),
      strokeWidth: annoStrokeWidth
    };
    redrawAnnotationCanvas();
  });

  window.addEventListener('mouseup', (e) => {
    if (!annoIsDrawing) return;
    annoIsDrawing = false;
    if (annoCurrentRect && annoCurrentRect.w > 6 && annoCurrentRect.h > 6) {
      annoRectangles.push({ ...annoCurrentRect });
    }
    annoCurrentRect = null;
    redrawAnnotationCanvas();
  });
}

// Stroke Width Buttons
document.getElementById('btnAnnoStroke3')?.addEventListener('click', () => {
  annoStrokeWidth = 3;
  updateStrokeBtnUI();
});
document.getElementById('btnAnnoStroke5')?.addEventListener('click', () => {
  annoStrokeWidth = 5;
  updateStrokeBtnUI();
});

// Undo & Clear
document.getElementById('btnAnnoUndo')?.addEventListener('click', () => {
  if (annoRectangles.length > 0) {
    annoRectangles.pop();
    redrawAnnotationCanvas();
  }
});
document.getElementById('btnAnnoClear')?.addEventListener('click', () => {
  if (annoRectangles.length > 0) {
    annoRectangles = [];
    redrawAnnotationCanvas();
  }
});

// Close / Cancel
function closeCaptureAnnotationModal() {
  const modal = document.getElementById('modalCaptureAnnotation');
  if (modal) modal.style.display = 'none';
  annoRectangles = [];
  annoIsDrawing = false;
  annoRectStart = null;
  annoCurrentRect = null;
  annoImageObj = null;
}

document.getElementById('btnAnnoClose')?.addEventListener('click', closeCaptureAnnotationModal);
document.getElementById('btnAnnoCancel')?.addEventListener('click', closeCaptureAnnotationModal);

// Copy Annotated Image to Clipboard
document.getElementById('btnAnnoCopy')?.addEventListener('click', async () => {
  const canvas = document.getElementById('annotationCanvas');
  if (!canvas) return;

  const btnCopy = document.getElementById('btnAnnoCopy');
  const origHtml = btnCopy ? btnCopy.innerHTML : '';
  if (btnCopy) {
    btnCopy.disabled = true;
    btnCopy.innerHTML = '<span>⏳</span><span>กำลังคัดลอก...</span>';
  }

  try {
    const finalDataUrl = canvas.toDataURL('image/png');
    const res = await window.nkAPI.writeClipboardImage(finalDataUrl);
    if (res && res.success) {
      closeCaptureAnnotationModal();
      showToast({
        type: 'success',
        badge: 'Clipboard',
        title: '📸 คัดลอกภาพพร้อมกรอบแดงแล้ว!',
        detail: 'ภาพแดชบอร์ดพร้อมกรอบสีแดงถูกคัดลอกลง Clipboard แล้ว! กด Ctrl + V วางใน LINE ได้ทันที 📋',
        badgeColor: '#10b981'
      });
    } else {
      showToast({
        type: 'error',
        badge: 'Clipboard',
        title: '❌ คัดลอกภาพไม่สำเร็จ',
        detail: res?.error || 'เกิดข้อผิดพลาดในการคัดลอก',
        badgeColor: '#ef4444'
      });
    }
  } catch (err) {
    showToast({
      type: 'error',
      badge: 'Clipboard',
      title: '❌ เกิดข้อผิดพลาด',
      detail: err.message,
      badgeColor: '#ef4444'
    });
  } finally {
    if (btnCopy) {
      btnCopy.innerHTML = origHtml;
      btnCopy.disabled = false;
    }
  }
});

// Save Annotated Image to File
document.getElementById('btnAnnoSave')?.addEventListener('click', async () => {
  const canvas = document.getElementById('annotationCanvas');
  if (!canvas) return;

  const btnSave = document.getElementById('btnAnnoSave');
  const origHtml = btnSave ? btnSave.innerHTML : '';
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '<span>⏳</span><span>กำลังบันทึก...</span>';
  }

  try {
    const finalDataUrl = canvas.toDataURL('image/png');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const res = await window.nkAPI.saveCaptureFile({
      dataUrl: finalDataUrl,
      defaultName: `${annoDefaultFilename}_${dateStr}.png`
    });

    if (res && res.success) {
      closeCaptureAnnotationModal();
      showToast({
        type: 'success',
        badge: 'บันทึกไฟล์',
        title: '💾 บันทึกรูปภาพสำเร็จ',
        detail: `บันทึกไฟล์ไว้ที่: ${res.filePath}`,
        badgeColor: '#10b981'
      });
    } else if (res && !res.canceled) {
      showToast({
        type: 'error',
        badge: 'บันทึกไฟล์',
        title: '❌ ไม่สามารถบันทึกรูปได้',
        detail: res.error || 'เกิดข้อผิดพลาดในการบันทึก',
        badgeColor: '#ef4444'
      });
    }
  } catch (err) {
    showToast({
      type: 'error',
      badge: 'บันทึกไฟล์',
      title: '❌ เกิดข้อผิดพลาด',
      detail: err.message,
      badgeColor: '#ef4444'
    });
  } finally {
    if (btnSave) {
      btnSave.innerHTML = origHtml;
      btnSave.disabled = false;
    }
  }
});

// Keyboard shortcuts for Window & Modal
window.addEventListener('keydown', (e) => {
  const annoModal = document.getElementById('modalCaptureAnnotation');
  const isAnnoOpen = annoModal && annoModal.style.display === 'flex';

  if (isAnnoOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCaptureAnnotationModal();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (annoRectangles.length > 0) {
        annoRectangles.pop();
        redrawAnnotationCanvas();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      document.getElementById('btnAnnoCopy')?.click();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      document.getElementById('btnAnnoSave')?.click();
      return;
    }
    return;
  }

  if (e.key === 'Escape') {
    const mainLayout = document.querySelector('.main-layout');
    if (mainLayout && mainLayout.classList.contains('fullscreen-webview')) {
      mainLayout.classList.remove('fullscreen-webview');
      if (btnToggleWebviewFullscreen) {
        btnToggleWebviewFullscreen.innerHTML = '⛶ ขยายเต็ม';
        btnToggleWebviewFullscreen.title = 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
      }
      if (typeof btnToggleSpFullscreen !== 'undefined' && btnToggleSpFullscreen) {
        btnToggleSpFullscreen.innerHTML = '⛶ ขยายเต็ม';
        btnToggleSpFullscreen.title = 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
      }
      if (typeof btnToggleAgFullscreen !== 'undefined' && btnToggleAgFullscreen) {
        btnToggleAgFullscreen.innerHTML = '⛶ ขยายเต็ม';
        btnToggleAgFullscreen.title = 'ขยายเต็มหน้าต่าง (Esc เพื่อออก)';
      }
    }
  }

  // Ctrl shortcuts
  if (e.ctrlKey || e.metaKey) {
    const isBoActive = document.getElementById('view-webview')?.classList.contains('active');
    const isSpActive = document.getElementById('view-swiftpay-webview')?.classList.contains('active');
    const isAgActive = document.getElementById('view-agent-webview')?.classList.contains('active');

    // Zoom shortcuts
    if (e.key === '-' || e.key === '_') {
      if (isBoActive) { e.preventDefault(); applyBoZoom(currentBoZoom - 0.05); }
      else if (isSpActive) { e.preventDefault(); applySpZoom(currentSpZoom - 0.05); }
      else if (isAgActive) { e.preventDefault(); applyAgZoom(currentAgZoom - 0.05); }
    } else if (e.key === '+' || e.key === '=') {
      if (isBoActive) { e.preventDefault(); applyBoZoom(currentBoZoom + 0.05); }
      else if (isSpActive) { e.preventDefault(); applySpZoom(currentSpZoom + 0.05); }
      else if (isAgActive) { e.preventDefault(); applyAgZoom(currentAgZoom + 0.05); }
    } else if (e.key === '0') {
      if (isBoActive) { e.preventDefault(); applyBoZoom(1.0); }
      else if (isSpActive) { e.preventDefault(); applySpZoom(1.0); }
      else if (isAgActive) { e.preventDefault(); applyAgZoom(1.0); }
    }

    // Ctrl + Shift + S: Quick Capture Dashboard to Clipboard
    if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
      if (isBoActive) {
        e.preventDefault();
        handleWebviewCapture(webview, { saveFile: false, defaultFilename: 'NK_BackOffice_Dashboard' });
      } else if (isSpActive) {
        e.preventDefault();
        const targetSp = document.getElementById('spWebview');
        handleWebviewCapture(targetSp, { saveFile: false, defaultFilename: 'SwiftPay_Workbench' });
      } else if (isAgActive) {
        e.preventDefault();
        const targetAg = document.getElementById('agWebview');
        handleWebviewCapture(targetAg, { saveFile: false, defaultFilename: 'Agent_Portal' });
      }
    }
  }
});

// When webview navigates and executes requests, capture headers
webview.addEventListener('dom-ready', () => {
  // Inject network snooper into the webview page
  const snifferCode = `
    (function() {
      if (window.__NK_SNIFFER_INSTALLED__) return;
      window.__NK_SNIFFER_INSTALLED__ = true;

      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
          if (url.includes('logicxking.com')) {
            const reqHeaders = args[1]?.headers || {};
            const headersObj = {};
            if (reqHeaders instanceof Headers) {
              reqHeaders.forEach((v, k) => { headersObj[k] = v; });
            } else if (typeof reqHeaders === 'object') {
              Object.assign(headersObj, reqHeaders);
            }
            if (Object.keys(headersObj).length) {
              const u = new URL(url, location.href);
              const queryObj = {};
              u.searchParams.forEach((v, k) => { queryObj[k] = v; });
              window.postMessage({
                type: 'NK_SESSION_SNIFFED',
                session: {
                  origin: u.origin,
                  headers: headersObj,
                  path: u.pathname,
                  query: queryObj
                }
              }, '*');
            }
          }
        } catch (e) {}
        return origFetch.apply(this, args);
      };
    })();
  `;
  webview.executeJavaScript(snifferCode).catch(() => {});

  // Apply theme immediately as soon as DOM is ready
  syncWebviewTheme();
  if (currentBoZoom !== 1.0) {
    try { webview.setZoomFactor(currentBoZoom); } catch (e) {}
  }
});

webview.addEventListener('ipc-message', async (event) => {
  if (event.channel === 'NK_SESSION_SNIFFED') {
    await window.nkAPI.saveSession(event.args[0]);
    syncAppState();
  }
});

// Also use webview request interception via webRequest on default session
webview.addEventListener('did-finish-load', async () => {
  // Ensure theme is applied once all assets/styles finish loading
  syncWebviewTheme();
  if (currentBoZoom !== 1.0) {
    try { webview.setZoomFactor(currentBoZoom); } catch (e) {}
  }

  try {
    const code = `
      (() => {
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
          const websiteId = localStorage.getItem('website_id');
          return { token, websiteId };
        } catch (e) { return null; }
      })()
    `;
    const authData = await webview.executeJavaScript(code);
    if (authData && authData.token) {
      await window.nkAPI.saveSession({
        origin: 'https://nklaos-adminapi.logicxking.com',
        headers: {
          authorization: authData.token.startsWith('Bearer ') ? authData.token : `Bearer ${authData.token}`
        },
        path: '/members',
        query: { website_id: authData.websiteId || '' }
      });
      syncAppState();
    }
  } catch (e) {}

  // Pre-inject session & auto-fill BackOffice webview
  await injectSessionIntoWebview();
  await attemptWebviewAutoLogin();
});

webview.addEventListener('dom-ready', async () => {
  syncWebviewTheme();
  await injectSessionIntoWebview();
  await attemptWebviewAutoLogin();
});

webview.addEventListener('did-navigate', async () => {
  syncWebviewTheme();
  await injectSessionIntoWebview();
  await attemptWebviewAutoLogin();
});

webview.addEventListener('did-navigate-in-page', async () => {
  syncWebviewTheme();
});

// 1. Direct Session Injection into Webview (Instant Single Sign-On)
async function injectSessionIntoWebview() {
  try {
    const session = await window.nkAPI.getSession();
    const user = await window.nkAPI.getUser();
    const userProfile = await window.nkAPI.getStore('userProfileData', null);
    const authHeader = session?.headers?.authorization || '';
    if (!authHeader) return false;

    const rawToken = authHeader.replace(/^Bearer\s+/i, '');
    const bearerToken = 'Bearer ' + rawToken;
    const websiteId = String(user?.websiteId || session?.query?.website_id || 0);

    const script = `
      (() => {
        try {
          const raw = ${JSON.stringify(rawToken)};
          const bearer = ${JSON.stringify(bearerToken)};
          const wid = ${JSON.stringify(websiteId)};
          const uObj = ${JSON.stringify(user || {})};
          const pObj = ${JSON.stringify(userProfile || {})};

          // Always seed standard localStorage keys
          localStorage.setItem('token', raw);
          localStorage.setItem('access_token', raw);
          localStorage.setItem('auth_token', raw);
          localStorage.setItem('auth._token.local', bearer);
          localStorage.setItem('auth.strategy', 'local');
          localStorage.setItem('auth._token_expiration.local', String(Date.now() + 86400000000));
          localStorage.setItem('website_id', wid);
          localStorage.setItem('user', JSON.stringify(uObj));
          localStorage.setItem('profile', JSON.stringify(pObj));
          localStorage.setItem('userProfile', JSON.stringify(pObj));

          document.cookie = 'token=' + encodeURIComponent(raw) + '; path=/; max-age=604800';
          document.cookie = 'auth._token.local=' + encodeURIComponent(bearer) + '; path=/; max-age=604800';
          document.cookie = 'website_id=' + encodeURIComponent(wid) + '; path=/; max-age=604800';

          // If on login page, redirect to dashboard
          if (location.pathname.includes('/auth/login') || location.pathname.includes('/login')) {
            if (window.$nuxt && window.$nuxt.$router) {
              window.$nuxt.$router.push('/dashboard').catch(() => { window.$nuxt.$router.push('/'); });
            } else {
              location.href = '/dashboard';
            }
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      })()
    `;
    return await webview.executeJavaScript(script);
  } catch (e) {
    return false;
  }
}

// 2. Intelligent Auto-Login Bot (Polling + Prototype Setter for Vue Reactivity)
let autoLoginRunning = false;

async function attemptWebviewAutoLogin() {
  if (autoLoginRunning) return;
  autoLoginRunning = true;

  try {
    const creds = await window.nkAPI.getTempCredentials();
    if (!creds || !creds.username || !creds.password) {
      autoLoginRunning = false;
      return;
    }

    const injectScript = `
      (function() {
        if (window.__nkAutoLoginActive) return;
        window.__nkAutoLoginActive = true;

        const creds = ${JSON.stringify(creds)};

        function setNativeValue(element, value) {
          if (!element) return;
          const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
          const prototype = Object.getPrototypeOf(element);
          const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
          } else if (valueSetter) {
            valueSetter.call(element, value);
          } else {
            element.value = value;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        let attempts = 0;
        const maxAttempts = 60; // Poll for ~15 seconds (250ms interval)
        let hasSubmitted = false;

        const timer = setInterval(() => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(timer);
            window.__nkAutoLoginActive = false;
            return;
          }

          // If already past login screen (on dashboard)
          if (!location.pathname.includes('/login') && !location.pathname.includes('/auth') && (document.querySelector('.layout') || document.querySelector('.sidebar') || document.querySelector('.navbar') || document.querySelector('#__layout > div > div > aside'))) {
            clearInterval(timer);
            window.__nkAutoLoginActive = false;
            return;
          }

          // 1. Check for 2FA modal/input
          const modalOtp = document.querySelector('.el-dialog input') ||
                           document.querySelector('.modal input') ||
                           document.querySelector('input[placeholder*="6 หลัก"]') ||
                           document.querySelector('input[placeholder*="Authenticator"]') ||
                           document.querySelector('input[placeholder*="000000"]') ||
                           document.querySelector('input[placeholder*="เครื่องใหม่"]');

          if (modalOtp && creds.otp && !modalOtp.value) {
            setNativeValue(modalOtp, creds.otp);
            const confirmBtn = document.querySelector('.el-dialog button.el-button--primary') ||
                               document.querySelector('.modal button.btn-primary') ||
                               [...document.querySelectorAll('button')].find(b => b.textContent && (b.textContent.includes('ยืนยัน') || b.textContent.includes('ตกลง')));
            if (confirmBtn) {
              confirmBtn.click();
              clearInterval(timer);
              window.__nkAutoLoginActive = false;
              return;
            }
          }

          if (hasSubmitted) return;

          // 2. Find login inputs
          const uInput = document.querySelector('input[placeholder*="ชื่อผู้ใช้"]') ||
                         document.querySelector('input[placeholder*="ผู้ใช้"]') ||
                         document.querySelector('input[placeholder*="username" i]') ||
                         document.querySelector('input[type="text"]');

          const pInput = document.querySelector('input[placeholder*="รหัสผ่าน"]') ||
                         document.querySelector('input[placeholder*="รหัส"]') ||
                         document.querySelector('input[placeholder*="password" i]') ||
                         document.querySelector('input[type="password"]');

          const oInput = document.querySelector('input[placeholder*="6 หลัก"]') ||
                         document.querySelector('input[placeholder*="Authenticator"]') ||
                         document.querySelector('input[name="otp"]');

          const btn = document.querySelector('button[type="submit"]') ||
                      document.querySelector('button.el-button--primary') ||
                      [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('เข้าสู่ระบบ'));

          if (uInput && pInput && btn) {
            const needsUser = uInput.value !== creds.username;
            const needsPass = !pInput.value;
            const needsOtp = oInput && creds.otp && !oInput.value;

            if (needsUser || needsPass || needsOtp) {
              if (needsUser) setNativeValue(uInput, creds.username);
              if (needsPass) setNativeValue(pInput, creds.password);
              if (needsOtp) setNativeValue(oInput, creds.otp);

              hasSubmitted = true;
              setTimeout(() => {
                btn.click();
                // Allow another attempt after 1s in case 2FA popup appears
                setTimeout(() => {
                  hasSubmitted = false;
                }, 1000);
              }, 300);
            }
          }
        }, 250);
      })();
    `;
    await webview.executeJavaScript(injectScript);
  } catch (e) {
  } finally {
    setTimeout(() => {
      autoLoginRunning = false;
    }, 1000);
  }
}

document.getElementById('btnWebAutoLogin')?.addEventListener('click', () => {
  injectSessionIntoWebview();
  attemptWebviewAutoLogin();
});

// ==========================================
// 9. SETTINGS MANAGEMENT & AUDIO SYNTHESIS
// ==========================================
let currentAudioContext = null;
let currentVolumeLevel = 0.8;

function getAudioContext() {
  if (!currentAudioContext || currentAudioContext.state === 'closed') {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) currentAudioContext = new AudioContext();
  }
  if (currentAudioContext && currentAudioContext.state === 'suspended') {
    currentAudioContext.resume();
  }
  return currentAudioContext;
}

// 1. Upbeat cheerful rising chime for deposit (C5 -> E5 -> G5 -> C6)
function playToneDeposit() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(currentVolumeLevel * 0.35, now);
    masterGain.connect(ctx.destination);

    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.8, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.38);
    });
  } catch (e) {}
}

// 2. Distinct double ping for withdrawal (A4 -> E5 double ping)
function playToneWithdraw() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(currentVolumeLevel * 0.4, now);
    masterGain.connect(ctx.destination);

    const pings = [
      { freq: 440, time: 0 },
      { freq: 659.25, time: 0.14 }
    ];

    pings.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.freq, now + p.time);

      gain.gain.setValueAtTime(0.001, now + p.time);
      gain.gain.exponentialRampToValueAtTime(0.9, now + p.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + p.time + 0.45);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + p.time);
      osc.stop(now + p.time + 0.48);
    });
  } catch (e) {}
}

// 3. Urgent multi-pulse warning tone for high-risk / fraud alert
function playToneHighRisk() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(currentVolumeLevel * 0.45, now);
    masterGain.connect(ctx.destination);

    [0, 0.12, 0.24].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now + t);
      osc.frequency.exponentialRampToValueAtTime(440, now + t + 0.09);

      gain.gain.setValueAtTime(0.001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.8, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.09);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + t);
      osc.stop(now + t + 0.1);
    });
  } catch (e) {}
}

// 4. Subtle smooth notification tone for member edit / password reset / manual
function playToneInfo() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(currentVolumeLevel * 0.3, now);
    masterGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(698.46, now); // F5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.7, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.48);
  } catch (e) {}
}

function playNotificationSound(type, tone) {
  const soundCheckbox = document.getElementById('setSoundEnabled');
  const soundEnabled = soundCheckbox ? soundCheckbox.checked : true;
  if (!soundEnabled) return;

  if (tone === 'high_risk' || type === 'high_risk') {
    playToneHighRisk();
  } else if (tone === 'withdraw' || type === 'withdraw') {
    playToneWithdraw();
  } else if (tone === 'deposit' || type === 'deposit') {
    playToneDeposit();
  } else {
    playToneInfo();
  }
}

// Settings initialization
const soundVolume = document.getElementById('soundVolume');
const soundVolumeText = document.getElementById('soundVolumeText');

if (soundVolume) {
  soundVolume.addEventListener('input', () => {
    const val = Number(soundVolume.value) || 0;
    currentVolumeLevel = val / 100;
    if (soundVolumeText) soundVolumeText.textContent = `${val}%`;
  });
}

document.getElementById('btnTestDeposit')?.addEventListener('click', () => playToneDeposit());
document.getElementById('btnTestWithdraw')?.addEventListener('click', () => playToneWithdraw());
document.getElementById('btnTestHighRisk')?.addEventListener('click', () => playToneHighRisk());
document.getElementById('btnTestMember')?.addEventListener('click', () => playToneInfo());

async function loadSettings() {
  const s = await window.nkAPI.getSettings();
  if (s) {
    if (document.getElementById('lblTargetSiteName')) {
      document.getElementById('lblTargetSiteName').textContent = s.targetWebsiteName || '-';
    }
    if (document.getElementById('lblTargetWebsiteId')) {
      document.getElementById('lblTargetWebsiteId').textContent = s.targetWebsiteId ? `(Website ID: ${s.targetWebsiteId})` : '';
    }
    if (document.getElementById('lblTargetBackofficeUrl')) {
      document.getElementById('lblTargetBackofficeUrl').textContent = s.backofficeUrl || '-';
    }

    ensureBackofficeWebviewLoaded();

    if (document.getElementById('setNotifyDeposit')) document.getElementById('setNotifyDeposit').checked = s.notifyDeposit !== false;
    if (document.getElementById('setNotifyWithdraw')) document.getElementById('setNotifyWithdraw').checked = s.notifyWithdraw !== false;
    if (document.getElementById('setNotifyManual')) document.getElementById('setNotifyManual').checked = s.notifyManual !== false;
    if (document.getElementById('setNotifyBonus')) document.getElementById('setNotifyBonus').checked = s.notifyBonus !== false;
    if (document.getElementById('setNotifyMemberEdit')) document.getElementById('setNotifyMemberEdit').checked = s.notifyMemberEdit !== false;
    if (document.getElementById('setSoundEnabled')) document.getElementById('setSoundEnabled').checked = s.soundEnabled !== false;
    if (document.getElementById('setObserverInterval')) document.getElementById('setObserverInterval').value = String(s.observerInterval || 15);

    // Risk settings
    if (document.getElementById('setRiskLargeAmount')) document.getElementById('setRiskLargeAmount').value = String(s.riskLargeAmount || 10000);
    if (document.getElementById('setRiskBankChange24h')) document.getElementById('setRiskBankChange24h').checked = s.riskBankChange24h !== false;
    if (document.getElementById('setRiskRapidWithdraw')) document.getElementById('setRiskRapidWithdraw').checked = s.riskRapidWithdraw !== false;

    // Remote Control URL setting
    if (document.getElementById('setRemoteControlUrl')) {
      document.getElementById('setRemoteControlUrl').value = s.remoteControlUrl || '';
    }

    // Volume setting
    const vol = s.soundVolume != null ? Number(s.soundVolume) : 80;
    currentVolumeLevel = vol / 100;
    if (soundVolume) soundVolume.value = String(vol);
    if (soundVolumeText) soundVolumeText.textContent = `${vol}%`;
  }
  const isDark = await window.nkAPI.getStore('darkMode', true);
  if (document.getElementById('setDarkMode')) {
    document.getElementById('setDarkMode').checked = isDark !== false;
  }
}
loadSettings();

document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnSaveSettings');
  const originalHtml = btn ? btn.innerHTML : '💾 บันทึกการตั้งค่า';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-icon">🔄</span> กำลังบันทึก...';
  }

  const startTime = Date.now();

  try {
    const isDark = document.getElementById('setDarkMode') ? document.getElementById('setDarkMode').checked : true;
    setAppTheme(isDark, true);

    const newSettings = {
      notifyDeposit: document.getElementById('setNotifyDeposit')?.checked !== false,
      notifyWithdraw: document.getElementById('setNotifyWithdraw')?.checked !== false,
      notifyManual: document.getElementById('setNotifyManual')?.checked !== false,
      notifyBonus: document.getElementById('setNotifyBonus')?.checked !== false,
      notifyMemberEdit: document.getElementById('setNotifyMemberEdit')?.checked !== false,
      soundEnabled: document.getElementById('setSoundEnabled')?.checked !== false,
      soundVolume: soundVolume ? Number(soundVolume.value) : 80,
      observerInterval: Number(document.getElementById('setObserverInterval')?.value) || 15,
      riskLargeAmount: Number(document.getElementById('setRiskLargeAmount')?.value) || 10000,
      riskBankChange24h: document.getElementById('setRiskBankChange24h')?.checked !== false,
      riskRapidWithdraw: document.getElementById('setRiskRapidWithdraw')?.checked !== false,
      remoteControlUrl: document.getElementById('setRemoteControlUrl')?.value?.trim() || ''
    };

    const updatedSettings = await window.nkAPI.saveSettings(newSettings);
    if (updatedSettings && updatedSettings.backofficeUrl) {
      const boInput = document.getElementById('boUrl') || document.getElementById('inputBackofficeUrl');
      if (boInput) boInput.value = updatedSettings.backofficeUrl;
      if (webview && webview.src !== updatedSettings.backofficeUrl) {
        webview.src = updatedSettings.backofficeUrl;
      }
      const siteName = updatedSettings.targetWebsiteName || 'ระบบเป้าหมาย';
      const siteId = updatedSettings.targetWebsiteId;
      if (document.getElementById('lblTargetSiteName')) {
        document.getElementById('lblTargetSiteName').textContent = siteName;
      }
      if (document.getElementById('lblTargetWebsiteId')) {
        document.getElementById('lblTargetWebsiteId').textContent = siteId ? `(Website ID: ${siteId})` : '(รอเข้าสู่ระบบ)';
      }
      if (document.getElementById('txtUserSite')) {
        document.getElementById('txtUserSite').textContent = siteName;
      }
    }

    // Ensure smooth spinner rotation visible for at least 450ms
    const elapsed = Date.now() - startTime;
    if (elapsed < 450) {
      await new Promise(r => setTimeout(r, 450 - elapsed));
    }

    // Success button state
    if (btn) {
      btn.classList.add('btn-saved-success');
      btn.innerHTML = '✓ บันทึกสำเร็จ!';
    }

    showToast({
      type: 'success',
      badge: '✓ บันทึกสำเร็จ',
      badgeColor: '#10b981',
      title: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
      detail: 'ระบบได้อัปเดตการแจ้งเตือน ระดับเสียง และการตรวจจับความเสี่ยงแล้ว'
    });

    try {
      playToneInfo();
    } catch (e) {}

  } catch (err) {
    console.error('Failed to save settings:', err);
    if (btn) {
      btn.innerHTML = '⚠️ เกิดข้อผิดพลาด';
    }
    showToast({
      type: 'error',
      badge: '⚠️ ล้มเหลว',
      badgeColor: '#ef4444',
      title: 'บันทึกการตั้งค่าไม่สำเร็จ',
      detail: err?.message || String(err)
    });
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('btn-saved-success');
        btn.innerHTML = originalHtml;
      }
    }, 1400);
  }
});

// Factory Reset button
document.getElementById('btnFactoryReset')?.addEventListener('click', async () => {
  const confirmed = await window.showConfirmDialog({
    title: 'รีเซ็ตโปรแกรมเป็นค่าเริ่มต้น',
    message: '⚠️ ข้อมูลและแคชทั้งหมดจะถูกล้าง และโปรแกรมจะเปิดหน้าต่างเข้าสู่ระบบใหม่ เหมือนเพิ่งติดตั้งโปรแกรมครั้งแรก\n\nต้องการดำเนินการต่อหรือไม่?',
    confirmText: 'ยืนยันรีเซ็ตทั้งหมด',
    cancelText: 'ยกเลิก',
    type: 'danger',
    icon: '⚠️'
  });
  if (!confirmed) return;

  try {
    await window.nkAPI.factoryReset();
  } catch (err) {
    await window.showAlertDialog({
      title: 'เกิดข้อผิดพลาด',
      message: 'เกิดข้อผิดพลาดในการรีเซ็ต: ' + (err.message || String(err)),
      type: 'danger'
    });
  }
});

// ==========================================
// 10. REALTIME NOTIFICATION TOAST & MODALS
// ==========================================
function showToast(notif) {
  if (notif.type !== 'success') {
    playNotificationSound(notif.type, notif.tone);
  }

  const container = document.getElementById('toastContainer');
  if (!container) return;

  const card = document.createElement('div');
  card.className = 'toast-card';

  const badgeColor = notif.badgeColor || (notif.type === 'error' ? '#ef4444' : (notif.type === 'success' ? '#10b981' : (notif.type === 'warning' ? '#f59e0b' : 'var(--accent)')));
  card.style.borderLeftColor = badgeColor;

  const iconMap = {
    deposit: '📥',
    withdraw: '📤',
    manual: '⚡',
    bonus: '🎁',
    reward: '💎',
    member_edit: '✏️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };

  const timeStr = new Date(notif.at || Date.now()).toLocaleTimeString('th-TH');
  const badgeText = notif.badge || (notif.type === 'error' ? 'ข้อผิดพลาด' : (notif.type === 'success' ? 'สำเร็จ' : (notif.type === 'warning' ? 'แจ้งเตือน' : 'แจ้งเตือน')));
  const titleText = notif.title || (notif.type === 'error' ? 'เกิดข้อผิดพลาด' : (notif.type === 'success' ? 'สำเร็จ' : 'มีการเปลี่ยนแปลง'));
  const detailText = notif.detail || notif.message || '';

  let extraActionHtml = '';
  if (notif.slipImage) {
    extraActionHtml += `<button type="button" class="btn btn-secondary btn-sm toast-slip-btn" style="height:24px; font-size:11px; padding:0 8px; margin-top:6px;">🧾 ดูสลิปโอนเงิน</button>`;
  }

  card.innerHTML = `
    <div class="toast-icon">${iconMap[notif.type] || (notif.type === 'error' ? '❌' : (notif.type === 'warning' ? '⚠️' : '🔔'))}</div>
    <div class="toast-body">
      <div class="toast-header">
        <span class="toast-badge" style="background:${badgeColor};">${badgeText}</span>
        <span class="toast-time">${timeStr}</span>
      </div>
      <div class="toast-title">${titleText}</div>
      ${detailText ? `<div class="toast-detail">${detailText}</div>` : ''}
      ${extraActionHtml}
    </div>
    <button class="toast-close" title="ปิด">✕</button>
  `;

  if (notif.slipImage) {
    card.querySelector('.toast-slip-btn')?.addEventListener('click', () => {
      window.viewSlip(notif.slipImage);
    });
  }

  card.querySelector('.toast-close').addEventListener('click', () => {
    card.classList.add('closing');
    setTimeout(() => card.remove(), 250);
  });

  container.appendChild(card);

  // Auto remove after 6 seconds (or 10 seconds for high risk alerts)
  const duration = notif.isHighRisk ? 10000 : 6000;
  setTimeout(() => {
    if (card.parentNode) {
      card.classList.add('closing');
      setTimeout(() => card.remove(), 250);
    }
  }, duration);
}

// ==========================================
// 10.5 MODAL SYSTEM & QUICK ACTIONS
// ==========================================
window.openModal = function(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.style.display = 'flex';
};

window.closeModal = function(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.style.display = 'none';
};

// 1. Audit / Turnover Modal Controller
let currentAuditItem = null;
async function openAuditModal(memberId, username, txId) {
  currentAuditItem = { memberId, username, txId };
  const modal = document.getElementById('modalMemberAudit');
  if (!modal) return;

  document.getElementById('auditMemberSubtitle').textContent = `กำลังโหลดข้อมูล ${username}...`;
  document.getElementById('auditTurnoverReq').textContent = '...';
  document.getElementById('auditTurnoverBet').textContent = '...';
  document.getElementById('auditTurnoverRem').textContent = '...';
  const statusBadge = document.getElementById('auditTurnoverStatus');
  statusBadge.className = 'audit-status-badge info';
  statusBadge.textContent = 'กำลังคำนวณ...';

  const tbody = document.querySelector('#tableAuditTransactions tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state">กำลังดึงข้อมูล...</td></tr>';

  window.openModal('modalMemberAudit');

  try {
    const res = await window.nkAPI.getMemberTurnoverSummary(memberId, username);
    if (!res || !res.ok) throw new Error(res?.error || 'ไม่สามารถโหลดข้อมูลได้');

    const m = res.member || {};
    const t = res.turnover || {};
    const totals = res.totals || {};

    document.getElementById('auditMemberSubtitle').textContent = `${m.username} (ID: #${m.id || memberId})`;
    document.getElementById('auditFullName').textContent = m.fullname || '-';
    document.getElementById('auditPhone').textContent = m.phone || '-';
    document.getElementById('auditBank').textContent = `${m.bankcode || '-'} ${m.banknumber || ''}`;
    document.getElementById('auditPoints').textContent = Number(m.point || 0).toLocaleString('th-TH');
    document.getElementById('auditTotalDeposit').textContent = `฿${Number(totals.deposit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('auditTotalWithdraw').textContent = `฿${Number(totals.withdraw || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    document.getElementById('auditTurnoverReq').textContent = `฿${Number(t.required || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('auditTurnoverBet').textContent = `฿${Number(t.bet || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    document.getElementById('auditTurnoverRem').textContent = `฿${Number(t.remaining || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    if (t.passed) {
      statusBadge.className = 'audit-status-badge success';
      statusBadge.textContent = '✅ ผ่านเทิร์นแล้ว (พร้อมถอน)';
    } else {
      statusBadge.className = 'audit-status-badge danger';
      statusBadge.textContent = `⚠️ ยังไม่ครบเทิร์น (ขาดอีก ฿${Number(t.remaining || 0).toLocaleString('th-TH')})`;
    }

    if (tbody) {
      const txs = res.recentTransactions || [];
      if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">ไม่พบประวัติรายการล่าสุด</td></tr>';
      } else {
        tbody.innerHTML = txs.map(tx => {
          const isOut = tx.direction === 'out' || tx.type === 'withdraw';
          const amtColor = isOut ? 'var(--warning)' : 'var(--success)';
          const timeStr = tx.at ? new Date(tx.at).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
          return `
            <tr>
              <td style="font-size:11.5px; color:var(--text-muted);">${timeStr}</td>
              <td><span class="badge-status ${isOut ? 'pending' : 'success'}">${tx.type || '-'}</span></td>
              <td style="font-weight:700; color:${amtColor};">฿${Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              <td style="font-size:11.5px;">${tx.bank || '-'}</td>
              <td><span class="badge-status ${tx.status === 'success' ? 'success' : 'pending'}">${tx.status || '-'}</span></td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    document.getElementById('auditMemberSubtitle').textContent = `เกิดข้อผิดพลาด: ${err.message}`;
  }
}

document.getElementById('btnAuditApproveNow')?.addEventListener('click', () => {
  if (currentAuditItem?.txId) {
    window.closeModal('modalMemberAudit');
    openApproveModal({
      id: currentAuditItem.txId,
      username: currentAuditItem.username,
      name: document.getElementById('auditFullName')?.textContent || '',
      amount: 0,
      bank: document.getElementById('auditBank')?.textContent || ''
    });
  }
});

// 2. Approve Modal Controller
let currentApproveItem = null;

function updateApproveModalState() {
  const provSelect = document.getElementById('approveModalProvider');
  const prov = provSelect?.value || 'crs';
  const btn = document.getElementById('btnExecuteApprove');
  const hint = document.getElementById('approveModalProviderHint');
  const chk = document.getElementById('chkApproveSafety');

  if (hint) {
    hint.textContent = prov === 'swiftpay'
      ? '⚡ ส่งคำสั่งไปยังเกตเวย์ SwiftPay เพื่อดำเนินการโอนเงินให้ลูกค้าอัตโนมัติทันที'
      : '🏢 ส่งรายการเข้าคิวกลางของ CRS เพื่อให้ทีมเจ้าหน้าที่ทำรายการโอน';
  }

  const btnLabel = prov === 'swiftpay' ? '⚡ ยืนยันการอนุมัติ (ส่ง SwiftPay)' : '✓ ยืนยันการอนุมัติ (ส่ง CRS)';
  if (btn) {
    btn.disabled = !chk?.checked;
    btn.textContent = btnLabel;
  }
}

function openApproveModal(tx) {
  currentApproveItem = tx;
  document.getElementById('approveModalTxId').textContent = `#${tx.id}`;
  document.getElementById('approveModalUser').textContent = `${tx.username} (${tx.name || '-'})`;
  document.getElementById('approveModalAmount').textContent = tx.amount > 0 ? `฿${Number(tx.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : 'ตรวจสอบในระบบ';
  document.getElementById('approveModalBank').textContent = tx.bank || '-';

  const riskRow = document.getElementById('approveModalRiskRow');
  const riskBadge = document.getElementById('approveModalRiskBadge');
  if (tx.riskLevel === 'critical' || tx.riskSummary) {
    riskRow.style.display = 'flex';
    riskBadge.innerHTML = `<span class="badge-risk-high">${tx.riskSummary || '⚠️ เสี่ยงสูง'}</span>`;
  } else {
    riskRow.style.display = 'none';
  }

  // Sync default provider with standby provider selection or fallback to 'crs'
  const defaultProv = document.getElementById('withdrawAutoProvider')?.value || 'crs';
  const provSelect = document.getElementById('approveModalProvider');
  if (provSelect) provSelect.value = defaultProv;

  const chk = document.getElementById('chkApproveSafety');
  if (chk) chk.checked = false;

  updateApproveModalState();
  window.openModal('modalConfirmApprove');
}

document.getElementById('approveModalProvider')?.addEventListener('change', () => {
  updateApproveModalState();
});

document.getElementById('chkApproveSafety')?.addEventListener('change', () => {
  updateApproveModalState();
});

document.getElementById('btnExecuteApprove')?.addEventListener('click', async () => {
  if (!currentApproveItem?.id) return;
  const btn = document.getElementById('btnExecuteApprove');
  const provider = document.getElementById('approveModalProvider')?.value || 'crs';
  const provName = provider === 'swiftpay' ? 'SwiftPay (อัตโนมัติ)' : 'CRS (เข้าคิวทีมงาน)';

  if (btn) {
    btn.disabled = true;
    btn.textContent = `⏳ กำลังส่งคำขออนุมัติ (${provName})...`;
  }

  try {
    const res = await window.nkAPI.approveWithdraw(currentApproveItem.id, provider);
    if (res && res.ok) {
      window.closeModal('modalConfirmApprove');
      showToast({
        type: 'success',
        badge: '✓ อนุมัติสำเร็จ',
        badgeColor: '#10b981',
        title: `อนุมัติรายการ #${currentApproveItem.id} แล้ว`,
        detail: `ส่งต่อให้ระบบ ${provName} ดำเนินการเรียบร้อยแล้ว`
      });
      window.nkAPI.pollWithdrawNow();
    } else {
      await window.showAlertDialog({ title: 'ไม่สามารถอนุมัติได้', message: res?.error || 'เกิดข้อผิดพลาดในการอนุมัติรายการ', type: 'danger' });
      if (btn) {
        btn.disabled = false;
        updateApproveModalState();
      }
    }
  } catch (err) {
    await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: err.message, type: 'danger' });
    if (btn) {
      btn.disabled = false;
      updateApproveModalState();
    }
  }
});

// 3. Reject Modal Controller
let currentRejectItem = null;
function openRejectModal(tx) {
  currentRejectItem = tx;
  document.getElementById('rejectModalTxId').textContent = `#${tx.id}`;
  document.getElementById('rejectModalUser').textContent = tx.username;
  document.getElementById('rejectModalAmount').textContent = tx.amount > 0 ? `฿${Number(tx.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-';

  const select = document.getElementById('rejectPresetReason');
  if (select) select.value = 'เทิร์นโอเวอร์ไม่ครบตามเงื่อนไข';
  const customWrap = document.getElementById('wrapRejectCustomNote');
  if (customWrap) customWrap.style.display = 'none';
  const noteArea = document.getElementById('rejectCustomNote');
  if (noteArea) noteArea.value = '';

  window.openModal('modalConfirmReject');
}

document.getElementById('rejectPresetReason')?.addEventListener('change', (e) => {
  const customWrap = document.getElementById('wrapRejectCustomNote');
  if (customWrap) {
    customWrap.style.display = e.target.value === 'other' ? 'block' : 'none';
  }
});

document.getElementById('btnExecuteReject')?.addEventListener('click', async () => {
  if (!currentRejectItem?.id) return;
  const btn = document.getElementById('btnExecuteReject');
  const select = document.getElementById('rejectPresetReason');
  const custom = document.getElementById('rejectCustomNote');

  let note = select ? select.value : '';
  if (note === 'other' || !note) {
    note = custom?.value.trim() || 'ปฏิเสธรายการโดยแอดมิน';
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังบันทึกการปฏิเสธ...';
  }

  try {
    const res = await window.nkAPI.rejectWithdraw(currentRejectItem.id, note);
    if (res && res.ok) {
      window.closeModal('modalConfirmReject');
      showToast({
        type: 'withdraw',
        badge: '✕ ปฏิเสธแล้ว',
        badgeColor: '#ef4444',
        title: `ปฏิเสธรายการ #${currentRejectItem.id}`,
        detail: `บันทึกเหตุผล: ${note}`
      });
      window.nkAPI.pollWithdrawNow();
    } else {
      await window.showAlertDialog({ title: 'ไม่สามารถปฏิเสธรายการได้', message: res?.error || 'เกิดข้อผิดพลาดในการปฏิเสธรายการ', type: 'danger' });
    }
  } catch (err) {
    await window.showAlertDialog({ title: 'เกิดข้อผิดพลาด', message: err.message, type: 'danger' });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✕ ยืนยันปฏิเสธรายการ';
    }
  }
});

// 4. Instant Slip Lightbox Controller
let currentSlipZoom = 1.0;
window.viewSlip = function(rawUrl) {
  if (!rawUrl) return;
  const url = decodeURIComponent(rawUrl);
  const img = document.getElementById('slipPreviewImg');
  if (img) {
    img.src = url;
    currentSlipZoom = 1.0;
    img.style.transform = 'scale(1)';
  }

  const btnDownload = document.getElementById('btnSlipDownload');
  if (btnDownload) {
    btnDownload.onclick = () => window.open(url, '_blank');
  }

  window.openModal('modalSlipPreview');
};

document.getElementById('btnSlipZoomIn')?.addEventListener('click', () => {
  currentSlipZoom = Math.min(3.0, currentSlipZoom + 0.3);
  const img = document.getElementById('slipPreviewImg');
  if (img) img.style.transform = `scale(${currentSlipZoom})`;
});

document.getElementById('btnSlipZoomOut')?.addEventListener('click', () => {
  currentSlipZoom = Math.max(0.5, currentSlipZoom - 0.3);
  const img = document.getElementById('slipPreviewImg');
  if (img) img.style.transform = `scale(${currentSlipZoom})`;
});

// 5. Global Keyboard Shortcuts & Version Check
document.getElementById('btnShowShortcutsModal')?.addEventListener('click', () => {
  window.openModal('modalShortcuts');
});


window.addEventListener('keydown', (e) => {
  // 1. Esc: close all open modals or fullscreen
  if (e.key === 'Escape') {
    ['modalMemberAudit', 'modalConfirmApprove', 'modalConfirmReject', 'modalSlipPreview', 'modalShortcuts'].forEach(id => {
      window.closeModal(id);
    });
    return;
  }

  // 2. Ctrl + F: focus search in current active view
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    const activeView = document.querySelector('.nav-item.active')?.dataset?.view;
    if (activeView === 'notifications') {
      document.getElementById('notifSearch')?.focus();
    } else if (activeView === 'points') {
      document.getElementById('inputPointsSearch')?.focus();
    } else if (activeView === 'member') {
      document.getElementById('inputMemberPhone')?.focus();
    } else if (activeView === 'analyzer') {
      document.getElementById('analyzerSearch')?.focus();
    } else {
      document.getElementById('notifSearch')?.focus();
    }
    return;
  }

  // 3. Ctrl + 1..9: fast view navigation
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const views = ['dashboard', 'notifications', 'withdraw', 'member', 'reset-password', 'points', 'reports', 'analyzer', 'settings'];
    const target = views[Number(e.key) - 1];
    if (target && window.navTo) {
      window.navTo(target);
    }
    return;
  }

  // 4. M (when not typing in an input/textarea): Mute audio toggle
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if ((e.key === 'm' || e.key === 'M') && activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
    e.preventDefault();
    const chk = document.getElementById('setSoundEnabled');
    if (chk) {
      chk.checked = !chk.checked;
      showToast({
        type: 'info',
        badge: chk.checked ? '🔊 เปิดเสียง' : '🔇 ปิดเสียง',
        badgeColor: '#64748b',
        title: chk.checked ? 'เปิดเสียงแจ้งเตือนแล้ว' : 'ปิดเสียงแจ้งเตือนแล้ว (Muted)',
        detail: 'คุณสามารถกด M อีกครั้งเพื่อสลับสถานะ'
      });
    }
  }
});

// ==========================================
// 1.5 NOTIFICATIONS LOG VIEW CONTROLLER
// ==========================================
let notifState = {
  category: 'all',
  datePreset: 'today',
  startDate: '',
  endDate: '',
  page: 1,
  limit: 50,
  search: '',
  loading: false
};

const notifTableBody = document.getElementById('notifTableBody');
const notifPaginationInfo = document.getElementById('notifPaginationInfo');
const notifPageIndicator = document.getElementById('notifPageIndicator');
const btnPrevNotifPage = document.getElementById('btnPrevNotifPage');
const btnNextNotifPage = document.getElementById('btnNextNotifPage');
const notifPageSize = document.getElementById('notifPageSize');
const notifSearch = document.getElementById('notifSearch');
const notifCustomDateWrap = document.getElementById('notifCustomDateWrap');
const notifStartDate = document.getElementById('notifStartDate');
const notifEndDate = document.getElementById('notifEndDate');
const btnApplyCustomDate = document.getElementById('btnApplyCustomDate');
const btnRefreshNotif = document.getElementById('btnRefreshNotif');

// Default date inputs to today (Bangkok timezone)
if (notifStartDate && notifEndDate) {
  const todayStr = todayDateString();
  notifStartDate.value = todayStr;
  notifEndDate.value = todayStr;
}

async function loadNotificationLogs() {
  if (notifState.loading) return;
  notifState.loading = true;

  if (notifTableBody) {
    notifTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">กำลังดึงข้อมูลประวัติการแจ้งเตือน...</td></tr>';
  }

  try {
    const res = await window.nkAPI.getNotificationLogs({
      category: notifState.category,
      datePreset: notifState.datePreset,
      startDate: notifState.startDate,
      endDate: notifState.endDate,
      page: notifState.page,
      limit: notifState.limit,
      search: notifState.search
    });

    if (res && res.ok) {
      renderNotificationTable(res.records || []);
      renderNotificationPagination(res.page, res.totalPages, res.total, res.limit);
    } else {
      if (notifTableBody) {
        notifTableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--danger);">เกิดข้อผิดพลาด: ${res?.error || 'ไม่สามารถโหลดข้อมูลได้'}</td></tr>`;
      }
    }
  } catch (err) {
    if (notifTableBody) {
      notifTableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--danger);">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
  } finally {
    notifState.loading = false;
  }
}

function renderNotificationTable(records) {
  if (!notifTableBody) return;
  if (!records.length) {
    notifTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">ไม่พบรายการแจ้งเตือนตามเงื่อนไขที่เลือก</td></tr>';
    return;
  }

  notifTableBody.innerHTML = records.map(r => `
    <tr>
      <td style="color:var(--text-muted); font-size:11.5px; white-space:nowrap;">${r.timeStr}</td>
      <td>
        <span class="badge-notif-type" style="background:${r.badgeColor};">${r.typeLabel}</span>
        ${r.riskBadgeHtml ? `<div style="margin-top:4px;">${r.riskBadgeHtml}</div>` : ''}
      </td>
      <td style="font-weight:600; color:var(--text-main);">${r.username}</td>
      <td style="font-weight:700; color:${r.type === 'deposit' ? 'var(--success)' : (r.type === 'withdraw' ? 'var(--warning)' : (r.type === 'manual' ? (String(r.amount).startsWith('+') ? 'var(--blue)' : 'var(--danger)') : (r.type === 'bonus' ? '#8b5cf6' : (r.type === 'reward' ? '#06b6d4' : 'var(--text-main)'))))};">
        ${r.amountHtml || r.amount}
      </td>
      <td style="color:var(--text-muted); font-size:12px;">${r.admin || '-'}</td>
      <td style="font-size:12px; color:var(--text-main); line-height:1.35;">
        <div>${r.detail || '-'}</div>
        ${r.slipHtml ? `<div style="margin-top:4px;">${r.slipHtml}</div>` : ''}
      </td>
      <td>
        <span class="badge-status ${
          r.statusLabel === 'เปลี่ยนแล้ว' || r.status === 'success' || r.status === 'approved' || r.statusLabel === 'สำเร็จ' || r.statusLabel === 'อนุมัติแล้ว' || r.statusLabel === 'ปรับเครดิตสำเร็จ'
            ? 'success'
            : (r.statusLabel === 'ปฏิเสธ' || r.status === 'rejected' || r.status === 'failed' || r.statusLabel === 'ปฏิเสธแล้ว'
              ? 'danger'
              : (r.statusLabel === 'บัญชีเดิม'
                ? 'neutral'
                : (r.statusLabel === 'รออนุมัติ' || r.status === 'pending' || r.statusLabel === 'รอดำเนินการ'
                  ? 'pending'
                  : 'info')))
        }">${r.statusLabel || r.status}</span>
      </td>
    </tr>
  `).join('');

  // Attach instant slip preview listeners
  notifTableBody.querySelectorAll('.btn-slip-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.viewSlip) {
        window.viewSlip(btn.dataset.slip);
      }
    });
  });
}

function renderNotificationPagination(page, totalPages, total, limit) {
  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);
  if (notifPaginationInfo) {
    notifPaginationInfo.textContent = `แสดง ${startIdx.toLocaleString('th-TH')} - ${endIdx.toLocaleString('th-TH')} จากทั้งหมด ${total.toLocaleString('th-TH')} รายการ`;
  }
  if (notifPageIndicator) {
    notifPageIndicator.textContent = `หน้า ${page} / ${Math.max(1, totalPages)}`;
  }
  if (btnPrevNotifPage) btnPrevNotifPage.disabled = page <= 1;
  if (btnNextNotifPage) btnNextNotifPage.disabled = page >= totalPages;
}

// Date Presets Listener
document.querySelectorAll('#notifDatePresets .btn-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#notifDatePresets .btn-preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const preset = btn.dataset.preset;
    notifState.datePreset = preset;
    notifState.page = 1;

    if (preset === 'custom') {
      if (notifCustomDateWrap) notifCustomDateWrap.style.display = 'flex';
    } else {
      if (notifCustomDateWrap) notifCustomDateWrap.style.display = 'none';
      loadNotificationLogs();
    }
  });
});

// Custom Date Apply
if (btnApplyCustomDate) {
  btnApplyCustomDate.addEventListener('click', async () => {
    if (!notifStartDate.value || !notifEndDate.value) {
      await window.showAlertDialog({ title: 'แจ้งเตือน', message: 'กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด', type: 'warning' });
      return;
    }
    notifState.datePreset = 'custom';
    notifState.startDate = notifStartDate.value;
    notifState.endDate = notifEndDate.value;
    notifState.page = 1;
    loadNotificationLogs();
  });
}

// Category Pills Listener
document.querySelectorAll('#notifCategories .btn-cat').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#notifCategories .btn-cat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    notifState.category = btn.dataset.category;
    notifState.page = 1;
    loadNotificationLogs();
  });
});

// Limit Change
if (notifPageSize) {
  notifPageSize.addEventListener('change', () => {
    notifState.limit = Number(notifPageSize.value) || 50;
    notifState.page = 1;
    loadNotificationLogs();
  });
}

// Search with debounce
let notifSearchTimer = null;
if (notifSearch) {
  notifSearch.addEventListener('input', () => {
    clearTimeout(notifSearchTimer);
    notifSearchTimer = setTimeout(() => {
      notifState.search = notifSearch.value.trim();
      notifState.page = 1;
      loadNotificationLogs();
    }, 400);
  });
}

// Refresh Button
if (btnRefreshNotif) {
  btnRefreshNotif.addEventListener('click', () => {
    loadNotificationLogs();
  });
}

// Prev / Next Page
if (btnPrevNotifPage) {
  btnPrevNotifPage.addEventListener('click', () => {
    if (notifState.page > 1) {
      notifState.page--;
      loadNotificationLogs();
    }
  });
}

if (btnNextNotifPage) {
  btnNextNotifPage.addEventListener('click', () => {
    notifState.page++;
    loadNotificationLogs();
  });
}

// Hook into backend notification stream
if (window.nkAPI.onNotification) {
  window.nkAPI.onNotification((notif) => {
    showToast(notif);

    // If currently on notifications view and looking at today, reload
    const activeView = document.querySelector('.nav-item.active')?.dataset?.view;
    if (activeView === 'notifications' && notifState.datePreset === 'today') {
      loadNotificationLogs();
    } else {
      // Increment unread badge in sidebar
      const badge = document.getElementById('notifBadge');
      if (badge) {
        const count = (parseInt(badge.textContent, 10) || 0) + 1;
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'inline-block';
      }
    }
  });
}

// ====================================================
// DAILY SUMMARY REPORT TABLE
// ====================================================
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

let dailyReportCurrentYm = null;

function formatDailyNum(val) {
  if (val == null || isNaN(val)) return '0';
  const num = Math.trunc(Number(val));
  return num.toLocaleString('th-TH');
}

let lastDailyReportData = null;
let selectedDailySummaryDate = null;

function generateDailySummaryText(dateStr, options = {}) {
  if (!lastDailyReportData || !lastDailyReportData.rows) return '';
  const rows = lastDailyReportData.rows;
  const row = rows.find(r => r.dateStr === dateStr) || {};

  // 1. Site name
  const rawSite = lastDailyReportData.siteName || 'JGAMING88';
  const siteName = rawSite.replace(/\s+/g, '').toUpperCase();

  // 2. Date formatting (DD.MM.YY in Buddhist Era)
  let dateFormatted = dateStr;
  if (dateStr && dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-');
    const beYear2 = String(Number(y) + 543).slice(-2);
    dateFormatted = `${d}.${m}.${beYear2}`;
  }

  // 3. Line inquiry & register
  const lineInquiry = Number(options.lineInquiry ?? 0);
  const lineRegister = Number(options.lineRegister ?? 0);
  const linePercent = lineInquiry > 0 ? ((lineRegister / lineInquiry) * 100) : 0;

  // 4. Dashboard Summary
  const regCount = Number(row.register || 0);
  const regDepositCount = Number(row.registerWithDeposit || 0);
  const regPercent = regCount > 0 ? ((regDepositCount / regCount) * 100) : 0;

  // 5. Daily Bonus
  const bonusAmt = Number(row.bonus || 0) + Number(row.reward || 0);
  const bonusPeople = Number(row.bonusCount || 0) + Number(row.rewardCount || 0);

  // 6. Active Users
  const activeCount = Number(row.activeMembers || 0);

  const lines = [
    `${siteName}\t\t`,
    `\t\t`,
    `วันที่ ${dateFormatted} เวลา 00:00 น.\t\t`,
    `\t\t`,
    `รายการลูกค้าทักเพจ/ไลน์\t\t`,
    `Line\t\t`,
    `ทักเข้ามา\t${lineInquiry.toFixed(2)} \tคน`,
    `สมัคร\t${lineRegister.toFixed(2)} \tคน`,
    `เปอร์เซ็นต์\t${linePercent.toFixed(2)} \t`,
    `\t\t`,
    `สรุป แดชบอร์ด   \t\t`,
    `สมัคร\t${regCount.toFixed(2)} \tคน`,
    `สมัครฝาก\t${regDepositCount.toFixed(2)} \tคน`,
    `เปอร์เซ็นต์\t${regPercent.toFixed(2)} \t`,
    `\t \t`,
    `โบนัสประจำวัน   \t\t`,
    `จำนวนคน\t${bonusPeople.toFixed(2)} \tคน`,
    `ยอดโบนัส\t${bonusAmt.toFixed(2)} \t`,
    `\t\t`,
    `ยอด Active ลูกค้า   \t\t`,
    `\t\t`,
    `ใช้งาน\t${activeCount.toFixed(2)}\tคน`
  ];

  return lines.join('\n');
}

function updateDailyTextSummary(reportData = null) {
  if (reportData) lastDailyReportData = reportData;
  if (!lastDailyReportData || !lastDailyReportData.rows) return;

  const selDate = document.getElementById('selDailySummaryDate');
  const txtResult = document.getElementById('txtDailySummaryResult');
  const inputLineInq = document.getElementById('inputDailySummaryLineInquiry');
  const inputLineReg = document.getElementById('inputDailySummaryLineRegister');
  const inputBonusCount = document.getElementById('inputDailySummaryBonusCount');

  if (!selDate || !txtResult) return;

  const rows = lastDailyReportData.rows || [];
  const yesterdayStr = lastDailyReportData.yesterdayStr || '';

  const completedRows = rows.filter(r => r.isCompleted || r.dateStr <= yesterdayStr);
  completedRows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  let targetDate = selectedDailySummaryDate || yesterdayStr;
  if (!completedRows.some(r => r.dateStr === targetDate) && completedRows.length > 0) {
    targetDate = completedRows[0].dateStr;
  }

  // Check if options need rebuild
  const existingValues = Array.from(selDate.options).map(o => o.value);
  const newValues = completedRows.map(r => r.dateStr);
  const needsRebuild = existingValues.length !== newValues.length || existingValues.some((v, idx) => v !== newValues[idx]);

  if (needsRebuild) {
    selDate.innerHTML = '';
    completedRows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.dateStr;
      const isYest = r.dateStr === yesterdayStr;
      const [y, m, d] = r.dateStr.split('-');
      const beYear = Number(y) + 543;
      opt.textContent = `วันที่ ${d}.${m}.${beYear} ${isYest ? '(เมื่อวาน)' : ''}`;
      selDate.appendChild(opt);
    });
  }

  selDate.value = targetDate;
  selectedDailySummaryDate = targetDate;

  const selectedRow = rows.find(r => r.dateStr === targetDate) || {};
  if (inputBonusCount) {
    inputBonusCount.value = String(Number(selectedRow.bonusCount || 0) + Number(selectedRow.rewardCount || 0));
  }

  const options = {
    lineInquiry: inputLineInq?.value || 0,
    lineRegister: inputLineReg?.value || 0
  };

  txtResult.value = generateDailySummaryText(targetDate, options);
}

function initDailyTextSummaryListeners() {
  const selDate = document.getElementById('selDailySummaryDate');
  const inputLineInq = document.getElementById('inputDailySummaryLineInquiry');
  const inputLineReg = document.getElementById('inputDailySummaryLineRegister');
  const inputBonusCount = document.getElementById('inputDailySummaryBonusCount');
  const btnCopy = document.getElementById('btnCopyDailySummary');
  const txtCopyLabel = document.getElementById('txtCopyDailySummaryLabel');
  const txtResult = document.getElementById('txtDailySummaryResult');

  selDate?.addEventListener('change', () => {
    selectedDailySummaryDate = selDate.value;
    updateDailyTextSummary();
  });

  const onInputChange = () => {
    updateDailyTextSummary();
  };

  inputLineInq?.addEventListener('input', onInputChange);
  inputLineReg?.addEventListener('input', onInputChange);
  btnCopy?.addEventListener('click', async () => {
    if (!txtResult?.value) return;
    try {
      await navigator.clipboard.writeText(txtResult.value);
      if (txtCopyLabel) {
        const orig = txtCopyLabel.textContent;
        txtCopyLabel.textContent = '✓ คัดลอกเรียบร้อยแล้ว!';
        btnCopy.style.background = '#10b981';
        btnCopy.style.borderColor = '#10b981';
        setTimeout(() => {
          txtCopyLabel.textContent = orig;
          btnCopy.style.background = '';
          btnCopy.style.borderColor = '';
        }, 2000);
      }
    } catch (err) {
      txtResult.select();
      document.execCommand('copy');
    }
  });
}

function initDailyReportTable() {
  const selMonth = document.getElementById('selDailyMonth');
  const btnRefresh = document.getElementById('btnDailyRefresh');
  const btnExport = document.getElementById('btnDailyExport');

  if (!selMonth) return;

  // Build Month options: current month + past 5 months
  const now = new Date();
  const options = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
    options.push({ ym, label });
  }

  selMonth.innerHTML = options.map((opt, idx) => 
    `<option value="${opt.ym}" ${idx === 0 ? 'selected' : ''}>${opt.label}</option>`
  ).join('');

  dailyReportCurrentYm = options[0].ym;

  // Month change listener
  selMonth.addEventListener('change', () => {
    dailyReportCurrentYm = selMonth.value;
    loadDailyReportTable(false);
  });

  // Refresh button listener
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadDailyReportTable(true);
    });
  }

  // Export button listener
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const origHtml = btnExport.innerHTML;
      try {
        btnExport.disabled = true;
        btnExport.innerHTML = '<span>⏳</span><span>กำลังส่งออก...</span>';
        const res = await window.nkAPI.exportDailyReportExcel({ yearMonth: dailyReportCurrentYm });
        if (res && res.ok) {
          showToast({
            type: 'success',
            badge: 'Excel',
            title: '📥 ส่งออกตารางสรุปรายวันสำเร็จ!',
            detail: `บันทึกไฟล์เรียบร้อยที่: ${res.filePath}`,
            badgeColor: '#10b981'
          });
        } else if (res && !res.canceled) {
          showToast({
            type: 'error',
            badge: 'Excel',
            title: '❌ ส่งออกไฟล์ไม่สำเร็จ',
            detail: res.error || 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel',
            badgeColor: '#ef4444'
          });
        }
      } catch (err) {
        showToast({
          type: 'error',
          badge: 'Excel',
          title: '❌ เกิดข้อผิดพลาด',
          detail: err.message,
          badgeColor: '#ef4444'
        });
      } finally {
        btnExport.innerHTML = origHtml;
        btnExport.disabled = false;
      }
    });
  }

  // Auto Midnight Update IPC listener
  if (window.nkAPI.onDailyReportUpdated) {
    window.nkAPI.onDailyReportUpdated(({ yesterdayStr, ym }) => {
      if (selMonth && selMonth.value === ym) {
        loadDailyReportTable(false);
        showToast({
          type: 'info',
          badge: 'Auto Sync',
          title: '📅 ข้อมูลตารางรายวันอัปเดตอัตโนมัติแล้ว',
          detail: `ระบบได้ดึงข้อมูลสรุปของเมื่อวาน (${yesterdayStr}) เข้าตารางเรียบร้อยแล้ว`,
          badgeColor: '#06b6d4'
        });
      }
    });
  }

  // Capture Button listener
  const btnCapture = document.getElementById('btnDailyCapture');
  if (btnCapture) {
    btnCapture.addEventListener('click', captureDailyReportTable);
  }

  // Fullscreen / Expand Button listener
  const btnExpand = document.getElementById('btnDailyExpand');
  if (btnExpand) {
    btnExpand.addEventListener('click', () => toggleDailyReportExpand());
  }

  // Initialize daily text summary listeners
  initDailyTextSummaryListeners();

  // Initial load
  loadDailyReportTable(false);
}

function toggleDailyReportExpand(force) {
  const card = document.getElementById('cardDailyReport');
  if (!card) return;
  const isExp = typeof force === 'boolean' ? force : !card.classList.contains('daily-report-expanded');
  card.classList.toggle('daily-report-expanded', isExp);
  const icon = document.getElementById('iconDailyExpand');
  const txt = document.getElementById('txtDailyExpand');
  if (icon) icon.textContent = isExp ? '✕' : '⛶';
  if (txt) txt.textContent = isExp ? 'ย่อมุมมอง' : 'ขยายเต็มจอ';
}

// Global Escape listener to exit expanded mode
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const card = document.getElementById('cardDailyReport');
    if (card && card.classList.contains('daily-report-expanded')) {
      toggleDailyReportExpand(false);
    }
  }
});

async function captureDailyReportTable() {
  const table = document.getElementById('dailyReportTable');
  const btnCapture = document.getElementById('btnDailyCapture');
  const txtCapture = document.getElementById('txtDailyCapture');
  if (!table) return;

  const originalHtml = btnCapture ? btnCapture.innerHTML : '';
  if (btnCapture) {
    btnCapture.disabled = true;
    btnCapture.innerHTML = '<span>⏳</span><span>กำลังแคปภาพ...</span>';
  }

  try {
    const h2c = window.html2canvas || (typeof html2canvas !== 'undefined' ? html2canvas : null);
    if (!h2c) {
      throw new Error('ไม่พบไลบรารี html2canvas ในระบบ กรุณารีสตาร์ทโปรแกรม');
    }

    // Determine theme background
    const isLight = document.body.classList.contains('light-theme');
    const bgCol = isLight ? '#ffffff' : '#0f172a';

    // Capture the entire table cleanly: all 16 columns and all rows including footer
    const canvas = await h2c(table, {
      scale: 2,
      backgroundColor: bgCol,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(table.scrollWidth + 40, 1200),
      onclone: (clonedDoc) => {
        const clonedTable = clonedDoc.getElementById('dailyReportTable');
        if (clonedTable) {
          clonedTable.style.transform = 'none';
          clonedTable.style.margin = '0';
          // Force all sticky headers and cells to static in clone to prevent misalignment
          const stickyCells = clonedTable.querySelectorAll('th, td');
          stickyCells.forEach(cell => {
            cell.style.position = 'static';
          });
        }
      }
    });

    const dataUrl = canvas.toDataURL('image/png');
    const nowStr = new Date().toISOString().slice(0, 10);
    const siteTitle = (document.getElementById('thDailySiteTitle')?.textContent || '').trim().replace(/[^a-zA-Z0-9_\-\u0E00-\u0E7F]/g, '_');
    const defaultFilename = `ตารางสรุปรายวัน_${siteTitle || 'NK'}_${dailyReportCurrentYm || nowStr}`;

    // 1. Copy directly to clipboard for immediate paste (Ctrl+V) into Line / Telegram / Chat
    if (window.nkAPI && window.nkAPI.writeClipboardImage) {
      try {
        await window.nkAPI.writeClipboardImage(dataUrl);
      } catch (clipErr) {
        console.warn('Failed auto clipboard copy:', clipErr);
      }
    }

    // 2. Open Annotation Modal so user can review the full image, draw annotations, or click save
    if (typeof openCaptureAnnotationModal === 'function') {
      openCaptureAnnotationModal(dataUrl, defaultFilename);
    }

    showToast({
      type: 'success',
      badge: '📸 แคปตาราง',
      title: 'แคปตารางสรุปรายวันสำเร็จ!',
      detail: 'คัดลอกรูปลง Clipboard เรียบร้อยแล้ว (กด Ctrl+V เพื่อวางรูปได้ทันที) หรือกดบันทึกรูปภาพจากหน้าต่างพรีวิว',
      badgeColor: '#10b981'
    });
  } catch (err) {
    console.error('[DailyReport] Capture error:', err);
    showToast({
      type: 'error',
      badge: 'Capture',
      title: '❌ แคปภาพตารางไม่สำเร็จ',
      detail: err.message,
      badgeColor: '#ef4444'
    });
  } finally {
    if (btnCapture) {
      btnCapture.innerHTML = originalHtml || '<span>📸</span><span id="txtDailyCapture">แคปตาราง</span>';
      btnCapture.disabled = false;
    }
  }
}

let isDailyReportLoading = false;

async function loadDailyReportTable(forceSync = false) {
  if (isDailyReportLoading) return;
  const tbody = document.getElementById('dailyReportTbody');
  const tfoot = document.getElementById('dailyReportTfoot');
  const btnRefresh = document.getElementById('btnDailyRefresh');
  const titleEl = document.getElementById('thDailySiteTitle');
  const txtTitle = document.getElementById('txtDailyReportTitle');
  const txtSubtitle = document.getElementById('txtDailyReportSubtitle');

  if (!tbody) return;

  isDailyReportLoading = true;
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.innerHTML = '<span>⏳</span><span>กำลังโหลด...</span>';
  }

  try {
    const res = await window.nkAPI.getDailyReport({
      yearMonth: dailyReportCurrentYm,
      forceSync
    });

    if (!res || !res.ok) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align:center; padding:24px; color:var(--danger);">
            ⚠️ ไม่สามารถดึงข้อมูลตารางรายวันได้ (${res?.error || 'เซสชันหมดอายุหรือไม่พบข้อมูล'})
          </td>
        </tr>
      `;
      return;
    }

    if (titleEl && res.siteName) {
      titleEl.textContent = res.siteName.replace(/\s+/g, '').toUpperCase();
    }
    if (txtTitle && res.siteName) {
      txtTitle.textContent = `ตารางสรุปยอดรายวัน (${res.siteName})`;
    }
    if (txtSubtitle && res.yesterdayStr) {
      txtSubtitle.textContent = `ข้อมูลบันทึกจริงถึงเมื่อวาน (${res.yesterdayStr}) · ซิงค์อัตโนมัติทุกวันหลังเที่ยงคืน`;
    }

    // Render Rows
    tbody.innerHTML = res.rows.map(r => {
      const isYesterday = (r.dateStr === res.yesterdayStr && r.isCompleted);
      const isPending = !r.isCompleted;
      const rowCls = isYesterday ? 'row-yesterday' : isPending ? 'row-pending' : '';

      return `
        <tr class="${rowCls}">
          <td class="col-day">${r.day}</td>
          <td class="col-num">${formatDailyNum(r.register)}</td>
          <td class="col-num">${formatDailyNum(r.registerWithDeposit)}</td>
          <td class="col-num">${formatDailyNum(r.activeMembers)}</td>
          <td class="col-num">${formatDailyNum(r.commission)}</td>
          <td class="col-num">${formatDailyNum(r.manualDeposit)}</td>
          <td class="col-num">${formatDailyNum(r.manualWithdraw)}</td>
          <td class="col-num">${formatDailyNum(r.bonus)}</td>
          <td class="col-num">${formatDailyNum(r.referral)}</td>
          <td class="col-num">${formatDailyNum(r.cashback)}</td>
          <td class="col-num">${formatDailyNum(r.luckyWheel)}</td>
          <td class="col-num">${formatDailyNum(r.reward)}</td>
          <td class="col-num" style="font-weight:600;">${formatDailyNum(r.deposit)}</td>
          <td class="col-num" style="font-weight:600;">${formatDailyNum(r.withdraw)}</td>
          <td class="col-num" style="font-weight:600; color:${r.profitLoss >= 0 ? '#10b981' : '#ef4444'};">${formatDailyNum(r.profitLoss)}</td>
          <td class="col-num" style="font-weight:700; color:${r.profit >= 0 ? '#10b981' : '#ef4444'};">${formatDailyNum(r.profit)}</td>
        </tr>
      `;
    }).join('');

    // Render Footer Row (รวม)
    const t = res.total;
    if (tfoot) {
      tfoot.innerHTML = `
        <tr class="daily-table-sum-row">
          <td class="col-day">รวม</td>
          <td>${formatDailyNum(t.register)}</td>
          <td>${formatDailyNum(t.registerWithDeposit)}</td>
          <td>${formatDailyNum(t.activeMembers)}</td>
          <td>${formatDailyNum(t.commission)}</td>
          <td>${formatDailyNum(t.manualDeposit)}</td>
          <td>${formatDailyNum(t.manualWithdraw)}</td>
          <td>${formatDailyNum(t.bonus)}</td>
          <td>${formatDailyNum(t.referral)}</td>
          <td>${formatDailyNum(t.cashback)}</td>
          <td>${formatDailyNum(t.luckyWheel)}</td>
          <td>${formatDailyNum(t.reward)}</td>
          <td>${formatDailyNum(t.deposit)}</td>
          <td>${formatDailyNum(t.withdraw)}</td>
          <td style="color:${t.profitLoss >= 0 ? '#059669' : '#dc2626'};">${formatDailyNum(t.profitLoss)}</td>
          <td style="color:${t.profit >= 0 ? '#059669' : '#dc2626'};">${formatDailyNum(t.profit)}</td>
        </tr>
      `;
    }

    // Update Daily Text Summary box
    updateDailyTextSummary(res);

    if (forceSync) {
      showToast({
        type: 'success',
        badge: 'Daily Report',
        title: '🔄 ซิงค์ข้อมูลล่าสุดสำเร็จ',
        detail: `อัปเดตข้อมูลตารางรายวันเดือน ${res.yearMonth} เรียบร้อยแล้ว`,
        badgeColor: '#10b981'
      });
    }

  } catch (err) {
    console.error('Daily report render error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align:center; padding:24px; color:var(--danger);">
          ❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}
        </td>
      </tr>
    `;
  } finally {
    isDailyReportLoading = false;
    if (btnRefresh) {
      btnRefresh.innerHTML = '<span>🔄</span><span>ดึงข้อมูลล่าสุด</span>';
      btnRefresh.disabled = false;
    }
  }
}

// Initialize Daily Report Table on startup
initDailyReportTable();

// ==========================================
// 🚀 REMOTE CONTROL & LOCKOUT ENGINE LISTENER (v3.6.0)
// ==========================================
(function initRemoteControlClient() {
  const overlay = document.getElementById('remoteLockoutOverlay');
  const titleEl = document.getElementById('lockoutTitle');
  const msgEl = document.getElementById('lockoutMessage');
  const contactEl = document.getElementById('lockoutContact');

  const updateModal = document.getElementById('remoteForceUpdateModal');
  const updateCurrentVer = document.getElementById('updateCurrentVer');
  const updateLatestVer = document.getElementById('updateLatestVer');
  const updateReleaseNotes = document.getElementById('updateReleaseNotes');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
  const updateNoticeText = document.getElementById('updateNoticeText');

  const broadcastBanner = document.getElementById('remoteBroadcastBanner');
  const broadcastText = document.getElementById('broadcastText');
  const btnCloseBroadcast = document.getElementById('btnCloseBroadcast');

  const remoteControlPill = document.getElementById('remoteControlPill');
  const remoteControlPillText = document.getElementById('remoteControlPillText');

  const lblDeviceUuid = document.getElementById('lblDeviceUuid');
  const lblRemoteLatency = document.getElementById('lblRemoteLatency');
  const lblRemoteLastSync = document.getElementById('lblRemoteLastSync');
  const badgeRemoteControlStatus = document.getElementById('badgeRemoteControlStatus');
  const btnResetRemoteUrl = document.getElementById('btnResetRemoteUrl');

  let currentDownloadUrl = '';
  const DEFAULT_PRODUCTION_URL = 'https://web-production-eaa42d1.up.railway.app';
  let isKickingOut = false;
  let lastBroadcastMsg = '';

  function playAlertChime(type = 'alarm') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.55);
      } else if (type === 'chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch (e) {}
  }

  function updateTitlebarPill(isOnline) {
    if (!remoteControlPill || !remoteControlPillText) return;
    if (isOnline) {
      remoteControlPill.style.background = 'rgba(16, 185, 129, 0.12)';
      remoteControlPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      remoteControlPill.style.color = '#10b981';
      remoteControlPillText.textContent = 'ควบคุมออนไลน์';
    } else {
      remoteControlPill.style.background = 'rgba(245, 158, 11, 0.12)';
      remoteControlPill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      remoteControlPill.style.color = '#f59e0b';
      remoteControlPillText.textContent = 'ออฟไลน์ (กำลังลองใหม่)';
    }
  }

  function applyRemoteStatus(status) {
    if (!status) return;

    // Update Titlebar Pill & Settings Telemetry
    updateTitlebarPill(status.online !== false);
    if (status.deviceUuid && lblDeviceUuid) {
      lblDeviceUuid.textContent = status.deviceUuid;
    }
    if (status.latency != null && lblRemoteLatency) {
      lblRemoteLatency.textContent = `${status.latency} ms`;
    }
    if (lblRemoteLastSync) {
      lblRemoteLastSync.textContent = new Date().toLocaleTimeString('th-TH');
    }
    if (badgeRemoteControlStatus) {
      if (status.online !== false) {
        badgeRemoteControlStatus.className = 'badge-status success';
        badgeRemoteControlStatus.textContent = '🟢 ออนไลน์ (เชื่อมต่อแล้ว)';
      } else {
        badgeRemoteControlStatus.className = 'badge-status warning';
        badgeRemoteControlStatus.textContent = '🟡 ออฟไลน์ (รอเชื่อมต่อ)';
      }
    }

    // 1. Lockout Check (Instant Kill Switch & Session Ejection)
    if (status.locked) {
      if (titleEl) titleEl.textContent = status.maintenance?.title || '🛑 ระบบถูกสั่งปิดโดยผู้ดูแลระบบ';
      if (msgEl) msgEl.textContent = status.maintenance?.message || 'ขณะนี้ระบบ NK Helper อยู่ระหว่างการปิดควบคุมเพื่อความปลอดภัย กรุณาติดต่อผู้ดูแลระบบ';
      if (contactEl) contactEl.textContent = `ติดต่อ: ${status.maintenance?.contact || 'ผู้ดูแลระบบ'}`;
      if (overlay) overlay.style.display = 'flex';

      // Play audio alarm chime
      playAlertChime('alarm');

      // Stop automated background tasks locally
      try {
        if (window.nkAPI?.stopWithdraw) {
          window.nkAPI.stopWithdraw();
        }
      } catch (e) {}

      // Instant Kick: Force logout user from active session immediately
      if (!isKickingOut) {
        isKickingOut = true;
        showToast({
          type: 'error',
          badge: '🛑 ศูนย์ควบคุม',
          badgeColor: '#ef4444',
          title: 'ระบบถูกสั่งปิดการทำงานฉุกเฉิน',
          detail: status.maintenance?.message || 'กำลังเด้งออกจากระบบทันทีตามคำสั่งศูนย์ควบคุม'
        });

        setTimeout(async () => {
          try {
            if (window.nkAPI?.logout) {
              await window.nkAPI.logout();
            }
          } catch (err) {
            console.error('Kick logout error:', err);
          }
        }, 800);
      }
      return;
    } else {
      isKickingOut = false;
      if (overlay) overlay.style.display = 'none';
    }

    // 2. Force Update Check (Hard Block & Soft Prompt)
    if ((status.forceUpdate || status.belowMinimum) && status.hasNewerVersion) {
      currentDownloadUrl = status.downloadUrl || '';
      if (updateCurrentVer) updateCurrentVer.textContent = `v${status.currentVersion}`;
      if (updateLatestVer) updateLatestVer.textContent = `v${status.latestVersion}`;
      if (updateReleaseNotes) updateReleaseNotes.textContent = status.releaseNotes || 'ปรับปรุงประสิทธิภาพและระบบความปลอดภัย';
      if (updateModal) updateModal.style.display = 'flex';
      if (updateNoticeText) {
        updateNoticeText.style.display = 'block';
        updateNoticeText.textContent = status.belowMinimum
          ? '🚨 บังคับอัปเดตเด็ดขาด: เวอร์ชันปัจจุบันต่ำกว่าขั้นต่ำที่รองรับ'
          : '⚠️ มีการบังคับให้อัปเดตเวอร์ชันนี้ก่อนใช้งานต่อ';
      }
    } else {
      if (updateModal && !updateModal.dataset.manualOpen) {
        updateModal.style.display = 'none';
      }
    }

    // 3. Broadcast Announcement (Instant Real-time push)
    if (status.broadcast && status.broadcast.enabled && status.broadcast.message) {
      const msg = status.broadcast.message.trim();
      if (msg && msg !== lastBroadcastMsg) {
        lastBroadcastMsg = msg;
        playAlertChime('chime');
        showToast({
          type: 'info',
          badge: '📢 ประกาศด่วน',
          badgeColor: '#3b82f6',
          title: 'ข้อความจากศูนย์ควบคุม',
          detail: msg
        });
      }

      if (broadcastText) broadcastText.textContent = msg;
      if (broadcastBanner) {
        broadcastBanner.style.display = 'flex';
        if (status.broadcast.type === 'danger') {
          broadcastBanner.style.background = '#ef4444';
        } else if (status.broadcast.type === 'warning') {
          broadcastBanner.style.background = '#f59e0b';
        } else if (status.broadcast.type === 'success') {
          broadcastBanner.style.background = '#10b981';
        } else {
          broadcastBanner.style.background = '#3b82f6';
        }
      }
    } else {
      lastBroadcastMsg = '';
      if (broadcastBanner) broadcastBanner.style.display = 'none';
    }
  }

  // Download Update Button
  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', async () => {
      if (currentDownloadUrl && window.nkAPI?.downloadAppUpdate) {
        btnDownloadUpdate.disabled = true;
        btnDownloadUpdate.innerHTML = '<span>⏳</span> <span>กำลังดาวน์โหลด...</span>';
        
        const container = document.getElementById('updateProgressContainer');
        const fill = document.getElementById('updateProgressFill');
        const pct = document.getElementById('updateProgressPercent');
        
        if (container) container.style.display = 'block';

        if (window.nkAPI.onUpdateDownloadProgress) {
          window.nkAPI.onUpdateDownloadProgress(({ downloaded, total }) => {
            if (total > 0 && fill && pct) {
              const p = Math.floor((downloaded / total) * 100);
              fill.style.width = p + '%';
              pct.textContent = p + '%';
            }
          });
        }

        try {
          await window.nkAPI.downloadAppUpdate(currentDownloadUrl);
          btnDownloadUpdate.innerHTML = '<span>✅</span> <span>กำลังเปิดตัวติดตั้ง...</span>';
        } catch(err) {
          btnDownloadUpdate.disabled = false;
          btnDownloadUpdate.innerHTML = '<span>❌</span> <span>ดาวน์โหลดล้มเหลว (ลองใหม่)</span>';
          await window.showAlertDialog({ title: 'เกิดข้อผิดพลาดในการดาวน์โหลด', message: String(err), type: 'danger' });
        }
      } else if (currentDownloadUrl && window.nkAPI?.openExternalUrl) {
        window.nkAPI.openExternalUrl(currentDownloadUrl);
      }
    });
  }

  // Close Broadcast Banner
  if (btnCloseBroadcast) {
    btnCloseBroadcast.addEventListener('click', () => {
      if (broadcastBanner) broadcastBanner.style.display = 'none';
    });
  }

  // Check App Update Button (Manual Click)
  document.getElementById('btnCheckAppUpdate')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnCheckAppUpdate');
    btn.disabled = true;
    btn.textContent = '🔄 กำลังตรวจหา...';

    try {
      const res = await window.nkAPI.checkAppUpdate();
      if (res && res.hasUpdate) {
        currentDownloadUrl = res.downloadUrl || '';
        if (updateCurrentVer) updateCurrentVer.textContent = `v${res.currentVersion}`;
        if (updateLatestVer) updateLatestVer.textContent = `v${res.latestVersion}`;
        if (updateReleaseNotes) updateReleaseNotes.textContent = res.releaseNotes || 'ปรับปรุงประสิทธิภาพ';
        if (updateNoticeText) updateNoticeText.style.display = res.forceUpdate ? 'block' : 'none';
        if (updateModal) {
          updateModal.dataset.manualOpen = 'true';
          updateModal.style.display = 'flex';
        }
      } else {
        showToast({
          type: 'info',
          badge: '✓ อัปเดต',
          badgeColor: '#10b981',
          title: 'คุณกำลังใช้เวอร์ชันล่าสุดแล้ว',
          detail: `NK Helper Desktop ปัจจุบันเป็นเวอร์ชัน v${res?.currentVersion || '3.6.0'}`
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        badge: '✕ ผิดพลาด',
        badgeColor: '#ef4444',
        title: 'ตรวจหาอัปเดตไม่สำเร็จ',
        detail: err.message
      });
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 ตรวจหาอัปเดต';
    }
  });

  // Test Remote Control URL Button
  document.getElementById('btnTestRemoteControl')?.addEventListener('click', async () => {
    const urlInput = document.getElementById('setRemoteControlUrl');
    const resultDiv = document.getElementById('remoteControlTestResult');
    const badge = document.getElementById('badgeRemoteControlStatus');
    const btn = document.getElementById('btnTestRemoteControl');

    const url = urlInput?.value?.trim() || DEFAULT_PRODUCTION_URL;
    btn.disabled = true;
    btn.textContent = '⏳ กำลังทดสอบ...';
    resultDiv.style.display = 'block';
    resultDiv.style.color = 'var(--text-muted)';
    resultDiv.textContent = 'กำลังเชื่อมต่อไปยังเซิร์ฟเวอร์ควบคุม...';

    // Save setting
    await window.nkAPI.saveSettings({ remoteControlUrl: url });

    try {
      const startTime = Date.now();
      const res = await window.nkAPI.checkRemoteControlNow();
      const latency = Date.now() - startTime;

      if (res && res.ok) {
        resultDiv.style.color = '#10b981';
        resultDiv.textContent = `✅ เชื่อมต่อศูนย์ควบคุมสำเร็จ (${latency}ms) — สถานะระบบ: ${res.status?.locked ? '🛑 ปิดปรับปรุง' : '🟢 เปิดใช้งานปกติ'} (เวอร์ชันล่าสุด: v${res.status?.latestVersion})`;
        applyRemoteStatus({ ...res.status, latency, online: true });
      } else {
        resultDiv.style.color = '#ef4444';
        resultDiv.textContent = `❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ${res.error || 'Connection Failed'}`;
        applyRemoteStatus({ online: false, latency: null });
      }
    } catch (e) {
      resultDiv.style.color = '#ef4444';
      resultDiv.textContent = `❌ เกิดข้อผิดพลาด: ${e.message}`;
      applyRemoteStatus({ online: false, latency: null });
    } finally {
      btn.disabled = false;
      btn.textContent = '📡 ตรวจสอบการเชื่อมต่อ';
    }
  });

  // Reset to Default Production Server URL Button
  if (btnResetRemoteUrl) {
    btnResetRemoteUrl.addEventListener('click', async () => {
      const urlInput = document.getElementById('setRemoteControlUrl');
      if (urlInput) {
        urlInput.value = DEFAULT_PRODUCTION_URL;
      }
      await window.nkAPI.saveSettings({ remoteControlUrl: DEFAULT_PRODUCTION_URL });
      showToast({
        type: 'success',
        badge: '✓ คืนค่าสำเร็จ',
        badgeColor: '#10b981',
        title: 'คืนค่าเซิร์ฟเวอร์หลักเรียบร้อย',
        detail: 'ตั้งค่าเป็น Railway Production Server อัตโนมัติ'
      });
      // Trigger instant check
      document.getElementById('btnTestRemoteControl')?.click();
    });
  }

  // Initial Telemetry Load
  if (window.nkAPI?.getRemoteTelemetry) {
    window.nkAPI.getRemoteTelemetry().then((t) => {
      if (t) {
        if (lblDeviceUuid && t.deviceUuid) lblDeviceUuid.textContent = t.deviceUuid;
        if (lblRemoteLatency && t.latency) lblRemoteLatency.textContent = `${t.latency} ms`;
        updateTitlebarPill(t.isOnline);
      }
    }).catch(() => {});
  }

  // Listen for real-time status updates from main process
  if (window.nkAPI?.onRemoteControlStatus) {
    window.nkAPI.onRemoteControlStatus((status) => {
      applyRemoteStatus(status);
    });
  }

  // Initial check on launch
  if (window.nkAPI?.checkRemoteControlNow) {
    window.nkAPI.checkRemoteControlNow().then((res) => {
      if (res && res.ok && res.status) {
        applyRemoteStatus(res.status);
      }
    }).catch(() => {});
  }

  try {
    if (typeof initCohortMonths === 'function') initCohortMonths();
  } catch (e) {}
})();


let appForms = [];
try {
  const cached = localStorage.getItem('nk_app_forms_cache');
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed) && parsed.length > 0) appForms = parsed;
  }
} catch (e) {}

let selectedFormId = null;
let quickPasteActiveCategory = 'default';

// State per form to ensure user inputs NEVER disappear while typing
let formInputsState = {};
try {
  const cachedInputs = localStorage.getItem('nk_form_inputs_state_v2');
  if (cachedInputs) {
    const parsed = JSON.parse(cachedInputs);
    if (parsed && typeof parsed === 'object') formInputsState = parsed;
  }
} catch (e) {}

function saveFormInputsState() {
  try {
    localStorage.setItem('nk_form_inputs_state_v2', JSON.stringify(formInputsState));
  } catch (e) {}
}

function getFormState(formId) {
  if (!formInputsState[formId]) {
    formInputsState[formId] = { fields: {}, items: {} };
  }
  if (!formInputsState[formId].fields) formInputsState[formId].fields = {};
  if (!formInputsState[formId].items) formInputsState[formId].items = {};
  return formInputsState[formId];
}

async function getFormsApiServerUrl() {
  try {
    const s = await window.nkAPI?.getSettings?.();
    if (s?.remoteControlUrl && typeof s.remoteControlUrl === 'string' && s.remoteControlUrl.trim()) {
      return s.remoteControlUrl.trim().replace(/\/+$/, '');
    }
  } catch (e) {}
  return 'https://web-production-eaa42d1.up.railway.app';
}

function getItemsFormattedText(items) {
  if (!items || items.length === 0) return '';
  const validRows = items.filter(it => (it.name && it.name.trim()) || (it.amount !== '' && it.amount != null));
  if (validRows.length === 0) return '';
  return validRows.map((it, idx) => {
    const rawAmt = String(it.amount || '').replace(/,/g, '').trim();
    const num = parseFloat(rawAmt);
    const numStr = !isNaN(num) ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const numPart = numStr ? `${numStr} บาท` : '';
    const namePart = (it.name || '').trim();
    if (namePart && numPart) {
      return `${idx + 1}. ${namePart} : ${numPart}`;
    } else if (numPart) {
      return `${idx + 1}. ${numPart}`;
    } else {
      return `${idx + 1}. ${namePart}`;
    }
  }).join('\n');
}

function getItemsTotalSum(items) {
  if (!items || items.length === 0) return 0;
  let sum = 0;
  items.forEach(it => {
    const rawAmt = String(it.amount || '').replace(/,/g, '').trim();
    const num = parseFloat(rawAmt);
    if (!isNaN(num)) sum += num;
  });
  return sum;
}

function getFormItemCategories(form) {
  const template = form.template || '';
  const categories = [];
  // Match <รายการ...>, [รายการ...], <items...>, [items...]
  const regex = /<รายการ(?::|_|\s+)?([^>]*?)>|\[รายการ(?::|_|\s+)?([^\]]*?)\]|<items(?::|_|\s+)?([^>]*?)>|\[items(?::|_|\s+)?([^\]]*?)\]/gi;
  let m;
  while ((m = regex.exec(template)) !== null) {
    const raw = (m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]))) || '';
    const cat = raw.trim() || 'default';
    if (!categories.includes(cat)) {
      categories.push(cat);
    }
  }

  // Also check form.fields
  (form.fields || []).forEach(f => {
    if (f.type === 'items' || f.name === 'รายการ' || f.name.toLowerCase() === 'items' || f.name.startsWith('รายการ:') || f.name.startsWith('รายการ_')) {
      const cat = f.name.includes(':') ? f.name.split(':')[1].trim() : (f.name.includes('_') ? f.name.split('_')[1].trim() : 'default');
      if (!categories.includes(cat)) categories.push(cat);
    }
  });

  return categories;
}

function getNumericValueOfVar(key, variables) {
  if (variables[key] !== undefined) {
    const raw = String(variables[key]).replace(/,/g, '').trim();
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function evaluateFormula(expr, variables = {}) {
  try {
    let rawExpr = (expr || '').trim();
    if (!rawExpr) return '';

    // Check if the expression references variables, and whether ANY of them have been entered
    const bracketMatches = [...rawExpr.matchAll(/\[([^\[\]]+)\]|<([^<>]+)>/g)].map(m => (m[1] || m[2]).trim());
    let hasReferencedVars = bracketMatches.length > 0;
    let hasNonEmptyVar = false;

    for (const vName of bracketMatches) {
      const val = variables[vName];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasNonEmptyVar = true;
        break;
      }
    }

    if (!hasReferencedVars) {
      for (const k of Object.keys(variables)) {
        if (k && rawExpr.includes(k)) {
          hasReferencedVars = true;
          const val = variables[k];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            hasNonEmptyVar = true;
            break;
          }
        }
      }
    }

    // If formula depends on user variables but all of them are completely empty/unfilled, return blank
    if (hasReferencedVars && !hasNonEmptyVar) {
      return '';
    }

    let formula = rawExpr.replace(/,/g, '');

    // Replace % with /100 e.g. 2.9% -> (2.9/100)
    formula = formula.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    
    // Replace variable placeholders [varName] or <varName>
    formula = formula.replace(/\[([^\[\]]+)\]/g, (m, varName) => {
      const v = getNumericValueOfVar(varName.trim(), variables);
      return v !== null && !isNaN(v) ? v : 0;
    });
    formula = formula.replace(/<([^<>]+)>/g, (m, varName) => {
      const v = getNumericValueOfVar(varName.trim(), variables);
      return v !== null && !isNaN(v) ? v : 0;
    });

    // Replace bare variable names that match keys in variables (longest names first)
    const sortedVarKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
    sortedVarKeys.forEach(k => {
      if (!k) return;
      const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp('\\b' + escapedK + '\\b|' + escapedK, 'g');
      const numVal = getNumericValueOfVar(k, variables);
      if (numVal !== null && !isNaN(numVal)) {
        formula = formula.replace(reg, numVal);
      }
    });

    // Replace common Thai math terms if user typed them
    formula = formula
      .replace(/\bคูณ\b|[xX]/g, '*')
      .replace(/\bหาร\b/g, '/')
      .replace(/\bบวก\b/g, '+')
      .replace(/\bลบ\b/g, '-');

    // Strip any remaining commas after variable insertions or substitutions
    formula = formula.replace(/,/g, '').trim();

    // Security check: Only allow numbers, math operators +, -, *, /, (, ), ., whitespace
    if (!/^[0-9+\-*/().\s]+$/.test(formula)) {
      return '';
    }

    // Safely evaluate formula using Function
    const result = Function(`'use strict'; return (${formula});`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '';
  } catch (err) {
    return '';
  }
}

function parsePastedItemsText(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  lines.forEach(line => {
    const numMatch = line.match(/(.*?)(?:[:=\-]?\s*)([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:บาท|baht)?$/i);
    if (numMatch) {
      let desc = (numMatch[1] || '').trim().replace(/^[\d+.\-*\s)]+/, '').trim();
      const amt = numMatch[2].replace(/,/g, '');
      results.push({ name: desc, amount: amt });
    } else {
      results.push({ name: line, amount: '' });
    }
  });
  return results;
}

async function fetchForms(showToastNotification = false) {
  const syncLabel = document.getElementById('lblFormsSyncStatus');
  const refreshBtns = [document.getElementById('btnRefreshForms'), document.getElementById('btnQuickRefreshForms')].filter(Boolean);
  refreshBtns.forEach(b => {
    b.classList.add('loading');
    const sp = b.querySelector('.refresh-spinner');
    if (sp) sp.style.animation = 'spin 0.8s linear infinite';
  });

  if (syncLabel) {
    syncLabel.innerHTML = '<span style="color:#38bdf8;">⏳</span> ซิงค์...';
  }

  try {
    const serverUrl = await getFormsApiServerUrl();
    const res = await fetch(`${serverUrl}/api/app-forms?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.forms)) {
      appForms = data.forms;
      try { localStorage.setItem('nk_app_forms_cache', JSON.stringify(appForms)); } catch (e) {}
      renderFormList(document.getElementById('inputSearchForms')?.value || '');

      // CRITICAL FIX: NEVER wipe active user inputs if selectedFormId exists!
      if (!selectedFormId && appForms.length > 0) {
        selectedFormId = appForms[0].id;
        renderFormList(document.getElementById('inputSearchForms')?.value || '');
        renderFormGenerator(selectedFormId);
      } else if (selectedFormId) {
        const currentForm = appForms.find(f => f.id === selectedFormId);
        if (currentForm) {
          const isUserTyping = document.activeElement && document.getElementById('formDynamicInputs')?.contains(document.activeElement);
          if (!isUserTyping) {
            renderFormGenerator(selectedFormId);
          } else {
            generateFormText(currentForm);
          }
        }
      }

      if (syncLabel) {
        const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        syncLabel.innerHTML = `<span style="color:#10b981;">●</span> ออนไลน์ · ${timeStr}`;
      }

      if (showToastNotification) {
        showToast({ title: 'ซิงค์แบบฟอร์มสำเร็จ', message: `ดึงแบบฟอร์มล่าสุดเรียบร้อย (${appForms.length} แบบฟอร์ม)`, type: 'success' });
      }
    }
  } catch (err) {
    console.error('Failed to fetch forms:', err);
    if (syncLabel) {
      syncLabel.innerHTML = '<span style="color:#ef4444;">⚠️</span> ซิงค์ไม่สำเร็จ (ใช้แคช)';
    }
    if (showToastNotification) {
      showToast({ title: 'ข้อผิดพลาด', message: 'ไม่สามารถติดต่อเซิร์ฟเวอร์แบบฟอร์มได้', type: 'error' });
    }
  } finally {
    refreshBtns.forEach(b => {
      b.classList.remove('loading');
      const sp = b.querySelector('.refresh-spinner');
      if (sp) sp.style.animation = '';
    });
  }
}

function renderFormList(filterQuery = '') {
  const container = document.getElementById('formTemplateList');
  if (!container) return;
  container.innerHTML = '';

  const badge = document.getElementById('lblFormCountBadge');
  if (badge) badge.textContent = appForms.length;

  const q = (filterQuery || '').toLowerCase().trim();
  const filtered = appForms.filter(form => {
    if (!q) return true;
    return (form.name && form.name.toLowerCase().includes(q)) ||
           (form.template && form.template.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:16px 0;">${q ? 'ไม่พบแบบฟอร์มที่ค้นหา' : 'ไม่มีแบบฟอร์มในระบบ'}</div>`;
    return;
  }

  filtered.forEach(form => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (form.id === selectedFormId ? 'btn-accent' : 'btn-secondary');
    btn.style.cssText = 'justify-content: flex-start; text-align: left; padding: 9px 12px; font-size: 13px; line-height: 1.4; border-radius: 8px; transition: all 0.15s; white-space: normal; word-break: break-word;';
    btn.innerHTML = `<span style="margin-right: 6px;">📄</span> <span>${escapeHtml(form.name || 'ไม่มีชื่อ')}</span>`;
    btn.onclick = () => {
      selectedFormId = form.id;
      renderFormList(document.getElementById('inputSearchForms')?.value || '');
      renderFormGenerator(form.id);
    };
    container.appendChild(btn);
  });
}

function renderFormGenerator(formId, forceReset = false) {
  const form = appForms.find(f => f.id === formId);
  const emptyState = document.getElementById('formEmptyState');
  const generatorArea = document.getElementById('formGeneratorArea');
  
  if (!form) {
    if (emptyState) emptyState.style.display = 'flex';
    if (generatorArea) generatorArea.style.display = 'none';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  if (generatorArea) generatorArea.style.display = 'flex';

  const title = document.getElementById('formGeneratorTitle');
  if (title) title.textContent = form.name;

  const previewTag = document.getElementById('lblPreviewFormTag');
  if (previewTag) previewTag.textContent = form.name;

  if (forceReset) {
    delete formInputsState[formId];
    saveFormInputsState();
  }

  const state = getFormState(formId);

  const inputsContainer = document.getElementById('formDynamicInputs');
  if (!inputsContainer) return;
  inputsContainer.innerHTML = '';

  // 1. Identify all item categories from template and fields
  const categories = getFormItemCategories(form);

  // Render Smart Item Cards for each category
  categories.forEach(cat => {
    if (!state.items[cat] || !Array.isArray(state.items[cat]) || state.items[cat].length === 0) {
      state.items[cat] = [{ name: '', amount: '' }];
    }

    const catKey = cat;
    const catLabel = catKey === 'default' ? 'ตารางรายการ' : `ตารางรายการ : ${catKey}`;
    const catTag = catKey === 'default' ? '<รายการ>' : `<รายการ:${catKey}>`;
    const catSumTag = catKey === 'default' ? '<รวมยอด>' : `<รวม:${catKey}>`;

    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.gridColumn = '1 / -1';

    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: 13.5px; color: var(--accent);">📋 ${escapeHtml(catLabel)}</span>
          <span style="font-size: 11px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 7px; border-radius: 12px;" title="แท็กในเทมเพลต">${escapeHtml(catTag)}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn btn-secondary btn-sm btn-quick-paste" style="font-size: 11.5px; height: 26px; padding: 0 9px;" title="วางข้อความหลายบรรทัดเพื่อแยกรายการและตัวเลขอัตโนมัติ">
            ⚡ วางหลายยอดออโต้
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-add-item-row" style="font-size: 11.5px; height: 26px; padding: 0 9px; color: var(--accent);">
            ➕ เพิ่มแถว
          </button>
        </div>
      </div>
      <div class="smart-items-rows-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-subtle); padding-top: 8px; font-size: 12.5px;">
        <span class="smart-items-count-label" style="color: var(--text-muted);">จำนวน 0 รายการ</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--text-muted); font-size: 12px;">รวมเฉพาะหมวดนี้ (${escapeHtml(catSumTag)}):</span>
          <span class="smart-items-sum-display" style="font-weight: 700; color: #10b981; font-size: 15px;">0.00 บาท</span>
        </div>
      </div>
    `;

    function renderRows() {
      const rowsContainer = card.querySelector('.smart-items-rows-container');
      if (!rowsContainer) return;
      rowsContainer.innerHTML = '';

      if (!state.items[catKey] || state.items[catKey].length === 0) {
        state.items[catKey] = [{ name: '', amount: '' }];
      }

      state.items[catKey].forEach((it, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        row.innerHTML = `
          <span style="width: 22px; font-size: 12px; color: var(--text-muted); text-align: center; font-weight: bold;">${idx + 1}.</span>
          <input type="text" class="input-field _itName" placeholder="ชื่อรายการ (เว้นว่างได้)" style="flex: 2; height: 32px; font-size: 12.5px;" value="${escapeHtml(it.name || '')}">
          <div style="flex: 1.2; position: relative; display: flex; align-items: center;">
            <input type="number" step="any" class="input-field _itAmt" placeholder="0.00" style="width: 100%; height: 32px; font-size: 12.5px; padding-right: 32px; text-align: right;" value="${it.amount || ''}">
            <span style="position: absolute; right: 8px; font-size: 11px; color: var(--text-muted); pointer-events: none;">บาท</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm _itDel" style="height: 32px; padding: 0 9px; color: #ef4444;" title="ลบรายการนี้">✕</button>
        `;

        const nameIn = row.querySelector('._itName');
        const amtIn = row.querySelector('._itAmt');
        const delBtn = row.querySelector('._itDel');

        nameIn.addEventListener('input', (e) => {
          it.name = e.target.value;
          saveFormInputsState();
          updateTotalAndSync();
        });

        amtIn.addEventListener('input', (e) => {
          it.amount = e.target.value;
          saveFormInputsState();
          updateTotalAndSync();
        });

        delBtn.addEventListener('click', () => {
          if (state.items[catKey].length > 1) {
            state.items[catKey].splice(idx, 1);
          } else {
            state.items[catKey][0] = { name: '', amount: '' };
          }
          saveFormInputsState();
          renderRows();
        });

        rowsContainer.appendChild(row);
      });

      updateTotalAndSync();
    }

    function updateTotalAndSync() {
      const sum = getItemsTotalSum(state.items[catKey]);
      const formatted = sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sumEl = card.querySelector('.smart-items-sum-display');
      if (sumEl) sumEl.textContent = `${formatted} บาท`;

      const validRows = (state.items[catKey] || []).filter(x => (x.name && x.name.trim()) || (x.amount !== '' && x.amount != null));
      const countEl = card.querySelector('.smart-items-count-label');
      if (countEl) countEl.textContent = `จำนวน ${validRows.length} รายการ`;

      generateFormText(form);
    }

    card.querySelector('.btn-add-item-row')?.addEventListener('click', () => {
      state.items[catKey].push({ name: '', amount: '' });
      saveFormInputsState();
      renderRows();
    });

    card.querySelector('.btn-quick-paste')?.addEventListener('click', () => {
      quickPasteActiveCategory = catKey;
      const txtIn = document.getElementById('txtQuickPasteInput');
      if (txtIn) txtIn.value = '';
      window.openModal('modalQuickPasteItems');
    });

    renderRows();
    group.appendChild(card);
    inputsContainer.appendChild(group);
  });

  // 2. Render standard variable inputs (Text, Money, Date, Month, Time, Select, Textarea)
  const savedOrder = form.fieldOrder || state.fieldOrder;
  let sortedFields = [...(form.fields || [])];
  if (Array.isArray(savedOrder) && savedOrder.length > 0) {
    sortedFields.sort((a, b) => {
      const idxA = savedOrder.indexOf(a.name);
      const idxB = savedOrder.indexOf(b.name);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }

  sortedFields.forEach(f => {
    const isItemsField = (f.type === 'items' || f.name.startsWith('รายการ') || f.name.toLowerCase() === 'items');
    if (isItemsField) return; // Handled above

    // Don't render formula calculation or sum tags as user input fields
    if (f.name.startsWith('คำนวณ:') || f.name.startsWith('สูตร:') || f.name.startsWith('calc:')) return;
    if (categories.length > 0 && (f.name === 'รวม' || f.name === 'รวมยอด' || f.name === 'ยอดรวม' || f.name.startsWith('รวม:') || f.name.startsWith('รวม_'))) {
      return;
    }

    const group = document.createElement('div');
    group.className = 'form-group draggable-field-group';
    group.dataset.fieldName = f.name;
    group.setAttribute('draggable', 'true');
    if (f.type === 'textarea') {
      group.style.gridColumn = '1 / -1';
    }

    let input;
    let restoredVal = state.fields[f.name] !== undefined ? state.fields[f.name] : (f.defaultValue || '');

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;';
    headerRow.innerHTML = `
      <label style="margin:0; display:inline-flex; align-items:center; gap:6px; cursor:grab;" title="คลิกค้างแล้วลากเพื่อสลับตำแหน่งช่องกรอก">
        <span class="drag-handle" title="คลิกค้างแล้วลากเพื่อสลับตำแหน่งช่อง">⠿</span>
        <span>${escapeHtml(f.label || f.name)}</span>
      </label>
      <span style="font-size:11px; color:var(--text-dim); opacity:0.5; cursor:grab;" title="ลากเพื่อสลับที่">⋮⋮</span>
    `;
    group.appendChild(headerRow);

    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'input-field';
      input.style.resize = 'vertical';
      input.style.minHeight = '70px';
      input.value = restoredVal;
    } else if (f.type === 'select') {
      input = document.createElement('select');
      input.className = 'select-field';
      (f.defaultValue || '').split(',').forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.trim();
        o.textContent = opt.trim();
        input.appendChild(o);
      });
      if (restoredVal) input.value = restoredVal;
    } else if (f.type === 'month') {
      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex; gap:4px;';
      btnGroup.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm btn-month-this" style="font-size:10.5px; height:20px; padding:0 6px;" title="เลือกเดือนปัจจุบัน">เดือนนี้</button>
        <button type="button" class="btn btn-secondary btn-sm btn-month-prev" style="font-size:10.5px; height:20px; padding:0 6px;" title="เลือกเดือนก่อนหน้า">เดือนก่อน</button>
      `;
      headerRow.appendChild(btnGroup);

      input = document.createElement('select');
      input.className = 'select-field';
      const defaultMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      let monthOptions = defaultMonths;
      if (f.defaultValue && f.defaultValue.includes(',')) {
        monthOptions = f.defaultValue.split(',').map(s => s.trim()).filter(Boolean);
      }
      monthOptions.forEach(mName => {
        const o = document.createElement('option');
        o.value = mName;
        o.textContent = mName;
        input.appendChild(o);
      });

      const currentMonthName = defaultMonths[new Date().getMonth()];
      const targetVal = restoredVal && monthOptions.includes(restoredVal)
        ? restoredVal
        : (monthOptions.includes(currentMonthName) ? currentMonthName : monthOptions[0] || '');
      input.value = targetVal;

      btnGroup.querySelector('.btn-month-this')?.addEventListener('click', () => {
        input.value = defaultMonths[new Date().getMonth()];
        input.dispatchEvent(new Event('change'));
      });

      btnGroup.querySelector('.btn-month-prev')?.addEventListener('click', () => {
        const prevIdx = (new Date().getMonth() - 1 + 12) % 12;
        input.value = defaultMonths[prevIdx];
        input.dispatchEvent(new Event('change'));
      });
    } else {
      input = document.createElement('input');
      input.className = 'input-field';
      input.type = f.type || 'text';
      if (f.type === 'datetime') {
        input.type = 'datetime-local';
        const btnNow = document.createElement('button');
        btnNow.type = 'button';
        btnNow.className = 'btn btn-secondary btn-sm';
        btnNow.style.cssText = 'font-size:10.5px; height:20px; padding:0 6px;';
        btnNow.textContent = '⏰ ตอนนี้';
        btnNow.title = 'ใส่วันที่และเวลาปัจจุบัน';
        btnNow.onclick = () => {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const hh = String(now.getHours()).padStart(2, '0');
          const mi = String(now.getMinutes()).padStart(2, '0');
          input.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
          input.dispatchEvent(new Event('input'));
        };
        headerRow.appendChild(btnNow);

        if (!restoredVal) {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const hh = String(now.getHours()).padStart(2, '0');
          const mi = String(now.getMinutes()).padStart(2, '0');
          restoredVal = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
          state.fields[f.name] = restoredVal;
        }
      } else if (f.type === 'date') {
        input.type = 'date';
        const btnToday = document.createElement('button');
        btnToday.type = 'button';
        btnToday.className = 'btn btn-secondary btn-sm';
        btnToday.style.cssText = 'font-size:10.5px; height:20px; padding:0 6px;';
        btnToday.textContent = '📅 วันนี้';
        btnToday.title = 'ใส่วันที่วันนี้';
        btnToday.onclick = () => {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          input.value = `${yyyy}-${mm}-${dd}`;
          input.dispatchEvent(new Event('input'));
        };
        headerRow.appendChild(btnToday);

        if (!restoredVal) {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          restoredVal = `${yyyy}-${mm}-${dd}`;
          state.fields[f.name] = restoredVal;
        }
      } else if (f.type === 'time') {
        input.type = 'time';
        const btnNow = document.createElement('button');
        btnNow.type = 'button';
        btnNow.className = 'btn btn-secondary btn-sm';
        btnNow.style.cssText = 'font-size:10.5px; height:20px; padding:0 6px;';
        btnNow.textContent = '⏰ ตอนนี้';
        btnNow.title = 'ใส่เวลาปัจจุบัน';
        btnNow.onclick = () => {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mi = String(now.getMinutes()).padStart(2, '0');
          input.value = `${hh}:${mi}`;
          input.dispatchEvent(new Event('input'));
        };
        headerRow.appendChild(btnNow);

        if (!restoredVal) {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mi = String(now.getMinutes()).padStart(2, '0');
          restoredVal = `${hh}:${mi}`;
          state.fields[f.name] = restoredVal;
        }
      } else if (f.type === 'money') {
        input.type = 'number';
      }
      input.value = restoredVal;
    }

    input.id = 'form_input_' + f.name;

    const handleInput = () => {
      state.fields[f.name] = input.value;
      saveFormInputsState();
      generateFormText(form);
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('change', handleInput);

    // Prevent text drag inside input from triggering parent drag
    input.addEventListener('mousedown', (e) => e.stopPropagation());

    group.appendChild(input);

    // Drag-and-drop event handlers on group
    group.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', f.name);
      e.dataTransfer.effectAllowed = 'move';
      group.classList.add('is-dragging');
    });

    group.addEventListener('dragend', () => {
      group.classList.remove('is-dragging');
    });

    group.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const draggingEl = inputsContainer.querySelector('.is-dragging');
      if (draggingEl && draggingEl !== group) {
        const rect = group.getBoundingClientRect();
        const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        inputsContainer.insertBefore(draggingEl, next && group.nextSibling || group);
      }
    });

    group.addEventListener('drop', (e) => {
      e.preventDefault();
      const currentGroups = Array.from(inputsContainer.querySelectorAll('.draggable-field-group'));
      const newOrder = currentGroups.map(el => el.dataset.fieldName).filter(Boolean);
      
      state.fieldOrder = newOrder;
      form.fieldOrder = newOrder;
      
      if (Array.isArray(form.fields)) {
        form.fields.sort((a, b) => {
          const idxA = newOrder.indexOf(a.name);
          const idxB = newOrder.indexOf(b.name);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }

      saveFormInputsState();

      try {
        const fIdx = appForms.findIndex(x => x.id === form.id);
        if (fIdx !== -1) {
          appForms[fIdx].fieldOrder = newOrder;
          appForms[fIdx].fields = form.fields;
          localStorage.setItem('nk_app_forms_cache', JSON.stringify(appForms));
        }
      } catch (err) {}

      saveFormsOnline({ action: 'upsert', form: form }).catch(() => {});
    });

    inputsContainer.appendChild(group);
  });

  generateFormText(form);
}

function generateFormText(form) {
  let text = form.template || '';
  const state = getFormState(form.id);

  // 1. Calculate Items Text & Subtotals per category
  const categories = getFormItemCategories(form);
  const catSubtotals = {};
  let grandTotalSum = 0;

  categories.forEach(cat => {
    const items = state.items[cat] || [];
    const catSum = getItemsTotalSum(items);
    catSubtotals[cat] = catSum;
    grandTotalSum += catSum;
  });

  const formattedGrandTotal = grandTotalSum > 0
    ? grandTotalSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  // 2. Build context variables for formulas & field values
  const contextVars = {};

  (form.fields || []).forEach(f => {
    const isItemField = (f.type === 'items' || f.name.startsWith('รายการ') || f.name.toLowerCase() === 'items');
    if (!isItemField) {
      let val = state.fields[f.name];
      if (val === undefined || val === null) val = f.defaultValue || '';
      contextVars[f.name] = val;
    }
  });

  // Inject subtotals and grand totals into contextVars
  categories.forEach(cat => {
    const sumVal = catSubtotals[cat] || 0;
    const formatted = sumVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (cat === 'default') {
      contextVars['รวม'] = formatted;
      contextVars['รวมยอด'] = formatted;
      contextVars['ยอดรวม'] = formatted;
    } else {
      contextVars[`รวม:${cat}`] = formatted;
      contextVars[`รวม_${cat}`] = formatted;
      contextVars[`รวม${cat}`] = formatted;
      contextVars[`ยอดรวม:${cat}`] = formatted;
    }
  });

  contextVars['รวมทั้งหมด'] = formattedGrandTotal;
  contextVars['ยอดรวมทั้งหมด'] = formattedGrandTotal;
  contextVars['ผลรวมทั้งหมด'] = formattedGrandTotal;
  contextVars['total'] = formattedGrandTotal;
  contextVars['grandTotal'] = formattedGrandTotal;

  // 3. Replace Items lists in template
  categories.forEach(cat => {
    const items = state.items[cat] || [];
    const formattedCatText = getItemsFormattedText(items);
    if (cat === 'default') {
      text = text.replace(/<รายการ>|\[รายการ\]|<items>|\[items\]/gi, formattedCatText);
    } else {
      const escCat = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`<(?:รายการ|items)(?::|_|\\s+)?${escCat}>`, 'gi'), formattedCatText);
      text = text.replace(new RegExp(`\\[(?:รายการ|items)(?::|_|\\s+)?${escCat}\\]`, 'gi'), formattedCatText);
    }
  });

  // 4. Replace Category Subtotals
  categories.forEach(cat => {
    const sumVal = catSubtotals[cat] || 0;
    const formatted = sumVal > 0 ? sumVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    if (cat !== 'default') {
      const escCat = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`<(?:รวม|ยอดรวม)(?::|_|\\s+)?${escCat}>`, 'gi'), formatted);
      text = text.replace(new RegExp(`\\[(?:รวม|ยอดรวม)(?::|_|\\s+)?${escCat}\\]`, 'gi'), formatted);
    }
  });

  // 5. Replace Grand Total tags
  if (grandTotalSum > 0 || categories.length > 0) {
    const grandTags = ['รวมทั้งหมด', 'ยอดรวมทั้งหมด', 'ผลรวมทั้งหมด', 'รวม', 'รวมยอด', 'ยอดรวม', 'ผลรวม', 'sum', 'total'];
    grandTags.forEach(t => {
      const escT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp('<' + escT + '>', 'gi'), formattedGrandTotal);
      text = text.replace(new RegExp('\\[' + escT + '\\]', 'gi'), formattedGrandTotal);
    });
  }

  // 6. Evaluate Math Formulas (<คำนวณ:...>, <สูตร:...>, <calc:...>)
  const formulaRegex = /<(?:คำนวณ|สูตร|calc):([^>]+)>|\[(?:คำนวณ|สูตร|calc):([^\]]+)\]/gi;
  text = text.replace(formulaRegex, (match, p1, p2) => {
    let expr = (p1 || p2 || '').trim();
    if (!expr) return '';
    expr = expr.replace(/,/g, '');
    const calculated = evaluateFormula(expr, contextVars);
    return calculated !== '' ? calculated : '';
  });

  // 7. Process Form Fields (replace remaining standard placeholders [key] with formatted values)
  (form.fields || []).forEach(f => {
    const isItemField = (f.type === 'items' || f.name.startsWith('รายการ') || f.name.toLowerCase() === 'items');
    if (isItemField) return;

    let val = state.fields[f.name];
    if (val === undefined || val === null) val = f.defaultValue || '';

    if (val) {
      if (f.type === 'datetime') {
        if (typeof val === 'string' && val.includes('T')) {
          const [datePart, timePart] = val.split('T');
          if (datePart && timePart) {
            const [yyyy, mm, dd] = datePart.split('-');
            val = `${dd}/${mm}/${yyyy} ${timePart}`;
          }
        } else {
          try {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              const dd = String(d.getDate()).padStart(2, '0');
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const yyyy = d.getFullYear();
              const HH = String(d.getHours()).padStart(2, '0');
              const MM = String(d.getMinutes()).padStart(2, '0');
              val = `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
            }
          } catch(e){}
        }
      } else if (f.type === 'date') {
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
          const [yyyy, mm, dd] = val.trim().split('-');
          val = `${dd}/${mm}/${yyyy}`;
        } else {
          try {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              const dd = String(d.getDate()).padStart(2, '0');
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const yyyy = d.getFullYear();
              val = `${dd}/${mm}/${yyyy}`;
            }
          } catch(e){}
        }
      } else if (f.type === 'month') {
        if (/^\d{4}-\d{2}$/.test(val)) {
          const [, m] = val.split('-');
          const mIdx = parseInt(m, 10) - 1;
          const months = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
          ];
          if (months[mIdx]) val = months[mIdx];
        }
      } else if (f.type === 'time') {
        if (typeof val === 'string' && val.includes(':')) {
          const parts = val.split(':');
          val = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
      } else if (f.type === 'money' || f.type === 'number') {
        const num = Number(String(val).replace(/,/g, ''));
        if (!isNaN(num) && val !== '') {
          val = num.toLocaleString('en-US');
        }
      }
    }

    const safeKey = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp('\\[' + safeKey + '\\]', 'g'), val);
    text = text.replace(new RegExp('<' + safeKey + '>', 'g'), val);
  });

  // 8. Auto-replace System Variables
  const bangkokNow = new Date();
  const currentSiteName = (document.getElementById('txtUserSite')?.textContent || '').trim();
  const currentAdminName = (document.getElementById('txtUserName')?.textContent || '').trim();
  const thaiBuddhistYear = String(bangkokNow.getFullYear() + 543);
  const ceYear = String(bangkokNow.getFullYear());
  const thaiMonthsList = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const thaiMonthFull = thaiMonthsList[bangkokNow.getMonth()];
  const padNum = (n) => String(n).padStart(2, '0');
  const todayBangkok = `${padNum(bangkokNow.getDate())}/${padNum(bangkokNow.getMonth() + 1)}/${bangkokNow.getFullYear()}`;
  const nowTimeBangkok = `${padNum(bangkokNow.getHours())}:${padNum(bangkokNow.getMinutes())}`;

  const sysVars = {
    'ชื่อเว็บ': currentSiteName && currentSiteName !== '-' ? currentSiteName : 'JGAMING88',
    'เว็บ': currentSiteName && currentSiteName !== '-' ? currentSiteName : 'JGAMING88',
    'website': currentSiteName && currentSiteName !== '-' ? currentSiteName : 'JGAMING88',
    'ชื่อแอดมิน': currentAdminName && currentAdminName !== '-' ? currentAdminName : 'แอดมิน',
    'แอดมิน': currentAdminName && currentAdminName !== '-' ? currentAdminName : 'แอดมิน',
    'admin': currentAdminName && currentAdminName !== '-' ? currentAdminName : 'แอดมิน',
    'ปี': thaiBuddhistYear,
    'ปี พ.ศ.': thaiBuddhistYear,
    'ปีพ.ศ.': thaiBuddhistYear,
    'พ.ศ.': thaiBuddhistYear,
    'ปี ค.ศ.': ceYear,
    'ปีค.ศ.': ceYear,
    'ค.ศ.': ceYear,
    'year': ceYear,
    'วันนี้': todayBangkok,
    'วันที่วันนี้': todayBangkok,
    'วันที่': todayBangkok,
    'เวลา': nowTimeBangkok,
    'เวลาปัจจุบัน': nowTimeBangkok,
    'เวลาตอนนี้': nowTimeBangkok,
    'เดือนปัจจุบัน': thaiMonthFull
  };

  Object.entries(sysVars).forEach(([k, v]) => {
    const escK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp('<' + escK + '>', 'g'), v);
    text = text.replace(new RegExp('\\[' + escK + '\\]', 'g'), v);
  });

  // 9. LINE Plain Text Mode (Strip ** and __)
  if (document.getElementById('chkFormatPlainLine')?.checked) {
    text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1');
  }

  // 10. Update Textarea & Counters
  const txtResult = document.getElementById('txtFormResult');
  if (txtResult) {
    txtResult.value = text;
    const charCount = text.length;
    const lineCount = text ? text.split('\n').length : 0;
    const charEl = document.getElementById('lblCharCount');
    const lineEl = document.getElementById('lblLineCount');
    if (charEl) charEl.textContent = `${charCount.toLocaleString()} ตัวอักษร`;
    if (lineEl) lineEl.textContent = `${lineCount.toLocaleString()} บรรทัด`;
  }
}

document.getElementById('inputSearchForms')?.addEventListener('input', (e) => {
  renderFormList(e.target.value);
});

document.getElementById('chkFormatPlainLine')?.addEventListener('change', () => {
  if (selectedFormId) {
    const f = appForms.find(x => x.id === selectedFormId);
    if (f) generateFormText(f);
  }
});

document.getElementById('btnClearCurrentInputs')?.addEventListener('click', async () => {
  if (!selectedFormId) return;
  const ok = await window.showConfirmDialog({
    title: 'ล้างข้อมูลที่กรอก',
    message: 'ยืนยันล้างข้อมูลที่กรอกทั้งหมดในแบบฟอร์มนี้ เพื่อเริ่มกรอกใหม่?',
    confirmText: 'ล้างข้อมูล',
    cancelText: 'ยกเลิก',
    type: 'danger',
    icon: '🗑️'
  });
  if (!ok) return;
  delete formInputsState[selectedFormId];
  saveFormInputsState();
  renderFormGenerator(selectedFormId, true);
  showToast({ title: 'ล้างค่าสำเร็จ', message: 'ล้างข้อมูลที่กรอกเรียบร้อยแล้ว', type: 'info' });
});

document.getElementById('btnConfirmQuickPaste')?.addEventListener('click', () => {
  const raw = document.getElementById('txtQuickPasteInput')?.value || '';
  const parsed = parsePastedItemsText(raw);
  const cat = quickPasteActiveCategory || 'default';
  if (parsed.length > 0 && selectedFormId) {
    const state = getFormState(selectedFormId);
    state.items[cat] = parsed;
    saveFormInputsState();
    showToast({ title: 'สำเร็จ', message: `นำเข้า ${parsed.length} รายการสำหรับหมวด [${cat === 'default' ? 'ทั่วไป' : cat}] แล้ว`, type: 'success' });
    renderFormGenerator(selectedFormId);
  }
  window.closeModal('modalQuickPasteItems');
});

document.getElementById('btnCopyFormResult')?.addEventListener('click', () => {
  const txt = document.getElementById('txtFormResult');
  if (txt) {
    navigator.clipboard.writeText(txt.value);
    const btn = document.getElementById('btnCopyFormResult');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ คัดลอกสำเร็จ!';
      btn.style.background = '#10b981';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 2000);
    }
    showToast({ title: 'สำเร็จ', message: 'คัดลอกข้อความแล้ว', type: 'success' });
  }
});

document.getElementById('btnOpenFormGuide')?.addEventListener('click', () => {
  window.openModal('modalFormGuide');
});

document.getElementById('btnCreateForm')?.addEventListener('click', () => {
  openFormBuilder();
});

document.getElementById('btnEditForm')?.addEventListener('click', () => {
  if (selectedFormId) {
    const f = appForms.find(x => x.id === selectedFormId);
    if (f) openFormBuilder(f);
  }
});

window.openFormBuilder = function(form = null) {
  document.getElementById('formBuilderId').value = form ? form.id : '';
  document.getElementById('inputFormName').value = form ? form.name : '';
  document.getElementById('inputFormTemplate').value = form ? form.template : '';
  
  const fieldsContainer = document.getElementById('formBuilderFields');
  if (fieldsContainer) {
    fieldsContainer.innerHTML = '';
    if (form && form.fields) {
      form.fields.forEach(f => addBuilderFieldRow(f, true));
    }
  }
  
  const delBtn = document.getElementById('btnDeleteForm');
  if (delBtn) delBtn.style.display = form ? 'block' : 'none';
  window.openModal('modalFormBuilder');
};

// Smart Parser in Builder
let templateParseTimeout;
document.getElementById('inputFormTemplate')?.addEventListener('input', (e) => {
  clearTimeout(templateParseTimeout);
  templateParseTimeout = setTimeout(() => {
    const text = e.target.value;
    // Match <key> or [key], max 60 chars, no newlines or nested brackets
    const regex = /<([^<>\n\r]{1,60})>|\[([^\[\]\n\r]{1,60})\]/g;
    let match;
    const foundKeys = [];

    const ignoredPrefixes = ['คำนวณ:', 'สูตร:', 'calc:'];
    const autoTags = ['รวม', 'รวมยอด', 'ยอดรวม', 'รวมทั้งหมด', 'ยอดรวมทั้งหมด', 'total', 'sum'];
    const htmlTags = ['br', 'b', 'i', 'u', 'p', 'span', 'div', 'strong', 'em', 'hr', 'a', 'img', 'table', 'tr', 'td', 'th'];
    // System tags: ONLY pure system-injected values (notice 'เวลา' is NOT here because it is a user time variable)
    const systemTags = ['ชื่อเว็บ', 'เว็บ', 'website', 'ชื่อแอดมิน', 'แอดมิน', 'admin', 'ปี', 'ปี พ.ศ.', 'ปีพ.ศ.', 'พ.ศ.', 'ปี ค.ศ.', 'ปีค.ศ.', 'ค.ศ.', 'year', 'วันนี้', 'วันที่วันนี้', 'เวลาปัจจุบัน', 'เวลาตอนนี้', 'เดือนปัจจุบัน'];

    while ((match = regex.exec(text)) !== null) {
      const key = (match[1] || match[2]).trim();
      if (!key) continue;
      
      // Skip math calculation formulas, HTML tags, and pure system tags
      if (ignoredPrefixes.some(p => key.startsWith(p))) continue;
      if (htmlTags.includes(key.toLowerCase())) continue;
      if (systemTags.includes(key)) continue;
      if (autoTags.includes(key)) continue;
      if (key.startsWith('รวม:') || key.startsWith('รวม_') || key.startsWith('ยอดรวม:') || key.startsWith('ยอดรวม_')) continue;

      if (!foundKeys.includes(key)) foundKeys.push(key);
    }

    const container = document.getElementById('formBuilderFields');
    if (!container) return;
    
    // Get existing fields in the builder to keep their settings
    const existingKeys = [];
    const fieldRows = container.children;
    for (let row of fieldRows) {
      const keyInput = row.querySelector('._fKey');
      if (keyInput && keyInput.value) existingKeys.push(keyInput.value.trim());
    }
    
    // Add new keys that were just typed
    foundKeys.forEach(k => {
      if (!existingKeys.includes(k)) {
        let guessedType = 'text';
        const lk = k.toLowerCase();
        if ((k.includes('วัน') && k.includes('เวลา')) || lk.includes('datetime')) guessedType = 'datetime';
        else if (k.includes('เวลา') || lk.includes('time')) guessedType = 'time';
        else if (k.includes('วันที่') || lk.includes('date')) guessedType = 'date';
        else if (k.includes('เดือน') || lk.includes('month')) guessedType = 'month';
        else if (k.startsWith('รายการ') || lk.startsWith('item')) guessedType = 'items';
        else if (k.includes('ยอด') || k.includes('เงิน') || k.includes('amount') || k.includes('จำนวน') || k.includes('บาท') || k.includes('ถอน') || k.includes('ฝาก') || k.includes('ธรรมเนียม') || k.includes('ราคา') || lk.includes('fee') || lk.includes('price')) guessedType = 'money';
        else if (k.includes('ปัญหา') || k.includes('รายละเอียด') || k.includes('หมายเหตุ') || k.includes('ข้อความ') || lk.includes('note') || lk.includes('desc') || lk.includes('remark')) guessedType = 'textarea';
        else if (k.includes('เลข') || k.includes('บัญชี') || lk.includes('number') || k.includes('เบอร์') || k.includes('โทร') || lk.includes('phone') || lk.includes('tel') || lk.includes('user') || k.includes('ยูส') || lk.includes('id')) guessedType = 'text';
        
        addBuilderFieldRow({ name: k, label: k, type: guessedType }, false);
        existingKeys.push(k);
      }
    });
    
    // Auto-remove fields that are no longer in the template (ONLY auto-parsed, unedited ones)
    const containerRows = document.getElementById('formBuilderFields').children;
    for (let i = containerRows.length - 1; i >= 0; i--) {
      const row = containerRows[i];
      // NEVER delete manually added rows or rows currently being edited by user
      if (row.dataset.manual === 'true' || row.dataset.userEdited === 'true') continue;
      if (row.contains(document.activeElement)) continue;

      const keyInput = row.querySelector('._fKey');
      const rowKey = keyInput ? keyInput.value.trim() : '';
      if (!rowKey) continue; // Don't delete while user might be typing

      // Check if key is still in template (either <k> or [k])
      const escK = rowKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const inTemplate = new RegExp('<' + escK + '>|\\[' + escK + '\\]').test(text);
      if (inTemplate) continue;

      if (!foundKeys.includes(rowKey)) {
        row.remove();
      }
    }
  }, 600); // 600ms debounce
});

window.addBuilderFieldRow = function(data = {}, isManual = false) {
  const container = document.getElementById('formBuilderFields');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'builder-field-row';
  row.setAttribute('draggable', 'true');
  if (isManual) row.dataset.manual = 'true';
  if (data.name) row.dataset.autoParsed = 'true';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.padding = '4px 6px';
  row.style.borderRadius = '6px';
  row.style.background = 'rgba(255,255,255,0.02)';
  row.style.transition = 'all 0.15s ease';
  
  row.innerHTML = `
    <span class="builder-drag-handle" style="font-size:16px; color:var(--text-dim); cursor:grab; padding:0 4px;" title="คลิกค้างแล้วลากเพื่อสลับลำดับตัวแปร">⠿</span>
    <input type="text" class="input-field _fKey" placeholder="รหัสตัวแปร (เช่น date)" style="flex:1" value="${data.name || ''}">
    <input type="text" class="input-field _fLabel" placeholder="ชื่อช่อง (เช่น วันที่)" style="flex:1" value="${data.label || ''}">
    <select class="select-field _fType" style="flex:1">
      <option value="text" ${data.type === 'text' ? 'selected':''}>ข้อความ (Text)</option>
      <option value="items" ${data.type === 'items' ? 'selected':''}>ตารางรายการ (Items List)</option>
      <option value="number" ${data.type === 'number' ? 'selected':''}>ตัวเลข (Number)</option>
      <option value="money" ${data.type === 'money' ? 'selected':''}>จำนวนเงิน (Money)</option>
      <option value="date" ${data.type === 'date' ? 'selected':''}>วันที่ (Date)</option>
      <option value="month" ${data.type === 'month' ? 'selected':''}>เดือน (Month)</option>
      <option value="time" ${data.type === 'time' ? 'selected':''}>เวลา (Time)</option>
      <option value="datetime" ${data.type === 'datetime' ? 'selected':''}>วันที่+เวลา</option>
      <option value="textarea" ${data.type === 'textarea' ? 'selected':''}>ข้อความยาว (Textarea)</option>
    </select>
    <input type="text" class="input-field _fDefault" placeholder="ค่าเริ่มต้น" style="flex:1" value="${data.defaultValue || ''}">
    <button type="button" class="btn btn-secondary btn-sm" style="color:#ef4444;" onclick="this.parentElement.remove()" title="ลบตัวแปรนี้">✕</button>
  `;

  // Stop propagation on inputs so typing/selection doesn't trigger drag
  row.querySelectorAll('input, select, button').forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  });

  const keyInput = row.querySelector('._fKey');
  if (keyInput) {
    keyInput.addEventListener('input', () => {
      row.dataset.userEdited = 'true';
    });
  }

  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('builder-row-dragging');
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('builder-row-dragging');
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draggingRow = container.querySelector('.builder-row-dragging');
    if (draggingRow && draggingRow !== row) {
      const rect = row.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      container.insertBefore(draggingRow, next && row.nextSibling || row);
    }
  });

  container.appendChild(row);
};

document.getElementById('btnAddFormField')?.addEventListener('click', () => addBuilderFieldRow({}, true));

document.getElementById('btnSaveForm')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnSaveForm');
  
  const id = document.getElementById('formBuilderId').value || 'form_' + Date.now();
  const name = (document.getElementById('inputFormName').value || '').trim();
  const template = (document.getElementById('inputFormTemplate').value || '').trim();
  
  if (!name) {
    showToast({
      type: 'warning',
      badge: 'กรุณาระบุ',
      title: 'ยังไม่ได้ใส่ชื่อแบบฟอร์ม',
      detail: 'กรุณากรอกชื่อแบบฟอร์มก่อนทำการบันทึก'
    });
    return;
  }
  
  if (!template) {
    showToast({
      type: 'warning',
      badge: 'กรุณาระบุ',
      title: 'ยังไม่ได้ใส่ Template',
      detail: 'กรุณาวางหรือพิมพ์รูปแบบข้อความแบบฟอร์มก่อนทำการบันทึก'
    });
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '💾 กำลังบันทึก...';
  }
  
  const fieldRows = document.getElementById('formBuilderFields').children;
  const fields = [];
  for (let row of fieldRows) {
    const key = row.querySelector('._fKey').value.trim();
    if (!key) continue;
    fields.push({
      name: key,
      label: row.querySelector('._fLabel').value.trim() || key,
      type: row.querySelector('._fType').value,
      defaultValue: row.querySelector('._fDefault').value.trim()
    });
  }
  
  const newForm = { id, name, template, fields, updatedAt: new Date().toISOString() };
  
  // 1. Optimistic Local Save immediately: User never loses work even if network hiccups
  const existIdx = appForms.findIndex(f => f.id === newForm.id);
  if (existIdx > -1) {
    appForms[existIdx] = newForm;
  } else {
    appForms.push(newForm);
  }
  try { localStorage.setItem('nk_app_forms_cache', JSON.stringify(appForms)); } catch (e) {}
  selectedFormId = newForm.id;
  renderFormList(document.getElementById('inputSearchForms')?.value || '');
  renderFormGenerator(selectedFormId);

  // 2. Sync online
  const syncResult = await saveFormsOnline({ action: 'upsert', form: newForm });
  
  if (syncResult && syncResult.success) {
    window.closeModal('modalFormBuilder');
  }
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '💾 บันทึกแบบฟอร์ม (ออนไลน์)';
  }
});

document.getElementById('btnDeleteForm')?.addEventListener('click', async () => {
  const ok = await window.showConfirmDialog({
    title: 'ลบแบบฟอร์ม',
    message: 'คุณแน่ใจหรือไม่ว่าต้องการลบแบบฟอร์มนี้? การดำเนินการนี้จะลบออกจากระบบออนไลน์สำหรับทุกคน',
    confirmText: 'ยืนยันลบแบบฟอร์ม',
    cancelText: 'ยกเลิก',
    type: 'danger',
    icon: '🗑️'
  });
  if (!ok) return;
  const id = document.getElementById('formBuilderId').value;
  await saveFormsOnline({ action: 'delete', formId: id });
  window.closeModal('modalFormBuilder');
});

async function saveFormsOnline(payload) {
  try {
    const serverUrl = await getFormsApiServerUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res;
    try {
      res = await fetch(`${serverUrl}/api/app-forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let errText = `เซิร์ฟเวอร์ตอบกลับสถานะ ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) errText = errJson.error;
      } catch (_) {
        try {
          const t = await res.text();
          if (t) errText = t.substring(0, 100);
        } catch (_) {}
      }
      throw new Error(errText);
    }

    const data = await res.json();
    if (data && data.success && Array.isArray(data.forms)) {
      appForms = data.forms;
      try { localStorage.setItem('nk_app_forms_cache', JSON.stringify(appForms)); } catch (e) {}
      renderFormList(document.getElementById('inputSearchForms')?.value || '');
      if (payload.action === 'delete') {
        if (selectedFormId === payload.formId || selectedFormId === payload.form?.id) {
          selectedFormId = appForms.length > 0 ? appForms[0].id : null;
        }
      } else if (payload.form?.id) {
        selectedFormId = payload.form.id;
      }

      if (selectedFormId && appForms.some(f => f.id === selectedFormId)) {
        renderFormGenerator(selectedFormId);
      } else {
        const emptyState = document.getElementById('formEmptyState');
        const generatorArea = document.getElementById('formGeneratorArea');
        if (emptyState) emptyState.style.display = 'flex';
        if (generatorArea) generatorArea.style.display = 'none';
      }

      showToast({
        type: 'success',
        badge: 'สำเร็จ',
        title: 'บันทึกสำเร็จ',
        detail: payload.action === 'delete' ? 'ลบแบบฟอร์มและซิงค์ไปยังทุกเครื่องแล้ว' : 'บันทึกแบบฟอร์มและซิงค์ออนไลน์เรียบร้อยแล้ว'
      });
      return { success: true };
    } else {
      throw new Error(data?.error || 'เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลแบบฟอร์มกลับมา');
    }
  } catch (err) {
    console.error('saveFormsOnline error:', err);
    showToast({
      type: payload.action === 'delete' ? 'error' : 'warning',
      badge: payload.action === 'delete' ? 'ข้อผิดพลาด' : 'บันทึกในเครื่อง',
      title: payload.action === 'delete' ? 'ลบแบบฟอร์มไม่สำเร็จ' : 'บันทึกแบบฟอร์มลงเครื่องแล้ว',
      detail: payload.action === 'delete'
        ? ('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: ' + (err?.message || err))
        : ('บันทึกในเครื่องเรียบร้อย (ระบบจะซิงค์ออนไลน์ให้อัตโนมัติเมื่อต่อเน็ตสำเร็จ: ' + (err?.message || err) + ')')
    });
    return { success: true, offline: true, error: err.message };
  }
}

// Hook into WS
if (window.nkAPI && window.nkAPI.onRemoteControlBroadcast) {
  window.nkAPI.onRemoteControlBroadcast(data => {
    if (data && data.type === 'FORMS_CHANGED') {
      if (Array.isArray(data.forms)) {
        appForms = data.forms;
        try { localStorage.setItem('nk_app_forms_cache', JSON.stringify(appForms)); } catch (e) {}
        renderFormList(document.getElementById('inputSearchForms')?.value || '');
        if (selectedFormId) {
          const currentForm = appForms.find(f => f.id === selectedFormId);
          if (currentForm) {
            const isUserTyping = document.activeElement && document.getElementById('formDynamicInputs')?.contains(document.activeElement);
            if (!isUserTyping) {
              renderFormGenerator(selectedFormId);
            } else {
              generateFormText(currentForm);
            }
          }
        }
        const syncLabel = document.getElementById('lblFormsSyncStatus');
        if (syncLabel) {
          const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          syncLabel.innerHTML = `<span style="color:#10b981;">●</span> ออนไลน์ · มีการอัปเดต ${timeStr}`;
        }
      }
    }
  });
}

// Refresh Buttons
document.getElementById('btnRefreshForms')?.addEventListener('click', () => fetchForms(true));
document.getElementById('btnQuickRefreshForms')?.addEventListener('click', () => fetchForms(true));

// Auto sync on window focus (Passive list update only - NEVER re-render generator DOM)
window.addEventListener('focus', () => {
  const activeView = document.querySelector('.nav-item.active')?.dataset?.view;
  if (activeView === 'forms' && typeof fetchForms === 'function') {
    fetchForms(false);
  }
});

// Periodic background sync (Passive - every 60s)
setInterval(() => {
  const activeView = document.querySelector('.nav-item.active')?.dataset?.view;
  if (activeView === 'forms' && typeof fetchForms === 'function' && !document.hidden) {
    fetchForms(false);
  }
}, 60000);

// Init
fetchForms();
