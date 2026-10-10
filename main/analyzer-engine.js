'use strict';

const { BrowserWindow, Notification } = require('electron');
const apiEngine = require('./api-engine');

let _store = null;
let observerTimer = null;
let inFlightObserver = null;
let planMemoryCache = {};

function getTargetWebsiteId() {
  const context = _store ? _store.get('apiBusinessContext', null) : null;
  if (context?.websiteId) return Number(context.websiteId);
  const settings = _store ? _store.get('settings', null) : null;
  if (settings?.targetWebsiteId) return Number(settings.targetWebsiteId);
  return null;
}

function getTargetWebsiteName() {
  const context = _store ? _store.get('apiBusinessContext', null) : null;
  if (context?.siteName) return context.siteName;
  const settings = _store ? _store.get('settings', null) : null;
  if (settings?.targetWebsiteName) return settings.targetWebsiteName;
  return 'เป้าหมาย';
}

function init(store) {
  _store = store;
  // Do NOT start observer here! Only start after user logs in.
}

function startObserver(intervalSec = 15) {
  stopObserver();
  if (!_store || !_store.get('session.loggedIn')) return;

  planMemoryCache = {}; // Reset in-memory seen cache on fresh start

  const siteName = getTargetWebsiteName();
  _store.set('globalObserverState', {
    status: 'watching',
    enabled: true,
    intervalSec,
    message: `กำลังเฝ้าดู Server (เฉพาะ ${siteName}) ทุก ${intervalSec} วินาที...`,
    updatedAt: Date.now()
  });

  runObserverTick();
  observerTimer = setInterval(() => {
    runObserverTick();
  }, Math.max(5, intervalSec) * 1000);
}

function stopObserver() {
  if (observerTimer) {
    clearInterval(observerTimer);
    observerTimer = null;
  }
  planMemoryCache = {};
  if (_store) {
    _store.set('globalObserverState', {
      status: 'stopped',
      enabled: false,
      message: 'Global Observer หยุดอยู่',
      updatedAt: Date.now()
    });
  }
}

function isTargetWebsite(item) {
  if (!item) return false;
  const targetWebsiteId = getTargetWebsiteId();
  // If item is admin activity
  if (item.action) {
    const act = String(item.action || '');
    // Strictly filter out any login / auth events
    if (/เข้าสู่ระบบ|login|auth/i.test(act)) return false;
    // Strictly filter out approve/reject actions
    if (/อนุมัติ|ปฏิเสธ|เพิ่ม frontend/i.test(act)) return false;
    // Strictly require website_id to match targetWebsiteId
    const wid = Number(item.website_id || (typeof item.payload === 'object' ? item.payload?.website_id : 0) || 0);
    if (wid > 0 && wid !== targetWebsiteId) return false;
    return /แก้ไข สมาชิก|แก้ไข บัญชีธนาคาร|รีเซ็ตรหัสผ่าน|เพิ่ม ฝาก-ถอนมือ/i.test(act);
  }

  const wid = Number(item.website_id || item.website?.id || item.member?.website_id || 0);
  if (wid > 0 && wid !== targetWebsiteId) return false;
  return true;
}

function shouldNotify(key) {
  if (!key || !_store) return false;
  if (!_store.get('session.loggedIn')) return false;

  const notified = new Set(_store.get('notifiedTransactionKeys', []));
  if (notified.has(key)) return false;
  notified.add(key);

  const arr = Array.from(notified);
  _store.set('notifiedTransactionKeys', arr.length > 5000 ? arr.slice(-5000) : arr);
  return true;
}

let cachedEndpoints = null;
let cachedMeta = null;
let endpointsDirty = false;
let lastEndpointsPersistAt = 0;

function flushEndpointsToDisk(force = false) {
  if (!_store || !endpointsDirty || !cachedEndpoints) return;
  const now = Date.now();
  if (force || now - lastEndpointsPersistAt > 60000) {
    _store.set('analyzerEndpoints', cachedEndpoints);
    _store.set('analyzerMeta', cachedMeta);
    endpointsDirty = false;
    lastEndpointsPersistAt = now;
  }
}

