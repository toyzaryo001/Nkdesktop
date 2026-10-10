'use strict';

const phaseCredentials = document.getElementById('phaseCredentials');
const phase2FA = document.getElementById('phase2FA');

const formCredentials = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorBanner = document.getElementById('errorMsg');
const btnLogin = document.getElementById('btnLogin');

const form2FA = document.getElementById('form2FA');
const otpInput = document.getElementById('otp');
const error2FA = document.getElementById('error2FA');
const btnSubmit2FA = document.getElementById('btnSubmit2FA');
const label2FAUsername = document.getElementById('label2FAUsername');
const btnBackToLogin = document.getElementById('btnBackToLogin');

const btnMin = document.getElementById('btnMin');
const btnClose = document.getElementById('btnClose');

btnMin.addEventListener('click', () => window.nkAPI.minimizeWindow());
btnClose.addEventListener('click', () => window.nkAPI.closeWindow());

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
    type = 'warning',
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
        msgEl.innerHTML = message.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '<div style="height:6px;"></div>';
          return `<p style="margin: 4px 0;">${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
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
    if (glowEl) glowEl.style.background = `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`;
    if (iconEl) iconEl.textContent = icon || t.icon;
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
    setTimeout(() => { try { btnConfirm?.focus(); } catch (e) {} }, 50);

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm?.removeEventListener('click', onConfirm);
      btnCancel?.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKey);
      modal.removeEventListener('click', onBackdrop);
    };

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
      else if (e.key === 'Enter') {
        if (document.activeElement !== btnCancel) { e.preventDefault(); e.stopPropagation(); onConfirm(); }
      }
    };
    const onBackdrop = (e) => { if (e.target === modal) onCancel(); };

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
    if (options.includes('✅') || options.includes('สำเร็จ')) { autoType = 'success'; autoIcon = '✅'; }
    else if (options.includes('⚠️') || options.includes('กรุณา')) { autoType = 'warning'; autoIcon = '⚠️'; }
    else if (options.includes('ผิดพลาด') || options.includes('ไม่สำเร็จ') || options.includes('ล้มเหลว') || options.includes('เกิดข้อผิดพลาด') || options.includes('❌')) {
      autoType = 'danger'; autoIcon = '❌';
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
    if (!modal) { resolve(); return; }

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
        msgEl.innerHTML = message.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '<div style="height:6px;"></div>';
          return `<p style="margin: 4px 0;">${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
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
    if (glowEl) glowEl.style.background = `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`;
    if (iconEl) iconEl.textContent = icon || t.icon;
    if (btnCancel) btnCancel.style.display = 'none';
    if (btnConfirm) {
      btnConfirm.textContent = buttonText;
      btnConfirm.style.background = t.confirmBg;
      btnConfirm.style.color = t.confirmColor;
      btnConfirm.style.boxShadow = t.confirmShadow;
    }

    modal.style.display = 'flex';
    setTimeout(() => { try { btnConfirm?.focus(); } catch (e) {} }, 50);

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm?.removeEventListener('click', onClose);
      window.removeEventListener('keydown', onKey);
      modal.removeEventListener('click', onBackdrop);
    };

    const onClose = () => { cleanup(); resolve(); };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    const onBackdrop = (e) => { if (e.target === modal) onClose(); };

    btnConfirm?.addEventListener('click', onClose);
    window.addEventListener('keydown', onKey, { capture: true });
    modal.addEventListener('click', onBackdrop);
  });
};

window.alert = function(msg) { return window.showAlertDialog(msg); };
window.confirm = function(msg) { return window.showConfirmDialog({ message: msg }); };


let savedUsername = '';
let savedPassword = '';

// Switch to Phase 2 (2FA) with animation
function switchTo2FA(username, password) {
  savedUsername = username;
  savedPassword = password;
  if (label2FAUsername) label2FAUsername.textContent = username;

  if (errorBanner) errorBanner.style.display = 'none';
  if (error2FA) error2FA.style.display = 'none';

  if (phaseCredentials) {
    phaseCredentials.style.display = 'none';
    phaseCredentials.classList.remove('phase-active', 'phase-back');
  }

  if (phase2FA) {
    phase2FA.style.display = 'flex';
    phase2FA.classList.remove('phase-back');
    phase2FA.classList.add('phase-active');
  }

  if (otpInput) {
    otpInput.value = '';
    setTimeout(() => otpInput.focus(), 150);
  }
}

// Switch back to Phase 1 (Credentials) with animation
function switchToCredentials() {
  if (error2FA) error2FA.style.display = 'none';

  if (phase2FA) {
    phase2FA.style.display = 'none';
    phase2FA.classList.remove('phase-active', 'phase-back');
  }

  if (phaseCredentials) {
    phaseCredentials.style.display = 'flex';
    phaseCredentials.classList.remove('phase-active');
    phaseCredentials.classList.add('phase-back');
  }

  if (passwordInput) {
    setTimeout(() => passwordInput.focus(), 150);
  }
}

if (btnBackToLogin) {
  btnBackToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    switchToCredentials();
  });
}

