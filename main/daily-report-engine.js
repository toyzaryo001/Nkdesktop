'use strict';

const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const apiEngine = require('./api-engine');
const store = require('./store');

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Get current Bangkok date components
 */
function getBangkokNow() {
  const bkk = apiEngine.getBangkokDateParts
    ? apiEngine.getBangkokDateParts(new Date())
    : {
        year: String(new Date().getFullYear()),
        month: pad(new Date().getMonth() + 1),
        day: pad(new Date().getDate()),
        hour: pad(new Date().getHours()),
        minute: pad(new Date().getMinutes())
      };
  return bkk;
}

/**
 * Get yesterday date string in YYYY-MM-DD (Bangkok time)
 */
function getBangkokYesterdayStr() {
  const bkk = getBangkokNow();
  const d = new Date(`${bkk.year}-${bkk.month}-${bkk.day}T12:00:00+07:00`);
  d.setDate(d.getDate() - 1);
  return apiEngine.getBangkokDateString
    ? apiEngine.getBangkokDateString(d)
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Total days in a month for a given year & month (e.g. '2026-09' -> 30)
 */
function getDaysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

const CACHE_VERSION = 3; // v3: includes bonus and reward recipient counts

/**
 * Truncate decimals completely (drop fractional part, take only integer)
 */
function toInt(val) {
  if (val == null || isNaN(val)) return 0;
  return Math.trunc(Number(val));
}

/**
 * Extract credit adjustments (increase / decrease) from credit-history rows
 */
function extractAdjustmentsFromRows(rows = []) {
  let inAmt = 0;
  let outAmt = 0;

  for (const item of rows) {
    const s = String(item.status || '').toLowerCase();
    if (['rejected', 'cancel', 'failed'].includes(s)) continue;

    const category = String(item.category || '').toLowerCase();
    const method = String(item.method || '').toLowerCase();
    const direction = String(item.direction || '').toLowerCase();
    const txid = String(item.transaction_id || '').toLowerCase();
    const noteText = String(item.note || '');

    // Must be manual adjustment
    const looksManual = category === 'adjustment' ||
                        /^manual_adjust:/.test(txid) ||
                        /increase_credit|decrease_credit/i.test(method);
    if (!looksManual) continue;

    // Strictly exclude promotions, bonuses, campaigns
    if (item.promotion_id != null || item.campaign_id != null) continue;
    if (category === 'bonus' || /bonus|โบนัส/i.test(method) || /bonus|โบนัส/i.test(item.campaign_name || '')) continue;

    const amt = Math.abs(Number(item.amount || 0));
    if (amt <= 0) continue;

    let isDeduct = false;
    if (direction === 'out') {
      isDeduct = true;
    } else if (direction === 'in') {
      isDeduct = false;
    } else if (/decrease|deduct|reduce/i.test(method)) {
      isDeduct = true;
    } else if (/increase|add/i.test(method)) {
      isDeduct = false;
    } else if (item.before_credit != null && item.after_credit != null && Number(item.before_credit) > Number(item.after_credit)) {
      isDeduct = true;
    } else if (item.before_credit != null && item.after_credit != null && Number(item.before_credit) < Number(item.after_credit)) {
      isDeduct = false;
    } else if (Number(item.amount || 0) < 0) {
      isDeduct = true;
    } else if (/ลดเครดิต|หักเครดิต|ดึงคืน|เข้าซ้ำ|ตัดยอด|ลดยอด/i.test(noteText)) {
      isDeduct = true;
    }

    if (isDeduct) {
      outAmt += amt;
    } else {
      inAmt += amt;
    }
  }

  return { inAmt, outAmt };
}

/**
 * Parse and normalize a single day's API summary into table row schema (Integers only)
 */
function mapSummaryToRow(dayNumStr, dateStr, s = {}) {
  const depositAmt = toInt(s.deposit?.amount);
  const withdrawAmt = toInt(s.withdraw?.amount);
  const profitLoss = depositAmt - withdrawAmt;
  const netIncome = s.profit != null ? toInt(s.profit) : profitLoss;

  const rawManualDep = toInt(s.manual_deposit?.amount);
  const rawManualWd = toInt(s.manual_withdraw?.amount);
  const adjustIn = toInt(s._adjustIn || 0);
  const adjustOut = toInt(s._adjustOut || 0);

  return {
    day: dayNumStr,
    dateStr,
    isCompleted: true,
    _v: CACHE_VERSION,
    register: toInt(s.register),
    registerWithDeposit: toInt(s.register_with_deposit),
    activeMembers: toInt(s.active_members),
    commission: toInt(s.play_commission?.amount),
    manualDeposit: rawManualDep + adjustIn,
    manualWithdraw: rawManualWd + adjustOut,
    bonus: toInt(s.bonus_deposit?.bonus ?? s.bonus_deposit?.amount),
    bonusCount: toInt(s.bonus_deposit?.count ?? s.bonus_deposit?.member_count ?? s.bonus_deposit?.user_count),
    referral: toInt(s.referral?.amount),
    cashback: toInt(s.loss_cashback),
    luckyWheel: toInt(s.lucky_wheel),
    reward: toInt(s.reward_credit?.amount),
    rewardCount: toInt(s.reward_credit?.count ?? s.reward_credit?.member_count ?? s.reward_credit?.user_count),
    deposit: depositAmt,
    withdraw: withdrawAmt,
    profitLoss,
    profit: netIncome
  };
}

/**
 * Create an empty row with 0s for future/pending days
 */
function createEmptyRow(dayNumStr, dateStr) {
  return {
    day: dayNumStr,
    dateStr,
    isCompleted: false,
    _v: CACHE_VERSION,
    register: 0,
    registerWithDeposit: 0,
    activeMembers: 0,
    commission: 0,
    manualDeposit: 0,
    manualWithdraw: 0,
    bonus: 0,
    bonusCount: 0,
    referral: 0,
    cashback: 0,
    luckyWheel: 0,
    reward: 0,
    rewardCount: 0,
    deposit: 0,
    withdraw: 0,
    profitLoss: 0,
    profit: 0
  };
}

/**
 * Fetch a single day from BackOffice /dashboard/daily and /credit-history
 */
async function fetchDayData(dateStr) {
  const context = store.get('apiBusinessContext', {}) || {};
  const settings = store.get('settings', {}) || {};
  const websiteId = Number(context.websiteId || settings.targetWebsiteId || 0);
  if (!websiteId) return {};

  const [dailyRes, creditHistRes] = await Promise.allSettled([
    apiEngine.apiFetchJson(
      '/dashboard/daily',
      {
        website_id: websiteId,
        start_date: dateStr,
        end_date: dateStr
      },
      { retries: 1 }
    ),
    apiEngine.apiFetchJson(
      '/credit-history',
      {
        website_id: websiteId,
        start_date: dateStr,
        end_date: dateStr,
        limit: 200,
        sort: 'transaction_at',
        order: 'desc'
      },
      { retries: 1 }
    )
  ]);

  const summary = dailyRes.status === 'fulfilled' ? (dailyRes.value?.summary || {}) : {};

  let adjustIn = 0;
  let adjustOut = 0;

  if (creditHistRes.status === 'fulfilled') {
    const rows = apiEngine.apiDataArray(creditHistRes.value);
    const { inAmt, outAmt } = extractAdjustmentsFromRows(rows);
    adjustIn = inAmt;
    adjustOut = outAmt;
  }

  return {
    ...summary,
    _adjustIn: adjustIn,
    _adjustOut: adjustOut
  };
}

/**
 * Get or sync monthly table data
 * @param {string} targetYearMonth 'YYYY-MM' (defaults to current Bangkok month)
 * @param {boolean} forceSync If true, re-fetches missing or existing data
 */
async function getMonthTableData(targetYearMonth = null, forceSync = false) {
  const bkk = getBangkokNow();
  const ym = targetYearMonth || `${bkk.year}-${bkk.month}`;
  const [yearStr, monthStr] = ym.split('-');
  const totalDays = getDaysInMonth(yearStr, monthStr);

  const yesterdayStr = getBangkokYesterdayStr();
  const currentYm = `${bkk.year}-${bkk.month}`;
  const isCurrentMonth = ym === currentYm;

  // Cache storage key
  const allCache = store.get('dailyReportCache', {}) || {};
  const monthCache = allCache[ym] || {};

  // Determine which days need to be fetched
  const pendingDays = [];
  const maxDayToFetch = isCurrentMonth ? Number(yesterdayStr.split('-')[2]) : totalDays;

  for (let d = 1; d <= maxDayToFetch; d++) {
    const dayStr = pad(d);
    const dateStr = `${ym}-${dayStr}`;

    // If date is beyond yesterday, do not fetch
    if (dateStr > yesterdayStr) continue;

    const isOutdated = !monthCache[dayStr] || !monthCache[dayStr]._v || monthCache[dayStr]._v < CACHE_VERSION;
    if (forceSync || isOutdated) {
      pendingDays.push({ dayStr, dateStr });
    }
  }

  // Fetch pending days concurrently (batch size 4)
  if (pendingDays.length > 0) {
    const concurrency = 4;
    for (let i = 0; i < pendingDays.length; i += concurrency) {
      const batch = pendingDays.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (item) => {
          try {
            const rawSummary = await fetchDayData(item.dateStr);
            monthCache[item.dayStr] = mapSummaryToRow(item.dayStr, item.dateStr, rawSummary);
          } catch (err) {
            console.warn(`[DailyReport] Failed to fetch ${item.dateStr}:`, err.message);
          }
        })
      );
    }

    // Save updated cache
    allCache[ym] = monthCache;
    store.set('dailyReportCache', allCache);
  }

  // Assemble the full monthly rows (01..totalDays)
  const rows = [];
  const total = {
    register: 0,
    registerWithDeposit: 0,
    activeMembers: 0,
    commission: 0,
    manualDeposit: 0,
    manualWithdraw: 0,
    bonus: 0,
    bonusCount: 0,
    referral: 0,
    cashback: 0,
    luckyWheel: 0,
    reward: 0,
    rewardCount: 0,
    deposit: 0,
    withdraw: 0,
    profitLoss: 0,
    profit: 0
  };

  for (let d = 1; d <= totalDays; d++) {
    const dayStr = pad(d);
    const dateStr = `${ym}-${dayStr}`;

    let row = monthCache[dayStr];
    if (!row || dateStr > yesterdayStr) {
      row = createEmptyRow(dayStr, dateStr);
    } else {
      row = {
        day: dayStr,
        dateStr,
        isCompleted: true,
        register: toInt(row.register),
        registerWithDeposit: toInt(row.registerWithDeposit),
        activeMembers: toInt(row.activeMembers),
        commission: toInt(row.commission),
        manualDeposit: toInt(row.manualDeposit),
        manualWithdraw: toInt(row.manualWithdraw),
        bonus: toInt(row.bonus),
        bonusCount: toInt(row.bonusCount),
        referral: toInt(row.referral),
        cashback: toInt(row.cashback),
        luckyWheel: toInt(row.luckyWheel),
        reward: toInt(row.reward),
        rewardCount: toInt(row.rewardCount),
        deposit: toInt(row.deposit),
        withdraw: toInt(row.withdraw),
        profitLoss: toInt(row.deposit) - toInt(row.withdraw),
        profit: toInt(row.profit)
      };
    }

    rows.push(row);

    if (row.isCompleted) {
      total.register += row.register;
      total.registerWithDeposit += row.registerWithDeposit;
      total.activeMembers += row.activeMembers;
      total.commission += row.commission;
      total.manualDeposit += row.manualDeposit;
      total.manualWithdraw += row.manualWithdraw;
      total.bonus += row.bonus;
      total.bonusCount += row.bonusCount;
      total.referral += row.referral;
      total.cashback += row.cashback;
      total.luckyWheel += row.luckyWheel;
      total.reward += row.reward;
      total.rewardCount += row.rewardCount;
      total.deposit += row.deposit;
      total.withdraw += row.withdraw;
      total.profitLoss += row.profitLoss;
      total.profit += row.profit;
    }
  }

  const context = store.get('apiBusinessContext', {}) || {};
  const settings = store.get('settings', {}) || {};
  const siteName = context.siteName || settings.targetWebsiteName || 'BackOffice';

  return {
    ok: true,
    yearMonth: ym,
    siteName,
    yesterdayStr,
    totalDays,
    rows,
    total,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Auto Midnight Worker check
 * Checks if yesterday's data has been synced. If not, syncs it in background.
 * Returns true if new data was synced.
 */
let isMidnightSyncRunning = false;
async function checkMidnightSync(notifyCallback = null) {
  if (isMidnightSyncRunning) return false;
  const bkk = getBangkokNow();
  const yesterdayStr = getBangkokYesterdayStr();
  const [yYear, yMonth, yDay] = yesterdayStr.split('-');
  const ym = `${yYear}-${yMonth}`;

  const allCache = store.get('dailyReportCache', {}) || {};
  const monthCache = allCache[ym] || {};

  // Check if yesterday is already cached with latest adjustment calculation
  if (monthCache[yDay] && monthCache[yDay].isCompleted && monthCache[yDay]._v >= CACHE_VERSION) {
    return false; // Already up to date
  }

  // Need to sync yesterday
  isMidnightSyncRunning = true;
  try {
    const rawSummary = await fetchDayData(yesterdayStr);
    monthCache[yDay] = mapSummaryToRow(yDay, yesterdayStr, rawSummary);
    allCache[ym] = monthCache;
    store.set('dailyReportCache', allCache);

    if (typeof notifyCallback === 'function') {
      notifyCallback({ yesterdayStr, ym });
    }
    return true;
  } catch (err) {
    console.warn('[DailyReport] Midnight sync error:', err.message);
    return false;
  } finally {
    isMidnightSyncRunning = false;
  }
}

/**
 * Export Monthly Report as Excel (.xlsx) matching the yellow-header template
 */
async function exportToExcel(targetYearMonth = null, savePath = null) {
  const data = await getMonthTableData(targetYearMonth, false);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(data.siteName || 'DailyReport', {
    views: [{ showGridLines: true }]
  });

  // Top title banner
  sheet.mergeCells('A1:P1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = data.siteName.replace(/\s+/g, '').toUpperCase();
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.font = { name: 'Segoe UI', bold: true, size: 12, color: { argb: 'FF000000' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
  sheet.getRow(1).height = 26;

  // Header row (Row 2) - Columns without "เพจที่รัน" and "จำนวนทัก"
  sheet.columns = [
    { key: 'day', width: 8 },
    { key: 'register', width: 12 },
    { key: 'registerWithDeposit', width: 16 },
    { key: 'activeMembers', width: 16 },
    { key: 'commission', width: 12 },
    { key: 'manualDeposit', width: 12 },
    { key: 'manualWithdraw', width: 12 },
    { key: 'bonus', width: 14 },
    { key: 'referral', width: 14 },
    { key: 'cashback', width: 14 },
    { key: 'luckyWheel', width: 14 },
    { key: 'reward', width: 12 },
    { key: 'deposit', width: 16 },
    { key: 'withdraw', width: 16 },
    { key: 'profitLoss', width: 16 },
    { key: 'profit', width: 16 }
  ];

  const headers = [
    'วันที่', 'สมัครใหม่', 'สมัครใหม่ฝากเงิน', 'Active จำนวนคนใช้งาน',
    'คอมมิชชั่น', 'เติม A', 'ลด A', 'ฝากโบนัส', 'แนะนำเพื่อน',
    'คืนยอดเสีย', 'กงล้อนำโชค', 'รีวอร์ด', 'ฝากเงิน', 'ถอนเงิน',
    'กำไรขาดทุน', 'สรุปรายได้'
  ];

  const hRow = sheet.getRow(2);
  hRow.values = headers;
  hRow.height = 28;
  hRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
  });

  // Data rows
  data.rows.forEach((r, idx) => {
    const row = sheet.addRow({
      day: r.day,
      register: r.register,
      registerWithDeposit: r.registerWithDeposit,
      activeMembers: r.activeMembers,
      commission: r.commission,
      manualDeposit: r.manualDeposit,
      manualWithdraw: r.manualWithdraw,
      bonus: r.bonus,
      referral: r.referral,
      cashback: r.cashback,
      luckyWheel: r.luckyWheel,
      reward: r.reward,
      deposit: r.deposit,
      withdraw: r.withdraw,
      profitLoss: r.profitLoss,
      profit: r.profit
    });

    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.alignment = { horizontal: colNum === 1 ? 'center' : 'right', vertical: 'middle' };
      if (colNum > 1) {
        cell.numFmt = '#,##0';
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });
  });

  // Summary Row (รวม)
  const sumRow = sheet.addRow({
    day: 'รวม',
    register: data.total.register,
    registerWithDeposit: data.total.registerWithDeposit,
    activeMembers: data.total.activeMembers,
    commission: data.total.commission,
    manualDeposit: data.total.manualDeposit,
    manualWithdraw: data.total.manualWithdraw,
    bonus: data.total.bonus,
    referral: data.total.referral,
    cashback: data.total.cashback,
    luckyWheel: data.total.luckyWheel,
    reward: data.total.reward,
    deposit: data.total.deposit,
    withdraw: data.total.withdraw,
    profitLoss: data.total.profitLoss,
    profit: data.total.profit
  });

  sumRow.height = 26;
  sumRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: colNum === 1 ? 'center' : 'right', vertical: 'middle' };
    if (colNum > 1) cell.numFmt = '#,##0';
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
  });

  const defaultFilename = `ตารางสรุปรายวัน_${data.siteName}_${data.yearMonth}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);
  await workbook.xlsx.writeFile(outputPath);

  return {
    ok: true,
    filePath: outputPath,
    filename: path.basename(outputPath)
  };
}

module.exports = {
  getBangkokNow,
  getBangkokYesterdayStr,
  getMonthTableData,
  checkMidnightSync,
  exportToExcel
};