function learnEndpoint(plan, payload, durationMs = 120) {
  if (!_store) return;
  if (!cachedEndpoints) {
    cachedEndpoints = _store.get('analyzerEndpoints', {}) || {};
  }
  if (!cachedMeta) {
    cachedMeta = _store.get('analyzerMeta', { totalRequests: 0, endpointCount: 0, lastSeen: 0 });
  }

  const id = `GET ${plan.path}`;
  const now = Date.now();
  const existing = cachedEndpoints[id];

  const categoryMap = {
    'transactions-deposit': 'deposit_history',
    'transactions-withdraw': 'withdraw_history',
    'credit-history': 'transaction_history',
    'reward-redeems': 'bonus_promotion',
    'admin-activity': 'admin_activity'
  };

  const category = categoryMap[plan.key] || 'other';
  const queryKeys = plan.params ? Object.keys(plan.params) : [];
  const responseKeys = (payload && typeof payload === 'object') ? Object.keys(payload) : [];

  if (existing) {
    existing.count = (Number(existing.count) || 0) + 1;
    existing.lastSeen = now;
    existing.lastStatus = 200;
    existing.avgMs = Math.round(((Number(existing.avgMs) || durationMs) * 0.7) + (durationMs * 0.3));
  } else {
    cachedEndpoints[id] = {
      id,
      method: 'GET',
      pathTemplate: plan.path,
      origin: 'https://nklaos-adminapi.logicxking.com',
      host: 'nklaos-adminapi.logicxking.com',
      examplePath: plan.path,
      exampleUrl: `https://nklaos-adminapi.logicxking.com${plan.path}`,
      category,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      lastStatus: 200,
      avgMs: durationMs,
      confidence: 1.0,
      purpose: plan.label,
      pages: ['Desktop App — Global Observer'],
      observationSources: ['server_observer'],
      queryKeys,
      responseKeys
    };
  }

  cachedMeta.totalRequests = (Number(cachedMeta.totalRequests) || 0) + 1;
  cachedMeta.endpointCount = Object.keys(cachedEndpoints).length;
  cachedMeta.lastSeen = now;
  endpointsDirty = true;
  flushEndpointsToDisk(false);
}

function emitNotification(payload, uniqueKey = '') {
  // STRICT: Never emit notification if user is not logged in!
  if (!_store || !_store.get('session.loggedIn')) return;
  if (uniqueKey && !shouldNotify(uniqueKey)) return;

  const settings = _store.get('settings', {});

  // Send to all renderer windows for in-app toast & chime sound
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('app-notification', payload);
    }
  }

  // Also show OS notification if enabled
  if (settings.osNotification !== false && Notification.isSupported()) {
    new Notification({
      title: payload.title,
      body: payload.body || payload.detail,
      silent: true // sound will be played with customizable chime in renderer
    }).show();
  }
}