// Format OTP: only 6 numeric digits & auto-submit on 6th digit
if (otpInput) {
  otpInput.addEventListener('input', () => {
    otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
    if (otpInput.value.length === 6 && form2FA) {
      form2FA.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
}

// Phase 1 Submission: verify credentials first
formCredentials.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;

  if (errorBanner) errorBanner.style.display = 'none';
  btnLogin.disabled = true;
  btnLogin.querySelector('span').textContent = 'กำลังตรวจสอบ...';

  try {
    const result = await window.nkAPI.login({ username, password });
    if (result.ok) {
      // Direct login successful (no 2FA required on this account)
      return;
    }

    // Check if server demands 2FA code
    const errStr = String(result.error || '').toLowerCase();
    const needs2FA = result.requires2FA || /authenticator|2fa|สองชั้น|2 ชั้น|รหัสยืนยัน|otp/i.test(errStr);

    if (needs2FA) {
      // Smoothly switch phase to 2FA screen!
      switchTo2FA(username, password);
    } else {
      if (errorBanner) {
        errorBanner.textContent = result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        errorBanner.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorBanner) {
      errorBanner.textContent = err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      errorBanner.style.display = 'block';
    }
  } finally {
    btnLogin.disabled = false;
    btnLogin.querySelector('span').textContent = 'เข้าสู่ระบบ';
  }
});

// Phase 2 Submission: submit with 2FA OTP code
if (form2FA) {
  form2FA.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = otpInput ? otpInput.value.trim().replace(/\D/g, '') : '';
    if (!otp || otp.length < 6) {
      if (error2FA) {
        error2FA.textContent = 'กรุณากรอกรหัส Authenticator ให้ครบ 6 หลัก';
        error2FA.style.display = 'block';
      }
      otpInput?.focus();
      return;
    }

    if (error2FA) error2FA.style.display = 'none';
    btnSubmit2FA.disabled = true;
    btnSubmit2FA.querySelector('span').textContent = 'กำลังยืนยัน 2FA...';

    try {
      const result = await window.nkAPI.login({
        username: savedUsername || usernameInput.value.trim(),
        password: savedPassword || passwordInput.value,
        otp
      });

      if (!result.ok) {
        if (error2FA) {
          error2FA.textContent = result.error || 'รหัสยืนยัน 2FA ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
          error2FA.style.display = 'block';
        }
        if (otpInput) {
          otpInput.value = '';
          otpInput.focus();
        }
      }
    } catch (err) {
      if (error2FA) {
        error2FA.textContent = err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
        error2FA.style.display = 'block';
      }
    } finally {
      btnSubmit2FA.disabled = false;
      btnSubmit2FA.querySelector('span').textContent = 'ยืนยันและเข้าสู่ระบบ';
    }
  });
}

// Remote Control Elements
const remoteLockoutOverlay = document.getElementById('remoteLockoutOverlay');
const lockoutTitle = document.getElementById('lockoutTitle');
const lockoutMessage = document.getElementById('lockoutMessage');
const lockoutContact = document.getElementById('lockoutContact');

const remoteForceUpdateOverlay = document.getElementById('remoteForceUpdateOverlay');
const updateVerNotice = document.getElementById('updateVerNotice');
const btnDownloadUpdateLogin = document.getElementById('btnDownloadUpdateLogin');

let downloadUrl = '';

let wasLocked = false;

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
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {}
}

function handleRemoteControlStatus(status) {
  if (!status) return;

  // 1. Lockout Check
  if (status.locked) {
    if (!wasLocked) {
      wasLocked = true;
      playAlertChime('alarm');
    }
    if (lockoutTitle) lockoutTitle.textContent = status.maintenance?.title || 'ระบบปิดปรับปรุงชั่วคราว';
    if (lockoutMessage) lockoutMessage.textContent = status.maintenance?.message || 'ขณะนี้ระบบปิดปรับปรุงชั่วคราว';
    if (lockoutContact) lockoutContact.textContent = `ติดต่อ: ${status.maintenance?.contact || 'ผู้ดูแลระบบ'}`;
    if (remoteLockoutOverlay) remoteLockoutOverlay.style.display = 'flex';
    btnLogin.disabled = true;
    return;
  } else {
    wasLocked = false;
    if (remoteLockoutOverlay) remoteLockoutOverlay.style.display = 'none';
    btnLogin.disabled = false;
  }

  // 2. Force Update Check
  if (status.forceUpdate && status.hasNewerVersion) {
    downloadUrl = status.downloadUrl || '';
    if (updateVerNotice) {
      updateVerNotice.textContent = `เวอร์ชันปัจจุบัน: v${status.currentVersion} ➔ เวอร์ชันใหม่: v${status.latestVersion}`;
    }
    if (remoteForceUpdateOverlay) remoteForceUpdateOverlay.style.display = 'flex';
    btnLogin.disabled = true;
  } else {
    if (remoteForceUpdateOverlay) remoteForceUpdateOverlay.style.display = 'none';
  }
}

if (btnDownloadUpdateLogin) {
  btnDownloadUpdateLogin.addEventListener('click', async () => {
    if (downloadUrl && window.nkAPI?.openExternalUrl) {
      window.nkAPI.openExternalUrl(downloadUrl);
    } else {
      await window.showAlertDialog({
        title: 'ไม่พบบริการลิงก์ดาวน์โหลด',
        message: 'ไม่พบบริการลิงก์ดาวน์โหลด กรุณาติดต่อผู้ดูแลระบบ',
        type: 'warning'
      });
    }
  });
}

// Listen for remote control broadcasts
if (window.nkAPI?.onRemoteControlStatus) {
  window.nkAPI.onRemoteControlStatus((status) => {
    handleRemoteControlStatus(status);
  });
}

// Initial status check
if (window.nkAPI?.checkRemoteControlNow) {
  window.nkAPI.checkRemoteControlNow().then((res) => {
    if (res && res.ok && res.status) {
      handleRemoteControlStatus(res.status);
    }
  }).catch(() => {});
}

// Dynamic version sync
if (window.nkAPI?.getAppVersion) {
  window.nkAPI.getAppVersion().then((v) => {
    const el = document.getElementById('loginAppVersion');
    if (el && v) el.textContent = `NK Helper Desktop v${v} (Enterprise Online)`;
  });
}
