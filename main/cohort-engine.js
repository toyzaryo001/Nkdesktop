'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const apiEngine = require('./api-engine');
const store = require('./store');

let isCancelled = false;

// In-memory cache of the latest calculated cohort data
let cachedCohortData = {
  monthsConfig: null,
  summary: null,
  rows: null,
  fetchedAt: null
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Calculate the current month and the 6 historical months
 * E.g., if current is Month 9 (Sep 2026):
 * - current: 2026-09 (2026-09-01 to today)
 * - historical 6 months:
 *   M1: 2026-08 (Aug) -> latestHistorical
 *   M2: 2026-07 (Jul)
 *   M3: 2026-06 (Jun)
 *   M4: 2026-05 (May)
 *   M5: 2026-04 (Apr)
 *   M6: 2026-03 (Mar)
 * Chronological order: [M6, M5, M4, M3, M2, M1] -> [ด.3, ด.4, ด.5, ด.6, ด.7, ด.8]
 */
function getCohortMonths(refDate = new Date()) {
  let now = refDate;
  if (typeof refDate === 'string' && refDate) {
    now = new Date(refDate);
  }
  const bkk = apiEngine.getBangkokDateParts
    ? apiEngine.getBangkokDateParts(now)
    : {
        year: String(now.getFullYear()),
        month: pad2(now.getMonth() + 1),
        day: pad2(now.getDate())
      };

  const curY = Number(bkk.year);
  const curM = Number(bkk.month);
  const curD = Number(bkk.day);

  const curMonthKey = `${curY}-${pad2(curM)}`;
  const curStartDate = `${curMonthKey}-01`;
  const curEndDate = `${curMonthKey}-${pad2(curD)}`;

  const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  const current = {
    monthKey: curMonthKey,
    monthNum: curM,
    year: curY,
    startDate: curStartDate,
    endDate: curEndDate,
    shortLabel: `ด.${curM} (${THAI_MONTHS[curM]})`,
    label: `เดือนปัจจุบัน (1-${curD} ${THAI_MONTHS[curM]} ${curY})`
  };

  const historical = [];
  for (let i = 1; i <= 6; i++) {
    let m = curM - i;
    let y = curY;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const monthKey = `${y}-${pad2(m)}`;
    const daysInM = new Date(y, m, 0).getDate();
    historical.push({
      step: i,
      monthKey,
      monthNum: m,
      year: y,
      startDate: `${monthKey}-01`,
      endDate: `${monthKey}-${pad2(daysInM)}`,
      shortLabel: `ด.${m} (${THAI_MONTHS[m]})`,
      fullLabel: `เดือน ${m}/${y} (${THAI_MONTHS[m]})`
    });
  }

  const latestHistorical = historical[0]; // M1 (e.g. Month 8)
  const chronological = [...historical].reverse(); // [M6, M5, M4, M3, M2, M1]

  return {
    current,
    historical,
    chronological,
    latestHistorical
  };
}

/**
 * Cache file management
 */
function getCacheFilePath() {
  try {
    const { app } = require('electron');
    const uPath = app ? app.getPath('userData') : path.join(os.homedir(), '.nk-helper');
    return path.join(uPath, 'nk-cohort-cache.json');
  } catch {
    return path.join(os.homedir(), '.nk-cohort-cache.json');
  }
}

function loadCohortCache() {
  try {
    const fp = getCacheFilePath();
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Cohort] Error loading cache:', e.message);
  }
  return { months: {} };
}

function saveCohortCache(cache) {
  try {
    const fp = getCacheFilePath();
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Cohort] Error saving cache:', e.message);
  }
}

function sendCohortProgress(data) {
  try {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('cohort-progress', data);
      }
    });
  } catch (e) {}
}

function cancelCohortFetch() {
  isCancelled = true;
}

/**
 * Fetch deposits for a single month range and aggregate by username
 */