async function runObserverTick() {
  if (inFlightObserver) return inFlightObserver;
  if (!_store || !_store.get('session.loggedIn')) {
    stopObserver();
    return null;
  }

  inFlightObserver = (async () => {
    try {
      if (!_store.get('session.loggedIn')) return { ok: false };

      const settings = _store.get('settings', {
        notifyDeposit: true,
        notifyWithdraw: true,
        notifyMemberEdit: true,
        notifyManual: true,
        notifyBonus: true
      });

      const targetWebsiteId = getTargetWebsiteId();
      const commonParams = {
        website_id: targetWebsiteId,
        page: 1,
        limit: 30
      };

      const plans = [
        {
          key: 'transactions-deposit',
          label: 'รายการฝากเงิน',
          path: '/transactions',
          params: { ...commonParams, type: 'deposit', sort: 'transaction_at', order: 'desc' }
        },
        {
          key: 'transactions-withdraw',
          label: 'รายการถอนเงิน',
          path: '/transactions',
          params: { ...commonParams, type: 'withdraw', sort: 'transaction_at', order: 'desc' }
        },
        {
          key: 'credit-history',
          label: 'ประวัติปรับเครดิต',
          path: '/credit-history',
          params: { ...commonParams, sort: 'transaction_at', order: 'desc' }
        },
        {
          key: 'reward-redeems',
          label: 'รายการแลกแต้ม/รีวอร์ด',
          path: '/reward-redeems',
          params: { ...commonParams, sort: 'created_at', order: 'desc' }
        },
        {
          key: 'admin-activity',
          label: 'กิจกรรมแอดมิน',
          path: '/admin-activity',
          params: { ...commonParams, sort: 'created_at', order: 'desc' }
        }
      ];

      let detectedCount = 0;
      const loginTime = Number(_store.get('session.loginTime') || 0);

      for (const plan of plans) {
        try {
          const t0 = Date.now();
          const payload = await apiEngine.apiFetchJson(plan.path, plan.params, { retries: 0 });
          const durationMs = Date.now() - t0;
          learnEndpoint(plan, payload, durationMs);

          let rows = apiEngine.apiDataArray(payload);

          // Strictly filter for the target website
          rows = rows.filter(isTargetWebsite);

          const currentIds = rows.map((r) => String(r.id || r.transaction_id || '')).filter(Boolean);

          // First run for this plan after login:
          // Initial snapshot phase: seed seen set with all current IDs and DO NOT notify any of them!
          if (!planMemoryCache[plan.key]) {
            planMemoryCache[plan.key] = new Set(currentIds);
            continue;
          }

          const seenSet = planMemoryCache[plan.key];
          const newRows = [];

          for (const r of rows) {
            const idStr = String(r.id || r.transaction_id || '');
            if (!idStr || seenSet.has(idStr)) continue;

            // Strict timestamp check: DO NOT notify items that occurred before or at login!
            const rawTime = r.transaction_at || r.created_at || r.requested_at || r.updated_at;
            if (rawTime && loginTime > 0) {
              let itemTime = new Date(rawTime).getTime();
              if (isNaN(itemTime) && String(rawTime).includes(' ')) {
                itemTime = new Date(String(rawTime).replace(' ', 'T')).getTime();
              }
              if (!isNaN(itemTime) && itemTime > 0 && itemTime <= loginTime) {
                seenSet.add(idStr);
                continue;
              }
            }

            seenSet.add(idStr);
            newRows.push(r);
          }

          if (newRows.length) {
            detectedCount += newRows.length;
            recordObservation(plan, newRows, durationMs);

            // Process notifications strictly for newly detected items occurring AFTER login
            for (const r of newRows) {
              dispatchPlanNotification(plan.key, r, settings);
            }
          }

          if (seenSet.size > 2000) {
            const arr = Array.from(seenSet).slice(-1000);
            planMemoryCache[plan.key] = new Set(arr);
          }
        } catch (e) {
          // ignore network hiccups
        }
      }

      const prevState = _store.get('globalObserverState', {});
      const totalDetected = Number(prevState.detectedCount || 0) + detectedCount;

      _store.set('globalObserverState', {
        status: 'watching',
        enabled: true,
        lastCheckAt: Date.now(),
        detectedCount: totalDetected,
        detectedThisRun: detectedCount,
        message: `เฝ้าดู Server ปกติ (${getTargetWebsiteName()}) · ล่าสุดพบ ${detectedCount} การเปลี่ยนแปลง`,
        updatedAt: Date.now()
      });

      return { ok: true, detected: detectedCount };
    } catch (err) {
      _store.set('globalObserverState', {
        status: 'error',
        enabled: true,
        message: err.message || String(err),
        lastCheckAt: Date.now(),
        updatedAt: Date.now()
      });
      return { ok: false, error: err.message };
    }
  })().finally(() => {
    inFlightObserver = null;
  });

  return inFlightObserver;
}

