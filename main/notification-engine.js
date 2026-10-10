'use strict';

const apiEngine = require('./api-engine');
const store = require('./store');

let withdrawEngine = null;
function getWithdrawEngine() {
  if (!withdrawEngine) {
    try { withdrawEngine = require('./withdraw-engine'); } catch {}
  }
  return withdrawEngine;
}

function getTargetWebsiteId() {
  const context = store ? store.get('apiBusinessContext', null) : null;
  if (context?.websiteId) return Number(context.websiteId);
  const settings = store ? store.get('settings', null) : null;
  if (settings?.targetWebsiteId) return Number(settings.targetWebsiteId);
  return null;
}

function formatTime(isoStr) {
  return apiEngine.formatBangkokDateTime ? apiEngine.formatBangkokDateTime(isoStr, 'DD/MM/YYYY HH:mm:ss') : String(isoStr);
}

function getTodayString() {
  return apiEngine.getBangkokDateString ? apiEngine.getBangkokDateString(new Date()) : new Date().toISOString().slice(0, 10);
}

function getYesterdayString() {
  const now = Date.now();
  return apiEngine.getBangkokDateString ? apiEngine.getBangkokDateString(new Date(now - 86400000)) : new Date(now - 86400000).toISOString().slice(0, 10);
}

function resolveDateRange(datePreset, startDate, endDate) {
  const today = getTodayString();
  const yesterday = getYesterdayString();
  if (datePreset === 'yesterday') return { start_date: yesterday, end_date: yesterday };
  if (datePreset === 'custom' && startDate && endDate) return { start_date: startDate, end_date: endDate };
  return { start_date: today, end_date: today };
}

const memberProfileCache = new Map();
const memberPrevBankCache = new Map();

async function resolveMemberName(memberId) {
  if (!memberId) return '';
  if (memberProfileCache.has(memberId)) {
    const m = memberProfileCache.get(memberId);
    return m.fullname ? (m.username ? `${m.fullname} (${m.username})` : m.fullname) : (m.username || `Member #${memberId}`);
  }
  try {
    const res = await apiEngine.apiFetchJson(`/members/${memberId}`, {}, { retries: 0 });
    const username = res.data?.game_username || '';
    const fullname = res.data?.fullname || '';
    const phone = res.data?.phone || '';
    memberProfileCache.set(memberId, { username, fullname, phone });
    return fullname ? (username ? `${fullname} (${username})` : fullname) : (username || `Member #${memberId}`);
  } catch (e) {
    return `Member #${memberId}`;
  }
}

async function resolveMemberPreviousBank(memberId, newBank, changeTime) {
  if (!memberId) return null;
  const cacheKey = `${memberId}:${changeTime}`;
  if (memberPrevBankCache.has(cacheKey)) {
    return memberPrevBankCache.get(cacheKey);
  }

  try {
    // 1. Fetch member profile to get game_username and phone (since /transactions requires search query)
    let username = '';
    let phone = '';
    if (memberProfileCache.has(memberId)) {
      const cached = memberProfileCache.get(memberId);
      username = cached.username;
      phone = cached.phone;
    } else {
      try {
        const memRes = await apiEngine.apiFetchJson(`/members/${memberId}`, {}, { retries: 0 });
        username = memRes.data?.game_username || '';
        phone = memRes.data?.phone || '';
        const fullname = memRes.data?.fullname || '';
        memberProfileCache.set(memberId, { username, fullname, phone });
      } catch (e) {}
    }

    // 2. Query transactions using username or phone
    const targetWebsiteId = getTargetWebsiteId();
    let txRows = [];
    if (username) {
      const txRes = await apiEngine.apiFetchJson('/transactions', {
        search: username,
        website_id: targetWebsiteId,
        limit: 30,
        sort: 'transaction_at',
        order: 'desc'
      }, { retries: 0 });
      txRows = apiEngine.apiDataArray(txRes);
    }
    if (!txRows.length && phone) {
      const txRes = await apiEngine.apiFetchJson('/transactions', {
        search: phone,
        website_id: targetWebsiteId,
        limit: 30,
        sort: 'transaction_at',
        order: 'desc'
      }, { retries: 0 });
      txRows = apiEngine.apiDataArray(txRes);
    }

    const changeDate = new Date(changeTime).getTime();
    const older = txRows.filter((t) => {
      const tTime = new Date(t.transaction_at || t.created_at || 0).getTime();
      return tTime > 0 && tTime < changeDate;
    });

    if (older.length > 0) {
      for (const t of older) {
        const bCode = t.direction === 'out' ? t.to_bank_code : t.from_bank_code;
        const bNum = t.direction === 'out' ? t.to_bank_number : t.from_bank_number;
        if (bCode) {
          const fullBank = (bCode + (bNum ? ' ' + bNum : '')).trim();
          memberPrevBankCache.set(cacheKey, fullBank);
          return fullBank;
        }
      }
    }
  } catch (e) {}

  memberPrevBankCache.set(cacheKey, null);
  return null;
}