async function fetchMonthDepositAggregates(monthKey, startDate, endDate, monthLabel, onProgress) {
  const userAgg = {};
  const context = await apiEngine.getApiBusinessContext();
  const pageSize = 200;

  const first = await apiEngine.apiFetchJson('/transactions', {
    type: 'deposit',
    page: 1,
    limit: pageSize,
    start_date: startDate,
    end_date: endDate,
    process_type: 'all',
    sort: 'transaction_at',
    order: 'desc',
    website_id: context.websiteId,
    website_agent_id: context.agentId || undefined
  });

  const firstData = apiEngine.apiDataArray(first);
  const pagination = apiEngine.apiPagination(first, 1, pageSize, firstData.length);
  let totalPages = pagination.totalPages || (firstData.length < pageSize ? 1 : 0);

  function processBatch(txs) {
    for (const tx of txs) {
      const cat = String(tx?.category || '').toLowerCase();
      const dir = String(tx?.direction || '').toLowerCase();
      const isDeposit = cat === 'deposit' || dir === 'in' || tx.type === 'deposit';
      if (!isDeposit) continue;

      const st = String(tx?.status || '').toLowerCase();
      if (['rejected', 'cancel', 'failed'].includes(st)) continue;

      const amt = Number(tx?.amount);
      if (isNaN(amt) || amt <= 0) continue;

      const username = String(tx.game_username || tx.member?.game_username || tx.username || '').trim();
      if (!username || username === '-') continue;

      if (!userAgg[username]) {
        userAgg[username] = {
          username,
          totalDeposit: 0,
          depositCount: 0,
          name: tx.member?.fullname || tx.from_bank_name || '-',
          phone: apiEngine.apiDisplayPhone(tx.phone || tx.member?.phone || '') || '-',
          dailyDeposits: {},
          depositDays: []
        };
      }
      userAgg[username].totalDeposit += amt;
      userAgg[username].depositCount += 1;
      if (userAgg[username].name === '-' && (tx.member?.fullname || tx.from_bank_name)) {
        userAgg[username].name = tx.member?.fullname || tx.from_bank_name;
      }
      if (userAgg[username].phone === '-' && (tx.phone || tx.member?.phone)) {
        userAgg[username].phone = apiEngine.apiDisplayPhone(tx.phone || tx.member?.phone);
      }

      // Record daily deposit breakdown
      const dtStr = tx.transaction_at || tx.created_at || tx.action_at || tx.date || '';
      let txDay = null;
      if (dtStr) {
        const mIso = String(dtStr).match(/^\d{4}[-/]\d{2}[-/](\d{1,2})/);
        const mSlash = String(dtStr).match(/^(\d{1,2})\/\d{1,2}\/\d{4}/);
        if (mIso) {
          txDay = parseInt(mIso[1], 10);
        } else if (mSlash) {
          txDay = parseInt(mSlash[1], 10);
        } else {
          try {
            const d = new Date(dtStr);
            if (!isNaN(d.getTime())) txDay = d.getDate();
          } catch (e) {}
        }
      }
      if (txDay && txDay >= 1 && txDay <= 31) {
        if (!userAgg[username].dailyDeposits) userAgg[username].dailyDeposits = {};
        userAgg[username].dailyDeposits[txDay] = (userAgg[username].dailyDeposits[txDay] || 0) + amt;
        if (!userAgg[username].depositDays) userAgg[username].depositDays = [];
        if (!userAgg[username].depositDays.includes(txDay)) {
          userAgg[username].depositDays.push(txDay);
        }
        if (!userAgg[username].lastDepositAt) {
          userAgg[username].lastDepositAt = dtStr;
        }
      }
    }
  }

  processBatch(firstData);

  if (onProgress) {
    onProgress({
      monthKey,
      monthLabel,
      completedPages: 1,
      totalPages: Math.max(1, totalPages),
      percent: Math.min(100, Math.round((1 / Math.max(1, totalPages)) * 100))
    });
  }

  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const concurrency = 10;
    let cursor = 0;
    let completed = 1;

    const worker = async () => {
      while (cursor < pages.length) {
        if (isCancelled) break;
        const page = pages[cursor++];
        try {
          const payload = await apiEngine.apiFetchJson('/transactions', {
            type: 'deposit',
            page,
            limit: pageSize,
            start_date: startDate,
            end_date: endDate,
            process_type: 'all',
            sort: 'transaction_at',
            order: 'desc',
            website_id: context.websiteId,
            website_agent_id: context.agentId || undefined
          });
          const raw = apiEngine.apiDataArray(payload);
          processBatch(raw);
        } catch (err) {
          console.warn(`[Cohort] Error page ${page} of ${monthKey}:`, err.message);
        } finally {
          completed++;
          if (onProgress) {
            onProgress({
              monthKey,
              monthLabel,
              completedPages: completed,
              totalPages,
              percent: Math.min(100, Math.round((completed / totalPages) * 100))
            });
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, pages.length) }, () => worker());
    await Promise.all(workers);
  }

  return userAgg;
}

/**
 * Fetch all members quickly to enrich full name, phone, registeredAt, lastOnline
 */
async function fetchMemberLookup() {
  const lookup = new Map();
  try {
    const context = await apiEngine.getApiBusinessContext();
    const firstPayload = await apiEngine.apiFetchJson('/members', {
      page: 1,
      limit: 200,
      sort: 'id',
      order: 'desc',
      website_id: context.websiteId,
      website_agent_id: context.agentId || undefined
    });

    const firstRaw = apiEngine.apiDataArray(firstPayload);
    const pagination = apiEngine.apiPagination(firstPayload, 1, 200, firstRaw.length);
    const totalPages = pagination.totalPages || 1;

    function addMembers(arr) {
      for (const m of arr) {
        const u = String(m.game_username || m.username || '').trim();
        if (!u || u === '-') continue;
        lookup.set(u, {
          name: m.fullname || m.name || [m.first_name, m.last_name].filter(Boolean).join(' ') || '-',
          phone: apiEngine.apiDisplayPhone(m.phone || m.line || '') || '-',
          lastOnline: m.last_login || m.last_online || m.online_at || m.updated_at || '',
          registeredAt: m.created_at || m.registered_at || m.register_at || ''
        });
      }
    }

    addMembers(firstRaw);

    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const concurrency = 10;
      let cursor = 0;
      const worker = async () => {
        while (cursor < pages.length) {
          if (isCancelled) break;
          const p = pages[cursor++];
          try {
            const pagePayload = await apiEngine.apiFetchJson('/members', {
              page: p,
              limit: 200,
              sort: 'id',
              order: 'desc',
              website_id: context.websiteId,
              website_agent_id: context.agentId || undefined
            });
            addMembers(apiEngine.apiDataArray(pagePayload));
          } catch {}
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
    }
  } catch (e) {
    console.warn('[Cohort] Warning fetching member details:', e.message);
  }
  return lookup;
}

function formatDateTimeDisplay(dtStr) {
  if (!dtStr || dtStr === '-' || dtStr === 'null') return '-';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return String(dtStr).slice(0, 19).replace('T', ' ');
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const h = pad2(d.getHours());
    const min = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  } catch {
    return String(dtStr);
  }
}

function formatDateDisplay(dtStr) {
  if (!dtStr || dtStr === '-' || dtStr === 'null') return '-';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return String(dtStr).slice(0, 10);
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
  } catch {
    return String(dtStr).slice(0, 10);
  }
}

/**
 * Main function: Fetch Cohort Data & Process Retention Segmentation
 */