function dispatchPlanNotification(planKey, item, settings) {
  const username = item.game_username || item.member?.game_username || item.username || '-';

  if (planKey === 'transactions-deposit') {
    if (settings.notifyDeposit === false) return;
    const rawStatus = String(item.status || '').toLowerCase();
    if (rawStatus && ['rejected', 'cancel', 'failed'].includes(rawStatus)) return;
    const amount = Number(item.amount || 0);
    const id = item.id || item.transaction_id || '';
    const notifKey = `deposit:${id}`;

    emitNotification({
      type: 'deposit',
      badge: '📥 ฝากเงิน',
      badgeColor: '#10b981',
      title: 'มีรายการฝากเงินเข้า',
      username,
      amount,
      detail: `ยูสเซอร์ ${username} ฝากเงิน ${amount.toLocaleString('th-TH')} บาท`,
      meta: item.method || 'ระบบออโต้',
      at: Date.now()
    }, notifKey);
  } else if (planKey === 'transactions-withdraw') {
    if (settings.notifyWithdraw === false) return;
    const rawStatus = String(item.status || '').toLowerCase();
    if (rawStatus && ['rejected', 'cancel', 'failed'].includes(rawStatus)) return;
    const amount = Number(item.amount || 0);
    const id = item.id || item.transaction_id || '';
    const notifKey = `withdraw:${id}`;

    emitNotification({
      type: 'withdraw',
      badge: '📤 ถอนเงิน',
      badgeColor: '#f59e0b',
      title: 'มีรายการขอถอนเงินใหม่',
      username,
      amount,
      detail: `ยูสเซอร์ ${username} ขอถอน ${amount.toLocaleString('th-TH')} บาท`,
      meta: item.status || 'รอดำเนินการ',
      at: Date.now()
    }, notifKey);
  } else if (planKey === 'credit-history') {
    const rawStatus = String(item.status || '').toLowerCase();
    if (rawStatus && ['rejected', 'cancel', 'failed'].includes(rawStatus)) return;
    const isManual = item.category === 'adjustment' || String(item.transaction_id || '').startsWith('manual_adjust:');
    const isBonus = !isManual && (item.category === 'bonus' || item.promotion_id != null);
    const id = item.id || item.transaction_id || '';

    if (isManual && settings.notifyManual !== false) {
      const isDeduct = /decrease|deduct/i.test(String(item.method || '')) ||
        String(item.direction || '') === 'out' ||
        (item.before_credit != null && item.after_credit != null && Number(item.before_credit) > Number(item.after_credit)) ||
        /ลดเครดิต|หักเครดิต|ดึงคืน|เข้าซ้ำ|ตัดยอด|ลดยอด/i.test(String(item.note || ''));
      const amount = Math.abs(Number(item.amount || 0));
      const notifKey = `manual:${id}`;

      emitNotification({
        type: 'manual',
        badge: isDeduct ? '⚡ ลดเครดิต' : '⚡ เติมเครดิต',
        badgeColor: isDeduct ? '#ef4444' : '#3b82f6',
        title: isDeduct ? 'มีการลดเครดิตแมนนวล' : 'มีการเติมเครดิตแมนนวล',
        username,
        amount,
        detail: `แอดมินปรับเครดิต ${isDeduct ? '-' : '+'}${amount.toLocaleString('th-TH')} บาท ให้ ${username}`,
        meta: item.note || 'แมนนวล',
        at: Date.now()
      }, notifKey);
    } else if (isBonus && settings.notifyBonus !== false) {
      const amount = Number(item.amount || 0);
      const notifKey = `bonus:${id}`;

      emitNotification({
        type: 'bonus',
        badge: '🎁 เติมโบนัส',
        badgeColor: '#8b5cf6',
        title: 'มีการรับโบนัส/โปรโมชั่น',
        username,
        amount,
        detail: `ยูสเซอร์ ${username} ได้รับโบนัส ${amount.toLocaleString('th-TH')} บาท`,
        meta: item.note || item.campaign_name || 'โบนัส',
        at: Date.now()
      }, notifKey);
    }
  } else if (planKey === 'reward-redeems') {
    if (settings.notifyBonus === false) return;
    const rawStatus = String(item.status || '').toLowerCase();
    if (rawStatus && ['rejected', 'cancel', 'failed'].includes(rawStatus)) return;
    const points = Number(item.points || 0);
    const credit = Number(item.credit_amount || 0);
    const id = item.id || item.redeem_id || '';
    const notifKey = `reward:${id}`;

    emitNotification({
      type: 'reward',
      badge: '💎 แลกแต้ม',
      badgeColor: '#06b6d4',
      title: 'มีรายการขอแลกแต้ม',
      username,
      amount: credit,
      detail: `ยูสเซอร์ ${username} แลก ${item.reward_name || 'แต้ม'} (${points.toLocaleString('th-TH')} แต้ม → ${credit.toLocaleString('th-TH')} เครดิต)`,
      meta: item.status || 'รออนุมัติ',
      at: Date.now()
    }, notifKey);
  } else if (planKey === 'admin-activity') {
    if (settings.notifyMemberEdit === false) return;
    if (item.status && Number(item.status) !== 200) return;
    const action = String(item.action || '');
    // Strictly exclude any login, approve, or reject actions
    if (/เข้าสู่ระบบ|login|auth|อนุมัติ|ปฏิเสธ/i.test(action)) return;

    const id = item.id || '';
    const notifKey = `admin_act:${id}`;

    if (/แก้ไข สมาชิก|แก้ไข บัญชีธนาคาร|รีเซ็ตรหัสผ่าน/i.test(action)) {
      emitNotification({
        type: 'member_edit',
        badge: '✏️ แก้ไขข้อมูล',
        badgeColor: '#ec4899',
        title: 'มีการแก้ไขข้อมูลสมาชิก',
        username: item.details?.username || item.details?.name || 'สมาชิก',
        amount: 0,
        detail: `${item.action || 'กิจกรรมแอดมิน'}: ${item.details?.description || item.details?.phone || item.action}`,
        meta: 'เครื่องอื่นในระบบ',
        at: Date.now()
      }, notifKey);
    }
  }
}