function normalizeLogItem(item, inferredType, extra = {}) {
  const id = item.id || item.transaction_id || Math.random().toString(36).slice(2, 9);
  const rawTime = item.transaction_at || item.created_at || item.requested_at || (item.at ? new Date(item.at).toISOString() : new Date().toISOString());
  const timeStr = formatTime(rawTime);
  const at = (apiEngine.parseToBangkokDate ? apiEngine.parseToBangkokDate(rawTime) : new Date(rawTime))?.getTime() || Date.now();

  const direction = String(item.direction || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const rawType = String(item.type || '').toLowerCase();

  let type = inferredType || 'unknown';
  if (!inferredType || inferredType === 'unknown') {
    if (direction === 'out' || cat === 'withdraw' || rawType === 'withdraw') {
      type = 'withdraw';
    } else if (direction === 'in' || cat === 'deposit' || rawType === 'deposit') {
      type = 'deposit';
    }
  }

  let typeLabel = 'ทั่วไป';
  let badgeColor = '#64748b';
  let username = item.game_username || item.username || item.member?.game_username || '-';
  let amountVal = 0;
  let amount = '-';
  let amountHtml = null;
  let admin = item.admin?.username || item.admin?.name || item.admin_name || (item.process_type === 'auto' ? 'ระบบออโต้' : (item.admin_id ? ('Admin #' + item.admin_id) : '-'));
  let detail = '';
  let status = item.status || 'success';
  let statusLabel = 'สำเร็จ';

  let payloadObj = null;
  if (typeof item.payload === 'string' && item.payload.startsWith('{')) {
    try { payloadObj = JSON.parse(item.payload); } catch {}
  } else if (typeof item.payload === 'object') {
    payloadObj = item.payload;
  }

  // 1. WITHDRAW (Strict: type === 'withdraw')
  if (type === 'withdraw') {
    type = 'withdraw';
    typeLabel = 'ถอนเงิน';
    badgeColor = '#f59e0b';
    amountVal = Number(item.amount || 0);
    amount = '฿' + amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    amountHtml = `<span style="color:var(--warning); font-weight:700;">${amount}</span>`;
    const targetBank = item.to_bank_code || item.from_bank_code || item.method || '';
    const targetAcc = item.to_bank_number || item.from_bank_number || '';
    detail = ('ถอนไปยัง ' + targetBank + (targetAcc ? ' (' + targetAcc + ')' : '')).trim();

    const isPending = item.status === 'pending' || item.status === 'waiting' || item.status === 'hold' || item.status === 'processing';
    const isSuccess = item.status === 'success' || item.status === 'approved';
    const isRejected = item.status === 'rejected' || item.status === 'cancel' || item.status === 'failed';

    // Real admin identification: check approverAdmin, then item.admin, then fallback
    if (extra.approverAdmin) {
      admin = extra.approverAdmin;
    } else if (item.admin?.username && item.admin?.username !== 'poc-bridge') {
      admin = item.admin.username;
    } else if (item.admin?.name && !/poc-bridge/i.test(item.admin.name)) {
      admin = item.admin.name;
    } else if (isPending) {
      admin = (item.admin?.username && item.admin?.username !== 'poc-bridge') ? item.admin.username : 'ลูกค้ายื่นถอน';
    } else if (item.admin_id && item.admin_id !== 27) {
      admin = 'Admin #' + item.admin_id;
    } else if (item.process_type === 'auto') {
      admin = 'ระบบออโต้';
    } else {
      admin = 'ระบบออโต้';
    }

    if (isPending) {
      statusLabel = 'รออนุมัติ';
    } else if (isSuccess) {
      statusLabel = 'อนุมัติแล้ว';
    } else if (isRejected) {
      statusLabel = 'ปฏิเสธแล้ว';
    } else {
      statusLabel = item.status || 'รอดำเนินการ';
    }

    const we = getWithdrawEngine();
    const riskFlags = we ? we.evaluateWithdrawRisk(item) : null;
    let riskBadgeHtml = '';
    if (riskFlags?.level === 'critical') {
      riskBadgeHtml = `<span class="badge-risk-high" title="${riskFlags.summary}">⚠️ เพิ่งเปลี่ยนบัญชี</span>`;
    } else if (riskFlags?.isLargeAmount) {
      riskBadgeHtml = `<span class="badge-risk-warning" title="${riskFlags.summary}">⚠️ ถอนยอดใหญ่</span>`;
    } else if (riskFlags?.isRapidRepeat) {
      riskBadgeHtml = `<span class="badge-risk-warning" title="${riskFlags.summary}">⚠️ ถอนถี่</span>`;
    }
    extra.riskFlags = riskFlags;
    extra.riskBadgeHtml = riskBadgeHtml;
  }
  // 2. DEPOSIT (Strict: type === 'deposit')
  else if (type === 'deposit') {
    type = 'deposit';
    typeLabel = 'ฝากเงิน';
    badgeColor = '#10b981';
    amountVal = Number(item.amount || 0);
    amount = '฿' + amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    amountHtml = `<span style="color:var(--success); font-weight:700;">${amount}</span>`;
    const toBank = item.to_bank_code || item.method || '';
    const toAcc = item.to_bank_number || '';
    const fromBank = item.from_bank_code || '';
    detail = ('ฝากเข้า ' + toBank + (toAcc ? ' (' + toAcc + ')' : '') + (fromBank ? ' จาก ' + fromBank : '')).trim();
    admin = item.process_type === 'auto' ? 'ระบบออโต้' : (item.admin?.username || item.admin?.name || (item.admin_id ? ('Admin #' + item.admin_id) : 'ระบบออโต้'));
    const isSuccess = item.status === 'success' || item.status === 'approved';
    const isRejected = item.status === 'rejected' || item.status === 'cancel' || item.status === 'failed';
    const isPending = item.status === 'pending' || item.status === 'waiting' || item.status === 'hold' || item.status === 'processing';
    if (isPending) {
      statusLabel = 'รอดำเนินการ';
    } else if (isRejected) {
      statusLabel = 'ปฏิเสธแล้ว';
      badgeColor = '#94a3b8';
      amountHtml = `<span style="color:var(--text-muted); text-decoration:line-through;">${amount}</span>`;
    } else if (isSuccess) {
      statusLabel = 'สำเร็จ';
    } else {
      statusLabel = item.status || 'สำเร็จ';
    }

    const slipUrl = item.slip_image || payloadObj?.slip_image || '';
    if (slipUrl) {
      extra.slipImage = slipUrl;
      extra.slipHtml = `<button type="button" class="btn-slip-view" data-slip="${encodeURIComponent(slipUrl)}" title="กดเพื่อเปิดดูภาพสลิปโอนเงิน">🧾 ดูสลิป</button>`;
    }
  }
  // 3. RESET PASSWORD
  else if (type === 'reset_password' || (item.action && /รีเซ็ตรหัสผ่าน/i.test(item.action))) {
    type = 'reset_password';
    typeLabel = 'รีรหัสผ่าน';
    badgeColor = '#ec4899';
    const memberId = payloadObj?.id || item.member_id || '';
    username = payloadObj?.username || (memberId ? ('Member #' + memberId) : '-');
    detail = 'แอดมินรีเซ็ตรหัสผ่าน (' + admin + ')';
    statusLabel = 'รีเซ็ตสำเร็จ';
  }
  // 4. BANK CHANGE / MEMBER EDIT (With Before/After Bank resolution)
  else if (type === 'bank_change' || (item.action && /แก้ไข สมาชิก|แก้ไข บัญชีธนาคาร/i.test(item.action))) {
    type = 'bank_change';
    typeLabel = 'เปลี่ยนข้อมูลธนาคาร';
    badgeColor = '#06b6d4';
    const bankCode = payloadObj?.bankcode || payloadObj?.code || '';
    const bankAcc = payloadObj?.banknumber || payloadObj?.account || '';
    const fullname = payloadObj?.fullname || payloadObj?.first_name || '';
    const memberId = payloadObj?.id || item.member_id || '';
    const userAlias = extra.username || payloadObj?.game_username || '';
    username = fullname ? (userAlias ? `${fullname} (${userAlias})` : fullname) : (memberId ? ('Member #' + memberId) : '-');

    const newBankStr = (bankCode ? `${bankCode} ${bankAcc}` : '').trim();
    const prevBankStr = extra.prevBank || null;

    if (prevBankStr && prevBankStr !== newBankStr) {
      amount = `ก่อน: ${prevBankStr} ➔ หลัง: ${newBankStr}`;
      amountHtml = `
        <div style="display:flex; flex-direction:column; gap:2px; font-size:11.5px; line-height:1.25;">
          <span style="color:#ef4444; text-decoration:line-through; font-weight:600;">ก่อน: ${prevBankStr}</span>
          <span style="color:#10b981; font-weight:700;">หลัง: ${newBankStr}</span>
        </div>
      `.trim();
      detail = `เปลี่ยนข้อมูลบัญชีจาก ${prevBankStr} เป็น ${newBankStr}`;
      statusLabel = 'เปลี่ยนแล้ว';
    } else if (prevBankStr && prevBankStr === newBankStr) {
      amount = `ก่อน: ${prevBankStr} | หลัง: ${newBankStr} (คงเดิม)`;
      amountHtml = `
        <div style="display:flex; flex-direction:column; gap:2px; font-size:11.5px; line-height:1.25;">
          <span style="color:var(--text-muted); font-size:11px;">ก่อน: ${prevBankStr}</span>
          <span style="color:#06b6d4; font-weight:600; font-size:11.5px;">หลัง: ${newBankStr} <small style="color:var(--text-dim);">(คงเดิม)</small></span>
        </div>
      `.trim();
      detail = `แก้ไขข้อมูลสมาชิก (เลขบัญชีคงเดิม ${newBankStr})`;
      statusLabel = 'บัญชีเดิม';
    } else {
      amount = newBankStr ? `ก่อน: (ไม่พบข้อมูลเดิม) ➔ หลัง: ${newBankStr}` : '-';
      amountHtml = newBankStr ? `
        <div style="display:flex; flex-direction:column; gap:2px; font-size:11.5px; line-height:1.25;">
          <span style="color:var(--text-dim); font-size:10.5px;">ก่อน: (ไม่พบประวัติเดิม)</span>
          <span style="color:#06b6d4; font-weight:600; font-size:11.5px;">หลัง: ${newBankStr}</span>
        </div>
      `.trim() : '-';
      detail = newBankStr ? `แก้ไขข้อมูลบัญชี: ${newBankStr}` : (item.action || 'แก้ไขข้อมูล');
      statusLabel = 'แก้ไขแล้ว';
    }
  }
  // 5. BONUS (Strict: type === 'bonus', payloadObj.source === 'bonus', item.category === 'bonus', or promotion)
  else if (
    type === 'bonus' ||
    payloadObj?.source === 'bonus' ||
    item.category === 'bonus' ||
    item.promotion_id != null ||
    (item.action && /bonus|โบนัส/i.test(item.action))
  ) {
    type = 'bonus';
    const isManualBonus = payloadObj?.source === 'bonus' || (item.action && /เพิ่ม ฝาก-ถอนมือ/i.test(item.action));
    typeLabel = isManualBonus ? 'เติมโบนัส (มือ)' : 'เติมโบนัส';
    badgeColor = '#8b5cf6';
    amountVal = Math.abs(Number(payloadObj?.amount != null ? payloadObj.amount : (item.amount || item.credit_amount || 0)));
    amount = '+฿' + amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    amountHtml = `<span style="color:#8b5cf6; font-weight:700;">${amount}</span>`;
    const memberId = payloadObj?.member_id || item.member_id || item.member?.id || '';
    username = extra.memberDisplayName || item.game_username || item.member?.game_username || (memberId ? ('Member #' + memberId) : '-');
    detail = payloadObj?.note || item.note || item.campaign_name || 'รับโบนัส';
    statusLabel = 'สำเร็จ';
  }
  // 6. MANUAL CREDIT (Strict: ONLY genuine manual additions & deductions, NEVER bonuses)
  else if (
    type === 'manual' ||
    (item.action && /เพิ่ม ฝาก-ถอนมือ/i.test(item.action)) ||
    item.category === 'adjustment' ||
    String(item.transaction_id || '').startsWith('manual_adjust:')
  ) {
    type = 'manual';

    // Accurately determine if it is DEDUCT (ลดเครดิต) vs ADD (เพิ่มเครดิต)
    // NOTE: item.action is "เพิ่ม ฝาก-ถอนมือ" which contains the word "ถอน". NEVER test item.action with /ถอน/!
    const dir = String(item.direction || payloadObj?.direction || '').toLowerCase();
    const meth = String(item.method || payloadObj?.method || '').toLowerCase();
    const rawAmt = Number(payloadObj?.amount != null ? payloadObj.amount : (item.amount || 0));
    const noteText = String(payloadObj?.note || item.note || '');
    const pType = String(payloadObj?.type || '').toLowerCase();
    const details = String(item.details || '').toLowerCase();

    let isDeduct = false;
    if (extra.isDeduct != null) {
      isDeduct = !!extra.isDeduct;
    } else if (details.includes('/manual/withdraw') || details.includes('withdraw')) {
      isDeduct = true;
    } else if (details.includes('/manual/deposit') || details.includes('deposit')) {
      isDeduct = false;
    } else if (dir === 'out') {
      isDeduct = true;
    } else if (dir === 'in') {
      isDeduct = false;
    } else if (/decrease|deduct/i.test(meth)) {
      isDeduct = true;
    } else if (/increase/i.test(meth)) {
      isDeduct = false;
    } else if (item.before_credit != null && item.after_credit != null && Number(item.before_credit) > Number(item.after_credit)) {
      isDeduct = true;
    } else if (item.before_credit != null && item.after_credit != null && Number(item.before_credit) < Number(item.after_credit)) {
      isDeduct = false;
    } else if (rawAmt < 0) {
      isDeduct = true;
    } else if (/ลดเครดิต|หักเครดิต|ดึงคืน|เข้าซ้ำ|ตัดยอด|ลดยอด/i.test(noteText) || /decrease|deduct|ลด/i.test(pType)) {
      isDeduct = true;
    } else {
      // Default for "เพิ่ม ฝาก-ถอนมือ" / "increase_credit" is ADD credit
      isDeduct = false;
    }

    if (isDeduct) {
      typeLabel = 'ลดเครดิต (มือ)';
      badgeColor = '#ef4444';
    } else {
      typeLabel = 'เพิ่มเครดิต (มือ)';
      badgeColor = '#3b82f6';
    }

    amountVal = Math.abs(rawAmt);
    amount = (isDeduct ? '-' : '+') + '฿' + amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    amountHtml = `<span style="color:${isDeduct ? 'var(--danger)' : 'var(--blue)'}; font-weight:700;">${amount}</span>`;

    const memberId = payloadObj?.member_id || item.member_id || '';
    username = extra.memberDisplayName || item.game_username || (memberId ? ('Member #' + memberId) : '-');
    detail = payloadObj?.note || item.note || ((isDeduct ? 'ลดเครดิตมือโดย ' : 'เพิ่มเครดิตมือโดย ') + admin);
    statusLabel = 'ปรับเครดิตสำเร็จ';
  }
  // 7. REWARD / แลกแต้ม
  else if (type === 'reward' || item.reward_name || cat === 'reward' || item.category === 'reward_redeem' || (item.action && /แลกแต้ม|reward/i.test(item.action))) {
    type = 'reward';
    typeLabel = 'แลกแต้ม';
    badgeColor = '#06b6d4';
    const creditAmt = Number(item.credit_amount || payloadObj?.credit_amount || 0);
    const ptsUsed = Number(item.points || payloadObj?.points || 0);
    amountVal = creditAmt;
    amount = creditAmt > 0 ? `฿${creditAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${ptsUsed.toLocaleString('th-TH')} แต้ม)` : `${ptsUsed.toLocaleString('th-TH')} แต้ม`;
    amountHtml = `
      <div style="display:flex; flex-direction:column; gap:1px; line-height:1.25;">
        <span style="color:#06b6d4; font-weight:700;">+฿${creditAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
        <small style="color:var(--text-dim); font-size:10.5px;">ใช้ ${ptsUsed.toLocaleString('th-TH')} แต้ม</small>
      </div>
    `.trim();

    const memberId = payloadObj?.member_id || item.member_id || item.member?.id || '';
    username = item.game_username || item.member?.game_username || payloadObj?.game_username || (memberId ? ('Member #' + memberId) : '-');
    detail = item.reward_name ? `แลกของรางวัล: ${item.reward_name}` : (item.note || 'แลกแต้มสะสม');

    if (item.approved_by) {
      if (typeof item.approved_by === 'object') {
        admin = item.approved_by.username || item.approved_by.name || ('Admin #' + item.approved_by.id);
      } else {
        admin = String(item.approved_by);
      }
    } else if (item.is_auto) {
      admin = 'ระบบออโต้';
    } else {
      admin = item.admin?.username || item.admin?.name || '-';
    }

    const rawStatus = String(item.status || '').toLowerCase();
    if (/approved|approve|success|complete/.test(rawStatus)) {
      statusLabel = 'อนุมัติแล้ว';
    } else if (/rejected|reject|cancel|fail/.test(rawStatus)) {
      statusLabel = 'ปฏิเสธ';
    } else if (/pending|wait|new/.test(rawStatus)) {
      statusLabel = 'รออนุมัติ';
    } else {
      statusLabel = item.status || 'สำเร็จ';
    }
  }
  else if (item.action) {
    typeLabel = item.action;
    detail = item.details || item.action;
  }

  return {
    id,
    at,
    timeStr,
    type,
    typeLabel,
    badgeColor,
    username,
    amount,
    amountHtml,
    amountVal,
    admin,
    detail,
    status,
    statusLabel,
    riskFlags: extra.riskFlags || null,
    riskBadgeHtml: extra.riskBadgeHtml || '',
    slipImage: extra.slipImage || '',
    slipHtml: extra.slipHtml || ''
  };
}

async function getWithdrawApprovalMap(dateFilter) {
  const approvalMap = new Map();
  try {
    const targetWebsiteId = getTargetWebsiteId();
    const actPayload = await apiEngine.apiFetchJson('/admin-activity', {
      website_id: targetWebsiteId,
      start_date: dateFilter.start_date,
      end_date: dateFilter.end_date,
      limit: 100,
      sort: 'created_at',
      order: 'desc'
    }, { retries: 1 });

    for (const a of actPayload.activities || []) {
      if (a.status && Number(a.status) !== 200) continue;
      if (/อนุมัติ|ปฏิเสธ/i.test(a.action)) {
        try {
          const p = typeof a.payload === 'string' ? JSON.parse(a.payload || '{}') : (a.payload || {});
          if (p.id) {
            approvalMap.set(Number(p.id), {
              admin: a.admin?.username || a.admin?.name || (a.admin_id ? ('Admin #' + a.admin_id) : 'แอดมิน'),
              action: a.action,
              at: a.created_at
            });
          }
        } catch {}
      }
    }
  } catch (e) {}
  return approvalMap;
}

function extractAccountUsername(str) {
  if (!str) return '';
  const m = String(str).match(/\(([^)]+)\)/);
  return (m ? m[1] : str).trim().toLowerCase();
}