async function fetchCohortData(options = {}) {
  isCancelled = false;
  const forceRefreshAll = Boolean(options.forceRefreshAll);

  const monthsConfig = getCohortMonths(options.refDate);
  const { current, historical, chronological, latestHistorical } = monthsConfig;

  const startMsg = 'กำลังเตรียมระบบวิเคราะห์กลุ่มลูกค้า 6 เดือนย้อนหลัง...';
  store.set('cohortState', {
    status: 'running',
    message: startMsg,
    currentStep: 0,
    totalSteps: 7,
    percent: 0,
    updatedAt: Date.now()
  });

  sendCohortProgress({
    status: 'running',
    message: startMsg,
    currentStep: 0,
    totalSteps: 7,
    percent: 0
  });

  const cache = loadCohortCache();
  if (!cache.months) cache.months = {};

  const monthlyAggregates = {};
  const totalMonthsToProcess = historical.length + 1; // 6 past + 1 current
  let stepIndex = 0;

  // 1. Process 6 historical months
  for (const hist of historical) {
    if (isCancelled) break;
    stepIndex++;
    const mKey = hist.monthKey;

    // Check cache: past months are immutable once completed
    if (!forceRefreshAll && cache.months[mKey] && cache.months[mKey].isComplete) {
      monthlyAggregates[mKey] = cache.months[mKey].userAgg || {};
      const msg = `ใช้ข้อมูลแคชของ ${hist.fullLabel} (${Object.keys(monthlyAggregates[mKey]).length} ยูสเซอร์)`;
      sendCohortProgress({
        status: 'running',
        message: msg,
        currentStep: stepIndex,
        totalSteps: totalMonthsToProcess,
        percent: Math.round((stepIndex / totalMonthsToProcess) * 100),
        detail: msg
      });
      continue;
    }

    // Fetch month from API
    const msg = `กำลังดึงประวัติการฝาก ${hist.fullLabel}...`;
    sendCohortProgress({
      status: 'running',
      message: msg,
      currentStep: stepIndex,
      totalSteps: totalMonthsToProcess,
      percent: Math.round((stepIndex / totalMonthsToProcess) * 100),
      detail: msg
    });

    const userAgg = await fetchMonthDepositAggregates(
      mKey,
      hist.startDate,
      hist.endDate,
      hist.fullLabel,
      (p) => {
        sendCohortProgress({
          status: 'running',
          message: `กำลังดึง ${hist.fullLabel} · หน้า ${p.completedPages}/${p.totalPages} (${p.percent}%)`,
          currentStep: stepIndex,
          totalSteps: totalMonthsToProcess,
          percent: Math.round(((stepIndex - 1 + p.percent / 100) / totalMonthsToProcess) * 100),
          detail: `หน้า ${p.completedPages}/${p.totalPages}`
        });
      }
    );

    monthlyAggregates[mKey] = userAgg;

    // Save past month to persistent cache
    cache.months[mKey] = {
      isComplete: true,
      userAgg,
      totalUsers: Object.keys(userAgg).length,
      updatedAt: Date.now()
    };
    saveCohortCache(cache);
  }

  if (isCancelled) {
    store.set('cohortState', { status: 'cancelled', message: 'ยกเลิกการดึงข้อมูลแล้ว' });
    return { ok: false, isCancelled: true };
  }

  // 2. Fetch current month (always fetched fresh to get real-time return rate)
  stepIndex++;
  const curKey = current.monthKey;
  const curMsg = `กำลังดึงยอดฝากเดือนปัจจุบัน (${current.label}) เพื่อตรวจสถิติการกลับมา...`;
  sendCohortProgress({
    status: 'running',
    message: curMsg,
    currentStep: stepIndex,
    totalSteps: totalMonthsToProcess,
    percent: Math.round((stepIndex / totalMonthsToProcess) * 100),
    detail: curMsg
  });

  const currentMonthAgg = await fetchMonthDepositAggregates(
    curKey,
    current.startDate,
    current.endDate,
    current.label,
    (p) => {
      sendCohortProgress({
        status: 'running',
        message: `กำลังดึง ${current.label} · หน้า ${p.completedPages}/${p.totalPages} (${p.percent}%)`,
        currentStep: stepIndex,
        totalSteps: totalMonthsToProcess,
        percent: Math.round(((stepIndex - 1 + p.percent / 100) / totalMonthsToProcess) * 100),
        detail: `หน้า ${p.completedPages}/${p.totalPages}`
      });
    }
  );
  monthlyAggregates[curKey] = currentMonthAgg;

  // 3. Fetch member lookup for rich profile data
  sendCohortProgress({
    status: 'running',
    message: 'กำลังตรวจสอบข้อมูลโปรไฟล์สมาชิกและวันที่ออนไลน์ล่าสุด...',
    currentStep: totalMonthsToProcess,
    totalSteps: totalMonthsToProcess,
    percent: 98
  });

  const memberLookup = await fetchMemberLookup();

  // 4. Calculate Customer Cohort Segmentation
  // Gather all unique users who deposited in ANY of the 6 historical months
  const historicalUserMap = new Map();

  for (const hist of historical) {
    const mKey = hist.monthKey;
    const agg = monthlyAggregates[mKey] || {};
    for (const [username, data] of Object.entries(agg)) {
      if (!historicalUserMap.has(username)) {
        const memProfile = memberLookup.get(username);
        historicalUserMap.set(username, {
          username,
          name: memProfile?.name && memProfile.name !== '-' ? memProfile.name : (data.name || '-'),
          phone: memProfile?.phone && memProfile.phone !== '-' ? memProfile.phone : (data.phone || '-'),
          lastOnline: formatDateTimeDisplay(memProfile?.lastOnline),
          registeredAt: formatDateDisplay(memProfile?.registeredAt),
          monthlyDeposits: {},
          activeMonthCount: 0,
          totalHistoricalDeposit: 0,
          isLatestHistoricalActive: false,
          currentMonthDeposit: 0,
          hasReturned: false,
          groupKey: '',
          groupName: '',
          parentGroup: ''
        });
      }
      const record = historicalUserMap.get(username);
      record.monthlyDeposits[mKey] = data.totalDeposit || 0;
      if (data.totalDeposit > 0) {
        record.activeMonthCount += 1;
        record.totalHistoricalDeposit += data.totalDeposit;
      }
    }
  }

  // Determine Groups & Current Month Return for each user
  const latestHistKey = latestHistorical.monthKey;
  const rows = [];

  for (const [username, rec] of historicalUserMap.entries()) {
    // Fill in 0 for any missing historical months
    for (const hist of historical) {
      if (!rec.monthlyDeposits[hist.monthKey]) {
        rec.monthlyDeposits[hist.monthKey] = 0;
      }
    }

    // Check if deposited in latest historical month (e.g. Month 8)
    const latestDeposit = rec.monthlyDeposits[latestHistKey] || 0;
    rec.isLatestHistoricalActive = latestDeposit > 0;

    // Current month return
    const curAgg = currentMonthAgg[username];
    const curDep = curAgg?.totalDeposit || 0;
    rec.currentMonthDeposit = curDep;
    rec.hasReturned = curDep > 0;
    rec.hasCurrentMonth = rec.hasReturned; // Alias
    rec.dailyDeposits = curAgg?.dailyDeposits || {};
    rec.depositDays = curAgg?.depositDays || [];
    rec.lastDepositAt = curAgg?.lastDepositAt || null;
    rec.lastOnlineStr = rec.lastOnline; // Alias for backward compatibility

    // Apply User's Explicit Cohort Rules
    if (rec.activeMonthCount >= 3) {
      rec.parentGroup = '1';
      if (rec.isLatestHistoricalActive) {
        rec.groupKey = '1.1';
        rec.groupName = 'กลุ่ม 1.1 (ฝาก 3-6 เดือน + เดือนล่าสุดฝาก)';
      } else {
        rec.groupKey = '1.2';
        rec.groupName = 'กลุ่ม 1.2 (ฝาก 3-5 เดือน + เดือนล่าสุดไม่ฝาก)';
      }
    } else if (rec.activeMonthCount === 2) {
      rec.parentGroup = '2';
      if (rec.isLatestHistoricalActive) {
        rec.groupKey = '2.1';
        rec.groupName = 'กลุ่ม 2.1 (ฝาก 2 เดือน + เดือนล่าสุดฝาก)';
      } else {
        rec.groupKey = '2.2';
        rec.groupName = 'กลุ่ม 2.2 (ฝาก 2 เดือน + เดือนล่าสุดไม่ฝาก)';
      }
    } else if (rec.activeMonthCount === 1) {
      rec.parentGroup = '3';
      if (rec.isLatestHistoricalActive) {
        rec.groupKey = '3.1';
        rec.groupName = 'กลุ่ม 3.1 (ฝาก 1 เดือน + เดือนล่าสุดฝาก)';
      } else {
        rec.groupKey = '3.2';
        rec.groupName = 'กลุ่ม 3.2 (ฝาก 1 เดือน + เดือนล่าสุดไม่ฝาก)';
      }
    } else {
      // 0 months in historical window (should not happen since gathered from historical)
      rec.parentGroup = 'other';
      rec.groupKey = 'other';
      rec.groupName = 'อื่นๆ';
    }

    rows.push(rec);
  }

  // Sort rows: first by parentGroup (1, 2, 3), then by groupKey (1.1, 1.2, ...), then by totalHistoricalDeposit desc
  rows.sort((a, b) => {
    if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey);
    return b.totalHistoricalDeposit - a.totalHistoricalDeposit;
  });

  // Assign ranking numbers
  rows.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  // 5. Aggregate Summary Statistics per Group & Overall
  const groupKeys = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2'];
  const groupStats = {};

  groupKeys.forEach((gk) => {
    groupStats[gk] = {
      groupKey: gk,
      totalCount: 0,
      returnCount: 0,
      returnRate: 0,
      currentDepositSum: 0,
      historicalDepositSum: 0
    };
  });

  rows.forEach((r) => {
    if (groupStats[r.groupKey]) {
      const g = groupStats[r.groupKey];
      g.totalCount++;
      g.historicalDepositSum += r.totalHistoricalDeposit;
      if (r.hasReturned) {
        g.returnCount++;
        g.currentDepositSum += r.currentMonthDeposit;
      }
    }
  });

  // Compute return rates for subgroups
  groupKeys.forEach((gk) => {
    const g = groupStats[gk];
    g.returnRate = g.totalCount > 0 ? Number(((g.returnCount / g.totalCount) * 100).toFixed(2)) : 0;
  });

  // Parent groups 1, 2, 3
  const parentStats = {
    '1': {
      parentGroup: '1',
      label: 'กลุ่มที่ 1 (ฝากตั้งแต่ 3 เดือนขึ้นไป)',
      totalCount: groupStats['1.1'].totalCount + groupStats['1.2'].totalCount,
      returnCount: groupStats['1.1'].returnCount + groupStats['1.2'].returnCount,
      returnRate: 0,
      currentDepositSum: groupStats['1.1'].currentDepositSum + groupStats['1.2'].currentDepositSum,
      historicalDepositSum: groupStats['1.1'].historicalDepositSum + groupStats['1.2'].historicalDepositSum,
      subgroups: [groupStats['1.1'], groupStats['1.2']]
    },
    '2': {
      parentGroup: '2',
      label: 'กลุ่มที่ 2 (ฝาก 2 เดือน)',
      totalCount: groupStats['2.1'].totalCount + groupStats['2.2'].totalCount,
      returnCount: groupStats['2.1'].returnCount + groupStats['2.2'].returnCount,
      returnRate: 0,
      currentDepositSum: groupStats['2.1'].currentDepositSum + groupStats['2.2'].currentDepositSum,
      historicalDepositSum: groupStats['2.1'].historicalDepositSum + groupStats['2.2'].historicalDepositSum,
      subgroups: [groupStats['2.1'], groupStats['2.2']]
    },
    '3': {
      parentGroup: '3',
      label: 'กลุ่มที่ 3 (ฝาก 1 เดือน)',
      totalCount: groupStats['3.1'].totalCount + groupStats['3.2'].totalCount,
      returnCount: groupStats['3.1'].returnCount + groupStats['3.2'].returnCount,
      returnRate: 0,
      currentDepositSum: groupStats['3.1'].currentDepositSum + groupStats['3.2'].currentDepositSum,
      historicalDepositSum: groupStats['3.1'].historicalDepositSum + groupStats['3.2'].historicalDepositSum,
      subgroups: [groupStats['3.1'], groupStats['3.2']]
    }
  };

  ['1', '2', '3'].forEach((p) => {
    const ps = parentStats[p];
    ps.returnRate = ps.totalCount > 0 ? Number(((ps.returnCount / ps.totalCount) * 100).toFixed(2)) : 0;
  });

  const overallTotal = {
    totalCount: rows.length,
    returnCount: rows.filter((r) => r.hasReturned).length,
    returnRate: 0,
    currentDepositSum: rows.filter((r) => r.hasReturned).reduce((sum, r) => sum + r.currentMonthDeposit, 0),
    historicalDepositSum: rows.reduce((sum, r) => sum + r.totalHistoricalDeposit, 0)
  };
  overallTotal.returnRate = overallTotal.totalCount > 0
    ? Number(((overallTotal.returnCount / overallTotal.totalCount) * 100).toFixed(2))
    : 0;

  // Calculate daily summary (returns per day 1 to 31)
  const dailyCounts = {};
  const dailyDeps = {};
  for (let i = 1; i <= 31; i++) {
    dailyCounts[i] = 0;
    dailyDeps[i] = 0;
  }
  rows.forEach((r) => {
    if (r.hasReturned || r.hasCurrentMonth || (r.currentMonthDeposit > 0)) {
      if (r.dailyDeposits && typeof r.dailyDeposits === 'object' && Object.keys(r.dailyDeposits).length > 0) {
        for (const [dayKey, amt] of Object.entries(r.dailyDeposits)) {
          const d = parseInt(dayKey, 10);
          if (d >= 1 && d <= 31) {
            dailyCounts[d] = (dailyCounts[d] || 0) + 1;
            dailyDeps[d] = (dailyDeps[d] || 0) + Number(amt || 0);
          }
        }
      } else {
        const dateStr = r.lastDepositAt || r.lastOnline || r.lastOnlineStr;
        if (dateStr && dateStr !== '-') {
          let day = null;
          const mIso = String(dateStr).match(/^\d{4}[-/]\d{2}[-/](\d{1,2})/);
          const mSlash = String(dateStr).match(/^(\d{1,2})\/\d{1,2}\/\d{4}/);
          if (mIso) day = parseInt(mIso[1], 10);
          else if (mSlash) day = parseInt(mSlash[1], 10);
          else {
            try {
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) day = d.getDate();
            } catch (e) {}
          }
          if (day && day >= 1 && day <= 31) {
            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
            dailyDeps[day] = (dailyDeps[day] || 0) + (r.currentMonthDeposit || 0);
          }
        }
      }
    }
  });

  const summary = {
    overall: overallTotal,
    parentGroups: parentStats,
    subgroups: groupStats,
    dailySummary: { dailyCounts, dailyDeps },
    monthsConfig
  };

  cachedCohortData = {
    monthsConfig,
    summary,
    rows,
    fetchedAt: Date.now()
  };

  const finalMsg = `วิเคราะห์กลุ่มลูกค้าสำเร็จ รวม ${rows.length.toLocaleString('th-TH')} ยูสเซอร์ · กลับมาแล้ว ${overallTotal.returnCount.toLocaleString('th-TH')} คน (${overallTotal.returnRate}%)`;
  store.set('cohortState', {
    status: 'done',
    message: finalMsg,
    currentStep: 7,
    totalSteps: 7,
    percent: 100,
    summary,
    updatedAt: Date.now()
  });

  sendCohortProgress({
    status: 'done',
    message: finalMsg,
    currentStep: 7,
    totalSteps: 7,
    percent: 100,
    summary,
    rowCount: rows.length
  });

  // Sync to Admin Server DB
  try {
    const websiteId = store.get('settings.websiteId') || '';
    const { net } = require('electron');
    const { request } = require('https');
    
    // We can use native fetch or require('node-fetch') if available, but fetch is global in newer node/electron
    if (typeof fetch === 'function') {
      const serverUrl = store.get('settings.remoteControlUrl') || 'https://web-production-eaa42d1.up.railway.app';

      const payload = {
        websiteId,
        targetMonth: current.label,
        totalUsers: overallTotal.totalCount,
        returnedUsers: overallTotal.returnCount,
        totalDeposit: overallTotal.currentDepositSum,
        rawData: {
          dailyCounts,
          dailyDeps,
          summary,
        }
      };
      
      await fetch(serverUrl.replace(/\/+$/, '') + '/api/cohort-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.error('Cohort DB Sync error:', err));
    }
  } catch (err) {
    console.error('Failed to sync cohort to DB:', err);
  }

  return {
    ok: true,
    summary,
    rowCount: rows.length,
    rows
  };
}