function recordObservation(plan, rows, durationMs = 120) {
  if (!rows || !rows.length) return;
  const history = _store.get('analyzerHistory', []) || [];
  history.unshift({
    endpointId: `GET ${plan.path}`,
    category: plan.key,
    detail: `${plan.label} (พบ ${rows.length} รายการใหม่)`,
    source: 'server_observer',
    at: Date.now()
  });
  _store.set('analyzerHistory', history.slice(0, 30));
}

function clearAnalyzerData() {
  cachedEndpoints = {};
  cachedMeta = { totalRequests: 0, endpointCount: 0, lastSeen: 0 };
  endpointsDirty = false;
  _store.set('analyzerEndpoints', {});
  _store.set('analyzerHistory', []);
  _store.set('analyzerMeta', { totalRequests: 0, endpointCount: 0, lastSeen: 0 });
  _store.set('globalObserverCache', { plans: {} });
  _store.set('globalObserverState', { status: 'idle', enabled: false, detectedCount: 0 });
  return { ok: true };
}

function setAnalyzerEnabled(enabled, observerEnabled = true, intervalSec = 15) {
  const cfg = {
    enabled: Boolean(enabled),
    globalObserverEnabled: Boolean(observerEnabled),
    globalObserverIntervalSec: intervalSec,
    updatedAt: Date.now()
  };
  _store.set('analyzerConfig', cfg);

  if (cfg.enabled && cfg.globalObserverEnabled) {
    startObserver(intervalSec);
  } else {
    stopObserver();
  }
  return { ok: true, config: cfg };
}

module.exports = {
  init,
  startObserver,
  stopObserver,
  runObserverTick,
  clearAnalyzerData,
  setAnalyzerEnabled,
  getTargetWebsiteId,
  getTargetWebsiteName
};
