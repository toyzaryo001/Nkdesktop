'use strict';

const { BrowserWindow, Notification } = require('electron');
const apiEngine = require('./api-engine');

let timer = null;
let inFlightPoll = null;
let approvalLedgerMutex = Promise.resolve();
let _store = null;
let withdrawMemorySeen = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function init(store) {
  _store = store;
  migrateApprovalLedger();
}

function getApprovalLedger() {
  const data = _store.get('withdrawApprovalLedger', {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function withApprovalLedgerLock(task) {
  const prev = approvalLedgerMutex;
  let release;
  approvalLedgerMutex = new Promise((resolve) => { release = resolve; });
  return prev.catch(() => {}).then(task).finally(() => { release(); });
}

function approvalLedgerId(item) {
  const id = String(item?.id || item?.transaction_id || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

function approvalFingerprint(item = {}) {
  return [
    approvalLedgerId(item),
    String(item.transaction_id || ''),
    String(item.game_username || item.member?.game_username || ''),
    Number(item.amount || 0).toFixed(2),
    String(item.requested_at || item.transaction_at || item.created_at || '')
  ].join('|');
}

async function migrateApprovalLedger() {
  return withApprovalLedgerLock(async () => {
    const ledger = getApprovalLedger();
    const now = Date.now();
    let changed = false;

    for (const [id, entry] of Object.entries(ledger)) {
      // Clear out entries that had errors so they don't block forever
      if (entry?.state === 'unknown' && (
        String(entry?.error || '').includes('CRS') ||
        String(entry?.error || '').includes('ไม่พบ') ||
        String(entry?.error || '').includes('Bank ID') ||
        String(entry?.error || '').includes('ไม่ได้เปิดการถอน') ||
        now - Number(entry?.updatedAt || 0) > 30 * 1000
      )) {
        delete ledger[id];
        changed = true;
        continue;
      }
      if (entry?.state === 'claimed' && now - Number(entry?.claimedAt || 0) > 5000) {
        delete ledger[id];
        changed = true;
      }
    }
    if (changed) {
      _store.set('withdrawApprovalLedger', ledger);
    }
    return ledger;
  });
}

async function claimWithdrawApproval(item) {
  const id = approvalLedgerId(item);
  if (!id) throw new Error(`Transaction ID ไม่ถูกต้อง: ${String(item?.id || '-')}`);

  return withApprovalLedgerLock(async () => {
    const ledger = getApprovalLedger();
    const existing = ledger[id];
    if (existing) {
      const now = Date.now();
      // Allow retry if previously failed with 'unknown' or expired claimed
      const isUnknown = existing.state === 'unknown';
      const isStaleClaim = existing.state === 'claimed' && (now - Number(existing.claimedAt || 0) > 5000);
      if (!isUnknown && !isStaleClaim) {
        return { ok: false, duplicate: true, entry: existing };
      }
    }

    const now = Date.now();
    const entry = {
      id,
      state: 'claimed',
      claimedAt: now,
      updatedAt: now,
      fingerprint: approvalFingerprint(item),
      transactionId: String(item?.transaction_id || ''),
      amount: Number(item?.amount || 0),
      username: String(item?.game_username || item?.member?.game_username || '')
    };
    ledger[id] = entry;
    _store.set('withdrawApprovalLedger', ledger);

    const verify = getApprovalLedger();
    if (!verify[id] || verify[id].fingerprint !== entry.fingerprint) {
      throw new Error(`ไม่สามารถยืนยันล็อกกันส่งซ้ำของ #${id} ได้ · ยกเลิกการส่งเพื่อความปลอดภัย`);
    }
    return { ok: true, entry };
  });
}

async function updateApprovalLedgerState(itemOrId, state, extra = {}) {
  const id = typeof itemOrId === 'string' ? String(itemOrId) : approvalLedgerId(itemOrId);
  if (!id) return null;

  return withApprovalLedgerLock(async () => {
    const ledger = getApprovalLedger();
    const old = ledger[id] || { id, claimedAt: Date.now(), fingerprint: typeof itemOrId === 'object' ? approvalFingerprint(itemOrId) : '' };
    ledger[id] = { ...old, ...extra, id, state, updatedAt: Date.now() };
    _store.set('withdrawApprovalLedger', ledger);
    return ledger[id];
  });
}

function isPendingWithdraw(tx) {
  // Support multiple field names returned by different API versions: type, category, transaction_type, direction
  const typeStr = String(tx?.type || tx?.category || tx?.transaction_type || '').toLowerCase();
  const dirStr = String(tx?.direction || '').toLowerCase();
  const isWithdraw = typeStr === 'withdraw' || typeStr === 'out' || dirStr === 'out';
  const status = String(tx?.status || tx?.raw_status || '').toLowerCase();
  return isWithdraw && /pending|new|wait|รอดำเนินการ|processing/.test(status);
}

function isCrsManagedWithdraw(tx) {
  if (tx?.approved_at || tx?.approvedAt || tx?.approve_at) return true;
  if (tx?.processed_at || tx?.processedAt) return true;
  if (tx?.via_crs === true || tx?.bank?.is_crs) return true;
  const rawStatus = String(tx?.raw_status || '').toUpperCase();
  if (rawStatus === 'PAYGATE_SENT' || rawStatus === 'PAYGATE_UNKNOWN' || rawStatus === 'EXTERNAL_CLAIMED' || rawStatus === 'EXTERNAL_UNKNOWN') return true;
  if (rawStatus === 'P2P_OPEN' || rawStatus === 'P2P_CLOSING') return true;
  if (tx?.autopeer_withdraw?.state === 'matching' || tx?.autopeer_withdraw?.state === 'stuck') return true;

  const note = String(tx?.note || '').toLowerCase();
  if (note.includes('ส่งเข้าคิว') || note.includes('รอเจ้าหน้าที่โอน') || note.includes('ส่งให้ crs') || note.includes('รอเปเม้น') || note.includes('รอ crs')) return true;
  return false;
}

async function fetchPendingWithdrawals(context, limit = 200) {
  const pending = [];
  let page = 1;
  let totalPages = 1;

  do {
    const payload = await apiEngine.apiFetchJson('/transactions', {
      type: 'withdraw',
      page,
      limit,
      website_id: context.websiteId,
      website_agent_id: context.agentId || undefined,
      status: 'pending',
      sort: 'transaction_at',
      order: 'desc'
    });
    const all = apiEngine.apiDataArray(payload);
    pending.push(...all.filter(isPendingWithdraw));
    const paging = apiEngine.apiPagination(payload, page, limit, all.length);
    totalPages = paging.totalPages || (all.length < limit ? page : page + 1);
    if (all.length < limit) break;
    page++;
  } while (page <= totalPages && page <= 20);

  const crs = [];
  const actionable = [];
  for (const tx of pending) {
    if (isCrsManagedWithdraw(tx)) crs.push(tx);
    else actionable.push(tx);
  }
  return { pending, actionable, crs };
}

async function resolveWithdrawCrsBank(context) {
  const websiteId = Number(context?.websiteId || 0);
  if (!websiteId) throw new Error('ไม่พบ Website ID สำหรับเลือกบัญชี CRS ถอน');

  // 1. Check if we have a manualApproveCapture from webview
  const manualCapture = _store.get('manualApproveCapture', null);
  const learnedBankId = Number(manualCapture?.request?.body?.bank_id || 0);

  // 2. Check cached in store
  const cached = _store.get('withdrawCrsBankCache', null);

  // 3. Fetch banks from API
  let banks = [];
  try {
    const payload = await apiEngine.apiFetchJson('/banks', { pageSize: 1000, website_id: websiteId }, { retries: 2 });
    banks = apiEngine.apiDataArray(payload);
  } catch (e) {
    if (learnedBankId > 0) return { id: learnedBankId, websiteId, updatedAt: Date.now() };
    if (cached && Number(cached.id) > 0) return cached;
    throw e;
  }

  const sameSiteBanks = banks.filter((b) => !Number(b?.website_id) || Number(b.website_id) === websiteId);

  // Priority 1: Learned bank from manual approve in BackOffice webview
  if (learnedBankId > 0) {
    const found = sameSiteBanks.find((x) => Number(x?.id) === learnedBankId);
    const selected = {
      id: learnedBankId,
      websiteId,
      code: String(found?.code || cached?.code || ''),
      account: String(found?.account || cached?.account || ''),
      name: found ? [found.first_name, found.last_name].filter(Boolean).join(' ').trim() : String(cached?.name || ''),
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Priority 2: Bank explicitly marked with is_crs
  const crsCandidates = sameSiteBanks.filter((b) => b?.is_crs && b?.is_enable !== false && b?.is_display !== false);
  if (crsCandidates.length > 0) {
    const bank = crsCandidates.find((b) => b?.is_withdraw) || crsCandidates[0];
    const selected = {
      id: Number(bank.id),
      websiteId,
      code: String(bank.code || ''),
      account: String(bank.account || ''),
      name: [bank.first_name, bank.last_name].filter(Boolean).join(' ').trim(),
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Priority 3: Existing cached bank (e.g. Bank 58 verified from analyzer file)
  if (cached && Number(cached.websiteId) === websiteId && Number(cached.id) > 0) {
    cached.updatedAt = Date.now();
    _store.set('withdrawCrsBankCache', cached);
    return cached;
  }

  // Priority 4: Bank marked with is_withdraw
  const withdrawCandidates = sameSiteBanks.filter((b) => b?.is_withdraw && b?.is_enable !== false && b?.is_display !== false);
  if (withdrawCandidates.length > 0) {
    const bank = withdrawCandidates[0];
    const selected = {
      id: Number(bank.id),
      websiteId,
      code: String(bank.code || ''),
      account: String(bank.account || ''),
      name: [bank.first_name, bank.last_name].filter(Boolean).join(' ').trim(),
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Priority 5: Active website banks (is_enable !== false and is_display !== false)
  const activeCandidates = sameSiteBanks.filter((b) => b?.is_enable !== false && b?.is_display !== false);
  if (activeCandidates.length > 0) {
    const bank = activeCandidates[0];
    const selected = {
      id: Number(bank.id),
      websiteId,
      code: String(bank.code || ''),
      account: String(bank.account || ''),
      name: [bank.first_name, bank.last_name].filter(Boolean).join(' ').trim(),
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Priority 6: Any bank returned for this website
  if (sameSiteBanks.length > 0) {
    const bank = sameSiteBanks[0];
    const selected = {
      id: Number(bank.id),
      websiteId,
      code: String(bank.code || ''),
      account: String(bank.account || ''),
      name: [bank.first_name, bank.last_name].filter(Boolean).join(' ').trim(),
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Priority 4: Default fallback for Website 13 (Bank 58 KTB บจก.เอทีพี from analyzer file)
  if (websiteId === 13) {
    const selected = {
      id: 58,
      websiteId: 13,
      code: 'KTB',
      account: '0170749339',
      name: 'บจก.เอทีพี',
      updatedAt: Date.now()
    };
    _store.set('withdrawCrsBankCache', selected);
    return selected;
  }

  // Default: ส่งเข้าคิว CRS โดยตรง (ไม่จำเป็นต้องเลือกบัญชีโอนเอง)
  return { id: 0, websiteId, code: 'CRS', account: '', name: 'CRS Gateway' };
}

async function approveWithdrawTransaction(item, crsBank = null, provider = 'crs') {
  const id = approvalLedgerId(item);
  if (!id) throw new Error(`Transaction ID ไม่ถูกต้อง: ${String(item?.id || '-')}`);

  // ระบบส่งเข้าเกตเวย์ (Paygate: SwiftPay หรือ CRS) ตรงตาม Nuxt BackOffice หน้าเว็บ
  // endpoint: POST /transactions/:id/approve
  // payload: { id: Number(id), payout_method: "paygate", provider: "swiftpay" | "crs", note: "" }
  const effectiveProvider = String(provider || 'crs').toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs';
  const body = {
    id: Number(id),
    payout_method: 'paygate',
    provider: effectiveProvider,
    note: ''
  };

  const payload = await apiEngine.apiFetchJson(`/transactions/${encodeURIComponent(id)}/approve`, {}, {
    method: 'POST',
    body,
    retries: 0
  });
  return { payload, requestBody: body, provider: effectiveProvider };
}

async function verifyWithdrawApproval(item, context, attempts = 4) {
  const id = approvalLedgerId(item);
  if (!id) return { ok: false, reason: 'invalid-id' };
  const waits = [200, 400, 700, 1000];
  const count = Math.min(waits.length, Number(attempts) || 4);

  for (let i = 0; i < count; i++) {
    await sleep(waits[i]);
    try {
      const queue = await fetchPendingWithdrawals(context, 200);
      const row = queue.pending.find((tx) => approvalLedgerId(tx) === id);
      if (!row) return { ok: true, reason: 'left-pending-queue' };
      if (isCrsManagedWithdraw(row)) {
        return {
          ok: true,
          reason: 'server-approved',
          approvedAt: row.approved_at || row.approvedAt || '',
          processedAt: row.processed_at || row.processedAt || ''
        };
      }
    } catch {}
  }
  return { ok: true, reason: 'sent-to-crs-queue' };
}

function shouldNotifyWithdraw(id) {
  if (!id || !_store) return false;
  if (!_store.get('session.loggedIn')) return false;
  const key = `withdraw:${id}`;
  const notified = new Set(_store.get('notifiedTransactionKeys', []));
  if (notified.has(key)) return false;
  notified.add(key);
  const arr = Array.from(notified);
  _store.set('notifiedTransactionKeys', arr.length > 5000 ? arr.slice(-5000) : arr);
  return true;
}

const recentBankChanges = new Map(); // memberId -> { prevBank, newBank, at }
const recentWithdrawals = new Map(); // username -> [{ id, at, amount, ip }]
const recentIps = new Map(); // ip -> Set of usernames

function recordBankChange(memberIdOrUsername, prevBank, newBank, at = Date.now()) {
  if (!memberIdOrUsername) return;
  const timeMs = typeof at === 'number' ? at : new Date(at).getTime() || Date.now();
  const entry = {
    prevBank: String(prevBank || '').trim(),
    newBank: String(newBank || '').trim(),
    at: timeMs
  };
  const key = String(memberIdOrUsername).trim().toLowerCase();
  recentBankChanges.set(key, entry);
  if (!isNaN(Number(memberIdOrUsername))) {
    recentBankChanges.set(Number(memberIdOrUsername), entry);
  }
}

function parseTimestampMs(raw) {
  if (!raw) return Date.now();
  if (typeof raw === 'number') return raw;
  let ms = new Date(raw).getTime();
  if (isNaN(ms) && typeof raw === 'string' && raw.includes(' ')) {
    ms = new Date(raw.replace(' ', 'T')).getTime();
  }
  return isNaN(ms) || !ms ? Date.now() : ms;
}

function recordWithdrawal(username, id, amount, ip, at = Date.now()) {
  if (!username) return;
  const uname = String(username).trim().toLowerCase();
  const idStr = String(id || '').trim();
  if (!idStr) return;
  const timeMs = parseTimestampMs(at);
  const list = recentWithdrawals.get(uname) || [];
  const existingIdx = list.findIndex(w => String(w.id) === idStr);
  if (existingIdx >= 0) {
    list[existingIdx] = { id: idStr, at: timeMs, amount: Number(amount || 0), ip: String(ip || '') };
  } else {
    list.push({ id: idStr, at: timeMs, amount: Number(amount || 0), ip: String(ip || '') });
  }
  const oneHourAgo = Date.now() - 3600000;
  recentWithdrawals.set(uname, list.filter(w => w.at > oneHourAgo));

  if (ip && ip !== '127.0.0.1' && ip !== '::1') {
    const users = recentIps.get(ip) || new Set();
    users.add(uname);
    recentIps.set(ip, users);
  }
}

function evaluateWithdrawRisk(tx) {
  const memberId = Number(tx.member_id || tx.member?.id || 0);
  const username = String(tx.game_username || tx.member?.game_username || tx.username || tx.member?.username || '').trim().toLowerCase();
  const txId = String(tx.id || tx.transaction_id || '').trim();
  const amount = Number(tx.amount || 0);
  const clientIp = String(tx.client_ip || tx.ip || tx.member?.client_ip || '').trim();
  const txTime = parseTimestampMs(tx.requested_at || tx.transaction_at || tx.created_at || tx.at);

  const settings = _store ? _store.get('settings', {}) : {};
  const largeAmountThreshold = Number(settings.riskLargeAmount || 10000);

  const riskFlags = {
    level: 'normal', // 'normal' | 'warning' | 'critical'
    badge: '',
    summary: '',
    reasons: [],
    bankChangedRecently: false,
    bankChangeInfo: null,
    isLargeAmount: false,
    isRapidRepeat: false,
    sharedIp: false,
    sharedWithUsers: []
  };

  // 1. Bank changed within 24 hours (< 86,400,000 ms)
  let bankChange = null;
  if (memberId && recentBankChanges.has(memberId)) {
    bankChange = recentBankChanges.get(memberId);
  } else if (username && recentBankChanges.has(username)) {
    bankChange = recentBankChanges.get(username);
  }

  if (bankChange) {
    const diffMs = txTime - bankChange.at;
    if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
      riskFlags.bankChangedRecently = true;
      riskFlags.bankChangeInfo = bankChange;
      riskFlags.level = 'critical';
      riskFlags.reasons.push(`เพิ่งเปลี่ยนบัญชี (${bankChange.prevBank || 'เดิม'} ➔ ${bankChange.newBank}) เมื่อ ${Math.max(1, Math.round(diffMs / 60000))} นาทีที่แล้ว`);
    }
  }

  // 2. Large withdrawal amount
  if (amount >= largeAmountThreshold) {
    riskFlags.isLargeAmount = true;
    if (riskFlags.level !== 'critical') riskFlags.level = 'warning';
    riskFlags.reasons.push(`ถอนยอดใหญ่ ฿${amount.toLocaleString('th-TH')} (เกณฑ์ ฿${largeAmountThreshold.toLocaleString('th-TH')})`);
  }

  // 3. Rapid repeat withdrawal (strictly within 5 minutes = 300,000 ms)
  if (username && recentWithdrawals.has(username)) {
    const list = recentWithdrawals.get(username);
    const matches = list.filter(w => {
      const wId = String(w.id || '').trim();
      if (txId && wId && txId === wId) return false;
      const diffMs = Math.abs(txTime - w.at);
      return diffMs <= 5 * 60 * 1000;
    });

    if (matches.length >= 1) {
      riskFlags.isRapidRepeat = true;
      if (riskFlags.level !== 'critical') riskFlags.level = 'warning';
      const minDiffMs = Math.min(...matches.map(w => Math.abs(txTime - w.at)));
      const minDiffMin = Math.max(1, Math.round(minDiffMs / 60000));
      riskFlags.reasons.push(`ยื่นถอนซ้ำ ${matches.length + 1} ครั้งใน 5 นาที (ห่างกัน ~${minDiffMin} นาที)`);
    }
  }

  // Auto-record this withdrawal to track subsequent repeats
  if (username && txId) {
    recordWithdrawal(username, txId, amount, clientIp, txTime);
  }

  // 4. Shared IP check
  if (clientIp && recentIps.has(clientIp)) {
    const users = Array.from(recentIps.get(clientIp)).filter(u => u !== username);
    if (users.length > 0) {
      riskFlags.sharedIp = true;
      riskFlags.sharedWithUsers = users;
      if (riskFlags.level !== 'critical') riskFlags.level = 'warning';
      riskFlags.reasons.push(`IP (${clientIp}) ซ้ำกับ ${users.slice(0, 3).join(', ')}`);
    }
  }

  // 5. Payment Gateway returned / rejected check
  const noteStr = String(tx.note || '').toLowerCase();
  const rawStatusStr = String(tx.raw_status || '').toLowerCase();
  const isPaymentReturned = noteStr.includes('swiftpay') || noteStr.includes('paygate') || noteStr.includes('เปเม้น') || noteStr.includes('ปฏิเสธ') || noteStr.includes('ล้มเหลว') || rawStatusStr.includes('failed') || rawStatusStr.includes('reject');

  if (isPaymentReturned) {
    riskFlags.isPaymentReturned = true;
    riskFlags.paymentReturnReason = tx.note || 'Payment ปฏิเสธการจ่ายเงิน';
  }

  // Summarize badge and summary text
  if (riskFlags.level === 'critical') {
    riskFlags.badge = '⚠️ เสี่ยงสูง: เพิ่งเปลี่ยนบัญชี!';
    riskFlags.summary = riskFlags.reasons.join(' | ');
  } else if (riskFlags.level === 'warning') {
    riskFlags.badge = riskFlags.isLargeAmount ? `⚠️ ถอนยอดใหญ่ (฿${amount.toLocaleString('th-TH')})` : `⚠️ ${riskFlags.reasons[0] || 'ควรตรวจสอบ'}`;
    riskFlags.summary = riskFlags.reasons.join(' | ');
  } else if (isPaymentReturned) {
    riskFlags.badge = '🔄 เปเม้นส่งกลับ (ส่ง CRS)';
    riskFlags.summary = tx.note ? `Payment ปฏิเสธ: ${tx.note}` : 'Payment ปฏิเสธ ส่งต่อให้ CRS โอน';
  }

  return riskFlags;
}

function notifyWithdrawPending(item) {
  if (!_store || !_store.get('session.loggedIn')) return;
  const settings = _store.get('settings', {});
  if (settings.notifyWithdraw === false) return;

  const id = String(item.id || item.transaction_id || '');
  if (!id || !shouldNotifyWithdraw(id)) return;

  const loginTime = Number(_store.get('session.loginTime') || 0);
  const rawTime = item.requested_at || item.transaction_at || item.created_at;
  if (rawTime && loginTime > 0) {
    let itemTime = new Date(rawTime).getTime();
    if (isNaN(itemTime) && String(rawTime).includes(' ')) {
      itemTime = new Date(String(rawTime).replace(' ', 'T')).getTime();
    }
    if (!isNaN(itemTime) && itemTime > 0 && itemTime <= loginTime) return;
  }

  const username = item.game_username || item.member?.game_username || '-';
  const amountNum = Number(item.amount || 0);
  const phone = apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') || '-';
  const riskFlags = evaluateWithdrawRisk(item);

  const isCritical = riskFlags.level === 'critical';
  const isWarning = riskFlags.level === 'warning';
  const badge = isCritical ? '🚨 เสี่ยงสูง: ถอนเงิน' : (isWarning ? '⚠️ เตือน: ถอนเงิน' : '📤 ถอนเงิน');
  const badgeColor = isCritical ? '#ef4444' : (isWarning ? '#f97316' : '#f59e0b');
  const toneType = isCritical ? 'high_risk' : 'withdraw';

  let detailMsg = `ยูสเซอร์ ${username} ขอถอน ${amountNum.toLocaleString('th-TH')} บาท`;
  if (riskFlags.summary) {
    detailMsg += ` · ${riskFlags.summary}`;
  }

  if (Notification.isSupported() && settings.osNotification !== false) {
    new Notification({
      title: isCritical ? `🚨 เสี่ยงสูง! รายการถอน #${id}` : (id ? `รายการถอนรอดำเนินการ #${id}` : 'รายการถอนรอดำเนินการ'),
      body: `${username} · ${amountNum.toLocaleString('th-TH')} บาท · ${riskFlags.summary || phone}`,
      silent: true
    }).show();
  }

  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('app-notification', {
        type: 'withdraw',
        tone: toneType,
        isHighRisk: isCritical,
        riskFlags,
        badge,
        badgeColor,
        title: isCritical ? `🚨 ตรวจพบความเสี่ยงสูง! รายการถอน #${id}` : (id ? `รายการถอนรอดำเนินการ #${id}` : 'รายการถอนรอดำเนินการ'),
        username,
        amount: amountNum,
        detail: detailMsg,
        meta: phone,
        at: Date.now()
      });
    }
  }

  const alerts = _store.get('withdrawAlerts', []) || [];
  alerts.unshift({ id, username, amount: amountNum, phone, type: item.method || '-', riskFlags, at: Date.now() });
  _store.set('withdrawAlerts', alerts.slice(0, 100));
}

async function autoApproveWithdrawals(items, maxPerCycle = 30, context = null, provider = 'crs') {
  await migrateApprovalLedger();
  let ledger = getApprovalLedger();
  const effectiveProvider = String(provider || 'crs').toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs';
  const providerLabel = effectiveProvider === 'swiftpay' ? 'SwiftPay' : 'CRS';
  const queue = [...items]
    .filter((x) => {
      const id = approvalLedgerId(x);
      return id && !ledger[id];
    })
    .slice(0, Math.max(1, Math.min(100, Number(maxPerCycle) || 30)));

  const approved = [];
  const uncertain = [];
  const skippedDuplicate = [];

  let crsBank = null;
  if (queue.length && effectiveProvider === 'crs') {
    crsBank = await resolveWithdrawCrsBank(context || await apiEngine.getApiBusinessContext());
  }

  for (const item of queue) {
    const id = approvalLedgerId(item);
    ledger = getApprovalLedger();
    if (ledger[id]) {
      skippedDuplicate.push({ id, item, entry: ledger[id] });
      continue;
    }

    let claim;
    try {
      claim = await claimWithdrawApproval(item);
      if (!claim.ok) {
        skippedDuplicate.push({ id, item, entry: claim.entry });
        continue;
      }

      _store.set('withdrawState', {
        ..._store.get('withdrawState', {}),
        status: 'working',
        working: true,
        currentId: id,
        message: `กำลังอนุมัติ #${id} ส่ง ${providerLabel} (${Number(item.amount || 0).toLocaleString('th-TH')} บาท)...`,
        updatedAt: Date.now()
      });

      const sent = await approveWithdrawTransaction(item, crsBank, effectiveProvider);
      const verify = await verifyWithdrawApproval(item, context || await apiEngine.getApiBusinessContext(), 3);

      await updateApprovalLedgerState(item, 'confirmed', {
        confirmedAt: Date.now(),
        provider: effectiveProvider,
        verifyReason: String(verify?.reason || 'server-sent-ok')
      });

      const logs = _store.get('withdrawApprovalLog', []) || [];
      logs.unshift({
        id,
        username: item.game_username || item.member?.game_username || '-',
        amount: Number(item.amount || 0),
        provider: effectiveProvider,
        at: Date.now(),
        ok: true
      });
      _store.set('withdrawApprovalLog', logs.slice(0, 200));

      if (Notification.isSupported()) {
        new Notification({
          title: `อนุมัติถอนสำเร็จ #${id} (${providerLabel})`,
          body: `${item.game_username || '-'} · ${Number(item.amount || 0).toLocaleString('th-TH')} บาท`
        }).show();
      }

      approved.push({ id, item, provider: effectiveProvider });
      await sleep(150);
    } catch (error) {
      uncertain.push({ id, item, error });
      if (claim?.ok) {
        await updateApprovalLedgerState(item, 'unknown', { error: error.message, uncertainAt: Date.now() });
      }
      break;
    }
  }
  return { approved, uncertain, skippedDuplicate };
}

async function pollWithdrawApi() {
  if (inFlightPoll) return inFlightPoll;

  inFlightPoll = (async () => {
    if (!_store || !_store.get('session.loggedIn')) {
      stop();
      return { ok: false, loggedOut: true };
    }
    const cfg = _store.get('withdrawConfig', { active: false, intervalSec: 5, minAmount: 0, maxAmount: 5000, autoApprove: false, provider: 'crs' });
    if (!cfg.active) return { ok: false, inactive: true };

    const intervalSec = Math.max(3, Math.min(3600, Math.floor(Number(cfg.intervalSec) || 5)));
    const minAmount = Number(cfg.minAmount) >= 0 ? Number(cfg.minAmount) : 0;
    const maxAmount = Number(cfg.maxAmount) > 0 ? Number(cfg.maxAmount) : 5000;
    const autoApprove = Boolean(cfg.autoApprove);
    const provider = String(cfg.provider || 'crs').toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs';
    const lastCheckAt = Date.now();

    try {
      const context = await apiEngine.getApiBusinessContext();
      const queue = await fetchPendingWithdrawals(context, 200);
      const pending = queue.pending;
      const actionable = queue.actionable;
      const crs = queue.crs;

      const ledger = getApprovalLedger();
      const lockedIds = new Set(
        Object.entries(ledger)
          .filter(([_, v]) => v?.state === 'confirmed' || v?.state === 'rejected' || (v?.state === 'claimed' && Date.now() - Number(v?.claimedAt || 0) <= 10000))
          .map(([k]) => k)
      );
      const ledgerUnknownCount = Object.values(ledger).filter((x) => x?.state === 'unknown' && Date.now() - Number(x?.updatedAt || 0) <= 60000).length;

      let effectiveAutoApprove = autoApprove && ledgerUnknownCount === 0;
      if (autoApprove && !effectiveAutoApprove) {
        _store.set('withdrawConfig', { ...cfg, autoApprove: false, safetyStopped: true });
      }

      const eligible = actionable.filter((x) => {
        const id = approvalLedgerId(x);
        const rf = evaluateWithdrawRisk(x);
        // SAFETY: Never auto-approve critical risk items (e.g. bank changed <24h) or items exceeding threshold
        if (rf.level === 'critical' || rf.isLargeAmount) return false;
        const amt = Number(x.amount);
        const isWithinRange = Number.isFinite(amt) && amt > 0 && amt >= minAmount && amt <= maxAmount;
        return id && !lockedIds.has(id) && isWithinRange;
      });

      const loginTime = Number(_store.get('session.loginTime') || 0);
      const currentActionableIds = actionable.map((x) => String(x.id || x.transaction_id || '')).filter(Boolean);

      // On first run after login: seed memory seen with all current actionable IDs without notifying
      if (withdrawMemorySeen === null) {
        withdrawMemorySeen = new Set(currentActionableIds);
        _store.set('withdrawSeen', currentActionableIds.slice(0, 1000));
      }

      const newItems = actionable.filter((x) => {
        const idStr = String(x.id || x.transaction_id || '');
        if (!idStr || withdrawMemorySeen.has(idStr)) return false;

        // Strict timestamp check: DO NOT notify items that occurred before or at login
        const rawTime = x.requested_at || x.transaction_at || x.created_at;
        if (rawTime && loginTime > 0) {
          let itemTime = new Date(rawTime).getTime();
          if (isNaN(itemTime) && String(rawTime).includes(' ')) {
            itemTime = new Date(String(rawTime).replace(' ', 'T')).getTime();
          }
          if (!isNaN(itemTime) && itemTime > 0 && itemTime <= loginTime) {
            withdrawMemorySeen.add(idStr);
            return false;
          }
        }
        return true;
      });

      let approval = { approved: [], uncertain: [], skippedDuplicate: [] };
      let approvalError = null;
      if (effectiveAutoApprove && eligible.length) {
        try {
          approval = await autoApproveWithdrawals(eligible, 30, context, provider);
        } catch (approveErr) {
          approvalError = approveErr?.message || String(approveErr);
          // Don't crash the poll — just report error in status message
        }
      } else {
        const settings = _store.get('settings', {});
        if (settings.notifyWithdraw !== false) {
          for (const item of newItems.slice(0, 10)) {
            notifyWithdrawPending(item);
          }
        }
      }

      for (const item of actionable) {
        const idStr = String(item.id || item.transaction_id || '');
        if (idStr) withdrawMemorySeen.add(idStr);
        recordWithdrawal(
          item.game_username || item.member?.game_username || item.username,
          item.id || item.transaction_id,
          item.amount,
          item.client_ip || item.ip,
          item.requested_at || item.transaction_at || item.created_at
        );
      }
      _store.set('withdrawSeen', Array.from(withdrawMemorySeen).slice(-1000));

      const approvedThisCycle = approval.approved.length;
      const uncertainCount = approval.uncertain.length;

      const message = approvalError
        ? `⚠️ Auto Approve ล้มเหลว: ${approvalError} · มีรายการรอ ${actionable.length} รายการ`
        : uncertainCount
          ? `หยุด Auto Approve เพื่อความปลอดภัย · มี ${uncertainCount} รายการไม่แน่ชัด`
          : approvedThisCycle
            ? `อนุมัติสำเร็จ ${approvedThisCycle} รายการ · ส่งต่อ CRS แล้ว`
            : actionable.length
              ? `รออนุมัติ ${actionable.length} รายการ (ตามยอด ${eligible.length}) · CRS รับช่วง ${crs.length}`
              : crs.length
                ? `ไม่มีรายการรออนุมัติ · CRS กำลังทำรายการ ${crs.length} รายการ`
                : 'Standby · ไม่มีรายการถอนใหม่';

      const nextState = {
        status: actionable.length || uncertainCount ? 'pending' : 'monitoring',
        monitoring: true,
        working: false,
        currentId: '',
        pendingCount: actionable.length,
        eligibleCount: eligible.length,
        crsCount: crs.length,
        rawPendingCount: pending.length,
        overLimitCount: actionable.filter((x) => Number(x.amount) > maxAmount).length,
        underLimitCount: actionable.filter((x) => Number(x.amount) < minAmount).length,
        approvedThisCycle,
        lastCheckAt,
        nextCheckAt: lastCheckAt + intervalSec * 1000,
        currentItems: actionable.slice(0, 30).map((x) => {
          const rf = evaluateWithdrawRisk(x);
          return {
            id: x.id || x.transaction_id || '',
            memberId: x.member_id || x.member?.id || '',
            username: x.game_username || x.member?.game_username || '-',
            name: x.fullname || x.name || x.member?.fullname || x.member?.name || '-',
            amount: Number(x.amount || 0),
            bankCode: x.to_bank_code || x.from_bank_code || x.method || '',
            bankNumber: x.to_bank_number || x.from_bank_number || '',
            clientIp: x.client_ip || x.ip || '',
            requestedAt: x.requested_at || x.transaction_at || x.created_at || '',
            note: String(x.note || ''),
            rawStatus: String(x.raw_status || ''),
            isPaymentReturned: Boolean(rf?.isPaymentReturned),
            riskFlags: rf
          };
        }),
        crsItems: crs.slice(0, 30).map((x) => ({
          id: x.id || x.transaction_id || '',
          memberId: x.member_id || x.member?.id || '',
          username: x.game_username || x.member?.game_username || '-',
          name: x.fullname || x.name || x.member?.fullname || x.member?.name || '-',
          amount: Number(x.amount || 0),
          bankCode: x.to_bank_code || x.from_bank_code || x.method || '',
          bankNumber: x.to_bank_number || x.from_bank_number || '',
          note: String(x.note || ''),
          rawStatus: String(x.raw_status || '')
        })),
        message,
        intervalSec,
        minAmount,
        maxAmount,
        autoApprove: effectiveAutoApprove,
        provider,
        updatedAt: Date.now()
      };
      _store.set('withdrawState', nextState);
      return { ok: true, ...nextState };
    } catch (error) {
      // Preserve existing items so the table doesn't go blank on error
      const prevState = _store.get('withdrawState', {});
      _store.set('withdrawState', {
        ...prevState,
        status: 'error',
        monitoring: true,
        working: false,
        message: `⚠️ ${error?.message || String(error)}`,
        lastCheckAt,
        nextCheckAt: lastCheckAt + intervalSec * 1000,
        intervalSec,
        minAmount,
        maxAmount,
        autoApprove,
        provider,
        updatedAt: Date.now()
        // currentItems, pendingCount, crsItems are preserved from prevState spread above
      });
      return { ok: false, error: error?.message || String(error) };
    }
  })();

  try { return await inFlightPoll; } finally { inFlightPoll = null; }
}

async function manualApproveWithdraw(itemOrId, provider = 'crs') {
  const id = typeof itemOrId === 'string' || typeof itemOrId === 'number' ? String(itemOrId) : approvalLedgerId(itemOrId);
  if (!id) throw new Error('Transaction ID ไม่ถูกต้อง');

  let item = typeof itemOrId === 'object' && itemOrId !== null ? itemOrId : null;
  if (!item) {
    const state = _store.get('withdrawState', {});
    item = (state.currentItems || []).find(x => String(x.id) === id) || { id };
  }

  const claim = await claimWithdrawApproval(item);
  if (!claim.ok) {
    throw new Error(`รายการ #${id} อยู่ระหว่างดำเนินการหรือเคยอนุมัติแล้ว (${claim.entry?.state || 'duplicate'})`);
  }

  const effectiveProvider = String(provider || 'crs').toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs';
  const providerLabel = effectiveProvider === 'swiftpay' ? 'SwiftPay' : 'CRS';

  try {
    const crsBank = effectiveProvider === 'crs'
      ? await resolveWithdrawCrsBank(await apiEngine.getApiBusinessContext()).catch(() => null)
      : null;
    const sent = await approveWithdrawTransaction(item, crsBank, effectiveProvider);
    const verify = await verifyWithdrawApproval(item, await apiEngine.getApiBusinessContext(), 3);

    await updateApprovalLedgerState(item, 'confirmed', {
      confirmedAt: Date.now(),
      method: 'manual',
      provider: effectiveProvider,
      verifyReason: String(verify?.reason || 'manual-sent-ok')
    });
    // Trigger tick to refresh tables
    pollWithdrawApi();
    return { ok: true, id, provider: effectiveProvider, message: `อนุมัติ #${id} สำเร็จ ส่งต่อให้ ${providerLabel} แล้ว` };
  } catch (err) {
    await updateApprovalLedgerState(item, 'unknown', { error: err.message });
    throw err;
  }
}

async function manualRejectWithdraw(txId, note = '') {
  const id = String(txId || '').trim();
  if (!id) throw new Error('Transaction ID ไม่ถูกต้อง');

  const claim = await claimWithdrawApproval({ id });
  if (!claim.ok && claim.entry?.state !== 'claimed') {
    if (claim.entry?.state === 'confirmed' || claim.entry?.state === 'rejected') {
      throw new Error(`รายการ #${id} อยู่ในสถานะ ${claim.entry.state} แล้ว`);
    }
  }

  try {
    const res = await apiEngine.rejectTransaction(id, note);
    await updateApprovalLedgerState(id, 'rejected', {
      rejectedAt: Date.now(),
      note,
      method: 'manual'
    });
    // Trigger tick to refresh tables
    pollWithdrawApi();
    return { ok: true, id, message: `ปฏิเสธรายการ #${id} สำเร็จ` };
  } catch (err) {
    await updateApprovalLedgerState(id, 'unknown', { error: err.message });
    throw err;
  }
}

function start(config = {}) {
  stop();
  if (!_store || !_store.get('session.loggedIn')) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' };
  withdrawMemorySeen = null;

  const intervalSec = Math.max(3, Math.min(3600, Math.floor(Number(config.intervalSec) || 5)));
  const minAmount = Number(config.minAmount) >= 0 ? Number(config.minAmount) : 0;
  const maxAmount = Number(config.maxAmount) > 0 ? Number(config.maxAmount) : 5000;
  const autoApprove = Boolean(config.autoApprove);
  const provider = String(config.provider || 'crs').toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs';

  _store.set('withdrawConfig', {
    active: true,
    intervalSec,
    minAmount,
    maxAmount,
    autoApprove,
    provider,
    updatedAt: Date.now()
  });

  _store.set('withdrawState', {
    status: 'starting',
    monitoring: true,
    working: false,
    message: 'กำลังเริ่ม Standby Monitor (ตรวจจับเรียลไทม์)...',
    intervalSec,
    minAmount,
    maxAmount,
    autoApprove,
    provider,
    updatedAt: Date.now()
  });

  pollWithdrawApi();
  timer = setInterval(() => {
    pollWithdrawApi();
  }, intervalSec * 1000);

  return { ok: true, active: true, intervalSec, minAmount, maxAmount, autoApprove, provider };
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  withdrawMemorySeen = null;
  const old = _store.get('withdrawConfig', {});
  _store.set('withdrawConfig', { ...old, active: false, updatedAt: Date.now() });
  _store.set('withdrawState', {
    status: 'stopped',
    monitoring: false,
    working: false,
    message: 'Standby ถอนเงินหยุดแล้ว',
    updatedAt: Date.now()
  });
  return { ok: true };
}

function updateConfig(newConfig = {}) {
  const cfg = _store.get('withdrawConfig', { active: false, intervalSec: 5, minAmount: 0, maxAmount: 5000, autoApprove: false, provider: 'crs' });
  const updated = {
    ...cfg,
    minAmount: Number(newConfig.minAmount) >= 0 ? Number(newConfig.minAmount) : (cfg.minAmount || 0),
    maxAmount: Number(newConfig.maxAmount) > 0 ? Number(newConfig.maxAmount) : (cfg.maxAmount || 5000),
    provider: newConfig.provider ? (String(newConfig.provider).toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs') : (cfg.provider || 'crs'),
    updatedAt: Date.now()
  };
  _store.set('withdrawConfig', updated);
  const st = _store.get('withdrawState', {});
  _store.set('withdrawState', {
    ...st,
    minAmount: updated.minAmount,
    maxAmount: updated.maxAmount,
    provider: updated.provider,
    updatedAt: Date.now()
  });
  return { ok: true, config: updated };
}

function setAutoApprove(enabled, options = {}) {
  const cfg = _store.get('withdrawConfig', { active: false, intervalSec: 5, minAmount: 0, maxAmount: 5000, autoApprove: false, provider: 'crs' });
  const next = Boolean(enabled);
  const minAmount = options && Number(options.minAmount) >= 0 ? Number(options.minAmount) : (cfg.minAmount || 0);
  const maxAmount = options && Number(options.maxAmount) > 0 ? Number(options.maxAmount) : (cfg.maxAmount || 5000);
  const provider = options && options.provider
    ? (String(options.provider).toLowerCase().trim() === 'swiftpay' ? 'swiftpay' : 'crs')
    : (cfg.provider || 'crs');
  const providerLabel = provider === 'swiftpay' ? 'SwiftPay' : 'CRS';

  if (next) {
    const ledger = getApprovalLedger();
    let changed = false;
    const now = Date.now();
    for (const [id, entry] of Object.entries(ledger)) {
      if (entry?.state === 'unknown') {
        delete ledger[id];
        changed = true;
      }
      if (entry?.state === 'claimed' && now - Number(entry?.claimedAt || 0) > 5000) {
        delete ledger[id];
        changed = true;
      }
    }
    if (changed) {
      _store.set('withdrawApprovalLedger', ledger);
    }
  }

  _store.set('withdrawConfig', { ...cfg, minAmount, maxAmount, autoApprove: next, provider, safetyStopped: false, updatedAt: Date.now() });
  const st = _store.get('withdrawState', {});
  _store.set('withdrawState', {
    ...st,
    minAmount,
    maxAmount,
    autoApprove: next,
    provider,
    message: next ? `เปิด Auto Approve (${providerLabel}) แล้ว` : 'ปิด Auto Approve แล้ว'
  });
  return { ok: true, autoApprove: next, provider };
}

module.exports = {
  init,
  start,
  stop,
  updateConfig,
  setAutoApprove,
  pollWithdrawApi,
  manualApproveWithdraw,
  manualRejectWithdraw,
  recordBankChange,
  evaluateWithdrawRisk
};