function getCohortState() {
  return {
    cached: cachedCohortData,
    state: store.get('cohortState', { status: 'idle' }),
    monthsConfig: getCohortMonths()
  };
}

/**
 * Populate an Excel sheet with cohort members list
 */
function populateCohortMemberSheet(sheet, list, chronologicalMonths, currentMonthConfig, headerBgColor = 'FF1E293B') {
  // Columns definition:
  // ลำดับ | กลุ่ม | ยูสเซอร์ | เบอร์ | ชื่อ-นามสกุล | [ด.M6..M1] | จำนวนเดือนที่ฝาก | สถานะเดือนปัจจุบัน | ยอดฝากเดือนปัจจุบัน | ออนไลน์ล่าสุด | วันที่สมัคร
  const cols = [
    { header: 'ลำดับ', key: 'rank', width: 8 },
    { header: 'กลุ่มลูกค้า', key: 'groupKey', width: 14 },
    { header: 'ยูสเซอร์', key: 'username', width: 18 },
    { header: 'เบอร์โทร', key: 'phone', width: 16 },
    { header: 'ชื่อ-นามสกุล', key: 'name', width: 24 }
  ];

  chronologicalMonths.forEach((m) => {
    cols.push({ header: m.shortLabel, key: `m_${m.monthKey}`, width: 16 });
  });

  cols.push(
    { header: 'จำนวนเดือนที่ฝาก', key: 'activeMonthCount', width: 18 },
    { header: `สถานะ ${currentMonthConfig.shortLabel}`, key: 'returnStatus', width: 18 },
    { header: `ยอดฝาก ${currentMonthConfig.shortLabel}`, key: 'currentMonthDeposit', width: 20 },
    { header: 'ยอดฝากรวม 6 ด.', key: 'totalHistoricalDeposit', width: 20 },
    { header: 'ออนไลน์ล่าสุด', key: 'lastOnline', width: 20 },
    { header: 'วันที่สมัคร', key: 'registeredAt', width: 16 }
  );

  sheet.columns = cols;

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } } };
  });

  let sumCurrent = 0;
  let sumHistorical = 0;

  list.forEach((r, idx) => {
    sumCurrent += r.currentMonthDeposit || 0;
    sumHistorical += r.totalHistoricalDeposit || 0;

    const rowObj = {
      rank: r.rank || idx + 1,
      groupKey: `กลุ่ม ${r.groupKey}`,
      username: r.username,
      phone: r.phone || '-',
      name: r.name || '-',
      activeMonthCount: `${r.activeMonthCount}/6 เดือน`,
      returnStatus: r.hasReturned ? '✅ กลับมาแล้ว' : '❌ ยังไม่กลับมา',
      currentMonthDeposit: r.currentMonthDeposit || 0,
      totalHistoricalDeposit: r.totalHistoricalDeposit || 0,
      lastOnline: r.lastOnline || '-',
      registeredAt: r.registeredAt || '-'
    };

    chronologicalMonths.forEach((m) => {
      rowObj[`m_${m.monthKey}`] = r.monthlyDeposits[m.monthKey] || 0;
    });

    const row = sheet.addRow(rowObj);
    row.height = 22;

    row.getCell('rank').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('groupKey').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('username').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('name').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('activeMonthCount').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('returnStatus').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('lastOnline').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('registeredAt').alignment = { horizontal: 'center', vertical: 'middle' };

    // Format money cells
    chronologicalMonths.forEach((m) => {
      const c = row.getCell(`m_${m.monthKey}`);
      c.alignment = { horizontal: 'right', vertical: 'middle' };
      c.numFmt = '#,##0.00';
    });

    const cCur = row.getCell('currentMonthDeposit');
    cCur.alignment = { horizontal: 'right', vertical: 'middle' };
    cCur.numFmt = '#,##0.00';
    cCur.font = { bold: true };

    const cHist = row.getCell('totalHistoricalDeposit');
    cHist.alignment = { horizontal: 'right', vertical: 'middle' };
    cHist.numFmt = '#,##0.00';
    cHist.font = { bold: true };

    // Highlighting & Zebra stripes
    if (r.hasReturned) {
      row.getCell('returnStatus').font = { bold: true, color: { argb: 'FF059669' } };
    } else {
      row.getCell('returnStatus').font = { color: { argb: 'FFDC2626' } };
    }

    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        if (!cell.fill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    }
  });

  // Total summary row
  const totalObj = {
    rank: '',
    groupKey: '',
    username: 'รวมทั้งหมด',
    phone: `${list.length.toLocaleString('th-TH')} คน`,
    name: '',
    activeMonthCount: '',
    returnStatus: '',
    currentMonthDeposit: sumCurrent,
    totalHistoricalDeposit: sumHistorical,
    lastOnline: '',
    registeredAt: ''
  };
  chronologicalMonths.forEach((m) => {
    let mSum = 0;
    list.forEach((r) => { mSum += r.monthlyDeposits[m.monthKey] || 0; });
    totalObj[`m_${m.monthKey}`] = mSum;
  });

  const totalRow = sheet.addRow(totalObj);
  totalRow.height = 28;
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF475569' } }
    };
  });
  totalRow.getCell('username').alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };

  chronologicalMonths.forEach((m) => {
    const c = totalRow.getCell(`m_${m.monthKey}`);
    c.alignment = { horizontal: 'right', vertical: 'middle' };
    c.numFmt = '#,##0.00';
  });
  totalRow.getCell('currentMonthDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('currentMonthDeposit').numFmt = '#,##0.00';
  totalRow.getCell('totalHistoricalDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('totalHistoricalDeposit').numFmt = '#,##0.00';
}

/**
 * Export Cohort Data to Excel with Executive Dashboard Sheet + Subgroup Sheets
 */
async function exportCohortExcel(savePath, options = {}) {
  let rows = cachedCohortData.rows;
  let summary = cachedCohortData.summary;
  let monthsConfig = cachedCohortData.monthsConfig;

  if (!rows || !rows.length || !summary) {
    const res = await fetchCohortData(options);
    if (!res.ok) throw new Error(res.isCancelled ? 'การดึงข้อมูลถูกยกเลิก' : 'ไม่สามารถดึงข้อมูลกลุ่มลูกค้าได้');
    rows = cachedCohortData.rows;
    summary = cachedCohortData.summary;
    monthsConfig = cachedCohortData.monthsConfig;
  }

  const { current, chronological, latestHistorical } = monthsConfig;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: สรุปภาพรวม_Cohort (Executive Summary)
  // ==========================================
  const sumSheet = workbook.addWorksheet('สรุปภาพรวม_Cohort', { views: [{ showGridLines: true }] });
  sumSheet.columns = [
    { key: 'colA', width: 20 },
    { key: 'colB', width: 44 },
    { key: 'colC', width: 18 },
    { key: 'colD', width: 22 },
    { key: 'colE', width: 18 },
    { key: 'colF', width: 24 },
    { key: 'colG', width: 24 }
  ];

  // Header Title
  const titleRow = sumSheet.addRow({
    colA: 'รายงานวิเคราะห์กลุ่มลูกค้าและการกลับมาเล่น (Customer Retention & Cohort)',
    colB: '', colC: '', colD: '', colE: '', colF: '', colG: ''
  });
  sumSheet.mergeCells('A1:G1');
  titleRow.height = 36;
  titleRow.getCell('colA').font = { name: 'Segoe UI', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell('colA').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleRow.getCell('colA').alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle
  const subTitleText = `ช่วง 6 เดือนย้อนหลัง: ${chronological[0].fullLabel} ถึง ${latestHistorical.fullLabel}  |  ช่วงวัดผลการกลับมา: ${current.label}`;
  const subTitleRow = sumSheet.addRow({ colA: subTitleText });
  sumSheet.mergeCells('A2:G2');
  subTitleRow.height = 24;
  subTitleRow.getCell('colA').font = { name: 'Segoe UI', italic: true, size: 10, color: { argb: 'FF475569' } };
  subTitleRow.getCell('colA').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subTitleRow.getCell('colA').alignment = { horizontal: 'center', vertical: 'middle' };

  sumSheet.addRow({}); // blank row 3

  // Table Headers
  const tableHeaderRow = sumSheet.addRow({
    colA: 'กลุ่มลูกค้า',
    colB: 'คำอธิบายเกณฑ์',
    colC: 'สมาชิกทั้งหมด (คน)',
    colD: `กลับมาฝาก ${current.shortLabel} (คน)`,
    colE: 'อัตราการกลับมา (%)',
    colF: `ยอดฝาก ${current.shortLabel} (บาท)`,
    colG: 'ยอดฝากรวม 6 เดือน (บาท)'
  });
  tableHeaderRow.height = 28;
  tableHeaderRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } } };
  });

  const p1 = summary.parentGroups['1'];
  const p2 = summary.parentGroups['2'];
  const p3 = summary.parentGroups['3'];
  const sg = summary.subgroups;

  const dataRows = [
    // Parent 1
    {
      isParent: true,
      colA: 'กลุ่มที่ 1',
      colB: 'ฝากตั้งแต่ 3 เดือนขึ้นไป ใน 6 เดือนย้อนหลัง (3-6 เดือน)',
      colC: p1.totalCount,
      colD: p1.returnCount,
      colE: p1.returnRate / 100,
      colF: p1.currentDepositSum,
      colG: p1.historicalDepositSum,
      bgColor: 'FFFEF3C7',
      textColor: 'FF92400E'
    },
    {
      colA: '   ↳ กลุ่ม 1.1',
      colB: `ฝาก 3-6 เดือน และ ${latestHistorical.shortLabel} มียอดฝาก (ขาประจำต่อเนื่อง)`,
      colC: sg['1.1'].totalCount,
      colD: sg['1.1'].returnCount,
      colE: sg['1.1'].returnRate / 100,
      colF: sg['1.1'].currentDepositSum,
      colG: sg['1.1'].historicalDepositSum
    },
    {
      colA: '   ↳ กลุ่ม 1.2',
      colB: `ฝาก 3-5 เดือน แต่ ${latestHistorical.shortLabel} ไม่ได้ฝาก (ขาประจำเสี่ยงหลุด)`,
      colC: sg['1.2'].totalCount,
      colD: sg['1.2'].returnCount,
      colE: sg['1.2'].returnRate / 100,
      colF: sg['1.2'].currentDepositSum,
      colG: sg['1.2'].historicalDepositSum
    },
    // Parent 2
    {
      isParent: true,
      colA: 'กลุ่มที่ 2',
      colB: 'ฝาก 2 เดือน ใน 6 เดือนย้อนหลัง',
      colC: p2.totalCount,
      colD: p2.returnCount,
      colE: p2.returnRate / 100,
      colF: p2.currentDepositSum,
      colG: p2.historicalDepositSum,
      bgColor: 'FFDBEAFE',
      textColor: 'FF1E40AF'
    },
    {
      colA: '   ↳ กลุ่ม 2.1',
      colB: `ฝาก 2 เดือน และ ${latestHistorical.shortLabel} มียอดฝาก (ทั่วไปยังเล่น)`,
      colC: sg['2.1'].totalCount,
      colD: sg['2.1'].returnCount,
      colE: sg['2.1'].returnRate / 100,
      colF: sg['2.1'].currentDepositSum,
      colG: sg['2.1'].historicalDepositSum
    },
    {
      colA: '   ↳ กลุ่ม 2.2',
      colB: `ฝาก 2 เดือน แต่ ${latestHistorical.shortLabel} ไม่ได้ฝาก (ทั่วไปหยุดเล่น)`,
      colC: sg['2.2'].totalCount,
      colD: sg['2.2'].returnCount,
      colE: sg['2.2'].returnRate / 100,
      colF: sg['2.2'].currentDepositSum,
      colG: sg['2.2'].historicalDepositSum
    },
    // Parent 3
    {
      isParent: true,
      colA: 'กลุ่มที่ 3',
      colB: 'ฝาก 1 เดือน ใน 6 เดือนย้อนหลัง',
      colC: p3.totalCount,
      colD: p3.returnCount,
      colE: p3.returnRate / 100,
      colF: p3.currentDepositSum,
      colG: p3.historicalDepositSum,
      bgColor: 'FFD1FAE5',
      textColor: 'FF065F46'
    },
    {
      colA: '   ↳ กลุ่ม 3.1',
      colB: `ฝาก 1 เดือน และ ${latestHistorical.shortLabel} มียอดฝาก (ลูกค้าใหม่เดือนล่าสุด)`,
      colC: sg['3.1'].totalCount,
      colD: sg['3.1'].returnCount,
      colE: sg['3.1'].returnRate / 100,
      colF: sg['3.1'].currentDepositSum,
      colG: sg['3.1'].historicalDepositSum
    },
    {
      colA: '   ↳ กลุ่ม 3.2',
      colB: `ฝาก 1 เดือน แต่ ${latestHistorical.shortLabel} ไม่ได้ฝาก (ลูกค้าเก่าครั้งเดียว)`,
      colC: sg['3.2'].totalCount,
      colD: sg['3.2'].returnCount,
      colE: sg['3.2'].returnRate / 100,
      colF: sg['3.2'].currentDepositSum,
      colG: sg['3.2'].historicalDepositSum
    }
  ];

  dataRows.forEach((r) => {
    const row = sumSheet.addRow(r);
    row.height = r.isParent ? 26 : 22;

    row.getCell('colA').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('colB').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('colC').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('colC').numFmt = '#,##0';
    row.getCell('colD').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('colD').numFmt = '#,##0';
    row.getCell('colE').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('colE').numFmt = '0.00%';
    row.getCell('colF').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('colF').numFmt = '#,##0.00';
    row.getCell('colG').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('colG').numFmt = '#,##0.00';

    if (r.isParent) {
      row.eachCell((cell) => {
        cell.font = { bold: true, name: 'Segoe UI', size: 10, color: { argb: r.textColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.bgColor } };
      });
    } else {
      row.getCell('colA').font = { name: 'Segoe UI', size: 10 };
      row.getCell('colE').font = { bold: true, color: { argb: 'FF059669' } };
    }
  });

  // Overall Total Row
  const ov = summary.overall;
  const overallRow = sumSheet.addRow({
    colA: 'รวมทั้งหมด',
    colB: 'สมาชิกรวมทุกกลุ่ม 6 เดือนย้อนหลัง',
    colC: ov.totalCount,
    colD: ov.returnCount,
    colE: ov.returnRate / 100,
    colF: ov.currentDepositSum,
    colG: ov.historicalDepositSum
  });
  overallRow.height = 30;
  overallRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 11, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF475569' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  });
  overallRow.getCell('colA').alignment = { horizontal: 'center', vertical: 'middle' };
  overallRow.getCell('colC').alignment = { horizontal: 'right', vertical: 'middle' };
  overallRow.getCell('colC').numFmt = '#,##0';
  overallRow.getCell('colD').alignment = { horizontal: 'right', vertical: 'middle' };
  overallRow.getCell('colD').numFmt = '#,##0';
  overallRow.getCell('colE').alignment = { horizontal: 'right', vertical: 'middle' };
  overallRow.getCell('colE').numFmt = '0.00%';
  overallRow.getCell('colF').alignment = { horizontal: 'right', vertical: 'middle' };
  overallRow.getCell('colF').numFmt = '#,##0.00';
  overallRow.getCell('colG').alignment = { horizontal: 'right', vertical: 'middle' };
  overallRow.getCell('colG').numFmt = '#,##0.00';

  // ==========================================
  // SHEET 2: สมาชิกทั้งหมด (All Members)
  // ==========================================
  const allSheet = workbook.addWorksheet('สมาชิกทั้งหมด_6เดือน', { views: [{ showGridLines: true }] });
  populateCohortMemberSheet(allSheet, rows, chronological, current, 'FF1E293B');

  // ==========================================
  // SHEETS 3 - 8: Separate Subgroup Sheets
  // ==========================================
  const subgroupConfigs = [
    { key: '1.1', title: 'กลุ่ม_1.1_ขาประจำต่อเนื่อง', color: 'FFB45309' },
    { key: '1.2', title: 'กลุ่ม_1.2_ขาประจำเสี่ยงหลุด', color: 'FFD97706' },
    { key: '2.1', title: 'กลุ่ม_2.1_ทั่วไปยังเล่น', color: 'FF1D4ED8' },
    { key: '2.2', title: 'กลุ่ม_2.2_ทั่วไปหยุดเล่น', color: 'FF2563EB' },
    { key: '3.1', title: 'กลุ่ม_3.1_ลูกค้าใหม่', color: 'FF047857' },
    { key: '3.2', title: 'กลุ่ม_3.2_ลูกค้าเก่าครั้งเดียว', color: 'FF059669' }
  ];

  subgroupConfigs.forEach((cfg) => {
    const subList = rows.filter((r) => r.groupKey === cfg.key);
    const subSheet = workbook.addWorksheet(cfg.title, { views: [{ showGridLines: true }] });
    populateCohortMemberSheet(subSheet, subList, chronological, current, cfg.color);
  });

  const now = new Date();
  const defaultFilename = `NK_กลุ่มลูกค้า_Retention_${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await workbook.xlsx.writeFile(outputPath);

  return {
    ok: true,
    filePath: outputPath,
    rowCount: rows.length,
    summary
  };
}

module.exports = {
  getCohortMonths,
  fetchCohortData,
  cancelCohortFetch,
  getCohortState,
  exportCohortExcel
};
