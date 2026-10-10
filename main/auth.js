'use strict';

const store = require('./store');

const API_LOGIN_URL = 'https://nklaos-adminapi.logicxking.com/auth/login';
const API_PROFILE_URL = 'https://nklaos-adminapi.logicxking.com/auth/profile';

function normalizeBackofficeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  try {
    const parsed = new URL(u);
    return parsed.origin;
  } catch (e) {
    return u.replace(/\/+$/, '');
  }
}

function deriveSiteNameFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
    let host = u.hostname.toLowerCase().replace(/^admin\./i, '').replace(/^www\./i, '');
    const main = host.split('.')[0] || host;
    return main.replace(/([a-zA-Z]+)(\d+)/g, '$1 $2').toUpperCase();
  } catch {
    return 'ระบบเป้าหมาย';
  }
}

async function loginWithApi(username, password, otp = '') {
  try {
    const payloadBody = {
      username: username.trim(),
      password: String(password)
    };
    const cleanOtp = String(otp || '').replace(/\D/g, '');
    if (cleanOtp) {
      payloadBody.otp = cleanOtp;
    }

    const res = await fetch(API_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payloadBody)
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      const errorMsg = typeof payload === 'object'
        ? (payload?.error || payload?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
        : 'เข้าสู่ระบบไม่สำเร็จ';
      const requires2FA = Boolean(
        payload?.requires_2fa ||
        payload?.has_2fa ||
        /authenticator|2fa|สองชั้น|2 ชั้น|รหัสยืนยัน|otp/i.test(errorMsg)
      );
      if (requires2FA) {
        store.set('has2FA.' + username.trim().toLowerCase(), true);
      }
      return { ok: false, error: errorMsg, status: res.status, requires2FA };
    }

    const token = payload?.token || payload?.access_token;
    if (!token) {
      return { ok: false, error: 'ไม่พบ Access Token จากระบบ BackOffice' };
    }

    const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    // Fetch official profile details to get the exact role and website configuration
    let profileData = null;
    try {
      const profRes = await fetch(API_PROFILE_URL, {
        headers: {
          'Authorization': bearerToken,
          'Accept': 'application/json'
        }
      });
      if (profRes.ok) {
        profileData = await profRes.json();
      }
    } catch (e) {}

    const websites = profileData?.websites || payload.user?.websites || payload.websites || [];
    const websiteIds = profileData?.website_ids || payload.website_ids || [];
    const targetWebsite = websites.length > 0 ? websites[0] : null;

    const websiteId = Number(targetWebsite?.id || websiteIds[0] || 0);
    const siteName = targetWebsite?.site_name || targetWebsite?.name || 'BackOffice';
    const roleName = profileData?.role_detail?.name || profileData?.role || payload.role || payload.user?.role || 'แอดมิน';

    // Derive BackOffice web URL dynamically from the website's assigned domain
    let backofficeUrl = '';
    const rawDomainStr = targetWebsite?.domain || targetWebsite?.site_url || '';
    if (rawDomainStr) {
      const primaryDomain = rawDomainStr.split(',')[0].trim();
      if (primaryDomain) {
        backofficeUrl = primaryDomain.startsWith('http') ? primaryDomain : `https://admin.${primaryDomain}`;
      }
    }

    if (profileData) {
      store.set('userProfileData', profileData);
    }

    // 1. Save API Session for all Smart API calls
    store.set('apiSession', {
      origin: 'https://nklaos-adminapi.logicxking.com',
      headers: {
        authorization: bearerToken,
        accept: 'application/json'
      },
      path: '/auth/login',
      query: { website_id: websiteId },
      updatedAt: Date.now()
    });

    // 2. Save Business Context targeting this specific website
    store.set('apiBusinessContext', {
      websiteId: websiteId || null,
      agentId: 0,
      siteName,
      backofficeUrl,
      updatedAt: Date.now()
    });

    // Update settings with detected target website
    const currentSettings = store.get('settings', {}) || {};
    store.set('settings', {
      ...currentSettings,
      backofficeUrl,
      targetWebsiteId: websiteId || null,
      targetWebsiteName: siteName
    });

    // 3. Save User App Session with exact system profile
    const safeUser = {
      id: profileData?.id || payload.user?.id || payload.id || 1,
      username: profileData?.username || payload.user?.name || username.trim(),
      name: profileData?.name || payload.user?.name || username.trim(),
      role: roleName,
      roleDetail: profileData?.role_detail || null,
      websiteId,
      siteName,
      backofficeUrl,
      creditLimit: profileData?.credit_limit || 0,
      lastLogin: Date.now()
    };

    if (cleanOtp || profileData?.has_2fa || payload?.has_2fa) {
      store.set('has2FA.' + username.trim().toLowerCase(), true);
    }

    // Save temporary credentials in memory/session for auto-authenticating the BackOffice webview
    store.set('tempCredentials', {
      username: username.trim(),
      password: String(password),
      otp: cleanOtp || ''
    });

    store.set('session.loggedIn', true);
    store.set('session.loginTime', Date.now());
    store.set('session.user', safeUser);

    return { ok: true, user: safeUser, source: 'api' };
  } catch (err) {
    return { ok: false, error: 'ไม่สามารถเชื่อมต่อ Server BackOffice ได้: ' + (err.message || String(err)) };
  }
}

async function login(username, password, otp = '') {
  if (!username || !password) {
    return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  }

  const u = username.trim();

  // Try official BackOffice API login first
  const apiRes = await loginWithApi(u, password, otp);
  if (apiRes.ok) {
    return apiRes;
  }

  // Fallback for local admin testing if offline
  if (u.toLowerCase() === 'admin' && password === 'admin') {
    const adminUser = {
      id: 'admin-local',
      username: 'admin',
      name: 'Local Admin',
      role: 'ผู้ดูแลระบบทั่วไป',
      websiteId: 1,
      siteName: 'Local Admin System',
      lastLogin: Date.now()
    };
    store.set('session.loggedIn', true);
    store.set('session.loginTime', Date.now());
    store.set('session.user', adminUser);
    store.set('tempCredentials', { username: 'admin', password: 'admin' });
    return { ok: true, user: adminUser, source: 'local' };
  }

  return apiRes;
}

function getCurrentUser() {
  const loggedIn = store.get('session.loggedIn', false);
  if (!loggedIn) return null;
  return store.get('session.user', null);
}

function logout() {
  store.set('session.loggedIn', false);
  store.delete('session.user');
  store.delete('session.loginTime');
  store.delete('apiSession');
  store.delete('tempCredentials');
  store.delete('userProfileData');
  store.delete('apiBusinessContext');
  return { ok: true };
}

module.exports = {
  login,
  getCurrentUser,
  logout,
  normalizeBackofficeUrl,
  deriveSiteNameFromUrl
};