function isSameBonusEvent(a, b) {
  const userA = extractAccountUsername(a.username);
  const userB = extractAccountUsername(b.username);
  if (userA && userB && userA !== userB) return false;
  if (Math.abs(Number(a.amountVal || 0) - Number(b.amountVal || 0)) >= 0.01) return false;
  const timeDiff = Math.abs((a.at || 0) - (b.at || 0));
  return timeDiff <= 60000;
}

async function fetchNotificationLogs(options = {}) {
  const {
    category = 'all',
    datePreset = 'today',
    startDate = '',
    endDate = '',
    page = 1,
    limit = 50,
    search = ''
  } = options;

  const dateFilter = resolveDateRange(datePreset, startDate, endDate);
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = [50, 100, 300, 500].includes(Number(limit)) ? Number(limit) : 50;
  const targetWebsiteId = getTargetWebsiteId();

  try {
    let records = [];
    let total = 0;

    if (category === 'deposit') {
      const payload = await apiEngine.apiFetchJson('/transactions', {
        type: 'deposit',
        website_id: targetWebsiteId,
        start_date: dateFilter.start_date,
        end_date: dateFilter.end_date,
        page: pageNum,
        limit: pageSize,
        sort: 'transaction_at',
        order: 'desc',
        search: search || undefined
      }, { retries: 1 });
      const rows = apiEngine.apiDataArray(payload);
      records = rows.map((r) => normalizeLogItem(r, 'deposit'));
      total = Number(payload.total || payload.count || (rows.length < pageSize ? (pageNum - 1) * pageSize + rows.length : pageNum * pageSize + 1));
    } else if (category === 'withdraw') {
      const [payload, approvalMap] = await Promise.all([
        apiEngine.apiFetchJson('/transactions', {
          type: 'withdraw',
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          page: pageNum,
          limit: pageSize,
          sort: 'transaction_at',
          order: 'desc',
          search: search || undefined
        }, { retries: 1 }),
        getWithdrawApprovalMap(dateFilter)
      ]);
      const rows = apiEngine.apiDataArray(payload);
      records = rows.map((r) => {
        const appr = approvalMap.get(Number(r.id));
        return normalizeLogItem(r, 'withdraw', { approverAdmin: appr?.admin });
      });
      total = Number(payload.total || payload.count || (rows.length < pageSize ? (pageNum - 1) * pageSize + rows.length : pageNum * pageSize + 1));
    } else if (category === 'manual') {
      const [payload, creditHistPayload] = await Promise.allSettled([
        apiEngine.apiFetchJson('/admin-activity', {
          action: 'เพิ่ม ฝาก-ถอนมือ',
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          page: pageNum,
          limit: pageSize,
          sort: 'created_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/credit-history', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          limit: 100,
          sort: 'transaction_at',
          order: 'desc'
        }, { retries: 1 })
      ]);

      const actData = payload.status === 'fulfilled' ? payload.value : {};
      const rows = (actData.activities || []).filter(a => {
        if (a.status && Number(a.status) !== 200) return false;
        let p = {}; try { p = JSON.parse(a.payload || '{}'); } catch {}
        // STRICT FILTER: Exclude any bonus operations from tab 'manual'! They belong in 'bonus'
        if (p.source === 'bonus') return false;
        return true;
      });
      const creditHistoryRows = creditHistPayload.status === 'fulfilled' ? apiEngine.apiDataArray(creditHistPayload.value) : [];

      records = await Promise.all(rows.map(async (r) => {
        let p = {}; try { p = JSON.parse(r.payload || '{}'); } catch {}
        let memberDisplayName = '';
        let isDeduct = undefined;

        // If adjustment, match with credit-history to get exact direction & before/after credit
        if (p.source === 'adjust' || !p.source) {
          const rTime = new Date(r.created_at).getTime();
          const memId = Number(p.member_id || r.member_id || 0);
          const amt = Math.abs(Number(p.amount != null ? p.amount : (r.amount || 0)));

          const match = creditHistoryRows.find(c => {
            const cMem = Number(c.member_id || c.member?.id || 0);
            const cAmt = Math.abs(Number(c.amount || 0));
            const cTime = new Date(c.transaction_at || c.created_at || 0).getTime();
            return cMem === memId && cAmt === amt && Math.abs(rTime - cTime) < 15000;
          });

          if (match) {
            r.direction = match.direction;
            r.method = match.method;
            r.before_credit = match.before_credit;
            r.after_credit = match.after_credit;
            if (match.game_username) r.game_username = match.game_username;
            if (match.admin?.username) r.admin = match.admin;
            if (match.member?.fullname) {
              memberDisplayName = `${match.member.fullname} (${match.game_username || ''})`.trim();
            }
            if (match.direction === 'out' || /decrease|deduct/i.test(match.method)) {
              isDeduct = true;
            } else if (match.direction === 'in' || /increase/i.test(match.method)) {
              isDeduct = false;
            }
          }
        }

        if (!memberDisplayName && p.member_id) {
          memberDisplayName = await resolveMemberName(p.member_id);
        }
        return normalizeLogItem(r, 'manual', { memberDisplayName, isDeduct });
      }));
      total = Number(actData.total || actData.count || (rows.length < pageSize ? (pageNum - 1) * pageSize + rows.length : pageNum * pageSize + 1));
    } else if (category === 'bonus') {
      const [actPayload, bonusReportPayload, creditHistPayload] = await Promise.allSettled([
        apiEngine.apiFetchJson('/admin-activity', {
          action: 'เพิ่ม ฝาก-ถอนมือ',
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          limit: 100,
          sort: 'created_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/reports/bonus', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          page: 1,
          limit: 100,
          sort: 'transaction_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/credit-history', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          limit: 100,
          sort: 'transaction_at',
          order: 'desc'
        }, { retries: 1 })
      ]);

      // 1. Manual bonus activities from admin (e.g. B100, B50)
      const actData = actPayload.status === 'fulfilled' ? actPayload.value : {};
      const manualBonusActs = (actData.activities || []).filter(a => {
        if (a.status && Number(a.status) !== 200) return false;
        let p = {}; try { p = JSON.parse(a.payload || '{}'); } catch {}
        return p.source === 'bonus';
      });

      const manualBonusList = await Promise.all(manualBonusActs.map(async (a) => {
        let p = {}; try { p = JSON.parse(a.payload || '{}'); } catch {}
        let memberDisplayName = '';
        if (p.member_id) {
          memberDisplayName = await resolveMemberName(p.member_id);
        }
        return normalizeLogItem(a, 'bonus', { memberDisplayName });
      }));

      // 2. Report bonuses
      const reportRows = bonusReportPayload.status === 'fulfilled' ? apiEngine.apiDataArray(bonusReportPayload.value) : [];
      const reportBonusList = reportRows.filter(r => {
        const s = String(r.status || '').toLowerCase();
        return !['rejected', 'cancel', 'failed'].includes(s);
      }).map(r => normalizeLogItem(r, 'bonus'));

      // 3. Credit history bonuses (CRITICAL: Strictly exclude any adjustments, deductions, negative amounts, or manual credit entries)
      const creditRows = creditHistPayload.status === 'fulfilled' ? apiEngine.apiDataArray(creditHistPayload.value) : [];
      const creditBonusList = creditRows.filter(r => {
        const s = String(r.status || '').toLowerCase();
        if (['rejected', 'cancel', 'failed'].includes(s)) return false;
        // Strictly exclude adjustments & deductions!
        if (r.category === 'adjustment' || String(r.transaction_id || '').startsWith('manual_adjust:')) return false;
        if (r.direction === 'out' || /decrease|deduct/i.test(r.method || '')) return false;
        if (Number(r.amount || 0) < 0) return false;
        if (/เข้าซ้ำ|ลดเครดิต|หักเครดิต|ลดยอด/i.test(r.note || '')) return false;
        return r.category === 'bonus' || r.promotion_id != null || r.campaign_id != null || /bonus|โบนัส/i.test(r.campaign_name || r.note || '');
      }).map(r => normalizeLogItem(r, 'bonus'));

      // DEDUPLICATION: Always prioritize the most detailed item (เลือกแสดงอันที่ละเอียด ไม่ซ้ำซ้อน)
      // manualBonusList has the full member name (e.g. นาย เทวิน เ (tubax13910af83)), badge 'เติมโบนัส (มือ)', and admin
      const combined = [...manualBonusList];

      // Add report bonuses and credit bonuses ONLY if they don't duplicate an already recorded bonus
      for (const item of [...reportBonusList, ...creditBonusList]) {
        const isDuplicate = combined.some(existing => isSameBonusEvent(existing, item));
        if (!isDuplicate) {
          combined.push(item);
        }
      }

      combined.sort((a, b) => b.at - a.at);
      records = combined.slice((pageNum - 1) * pageSize, pageNum * pageSize);
      total = combined.length;
    } else if (category === 'reward') {
      const payload = await apiEngine.apiFetchJson('/reward-redeems', {
        website_id: targetWebsiteId,
        page: pageNum,
        limit: pageSize,
        sort: 'created_at',
        order: 'desc'
      }, { retries: 1 });
      const rows = apiEngine.apiDataArray(payload);
      const filtered = rows.filter((r) => {
        const s = String(r.status || '').toLowerCase();
        if (['rejected', 'cancel', 'failed'].includes(s)) return false;
        const dStr = apiEngine.formatBangkokDateTime ? apiEngine.formatBangkokDateTime(r.created_at || Date.now(), 'YYYY-MM-DD') : String(r.created_at || '').slice(0, 10);
        return (!dateFilter.start_date || dStr >= dateFilter.start_date) &&
               (!dateFilter.end_date || dStr <= dateFilter.end_date);
      });
      records = filtered.map((r) => normalizeLogItem(r, 'reward'));
      total = Number(payload.total || filtered.length);
    } else if (category === 'reset_password') {
      const payload = await apiEngine.apiFetchJson('/admin-activity', {
        action: 'รีเซ็ตรหัสผ่านสมาชิก สมาชิก',
        website_id: targetWebsiteId,
        start_date: dateFilter.start_date,
        end_date: dateFilter.end_date,
        page: pageNum,
        limit: pageSize,
        sort: 'created_at',
        order: 'desc'
      }, { retries: 1 });
      const rows = (payload.activities || []).filter(a => !a.status || Number(a.status) === 200);
      records = rows.map((r) => normalizeLogItem(r, 'reset_password'));
      total = Number(payload.total || rows.length);
    } else if (category === 'bank_change') {
      const fetchLimit = 100;
      const payload = await apiEngine.apiFetchJson('/admin-activity', {
        action: 'แก้ไข สมาชิก',
        website_id: targetWebsiteId,
        start_date: dateFilter.start_date,
        end_date: dateFilter.end_date,
        page: pageNum,
        limit: fetchLimit,
        sort: 'created_at',
        order: 'desc'
      }, { retries: 1 });
      const rows = (payload.activities || []).filter(a => !a.status || Number(a.status) === 200);

      // Group activities by memberId in chronological order to detect previous bank from sequential edits
      const memberActMap = new Map();
      for (const act of [...rows].reverse()) {
        try {
          const p = JSON.parse(act.payload || '{}');
          if (p.id) {
            if (!memberActMap.has(p.id)) memberActMap.set(p.id, []);
            memberActMap.get(p.id).push(act);
          }
        } catch {}
      }

      // Resolve previous bank for each row concurrently
      const allResolved = await Promise.all(rows.map(async (act) => {
        let p = {};
        try { p = JSON.parse(act.payload || '{}'); } catch {}
        const newBank = (p.bankcode ? `${p.bankcode} ${p.banknumber || ''}` : '').trim();
        let prevBank = await resolveMemberPreviousBank(p.id, newBank, act.created_at);

        // Fallback: Check older activity for the same member in this batch
        if (!prevBank && p.id && memberActMap.has(p.id)) {
          const actTime = new Date(act.created_at).getTime();
          const olderActs = memberActMap.get(p.id).filter(a => new Date(a.created_at).getTime() < actTime);
          if (olderActs.length > 0) {
            const lastOlder = olderActs[olderActs.length - 1];
            try {
              const oldP = JSON.parse(lastOlder.payload || '{}');
              const oldBank = (oldP.bankcode ? `${oldP.bankcode} ${oldP.banknumber || ''}` : '').trim();
              if (oldBank) prevBank = oldBank;
            } catch {}
          }
        }

        if (p.id && newBank && prevBank && prevBank !== newBank) {
          getWithdrawEngine()?.recordBankChange(p.id, prevBank, newBank, act.created_at);
        }

        const userAlias = memberProfileCache.get(p.id)?.username || '';
        return normalizeLogItem(act, 'bank_change', { prevBank, newBank, username: userAlias });
      }));

      // STRICT FILTER: Only keep actual bank changes!
      // Discard items where prevBank === newBank ('บัญชีเดิม') or trivial non-bank profile edits
      const actualChanges = allResolved.filter(r => r.statusLabel === 'เปลี่ยนแล้ว' || (r.prevBank && r.prevBank !== r.newBank));

      total = actualChanges.length;
      records = actualChanges.slice((pageNum - 1) * pageSize, pageNum * pageSize);
    } else {
      // ALL CATEGORIES (Fetch /transactions, /admin-activity, /reward-redeems, and /credit-history)
      const [txRes, actRes, rewardRes, creditHistRes] = await Promise.allSettled([
        apiEngine.apiFetchJson('/transactions', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          page: pageNum,
          limit: pageSize,
          sort: 'transaction_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/admin-activity', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          page: pageNum,
          limit: pageSize,
          sort: 'created_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/reward-redeems', {
          website_id: targetWebsiteId,
          page: 1,
          limit: pageSize,
          sort: 'created_at',
          order: 'desc'
        }, { retries: 1 }),
        apiEngine.apiFetchJson('/credit-history', {
          website_id: targetWebsiteId,
          start_date: dateFilter.start_date,
          end_date: dateFilter.end_date,
          limit: 100,
          sort: 'transaction_at',
          order: 'desc'
        }, { retries: 1 })
      ]);

      const txRows = txRes.status === 'fulfilled' ? apiEngine.apiDataArray(txRes.value) : [];
      const actRows = actRes.status === 'fulfilled' ? (actRes.value.activities || []) : [];
      const rewardRows = rewardRes.status === 'fulfilled' ? apiEngine.apiDataArray(rewardRes.value) : [];
      const creditHistoryRows = creditHistRes.status === 'fulfilled' ? apiEngine.apiDataArray(creditHistRes.value) : [];

      // Filter admin activities to only meaningful events (bank changes, password resets, manual credits)
      // Strictly exclude any login, auth, approvals, failed HTTP requests, or non-target website entries
      const meaningfulActs = actRows.filter((a) => {
        const act = String(a.action || '');
        const wid = Number(a.website_id || (typeof a.payload === 'object' ? a.payload?.website_id : 0) || 0);
        if (wid > 0 && wid !== targetWebsiteId) return false;
        if (a.status && Number(a.status) !== 200) return false;
        if (/เข้าสู่ระบบ|login|auth/i.test(act)) return false;
        if (/อนุมัติ รายการฝาก-ถอน|ปฏิเสธ รายการฝาก-ถอน|เพิ่ม frontend/i.test(act)) return false;
        return /แก้ไข สมาชิก|แก้ไข บัญชีธนาคาร|รีเซ็ตรหัสผ่าน|เพิ่ม ฝาก-ถอนมือ/i.test(act);
      });

      const listB = (await Promise.all(meaningfulActs.map(async (a) => {
        if (/แก้ไข สมาชิก/i.test(String(a.action || ''))) {
          let p = {};
          try { p = JSON.parse(a.payload || '{}'); } catch {}
          const newBank = (p.bankcode ? `${p.bankcode} ${p.banknumber || ''}` : '').trim();
          const prevBank = await resolveMemberPreviousBank(p.id, newBank, a.created_at);
          // Only include if bank actually changed
          if (prevBank && prevBank === newBank) return null;
          if (p.id && newBank && prevBank && prevBank !== newBank) {
            getWithdrawEngine()?.recordBankChange(p.id, prevBank, newBank, a.created_at);
          }
          const userAlias = memberProfileCache.get(p.id)?.username || '';
          return normalizeLogItem(a, 'bank_change', { prevBank, newBank, username: userAlias });
        }
        if (/เพิ่ม ฝาก-ถอนมือ/i.test(String(a.action || ''))) {
          let p = {};
          try { p = JSON.parse(a.payload || '{}'); } catch {}
          let memberDisplayName = '';

          // If bonus source, classify strictly as bonus!
          if (p.source === 'bonus') {
            if (p.member_id) {
              memberDisplayName = await resolveMemberName(p.member_id);
            }
            return normalizeLogItem(a, 'bonus', { memberDisplayName });
          }

          let isDeduct = undefined;

          if (p.source === 'adjust' || !p.source) {
            const aTime = new Date(a.created_at).getTime();
            const memId = Number(p.member_id || a.member_id || 0);
            const amt = Math.abs(Number(p.amount != null ? p.amount : (a.amount || 0)));

            const match = creditHistoryRows.find(c => {
              const cMem = Number(c.member_id || c.member?.id || 0);
              const cAmt = Math.abs(Number(c.amount || 0));
              const cTime = new Date(c.transaction_at || c.created_at || 0).getTime();
              return cMem === memId && cAmt === amt && Math.abs(aTime - cTime) < 15000;
            });

            if (match) {
              a.direction = match.direction;
              a.method = match.method;
              a.before_credit = match.before_credit;
              a.after_credit = match.after_credit;
              if (match.game_username) a.game_username = match.game_username;
              if (match.admin?.username) a.admin = match.admin;
              if (match.member?.fullname) {
                memberDisplayName = `${match.member.fullname} (${match.game_username || ''})`.trim();
              }
              if (match.direction === 'out' || /decrease|deduct/i.test(match.method)) {
                isDeduct = true;
              } else if (match.direction === 'in' || /increase/i.test(match.method)) {
                isDeduct = false;
              }
            }
          }

          if (!memberDisplayName && p.member_id) {
            memberDisplayName = await resolveMemberName(p.member_id);
          }
          return normalizeLogItem(a, 'manual', { memberDisplayName, isDeduct });
        }
        return normalizeLogItem(a);
      }))).filter(Boolean);

      // Build approval map from actRows to resolve actual admin who approved withdraws
      const approvalMap = new Map();
      for (const a of actRows) {
        if (a.status && Number(a.status) !== 200) continue;
        if (/อนุมัติ|ปฏิเสธ/i.test(a.action)) {
          try {
            const p = typeof a.payload === 'string' ? JSON.parse(a.payload || '{}') : (a.payload || {});
            if (p.id) {
              approvalMap.set(Number(p.id), {
                admin: a.admin?.username || a.admin?.name || (a.admin_id ? ('Admin #' + a.admin_id) : 'แอดมิน'),
                action: a.action,
                at: a.created_at
              });
            }
          } catch {}
        }
      }

      // In the 'all' view, correctly map each transaction by its real direction (deposit vs withdraw)
      const listA = txRows.map((r) => {
        const isWithdraw = r.category === 'withdraw' || r.direction === 'out';
        const appr = isWithdraw ? approvalMap.get(Number(r.id)) : null;
        return normalizeLogItem(r, undefined, { approverAdmin: appr?.admin });
      });

      // Reward rows filtered by date and non-rejected status
      const listC = rewardRows.filter(r => {
        const s = String(r.status || '').toLowerCase();
        if (['rejected', 'cancel', 'failed'].includes(s)) return false;
        const dStr = apiEngine.formatBangkokDateTime ? apiEngine.formatBangkokDateTime(r.created_at || Date.now(), 'YYYY-MM-DD') : String(r.created_at || '').slice(0, 10);
        return (!dateFilter.start_date || dStr >= dateFilter.start_date) &&
               (!dateFilter.end_date || dStr <= dateFilter.end_date);
      }).map(r => normalizeLogItem(r, 'reward'));

      const combined = [...listA, ...listB, ...listC].sort((a, b) => b.at - a.at);
      records = combined.slice((pageNum - 1) * pageSize, pageNum * pageSize);
      total = Number(txRes.value?.total || (listA.length + listB.length + listC.length));
    }

    if (search) {
      const q = search.toLowerCase();
      records = records.filter((r) =>
        r.username.toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q) ||
        r.admin.toLowerCase().includes(q) ||
        r.typeLabel.toLowerCase().includes(q)
      );
      if (['manual', 'bonus', 'reward', 'reset_password', 'bank_change', 'all'].includes(category)) {
        total = records.length;
      }
    }

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    return { ok: true, records, page: pageNum, limit: pageSize, total, totalPages, dateRange: dateFilter };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), records: [], page: pageNum, limit: pageSize, total: 0, totalPages: 1, dateRange: dateFilter };
  }
}

module.exports = { fetchNotificationLogs, normalizeLogItem, resolveMemberPreviousBank, getTargetWebsiteId };
