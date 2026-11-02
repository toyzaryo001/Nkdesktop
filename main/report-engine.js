'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const apiEngine = require('./api-engine');
const store = require('./store');

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDate(d = new Date()) {
  return apiEngine.getBangkokDateString ? apiEngine.getBangkokDateString(d) : d.toISOString().slice(0, 10);
}

function apiTransactionToDepositRow(tx, pageNo, rowOnPage) {
  const bankCode = tx.to_bank_code || tx.bank?.code || '';
  const account = String(tx.to_bank_number || tx.bank?.account || '-');
  const owner = tx.to_bank_name || [tx.bank?.first_name, tx.bank?.last_name].filter(Boolean).join(' ') || '-';
  const amount = Number(tx.amount);
  return {
    pageNo,
    rowOnPage,
    createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(tx.created_at || tx.transaction_at) : (tx.created_at || '-'),
    approvedAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(tx.approved_at || tx.processed_at || tx.transaction_at) : (tx.approved_at || '-'),
    username: tx.game_username || tx.member?.game_username || '-',
    name: tx.member?.fullname || tx.from_bank_name || '-',
    phone: apiEngine.apiDisplayPhone(tx.phone || tx.member?.phone || '') || '-',
    amount: Number.isFinite(amount) ? amount : 0,
    credit: `${tx.before_credit ?? '-'} → ${tx.after_credit ?? '-'}`,
    type: tx.method || tx.type || tx.process_type || '-',
    recipientName: apiEngine.apiBankName(bankCode),
    recipientAccount: account,
    recipientOwner: owner,
    status: /success|complete|approved/i.test(String(tx.status || '')) ? 'สำเร็จ' : (tx.status || '-'),
    note: tx.note || '-'
  };
}

// In-memory cache for fetched report data
let cachedDepositData = {
  config: null,
  rows: null,
  summary: null,
  fetchedAt: null
};

let cachedRewardData = {
  config: null,
  rows: null,
  summary: null,
  fetchedAt: null
};

let cachedMonthlyRankingData = {
  config: null,
  rows: null,
  summary: null,
  fetchedAt: null
};

let cachedReconciliationData = {
  config: null,
  rows: null,
  summary: null,
  findings: null,
  fetchedAt: null
};

/**
 * 1. ดึงข้อมูลรายงานฝาก (เมนู 3.1) และสรุปยอดโดยยังไม่ส่งออกไฟล์ Excel
 */
async function fetchDepositData(config = {}) {
  const bkk = apiEngine.getBangkokDateParts ? apiEngine.getBangkokDateParts(new Date()) : { year: new Date().getFullYear(), month: '01', day: '01' };
  const defaults = {
    startDate: `${bkk.year}-${bkk.month}-01`,
    endDate: `${bkk.year}-${bkk.month}-${bkk.day}`,
    pageSize: 200
  };

  const normalized = {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(config.startDate || '')) ? String(config.startDate) : defaults.startDate,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(config.endDate || '')) ? String(config.endDate) : defaults.endDate,
    pageSize: Number(config.pageSize) || 200
  };

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('depositState', {
    status: 'starting',
    requestId,
    config: normalized,
    message: `กำลังเริ่มดึงรายงานฝาก ${normalized.startDate} ถึง ${normalized.endDate}`,
    currentPage: 0,
    totalPages: 0,
    rowCount: 0,
    startedAt
  });

  try {
    const context = await apiEngine.getApiBusinessContext();
    const first = await apiEngine.apiFetchJson('/transactions', {
      type: 'deposit',
      page: 1,
      limit: normalized.pageSize,
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      process_type: 'all',
      sort: 'transaction_at',
      order: 'desc',
      website_id: context.websiteId,
      website_agent_id: context.agentId || undefined
    });

    const firstRaw = apiEngine.apiDataArray(first).filter((tx) =>
      String(tx?.category || '').toLowerCase() === 'deposit' || String(tx?.direction || '').toLowerCase() === 'in'
    );
    const paging = apiEngine.apiPagination(first, 1, normalized.pageSize, apiEngine.apiDataArray(first).length);
    let totalPages = paging.totalPages || (apiEngine.apiDataArray(first).length < normalized.pageSize ? 1 : 0);

    const rawByPage = new Map([[1, firstRaw]]);
    let completed = 1;
    let rowCount = firstRaw.length;

    store.set('depositState', {
      status: 'running',
      requestId,
      config: normalized,
      message: `กำลังดึงข้อมูลผ่าน API · หน้า 1/${totalPages || '?'}`,
      currentPage: 1,
      totalPages: totalPages || 1,
      rowCount,
      startedAt
    });

    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const concurrency = 5;
      let cursor = 0;

      const worker = async () => {
        while (cursor < pages.length) {
          const page = pages[cursor++];
          const payload = await apiEngine.apiFetchJson('/transactions', {
            type: 'deposit',
            page,
            limit: normalized.pageSize,
            start_date: normalized.startDate,
            end_date: normalized.endDate,
            process_type: 'all',
            sort: 'transaction_at',
            order: 'desc',
            website_id: context.websiteId,
            website_agent_id: context.agentId || undefined
          });
          const raw = apiEngine.apiDataArray(payload).filter((tx) =>
            String(tx?.category || '').toLowerCase() === 'deposit' || String(tx?.direction || '').toLowerCase() === 'in'
          );
          rawByPage.set(page, raw);
          completed++;
          rowCount += raw.length;

          store.set('depositState', {
            status: 'running',
            requestId,
            config: normalized,
            message: `กำลังดึงข้อมูลผ่าน API · ${completed}/${totalPages} หน้า`,
            currentPage: completed,
            totalPages,
            rowCount,
            startedAt
          });
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
    }

    const seen = new Set();
    const rows = [];
    let totalAmount = 0;
    let successCount = 0;
    let successAmount = 0;
    let otherCount = 0;
    let otherAmount = 0;
    const byBank = {};
    const byType = {};

    for (const page of [...rawByPage.keys()].sort((a, b) => a - b)) {
      const list = rawByPage.get(page) || [];
      list.forEach((tx, idx) => {
        const sig = String(tx.id || tx.transaction_id || [tx.created_at, tx.game_username, tx.amount].join('|'));
        if (seen.has(sig)) return;
        seen.add(sig);
        const row = apiTransactionToDepositRow(tx, page, idx + 1);
        rows.push(row);

        const amt = Number(row.amount) || 0;
        totalAmount += amt;

        if (row.status === 'สำเร็จ') {
          successCount++;
          successAmount += amt;
        } else {
          otherCount++;
          otherAmount += amt;
        }

        const b = row.recipientName || 'ไม่ระบุธนาคาร';
        if (!byBank[b]) byBank[b] = { count: 0, amount: 0 };
        byBank[b].count++;
        byBank[b].amount += amt;

        const t = row.type || 'ทั่วไป';
        if (!byType[t]) byType[t] = { count: 0, amount: 0 };
        byType[t].count++;
        byType[t].amount += amt;
      });
    }

    const summary = {
      totalRows: rows.length,
      totalAmount,
      successCount,
      successAmount,
      otherCount,
      otherAmount,
      byBank,
      byType
    };

    cachedDepositData = {
      config: normalized,
      rows,
      summary,
      fetchedAt: Date.now()
    };

    const finalState = {
      status: 'preview',
      requestId,
      config: normalized,
      message: `ดึงข้อมูลสำเร็จ ${rows.length.toLocaleString('th-TH')} รายการ ยอดรวม ฿${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      rowCount: rows.length,
      summary,
      finishedAt: Date.now()
    };
    store.set('depositState', finalState);

    return { ok: true, summary, rowCount: rows.length, config: normalized };
  } catch (error) {
    store.set('depositState', {
      status: 'error',
      requestId,
      config: normalized,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

/**
 * 2. ส่งออกไฟล์ Excel สำหรับรายงานฝาก (เมนู 3.1)
 */
async function exportDepositWorkbook(savePath = null, config = null) {
  let rows = cachedDepositData.rows;
  let normalized = cachedDepositData.config || config;

  if (!rows || !rows.length) {
    await fetchDepositData(normalized || {});
    rows = cachedDepositData.rows;
    normalized = cachedDepositData.config;
  }

  // Build Excel Workbook using exceljs
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('รายงานฝาก 3.1', {
    views: [{ showGridLines: true }]
  });

  sheet.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'เวลาที่สร้าง', key: 'createdAt', width: 19 },
    { header: 'เวลาอนุมัติ', key: 'approvedAt', width: 19 },
    { header: 'ยูสเซอร์', key: 'username', width: 16 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'ยอดเงิน (บาท)', key: 'amount', width: 16 },
    { header: 'เครดิต ก่อน → หลัง', key: 'credit', width: 20 },
    { header: 'ช่องทาง', key: 'type', width: 14 },
    { header: 'ธนาคารปลายทาง', key: 'recipientName', width: 20 },
    { header: 'เลขบัญชี', key: 'recipientAccount', width: 18 },
    { header: 'ชื่อบัญชี', key: 'recipientOwner', width: 22 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 25 }
  ];

  // Style Header Row
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach((r, idx) => {
    const row = sheet.addRow({
      seq: idx + 1,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.amount,
      credit: r.credit,
      type: r.type,
      recipientName: r.recipientName,
      recipientAccount: r.recipientAccount,
      recipientOwner: r.recipientOwner,
      status: r.status,
      note: r.note
    });

    row.height = 22;
    row.getCell('amount').numFmt = '#,##0.00';
    row.getCell('seq').alignment = { horizontal: 'center' };
    row.getCell('status').alignment = { horizontal: 'center' };

    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  });

  const d = new Date();
  const defaultFilename = `NK_รายงานฝาก_3.1_${normalized.startDate}_ถึง_${normalized.endDate}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  const finalState = {
    status: 'done',
    config: normalized,
    message: `สร้างรายงานสำเร็จ ${rows.length.toLocaleString('th-TH')} รายการ`,
    rowCount: rows.length,
    summary: cachedDepositData.summary,
    filePath: outputPath,
    finishedAt: Date.now()
  };
  store.set('depositState', finalState);

  return { ok: true, filePath: outputPath, rowCount: rows.length, summary: cachedDepositData.summary };
}

async function runDepositReport(config = {}, savePath = null) {
  await fetchDepositData(config);
  return exportDepositWorkbook(savePath, config);
}

/**
 * 3. ดึงข้อมูลรายงานรวม BONUS + แลกแต้ม 1.9 + ปรับเครดิตแมนนวล และสรุปยอดโดยยังไม่ส่งออกไฟล์ Excel
 */
async function fetchRewardData(config = {}) {
  const bkk = apiEngine.getBangkokDateParts ? apiEngine.getBangkokDateParts(new Date()) : { year: new Date().getFullYear(), month: '01', day: '01' };
  const defaults = {
    startDate: `${bkk.year}-${bkk.month}-01`,
    endDate: `${bkk.year}-${bkk.month}-${bkk.day}`
  };

  const normalized = {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(config.startDate || '')) ? String(config.startDate) : defaults.startDate,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(config.endDate || '')) ? String(config.endDate) : defaults.endDate
  };

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('rewardState', {
    status: 'starting',
    requestId,
    config: normalized,
    message: 'กำลังเชื่อม API แมนนวล + ปรับยอด + โบนัส + แลกแต้ม...',
    currentPage: 0,
    totalPages: 0,
    matchedCount: 0,
    startedAt
  });

  try {
    const context = await apiEngine.getApiBusinessContext();
    const combined = [];
    const seen = new Set();

    // 1. Manual Deposits from /transactions (เมนู 1.4 ฝากมือ)
    try {
      let page = 1;
      while (page <= 200) {
        const payload = await apiEngine.apiFetchJson('/transactions', {
          type: 'deposit',
          process_type: 'manual',
          page,
          limit: 200,
          start_date: normalized.startDate,
          end_date: normalized.endDate,
          sort: 'transaction_at',
          order: 'desc',
          website_id: context.websiteId,
          website_agent_id: context.agentId || undefined
        });
        const raw = apiEngine.apiDataArray(payload);
        for (const item of raw) {
          const pType = String(item.process_type || '').toLowerCase();
          const meth = String(item.method || '').toLowerCase();
          const isManual = pType === 'manual' || meth === 'manual' || item.type === 'manual' || !item.process_type;
          if (!isManual && item.process_type && item.process_type !== 'manual') continue;

          const key = `TX_DEP:${String(item?.id ?? item?.transaction_id)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const bankCode = String(item.to_bank_code || item.bank?.code || '').trim();
          const bankNumber = String(item.to_bank_number || item.bank?.account || '').trim();
          const hasBank = Boolean(
            (bankCode && bankCode !== '-' && bankCode !== 'null' && bankCode !== 'undefined') ||
            (bankNumber && bankNumber !== '-' && bankNumber !== 'null' && bankNumber !== 'undefined')
          );
          const bankNameText = bankCode ? (apiEngine.apiBankName ? apiEngine.apiBankName(bankCode) : bankCode) : '';
          const bankFull = hasBank ? `${bankNameText} ${bankNumber}`.trim() : 'ไม่ระบุบัญชี';
          const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');
          const amount = Math.abs(Number(item.amount || 0));

          combined.push({
            id: key,
            sourceCategory: hasBank ? 'manual_deposit_bank' : 'manual_deposit_nobank',
            group: 'manual',
            groupLabel: 'แมนนวล (เมนู 1.4)',
            source: hasBank ? 'ฝากมือ (ระบุบัญชี)' : 'ฝากมือ (ไม่ระบุ)',
            type: item.method || 'ฝากมือ',
            username: item.game_username || item.member?.game_username || '-',
            name: item.member?.fullname || item.fullname || item.from_bank_name || item.to_bank_name || '-',
            phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
            amount,
            points: 0,
            creditBeforeAfter: (item.before_credit != null && item.after_credit != null) ? `${item.before_credit} → ${item.after_credit}` : '-',
            bankInfo: bankFull,
            bankName: bankNameText || '-',
            bankAccount: bankNumber || '-',
            bankType: hasBank ? 'ระบุบัญชีปลายทาง' : 'ไม่ระบุบัญชี',
            admin,
            createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
            rawDate: item.transaction_at || item.created_at || '',
            status: /success|approved|complete/i.test(String(item.status || '')) ? 'สำเร็จ' : (/reject|cancel|fail/i.test(String(item.status || '')) ? 'ปฏิเสธ' : (item.status || 'สำเร็จ')),
            note: item.note || '-'
          });
        }
        if (!raw.length || raw.length < 200) break;
        page++;
      }
    } catch (depErr) {
      console.warn('[RewardReport] Warning fetching manual deposits:', depErr?.message || depErr);
    }

    // 2. Manual Withdrawals from /transactions (เมนู 1.4 ถอนมือ)
    try {
      let page = 1;
      while (page <= 200) {
        const payload = await apiEngine.apiFetchJson('/transactions', {
          type: 'withdraw',
          process_type: 'manual',
          page,
          limit: 200,
          start_date: normalized.startDate,
          end_date: normalized.endDate,
          sort: 'transaction_at',
          order: 'desc',
          website_id: context.websiteId,
          website_agent_id: context.agentId || undefined
        });
        const raw = apiEngine.apiDataArray(payload);
        for (const item of raw) {
          const pType = String(item.process_type || '').toLowerCase();
          const meth = String(item.method || '').toLowerCase();
          const isManual = pType === 'manual' || meth === 'manual' || item.type === 'manual' || !item.process_type;
          if (!isManual && item.process_type && item.process_type !== 'manual') continue;

          const key = `TX_WTH:${String(item?.id ?? item?.transaction_id)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const bankCode = String(item.to_bank_code || item.bank?.code || item.from_bank_code || '').trim();
          const bankNumber = String(item.to_bank_number || item.bank?.account || item.from_bank_number || '').trim();
          const hasBank = Boolean(
            (bankCode && bankCode !== '-' && bankCode !== 'null' && bankCode !== 'undefined') ||
            (bankNumber && bankNumber !== '-' && bankNumber !== 'null' && bankNumber !== 'undefined')
          );
          const bankNameText = bankCode ? (apiEngine.apiBankName ? apiEngine.apiBankName(bankCode) : bankCode) : '';
          const bankFull = hasBank ? `${bankNameText} ${bankNumber}`.trim() : 'ไม่ระบุบัญชี';
          const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');
          const amount = -1 * Math.abs(Number(item.amount || 0));

          combined.push({
            id: key,
            sourceCategory: 'manual_withdraw',
            group: 'manual',
            groupLabel: 'แมนนวล (เมนู 1.4)',
            source: 'ถอนมือ',
            type: item.method || 'ถอนมือ',
            username: item.game_username || item.member?.game_username || '-',
            name: item.member?.fullname || item.fullname || item.from_bank_name || item.to_bank_name || '-',
            phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
            amount,
            points: 0,
            creditBeforeAfter: (item.before_credit != null && item.after_credit != null) ? `${item.before_credit} → ${item.after_credit}` : '-',
            bankInfo: bankFull,
            bankName: bankNameText || '-',
            bankAccount: bankNumber || '-',
            bankType: hasBank ? 'ระบุบัญชีปลายทาง' : 'ไม่ระบุบัญชี',
            admin,
            createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
            rawDate: item.transaction_at || item.created_at || '',
            status: /success|approved|complete/i.test(String(item.status || '')) ? 'สำเร็จ' : (/reject|cancel|fail/i.test(String(item.status || '')) ? 'ปฏิเสธ' : (item.status || 'สำเร็จ')),
            note: item.note || '-'
          });
        }
        if (!raw.length || raw.length < 200) break;
        page++;
      }
    } catch (wthErr) {
      console.warn('[RewardReport] Warning fetching manual withdraws:', wthErr?.message || wthErr);
    }

    // 3. Balance Adjustments from /credit-history (ปรับยอดหน้าสมาชิก)
    try {
      let page = 1;
      while (page <= 200) {
        const payload = await apiEngine.apiFetchJson('/credit-history', {
          page,
          limit: 200,
          start_date: normalized.startDate,
          end_date: normalized.endDate,
          website_id: context.websiteId,
          website_agent_id: context.agentId || undefined
        });
        const raw = apiEngine.apiDataArray(payload);
        for (const item of raw) {
          const txid = String(item.transaction_id || '');
          if (!txid.startsWith('manual_adjust:') && item.category !== 'adjustment' && !/increase_credit|decrease_credit/i.test(String(item.method || ''))) continue;

          const key = `CH_ADJ:${String(item?.id ?? txid)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const isDeduct = /decrease|deduct/i.test(String(item.method || '')) || String(item.direction || '') === 'out';
          const rawAmt = Math.abs(Number(item.amount || 0));
          const amount = (isDeduct ? -1 : 1) * rawAmt;
          const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

          combined.push({
            id: key,
            sourceCategory: isDeduct ? 'adjust_decrease' : 'adjust_increase',
            group: 'adjustment',
            groupLabel: 'ปรับยอด (หน้าสมาชิก)',
            source: isDeduct ? 'ปรับลดเครดิต' : 'ปรับเพิ่มเครดิต',
            type: item.note || (isDeduct ? 'ลดเครดิต' : 'เพิ่มเครดิต'),
            username: item.game_username || item.member?.game_username || '-',
            name: item.member?.fullname || item.fullname || '-',
            phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
            amount,
            points: 0,
            creditBeforeAfter: (item.before_credit != null && item.after_credit != null) ? `${item.before_credit} → ${item.after_credit}` : '-',
            bankInfo: 'ไม่ระบุบัญชี (ปรับเครดิตตรง)',
            bankName: '-',
            bankAccount: '-',
            bankType: 'ไม่ระบุบัญชี',
            admin,
            createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
            rawDate: item.transaction_at || item.created_at || '',
            status: 'สำเร็จ',
            note: item.note || '-'
          });
        }
        if (!raw.length || raw.length < 200) break;
        page++;
      }
    } catch (adjErr) {
      console.warn('[RewardReport] Warning fetching credit adjustments:', adjErr?.message || adjErr);
    }

    // 4. Bonus from /reports/bonus (โบนัส)
    try {
      let page = 1;
      while (page <= 200) {
        const payload = await apiEngine.apiFetchJson('/reports/bonus', {
          page,
          limit: 200,
          start_date: normalized.startDate,
          end_date: normalized.endDate,
          sort: 'transaction_at',
          order: 'desc',
          website_id: context.websiteId,
          website_agent_id: context.agentId || undefined
        });
        const raw = apiEngine.apiDataArray(payload);
        for (const item of raw) {
          const key = `BONUS:${String(item?.id ?? item?.transaction_id)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const amount = Math.abs(Number(item.amount || 0));
          const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

          combined.push({
            id: key,
            sourceCategory: 'bonus',
            group: 'bonus',
            groupLabel: 'โบนัส (Bonus)',
            source: 'โบนัส',
            type: item.campaign_name || item.method || 'โบนัส',
            username: item.game_username || item.member?.game_username || '-',
            name: item.member?.fullname || item.fullname || '-',
            phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
            amount,
            points: 0,
            creditBeforeAfter: '-',
            bankInfo: '-',
            bankName: '-',
            bankAccount: '-',
            bankType: 'ไม่ระบุบัญชี',
            admin,
            createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
            rawDate: item.transaction_at || item.created_at || '',
            status: /success|approved/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || '-'),
            note: item.note || '-'
          });
        }
        if (!raw.length || raw.length < 200) break;
        page++;
      }
    } catch (bonErr) {
      console.warn('[RewardReport] Warning fetching bonus report:', bonErr?.message || bonErr);
    }

    // 5. Reward Redeems from /reward-redeems (แลกแต้ม 1.9)
    try {
      let page = 1;
      while (page <= 200) {
        const payload = await apiEngine.apiFetchJson('/reward-redeems', {
          page,
          limit: 200,
          sort: 'created_at',
          order: 'desc',
          website_id: context.websiteId,
          website_agent_id: context.agentId || undefined
        });
        const raw = apiEngine.apiDataArray(payload);
        let stop = false;
        for (const item of raw) {
          const dStr = String(item.created_at || '').slice(0, 10);
          if (dStr && dStr < normalized.startDate) { stop = true; break; }
          if (dStr && (dStr < normalized.startDate || dStr > normalized.endDate)) continue;

          const key = `REWARD:${String(item?.id)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const amount = Math.abs(Number(item.credit_amount || 0));
          const points = Math.abs(Number(item.points || 0));
          const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

          combined.push({
            id: key,
            sourceCategory: 'reward',
            group: 'reward',
            groupLabel: 'แลกแต้ม 1.9',
            source: 'แลกแต้ม 1.9',
            type: item.reward_name || 'แลกแต้ม',
            username: item.game_username || item.member?.game_username || '-',
            name: item.member?.fullname || item.fullname || '-',
            phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
            amount,
            points,
            creditBeforeAfter: '-',
            bankInfo: '-',
            bankName: '-',
            bankAccount: '-',
            bankType: 'ไม่ระบุบัญชี',
            admin,
            createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.created_at) : (item.created_at || '-'),
            rawDate: item.created_at || '',
            status: /approved|success/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || '-'),
            note: item.note || '-'
          });
        }
        if (stop || !raw.length || raw.length < 200) break;
        page++;
      }
    } catch (rewErr) {
      console.warn('[RewardReport] Warning fetching reward redeems:', rewErr?.message || rewErr);
    }

    // Sort all rows chronologically (descending)
    combined.sort((a, b) => {
      const timeA = new Date(a.rawDate || a.createdAt).getTime() || 0;
      const timeB = new Date(b.rawDate || b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    let totalCredit = 0;
    let totalPoints = 0;
    let manualDepositWithBankCount = 0;
    let manualDepositWithBankAmount = 0;
    let manualDepositNoBankCount = 0;
    let manualDepositNoBankAmount = 0;
    let manualWithdrawCount = 0;
    let manualWithdrawAmount = 0;

    let adjustIncreaseCount = 0;
    let adjustIncreaseAmount = 0;
    let adjustDecreaseCount = 0;
    let adjustDecreaseAmount = 0;

    let bonusCount = 0;
    let bonusAmount = 0;
    let rewardCount = 0;
    let rewardAmount = 0;
    let rewardPoints = 0;

    combined.forEach((r, idx) => {
      r.seq = idx + 1;
      const amt = Number(r.amount) || 0;
      const pts = Number(r.points) || 0;
      totalCredit += amt;
      totalPoints += pts;

      if (r.sourceCategory === 'manual_deposit_bank') {
        manualDepositWithBankCount++;
        manualDepositWithBankAmount += amt;
      } else if (r.sourceCategory === 'manual_deposit_nobank') {
        manualDepositNoBankCount++;
        manualDepositNoBankAmount += amt;
      } else if (r.sourceCategory === 'manual_withdraw') {
        manualWithdrawCount++;
        manualWithdrawAmount += Math.abs(amt);
      } else if (r.sourceCategory === 'adjust_increase') {
        adjustIncreaseCount++;
        adjustIncreaseAmount += amt;
      } else if (r.sourceCategory === 'adjust_decrease') {
        adjustDecreaseCount++;
        adjustDecreaseAmount += Math.abs(amt);
      } else if (r.sourceCategory === 'bonus') {
        bonusCount++;
        bonusAmount += amt;
      } else if (r.sourceCategory === 'reward') {
        rewardCount++;
        rewardAmount += amt;
        rewardPoints += pts;
      }
    });

    const manualDepositTotalCount = manualDepositWithBankCount + manualDepositNoBankCount;
    const manualDepositTotalAmount = manualDepositWithBankAmount + manualDepositNoBankAmount;
    const manualTotalCount = manualDepositTotalCount + manualWithdrawCount;
    const manualTotalAmount = manualDepositTotalAmount - manualWithdrawAmount;

    const adjustTotalCount = adjustIncreaseCount + adjustDecreaseCount;
    const adjustTotalAmount = adjustIncreaseAmount - adjustDecreaseAmount;

    const withBankCount = manualDepositWithBankCount + (combined.filter(r => r.sourceCategory === 'manual_withdraw' && r.bankType === 'ระบุบัญชีปลายทาง').length);
    const withBankAmount = manualDepositWithBankAmount + (combined.filter(r => r.sourceCategory === 'manual_withdraw' && r.bankType === 'ระบุบัญชีปลายทาง').reduce((s, r) => s + Math.abs(r.amount), 0));
    const noBankCount = combined.length - withBankCount;

    const summary = {
      totalCount: combined.length,
      totalCredit,
      totalPoints,

      // แมนนวล (เมนู 1.4)
      manualTotalCount,
      manualTotalAmount,
      manualDepositTotalCount,
      manualDepositTotalAmount,
      manualDepositWithBankCount,
      manualDepositWithBankAmount,
      manualDepositNoBankCount,
      manualDepositNoBankAmount,
      manualWithdrawCount,
      manualWithdrawAmount,

      // ปรับยอด (หน้าสมาชิก)
      adjustTotalCount,
      adjustTotalAmount,
      adjustIncreaseCount,
      adjustIncreaseAmount,
      adjustDecreaseCount,
      adjustDecreaseAmount,

      // โบนัส
      bonusCount,
      bonusAmount,

      // แลกแต้ม
      rewardCount,
      rewardAmount,
      rewardPoints,

      // แยกตามระบุบัญชีปลายทาง
      withBankCount,
      withBankAmount,
      noBankCount,

      // Legacy compatibility
      manualCount: manualTotalCount,
      manualAmount: manualTotalAmount,
      manualIncreaseCount: manualDepositTotalCount + adjustIncreaseCount,
      manualIncreaseAmount: manualDepositTotalAmount + adjustIncreaseAmount,
      manualDecreaseCount: manualWithdrawCount + adjustDecreaseCount,
      manualDecreaseAmount: manualWithdrawAmount + adjustDecreaseAmount
    };

    cachedRewardData = {
      config: normalized,
      rows: combined,
      summary,
      fetchedAt: Date.now()
    };

    const finalState = {
      status: 'preview',
      requestId,
      config: normalized,
      message: `ดึงข้อมูลสำเร็จ ${combined.length.toLocaleString('th-TH')} รายการ (แมนนวล 1.4: ${manualTotalCount} รายการ · ปรับยอด: ${adjustTotalCount} รายการ · โบนัส: ${bonusCount} รายการ · แลกแต้ม: ${rewardCount} รายการ)`,
      matchedCount: combined.length,
      summary,
      finishedAt: Date.now()
    };
    store.set('rewardState', finalState);

    return { ok: true, summary, rows: combined, rowCount: combined.length, config: normalized };
  } catch (error) {
    store.set('rewardState', {
      status: 'error',
      requestId,
      config: normalized,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

/**
 * 4. ส่งออกไฟล์ Excel สำหรับรายงานรวม BONUS + แลกแต้ม 1.9 + ปรับเครดิตแมนนวล
 * จัดเป็นตาราง 5 ชีท เล่นสีสวยงาม ดูง่าย สบายตา
 */
async function exportRewardWorkbook(savePath = null, config = null) {
  let combined = cachedRewardData.rows;
  let normalized = cachedRewardData.config || config;

  if (!combined || !combined.length) {
    await fetchRewardData(normalized || {});
    combined = cachedRewardData.rows;
    normalized = cachedRewardData.config;
  }

  const summary = cachedRewardData.summary || {};
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  // Helper styles
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  const headerBorder = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  function applyHeaderStyle(row, bgHex = 'FF1E3A8A', height = 28) {
    row.height = height;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = headerBorder;
    });
  }

  function applyDataRowStyle(row, idx, amountKey = 'amount') {
    row.height = 22;
    const isAlt = idx % 2 === 1;
    const bg = isAlt ? 'FFF8FAFC' : 'FFFFFFFF';
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
    });

    const amtCell = row.getCell(amountKey);
    if (amtCell && amtCell.value != null && Number.isFinite(Number(amtCell.value))) {
      amtCell.numFmt = '#,##0.00';
      amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (Number(amtCell.value) < 0) {
        amtCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      } else if (Number(amtCell.value) > 0) {
        amtCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF166534' } };
      }
    }
  }

  // ----------------------------------------------------
  // SHEET 1: สรุปภาพรวม (Overview & KPI)
  // ----------------------------------------------------
  const sheetSummary = workbook.addWorksheet('สรุปภาพรวม', { views: [{ showGridLines: true }] });
  sheetSummary.columns = [
    { width: 28 }, // A
    { width: 26 }, // B
    { width: 22 }, // C
    { width: 16 }, // D
    { width: 22 }, // E
    { width: 16 }  // F
  ];

  // Title Banner
  sheetSummary.mergeCells('A1:F1');
  const sTitle = sheetSummary.getCell('A1');
  sTitle.value = 'รายงานสรุป แมนนวล (เมนู 1.4) · ปรับยอดเครดิต · โบนัส · แลกแต้ม 1.9';
  sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sTitle.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  sTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(1).height = 42;

  // Subtitle
  sheetSummary.mergeCells('A2:F2');
  const sSub = sheetSummary.getCell('A2');
  const nowStr = apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(new Date().toISOString()) : new Date().toLocaleString('th-TH');
  sSub.value = `ช่วงวันที่ ${normalized.startDate} ถึง ${normalized.endDate} · รวมทั้งหมด ${(summary.totalCount || 0).toLocaleString('th-TH')} รายการ · ส่งออกเมื่อ ${nowStr}`;
  sSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sSub.font = { name: 'Segoe UI', italic: true, color: { argb: 'FF475569' }, size: 10.5 };
  sSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(2).height = 24;

  // Blank row 3
  sheetSummary.getRow(3).height = 10;

  // Section 1 Header: Grand Total
  sheetSummary.mergeCells('A4:F4');
  const sSec1 = sheetSummary.getCell('A4');
  sSec1.value = '1. สรุปยอดเครดิตสุทธิรวม (Grand Summary)';
  sSec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  sSec1.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sSec1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheetSummary.getRow(4).height = 26;

  // KPI Boxes (Rows 5-6)
  sheetSummary.mergeCells('A5:B5');
  sheetSummary.getCell('A5').value = 'ยอดเครดิตสุทธิรวม (บาท)';
  sheetSummary.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  sheetSummary.getCell('A5').font = { name: 'Segoe UI', bold: true, color: { argb: 'FF1E40AF' }, size: 10 };
  sheetSummary.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('C5:D5');
  sheetSummary.getCell('C5').value = 'จำนวนรายการทั้งหมด';
  sheetSummary.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  sheetSummary.getCell('C5').font = { name: 'Segoe UI', bold: true, color: { argb: 'FF475569' }, size: 10 };
  sheetSummary.getCell('C5').alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('E5:F5');
  sheetSummary.getCell('E5').value = 'แต้มที่ใช้แลก 1.9 รวม';
  sheetSummary.getCell('E5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F8' } };
  sheetSummary.getCell('E5').font = { name: 'Segoe UI', bold: true, color: { argb: 'FF9D174D' }, size: 10 };
  sheetSummary.getCell('E5').alignment = { horizontal: 'center', vertical: 'middle' };
  sheetSummary.getRow(5).height = 22;

  sheetSummary.mergeCells('A6:B6');
  const kpiCredit = sheetSummary.getCell('A6');
  kpiCredit.value = summary.totalCredit || 0;
  kpiCredit.numFmt = '#,##0.00';
  kpiCredit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  kpiCredit.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF1E3A8A' }, size: 16 };
  kpiCredit.alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('C6:D6');
  const kpiCount = sheetSummary.getCell('C6');
  kpiCount.value = `${(summary.totalCount || 0).toLocaleString('th-TH')} รายการ`;
  kpiCount.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  kpiCount.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF0F172A' }, size: 15 };
  kpiCount.alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('E6:F6');
  const kpiPoints = sheetSummary.getCell('E6');
  kpiPoints.value = `${(summary.rewardPoints || 0).toLocaleString('th-TH')} แต้ม`;
  kpiPoints.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE7F3' } };
  kpiPoints.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF831843' }, size: 15 };
  kpiPoints.alignment = { horizontal: 'center', vertical: 'middle' };
  sheetSummary.getRow(6).height = 36;

  // Blank row 7
  sheetSummary.getRow(7).height = 10;

  // Section 2 Header: Category Breakdown
  sheetSummary.mergeCells('A8:F8');
  const sSec2 = sheetSummary.getCell('A8');
  sSec2.value = '2. ตารางจำแนกตามกลุ่มและประเภทรายการ (Category Breakdown)';
  sSec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  sSec2.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sSec2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheetSummary.getRow(8).height = 26;

  // Table 2 Headers
  const catHeaderRow = sheetSummary.getRow(9);
  catHeaderRow.values = ['กลุ่มหลัก', 'ประเภทรายการ', 'การระบุบัญชีปลายทาง', 'จำนวนรายการ', 'ยอดเงินรวม (บาท)', 'สัดส่วน (%)'];
  applyHeaderStyle(catHeaderRow, 'FF1E293B', 26);

  const catRowsData = [
    {
      group: 'แมนนวล (เมนู 1.4)',
      type: 'ฝากมือ (ระบุบัญชี)',
      bankDesc: 'ระบุบัญชีปลายทาง (มีธนาคาร+เลขบัญชี)',
      count: summary.manualDepositWithBankCount || 0,
      amount: summary.manualDepositWithBankAmount || 0,
      bg: 'FFDCFCE7'
    },
    {
      group: 'แมนนวล (เมนู 1.4)',
      type: 'ฝากมือ (ไม่ระบุบัญชี)',
      bankDesc: 'ไม่ระบุบัญชีปลายทาง',
      count: summary.manualDepositNoBankCount || 0,
      amount: summary.manualDepositNoBankAmount || 0,
      bg: 'FFFEF3C7'
    },
    {
      group: 'แมนนวล (เมนู 1.4)',
      type: 'ถอนมือ',
      bankDesc: 'ระบุ / ไม่ระบุบัญชีผู้รับโอน',
      count: summary.manualWithdrawCount || 0,
      amount: -1 * (summary.manualWithdrawAmount || 0),
      bg: 'FFFEE2E2'
    },
    {
      group: 'ปรับยอด (หน้าสมาชิก)',
      type: 'ปรับเพิ่มเครดิต (+)',
      bankDesc: 'ไม่ระบุบัญชี (ปรับตรงในระบบ)',
      count: summary.adjustIncreaseCount || 0,
      amount: summary.adjustIncreaseAmount || 0,
      bg: 'FFDBEAFE'
    },
    {
      group: 'ปรับยอด (หน้าสมาชิก)',
      type: 'ปรับลดเครดิต (-)',
      bankDesc: 'ไม่ระบุบัญชี (ปรับตรงในระบบ)',
      count: summary.adjustDecreaseCount || 0,
      amount: -1 * (summary.adjustDecreaseAmount || 0),
      bg: 'FFFFEDD5'
    },
    {
      group: 'โบนัส (Bonus)',
      type: 'รับโบนัสแคมเปญ',
      bankDesc: 'ไม่ระบุบัญชี',
      count: summary.bonusCount || 0,
      amount: summary.bonusAmount || 0,
      bg: 'FFF3E8FF'
    },
    {
      group: 'แลกแต้ม 1.9',
      type: 'แลกแต้มสะสม',
      bankDesc: 'ไม่ระบุบัญชี',
      count: summary.rewardCount || 0,
      amount: summary.rewardAmount || 0,
      bg: 'FFEEF2FF'
    }
  ];

  const totalAbs = catRowsData.reduce((acc, r) => acc + Math.abs(r.amount), 0) || 1;

  catRowsData.forEach((item, idx) => {
    const row = sheetSummary.addRow([
      item.group,
      item.type,
      item.bankDesc,
      item.count,
      item.amount,
      (Math.abs(item.amount) / totalAbs) * 100
    ]);
    row.height = 24;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
    });

    row.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(5).font = {
      name: 'Segoe UI',
      size: 10,
      bold: true,
      color: { argb: item.amount < 0 ? 'FFDC2626' : 'FF166534' }
    };
    row.getCell(6).numFmt = '0.0"%"';
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

    // Soft badge tint on type column
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
  });

  // Table 2 Total Row
  const catTotalRow = sheetSummary.addRow([
    'รวมยอดเครดิตสุทธิทุกหมวด',
    '',
    '',
    summary.totalCount || 0,
    summary.totalCredit || 0,
    100
  ]);
  catTotalRow.height = 26;
  catTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });
  catTotalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  catTotalRow.getCell(4).numFmt = '#,##0';
  catTotalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  catTotalRow.getCell(5).numFmt = '#,##0.00';
  catTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  catTotalRow.getCell(6).numFmt = '0.0"%"';

  // Blank row
  const rBlankRow = sheetSummary.addRow([]);
  rBlankRow.height = 12;

  // Section 3 Header: Destination Bank Breakdown
  const sec3Idx = sheetSummary.rowCount + 1;
  sheetSummary.mergeCells(`A${sec3Idx}:F${sec3Idx}`);
  const sSec3 = sheetSummary.getCell(`A${sec3Idx}`);
  sSec3.value = '3. สรุปการระบุบัญชีปลายทาง (Destination Bank Summary)';
  sSec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  sSec3.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sSec3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheetSummary.getRow(sec3Idx).height = 26;

  // Table 3 Headers
  const bankHeaderRow = sheetSummary.addRow(['การระบุบัญชี', 'คำอธิบาย', '', 'จำนวนรายการ', 'ยอดเงินรวม (บาท)', 'สัดส่วน (%)']);
  applyHeaderStyle(bankHeaderRow, 'FF134E4A', 26);

  const bankRowsData = [
    {
      name: 'ระบุบัญชีปลายทาง',
      desc: 'มีข้อมูลธนาคารและเลขบัญชีปลายทางชัดเจน (ฝากมือ / ถอนมือ)',
      count: summary.withBankCount || 0,
      amount: summary.withBankAmount || 0,
      bg: 'FFDCFCE7',
      fontColor: 'FF166534'
    },
    {
      name: 'ไม่ระบุบัญชีปลายทาง',
      desc: 'ไม่มีเลขบัญชี / ปรับยอดตรงหน้าสมาชิก / โบนัส / แลกแต้ม',
      count: summary.noBankCount || 0,
      amount: (summary.totalCredit || 0) - (summary.withBankAmount || 0),
      bg: 'FFFEF3C7',
      fontColor: 'FF854D0E'
    }
  ];

  bankRowsData.forEach((b) => {
    const row = sheetSummary.addRow([
      b.name,
      b.desc,
      '',
      b.count,
      b.amount,
      summary.totalCount ? (b.count / summary.totalCount) * 100 : 0
    ]);
    row.height = 24;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
    });
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.bg } };
    row.getCell(1).font = { name: 'Segoe UI', bold: true, color: { argb: b.fontColor }, size: 10 };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(5).font = { name: 'Segoe UI', bold: true, color: { argb: b.fontColor } };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).numFmt = '0.0"%"';
  });

  // Table 3 Total
  const bankTotalRow = sheetSummary.addRow([
    'รวมทั้งหมด',
    '',
    '',
    summary.totalCount || 0,
    summary.totalCredit || 0,
    100
  ]);
  bankTotalRow.height = 26;
  bankTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });
  bankTotalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  bankTotalRow.getCell(4).numFmt = '#,##0';
  bankTotalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  bankTotalRow.getCell(5).numFmt = '#,##0.00';
  bankTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  bankTotalRow.getCell(6).numFmt = '0.0"%"';

  // ----------------------------------------------------
  // SHEET 2: รายการทั้งหมด (All Items)
  // ----------------------------------------------------
  const sheetAll = workbook.addWorksheet('รายการทั้งหมด', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }]
  });

  sheetAll.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'กลุ่มหลัก', key: 'groupLabel', width: 22 },
    { header: 'ประเภทรายการ', key: 'source', width: 22 },
    { header: 'การระบุบัญชี', key: 'bankType', width: 18 },
    { header: 'ยูสเซอร์', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'ยอดเงิน (บาท)', key: 'amount', width: 16 },
    { header: 'แต้มที่ใช้', key: 'points', width: 12 },
    { header: 'บัญชีปลายทาง', key: 'bankInfo', width: 26 },
    { header: 'แอดมินผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'เวลาทำรายการ', key: 'createdAt', width: 20 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 30 }
  ];

  // Title Banner on Sheet 2
  sheetAll.spliceRows(1, 0, [], []);
  sheetAll.mergeCells('A1:N1');
  const allTitle = sheetAll.getCell('A1');
  allTitle.value = `รายการทั้งหมด (แมนนวล · ปรับยอด · โบนัส · แลกแต้ม) — ${normalized.startDate} ถึง ${normalized.endDate}`;
  allTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  allTitle.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  allTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetAll.getRow(1).height = 34;

  sheetAll.mergeCells('A2:N2');
  const allSub = sheetAll.getCell('A2');
  allSub.value = `รวมทั้งหมด ${combined.length.toLocaleString('th-TH')} รายการ · เรียงตามเวลาล่าสุดไปเก่าสุด · แยกสีตามสถานะและการระบุบัญชี`;
  allSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  allSub.font = { name: 'Segoe UI', italic: true, color: { argb: 'FF475569' }, size: 10 };
  allSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetAll.getRow(2).height = 22;

  applyHeaderStyle(sheetAll.getRow(3), 'FF1E3A8A', 28);
  sheetAll.autoFilter = `A3:N${combined.length + 3}`;

  let runningSumAll = 0;
  combined.forEach((r, idx) => {
    runningSumAll += Number(r.amount) || 0;
    const row = sheetAll.addRow({
      seq: idx + 1,
      groupLabel: r.groupLabel,
      source: r.source,
      bankType: r.bankType,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.amount,
      points: r.points || '-',
      bankInfo: r.bankInfo,
      admin: r.admin,
      createdAt: r.createdAt,
      status: r.status,
      note: r.note
    });

    applyDataRowStyle(row, idx, 'amount');
    row.getCell('seq').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('bankType').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('points').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('createdAt').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };

    // Soft badge fill for bankType
    if (r.bankType === 'ระบุบัญชีปลายทาง') {
      row.getCell('bankType').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      row.getCell('bankType').font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
    }
  });

  // Total row at bottom
  const allTotalRow = sheetAll.addRow({
    seq: '',
    groupLabel: 'รวมทั้งหมด',
    source: '',
    bankType: '',
    username: '',
    name: '',
    phone: `${combined.length.toLocaleString('th-TH')} รายการ`,
    amount: runningSumAll,
    points: summary.rewardPoints || '-',
    bankInfo: '',
    admin: '',
    createdAt: '',
    status: '',
    note: ''
  });
  allTotalRow.height = 26;
  allTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } }
    };
  });
  allTotalRow.getCell('amount').numFmt = '#,##0.00';
  allTotalRow.getCell('amount').alignment = { horizontal: 'right', vertical: 'middle' };
  allTotalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
  allTotalRow.getCell('points').alignment = { horizontal: 'center', vertical: 'middle' };

  // ----------------------------------------------------
  // SHEET 3: แมนนวล_เมนู1.4 (Manual Only)
  // ----------------------------------------------------
  const manualList = combined.filter((r) => r.group === 'manual');
  const sheetManual = workbook.addWorksheet('แมนนวล_เมนู1.4', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }]
  });

  sheetManual.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'ประเภทรายการ', key: 'source', width: 22 },
    { header: 'การระบุบัญชี', key: 'bankType', width: 18 },
    { header: 'ยูสเซอร์', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'ยอดเงิน (บาท)', key: 'amount', width: 16 },
    { header: 'บัญชีปลายทาง', key: 'bankInfo', width: 26 },
    { header: 'ธนาคาร', key: 'bankName', width: 16 },
    { header: 'เลขบัญชี', key: 'bankAccount', width: 18 },
    { header: 'แอดมินผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'เวลาทำรายการ', key: 'createdAt', width: 20 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 28 }
  ];

  sheetManual.spliceRows(1, 0, [], []);
  sheetManual.mergeCells('A1:N1');
  const manTitle = sheetManual.getCell('A1');
  manTitle.value = `รายการแมนนวล ฝาก-ถอนมือ (เมนู 1.4) — ${normalized.startDate} ถึง ${normalized.endDate}`;
  manTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  manTitle.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  manTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetManual.getRow(1).height = 34;

  sheetManual.mergeCells('A2:N2');
  const manSub = sheetManual.getCell('A2');
  manSub.value = `ฝากมือระบุบัญชี: ${(summary.manualDepositWithBankCount || 0).toLocaleString('th-TH')} รายการ · ฝากมือไม่ระบุ: ${(summary.manualDepositNoBankCount || 0).toLocaleString('th-TH')} รายการ · ถอนมือ: ${(summary.manualWithdrawCount || 0).toLocaleString('th-TH')} รายการ`;
  manSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
  manSub.font = { name: 'Segoe UI', italic: true, color: { argb: 'FF0F766E' }, size: 10 };
  manSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetManual.getRow(2).height = 22;

  applyHeaderStyle(sheetManual.getRow(3), 'FF0D9488', 28);
  sheetManual.autoFilter = `A3:N${manualList.length + 3}`;

  let runningSumMan = 0;
  manualList.forEach((r, idx) => {
    runningSumMan += Number(r.amount) || 0;
    const row = sheetManual.addRow({
      seq: idx + 1,
      source: r.source,
      bankType: r.bankType,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.amount,
      bankInfo: r.bankInfo,
      bankName: r.bankName,
      bankAccount: r.bankAccount,
      admin: r.admin,
      createdAt: r.createdAt,
      status: r.status,
      note: r.note
    });

    applyDataRowStyle(row, idx, 'amount');
    row.getCell('seq').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('bankType').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('createdAt').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };

    if (r.bankType === 'ระบุบัญชีปลายทาง') {
      row.getCell('bankType').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      row.getCell('bankType').font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
    }
  });

  const manTotalRow = sheetManual.addRow({
    seq: '',
    source: 'ยอดสุทธิรวม',
    bankType: '',
    username: '',
    name: '',
    phone: `${manualList.length.toLocaleString('th-TH')} รายการ`,
    amount: runningSumMan,
    bankInfo: '',
    bankName: '',
    bankAccount: '',
    admin: '',
    createdAt: '',
    status: '',
    note: ''
  });
  manTotalRow.height = 26;
  manTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } }
    };
  });
  manTotalRow.getCell('amount').numFmt = '#,##0.00';
  manTotalRow.getCell('amount').alignment = { horizontal: 'right', vertical: 'middle' };
  manTotalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };

  // ----------------------------------------------------
  // SHEET 4: ปรับยอดเครดิต (Adjustments Only)
  // ----------------------------------------------------
  const adjList = combined.filter((r) => r.group === 'adjustment');
  const sheetAdj = workbook.addWorksheet('ปรับยอดเครดิต', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }]
  });

  sheetAdj.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'ประเภทรายการ', key: 'source', width: 20 },
    { header: 'ยูสเซอร์', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'ยอดเงิน (บาท)', key: 'amount', width: 16 },
    { header: 'เครดิต ก่อน → หลัง', key: 'creditBeforeAfter', width: 22 },
    { header: 'แอดมินผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'เวลาทำรายการ', key: 'createdAt', width: 20 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 30 }
  ];

  sheetAdj.spliceRows(1, 0, [], []);
  sheetAdj.mergeCells('A1:K1');
  const adjTitle = sheetAdj.getCell('A1');
  adjTitle.value = `รายการปรับยอดเครดิต หน้าสมาชิก (เพิ่ม/ลด) — ${normalized.startDate} ถึง ${normalized.endDate}`;
  adjTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  adjTitle.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  adjTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetAdj.getRow(1).height = 34;

  sheetAdj.mergeCells('A2:K2');
  const adjSub = sheetAdj.getCell('A2');
  adjSub.value = `ปรับเพิ่ม (+): ${(summary.adjustIncreaseCount || 0).toLocaleString('th-TH')} รายการ (+฿${(summary.adjustIncreaseAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}) · ปรับลด (-): ${(summary.adjustDecreaseCount || 0).toLocaleString('th-TH')} รายการ (-฿${(summary.adjustDecreaseAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
  adjSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  adjSub.font = { name: 'Segoe UI', italic: true, color: { argb: 'FF1D4ED8' }, size: 10 };
  adjSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetAdj.getRow(2).height = 22;

  applyHeaderStyle(sheetAdj.getRow(3), 'FF2563EB', 28);
  sheetAdj.autoFilter = `A3:K${adjList.length + 3}`;

  let runningSumAdj = 0;
  adjList.forEach((r, idx) => {
    runningSumAdj += Number(r.amount) || 0;
    const row = sheetAdj.addRow({
      seq: idx + 1,
      source: r.source,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.amount,
      creditBeforeAfter: r.creditBeforeAfter,
      admin: r.admin,
      createdAt: r.createdAt,
      status: r.status,
      note: r.note
    });

    applyDataRowStyle(row, idx, 'amount');
    row.getCell('seq').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('creditBeforeAfter').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('createdAt').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const adjTotalRow = sheetAdj.addRow({
    seq: '',
    source: 'ยอดสุทธิรวม',
    username: '',
    name: '',
    phone: `${adjList.length.toLocaleString('th-TH')} รายการ`,
    amount: runningSumAdj,
    creditBeforeAfter: '',
    admin: '',
    createdAt: '',
    status: '',
    note: ''
  });
  adjTotalRow.height = 26;
  adjTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } }
    };
  });
  adjTotalRow.getCell('amount').numFmt = '#,##0.00';
  adjTotalRow.getCell('amount').alignment = { horizontal: 'right', vertical: 'middle' };
  adjTotalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };

  // ----------------------------------------------------
  // SHEET 5: โบนัส_และ_แลกแต้ม (Bonus & Reward Redeems)
  // ----------------------------------------------------
  const bonusRewardList = combined.filter((r) => r.group === 'bonus' || r.group === 'reward');
  const sheetBR = workbook.addWorksheet('โบนัส_และ_แลกแต้ม', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: true }]
  });

  sheetBR.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'แหล่งข้อมูล', key: 'groupLabel', width: 18 },
    { header: 'แคมเปญ / ของรางวัล', key: 'type', width: 25 },
    { header: 'ยูสเซอร์', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'ยอดเครดิต (บาท)', key: 'amount', width: 16 },
    { header: 'แต้มที่ใช้', key: 'points', width: 12 },
    { header: 'แอดมินผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'เวลาทำรายการ', key: 'createdAt', width: 20 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 28 }
  ];

  sheetBR.spliceRows(1, 0, [], []);
  sheetBR.mergeCells('A1:L1');
  const brTitle = sheetBR.getCell('A1');
  brTitle.value = `รายการโบนัส และ แลกแต้ม 1.9 — ${normalized.startDate} ถึง ${normalized.endDate}`;
  brTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  brTitle.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  brTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetBR.getRow(1).height = 34;

  sheetBR.mergeCells('A2:L2');
  const brSub = sheetBR.getCell('A2');
  brSub.value = `โบนัส: ${(summary.bonusCount || 0).toLocaleString('th-TH')} รายการ (฿${(summary.bonusAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}) · แลกแต้ม: ${(summary.rewardCount || 0).toLocaleString('th-TH')} รายการ (฿${(summary.rewardAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}, ใช้ ${(summary.rewardPoints || 0).toLocaleString('th-TH')} แต้ม)`;
  brSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
  brSub.font = { name: 'Segoe UI', italic: true, color: { argb: 'FF6D28D9' }, size: 10 };
  brSub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetBR.getRow(2).height = 22;

  applyHeaderStyle(sheetBR.getRow(3), 'FF7C3AED', 28);
  sheetBR.autoFilter = `A3:L${bonusRewardList.length + 3}`;

  let runningSumBR = 0;
  bonusRewardList.forEach((r, idx) => {
    runningSumBR += Number(r.amount) || 0;
    const row = sheetBR.addRow({
      seq: idx + 1,
      groupLabel: r.groupLabel,
      type: r.type,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.amount,
      points: r.points || '-',
      admin: r.admin,
      createdAt: r.createdAt,
      status: r.status,
      note: r.note
    });

    applyDataRowStyle(row, idx, 'amount');
    row.getCell('seq').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('points').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('createdAt').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const brTotalRow = sheetBR.addRow({
    seq: '',
    groupLabel: 'รวมทั้งหมด',
    type: '',
    username: '',
    name: '',
    phone: `${bonusRewardList.length.toLocaleString('th-TH')} รายการ`,
    amount: runningSumBR,
    points: summary.rewardPoints || '-',
    admin: '',
    createdAt: '',
    status: '',
    note: ''
  });
  brTotalRow.height = 26;
  brTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Segoe UI', bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF334155' } }
    };
  });
  brTotalRow.getCell('amount').numFmt = '#,##0.00';
  brTotalRow.getCell('amount').alignment = { horizontal: 'right', vertical: 'middle' };
  brTotalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
  brTotalRow.getCell('points').alignment = { horizontal: 'center', vertical: 'middle' };

  // Write file
  const d = new Date();
  const defaultFilename = `NK_รายงานรวม_แมนนวล_ปรับยอด_โบนัส_แต้ม_${normalized.startDate}_ถึง_${normalized.endDate}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  const finalState = {
    status: 'done',
    config: normalized,
    message: `บันทึกรายงานสำเร็จ ${combined.length.toLocaleString('th-TH')} รายการ (5 ชีท)`,
    matchedCount: combined.length,
    summary,
    filePath: outputPath,
    finishedAt: Date.now()
  };
  store.set('rewardState', finalState);

  return { ok: true, filePath: outputPath, rowCount: combined.length, summary };
}

/**
 * 5. ดึงข้อมูลจัดอันดับยอดฝากสูงสุด & เปรียบเทียบเดือนนี้ vs เดือนที่แล้ว แบ่งกลุ่มลูกค้า
 */
function getMonthDateRanges(refDate = new Date()) {
  const bkk = apiEngine.getBangkokDateParts ? apiEngine.getBangkokDateParts(refDate) : {
    year: refDate.getFullYear(),
    month: pad(refDate.getMonth() + 1),
    day: pad(refDate.getDate())
  };

  const curYear = Number(bkk.year);
  const curMonth = Number(bkk.month);
  const curDay = Number(bkk.day);

  // This Month: วันที่ 1 ของเดือนปัจจุบัน ถึง วันนี้
  const thisMonthStart = `${curYear}-${pad(curMonth)}-01`;
  const thisMonthEnd = `${curYear}-${pad(curMonth)}-${pad(curDay)}`;

  // Last Month: วันที่ 1 ของเดือนก่อน ถึง สิ้นเดือนก่อน
  const lastMonthDate = new Date(Date.UTC(curYear, curMonth - 1, 0));
  const lastYear = lastMonthDate.getUTCFullYear();
  const lastMonth = lastMonthDate.getUTCMonth() + 1;
  const lastDay = lastMonthDate.getUTCDate();

  const lastMonthStart = `${lastYear}-${pad(lastMonth)}-01`;
  const lastMonthEnd = `${lastYear}-${pad(lastMonth)}-${pad(lastDay)}`;

  return {
    thisMonth: { startDate: thisMonthStart, endDate: thisMonthEnd, label: `เดือนนี้ (${pad(curMonth)}/${curYear})` },
    lastMonth: { startDate: lastMonthStart, endDate: lastMonthEnd, label: `เดือนที่แล้ว (${pad(lastMonth)}/${lastYear})` }
  };
}

function formatDateTimeDisplay(dtStr) {
  if (!dtStr || dtStr === '-' || dtStr === 'null') return '-';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return String(dtStr).slice(0, 19).replace('T', ' ');
    const pad2 = (n) => String(n).padStart(2, '0');
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
    const pad2 = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
  } catch {
    return String(dtStr).slice(0, 10);
  }
}

let isRankingCancelled = false;

function cancelMonthlyRanking() {
  isRankingCancelled = true;
}

function sendRankingProgress(data) {
  try {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('monthly-ranking-progress', data);
      }
    });
  } catch (e) {}
}

function extractMemberDeposit(mem) {
  if (!mem || typeof mem !== 'object') return 0;
  const directFields = [
    'total_deposit',
    'deposit_total',
    'total_deposit_amount',
    'deposit_amount',
    'deposit',
    'all_deposit',
    'sum_deposit',
    'total_in',
    'deposits_sum_amount',
    'deposit_sum',
    'total_deposits',
    'sum_amount_deposit',
    'turnover_deposit',
    'in_total'
  ];
  for (const f of directFields) {
    if (mem[f] != null && !isNaN(Number(mem[f])) && Number(mem[f]) > 0) {
      return Number(mem[f]);
    }
  }
  if (mem.summary?.total_deposit != null && !isNaN(Number(mem.summary.total_deposit))) {
    return Number(mem.summary.total_deposit);
  }
  if (mem.stats?.total_deposit != null && !isNaN(Number(mem.stats.total_deposit))) {
    return Number(mem.stats.total_deposit);
  }
  if (mem.wallet?.total_deposit != null && !isNaN(Number(mem.wallet.total_deposit))) {
    return Number(mem.wallet.total_deposit);
  }
  for (const [k, v] of Object.entries(mem)) {
    if (/deposit|ยอดฝาก/i.test(k) && !/count|time|date|status|last|min|max|bonus|turnover|withdraw/i.test(k)) {
      const num = Number(v);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return 0;
}

async function fetchMonthlyTopDepositors(config = {}) {
  isRankingCancelled = false;

  const vipMin = Number(config.vipMin) || 1000000;
  const generalMin = Number(config.generalMin) || 100000;
  const newMin = Number(config.newMin) || 0;

  const normalized = {
    allTime: true,
    vipMin,
    generalMin,
    newMin
  };

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const startMsg = 'กำลังเชื่อมต่อ API เพื่อดึงข้อมูลรายชื่อสมาชิกทั้งหมด...';

  store.set('monthlyRankingState', {
    status: 'starting',
    requestId,
    config: normalized,
    message: startMsg,
    currentPage: 0,
    totalPages: 0,
    rowCount: 0,
    startedAt
  });

  sendRankingProgress({
    current: 0,
    total: 0,
    rowCount: 0,
    percent: 0,
    message: startMsg
  });

  try {
    const context = await apiEngine.getApiBusinessContext();
    const pageSize = 200;

    // 1. Fetch Page 1 of /members
    const firstPayload = await apiEngine.apiFetchJson('/members', {
      page: 1,
      limit: pageSize,
      website_id: context.websiteId,
      website_agent_id: context.agentId || undefined
    });

    const firstRaw = apiEngine.apiDataArray(firstPayload);
    const paging = apiEngine.apiPagination(firstPayload, 1, pageSize, firstRaw.length);
    let totalPages = paging.totalPages || (firstRaw.length < pageSize ? 1 : 0);

    const allMembersRaw = [...firstRaw];
    let completed = 1;

    const initialPercent = totalPages > 0 ? Math.round((1 / totalPages) * 100) : 100;
    const initialMsg = `กำลังดึงข้อมูลยูสเซอร์ผ่าน API · หน้า 1/${totalPages || '?'} (${allMembersRaw.length.toLocaleString('th-TH')} ยูสเซอร์ · ${initialPercent}%)`;

    store.set('monthlyRankingState', {
      status: 'running',
      requestId,
      config: normalized,
      message: initialMsg,
      currentPage: 1,
      totalPages: totalPages || 1,
      rowCount: allMembersRaw.length,
      percent: initialPercent,
      startedAt
    });

    sendRankingProgress({
      current: 1,
      total: totalPages || 1,
      rowCount: allMembersRaw.length,
      percent: initialPercent,
      message: initialMsg
    });

    // 2. If multiple pages, fetch remaining pages concurrently
    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const concurrency = 10;
      let cursor = 0;

      const worker = async () => {
        while (cursor < pages.length) {
          if (isRankingCancelled) break;
          const page = pages[cursor++];
          try {
            const pagePayload = await apiEngine.apiFetchJson('/members', {
              page,
              limit: pageSize,
              website_id: context.websiteId,
              website_agent_id: context.agentId || undefined
            });
            const raw = apiEngine.apiDataArray(pagePayload);
            allMembersRaw.push(...raw);
          } catch (fetchErr) {
            console.warn(`[Ranking] Warning fetching members page ${page}:`, fetchErr?.message || fetchErr);
          }

          completed++;
          const percent = totalPages > 0 ? Math.round((completed / totalPages) * 100) : 0;
          const progressMsg = `กำลังดึงข้อมูลยูสเซอร์ผ่าน API · หน้า ${completed}/${totalPages} (${allMembersRaw.length.toLocaleString('th-TH')} ยูสเซอร์ · ${percent}%)`;

          store.set('monthlyRankingState', {
            status: 'running',
            requestId,
            config: normalized,
            message: progressMsg,
            currentPage: completed,
            totalPages,
            rowCount: allMembersRaw.length,
            percent,
            startedAt
          });

          sendRankingProgress({
            current: completed,
            total: totalPages,
            rowCount: allMembersRaw.length,
            percent,
            message: progressMsg
          });
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
    }

    // 3. Process members and total deposits
    const seenUsers = new Set();
    const members = [];

    for (const mem of allMembersRaw) {
      const username = String(mem.game_username || mem.username || '').trim();
      if (!username || username === '-' || seenUsers.has(username)) continue;
      seenUsers.add(username);

      const totalDeposit = extractMemberDeposit(mem);
      const regDateRaw = mem.created_at || mem.registered_at || mem.register_at || '';
      const onlineRaw = mem.last_login || mem.last_online || mem.online_at || mem.updated_at || '';

      members.push({
        username,
        name: mem.fullname || mem.name || [mem.first_name, mem.last_name].filter(Boolean).join(' ') || '-',
        phone: apiEngine.apiDisplayPhone(mem.phone || mem.line || '') || '-',
        bank: apiEngine.apiBankName(mem.bankcode || mem.bank_code || mem.bank?.code || '') || '-',
        totalDeposit,
        lastOnline: formatDateTimeDisplay(onlineRaw),
        registeredAt: formatDateDisplay(regDateRaw)
      });
    }

    // Sort descending by totalDeposit
    members.sort((a, b) => b.totalDeposit - a.totalDeposit);

    members.forEach((m, idx) => {
      m.rank = idx + 1;
    });

    let vipCount = 0;
    let vipTotal = 0;
    let generalCount = 0;
    let generalTotal = 0;
    let newCount = 0;
    let newTotal = 0;
    let grandTotal = 0;

    members.forEach((m) => {
      let tier = 'ใหม่';
      let tierKey = 'new';

      if (m.totalDeposit >= vipMin) {
        tier = 'VIP';
        tierKey = 'vip';
        vipCount++;
        vipTotal += m.totalDeposit;
      } else if (m.totalDeposit >= generalMin) {
        tier = 'ทั่วไป';
        tierKey = 'general';
        generalCount++;
        generalTotal += m.totalDeposit;
      } else {
        tier = 'ใหม่';
        tierKey = 'new';
        newCount++;
        newTotal += m.totalDeposit;
      }

      m.tier = tier;
      m.tierKey = tierKey;
      grandTotal += m.totalDeposit;
    });

    const summary = {
      totalMembers: members.length,
      grandTotal,
      vip: { count: vipCount, total: vipTotal, avg: vipCount ? Math.round(vipTotal / vipCount) : 0 },
      general: { count: generalCount, total: generalTotal, avg: generalCount ? Math.round(generalTotal / generalCount) : 0 },
      new: { count: newCount, total: newTotal, avg: newCount ? Math.round(newTotal / newCount) : 0 },
      allTime: true
    };

    cachedMonthlyRankingData = {
      config: normalized,
      rows: members,
      summary,
      fetchedAt: Date.now()
    };

    const finalState = {
      status: 'preview',
      requestId,
      config: normalized,
      message: isRankingCancelled
        ? `⏹️ หยุดการดึงข้อมูลตามคำสั่ง ดึงได้ทั้งหมด ${members.length.toLocaleString('th-TH')} ยูสเซอร์ (หน้า ${completed}/${totalPages})`
        : `ดึงและจัดอันดับสำเร็จ ${members.length.toLocaleString('th-TH')} ยูสเซอร์ (VIP: ${vipCount} คน, ทั่วไป: ${generalCount} คน, ใหม่: ${newCount} คน)`,
      rowCount: members.length,
      summary,
      isCancelled: isRankingCancelled,
      finishedAt: Date.now()
    };
    store.set('monthlyRankingState', finalState);

    return { ok: true, summary, rowCount: members.length, config: normalized, members, isCancelled: isRankingCancelled };
  } catch (error) {
    store.set('monthlyRankingState', {
      status: 'error',
      requestId,
      config: normalized,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

function populateRankingSheet(sheet, list, sheetTitle, headerBgColor = 'FF1E293B') {
  sheet.columns = [
    { header: 'ยอดฝากทั้งหมด', key: 'totalDeposit', width: 22 },
    { header: 'ยูสเซอร์', key: 'username', width: 20 },
    { header: 'เบอร์', key: 'phone', width: 18 },
    { header: 'ชื่อ-นามสกุล', key: 'name', width: 26 },
    { header: 'ออนไลน์ล่าสุด', key: 'lastOnline', width: 22 },
    { header: 'วันที่สมัคร', key: 'registeredAt', width: 18 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let sumDeposit = 0;

  list.forEach((m, idx) => {
    sumDeposit += m.totalDeposit;

    const row = sheet.addRow({
      totalDeposit: m.totalDeposit,
      username: m.username,
      phone: m.phone,
      name: m.name,
      lastOnline: m.lastOnline || '-',
      registeredAt: m.registeredAt || '-'
    });

    row.height = 22;

    row.getCell('totalDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('totalDeposit').numFmt = '#,##0.00';
    row.getCell('totalDeposit').font = { bold: true };
    row.getCell('username').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('name').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('lastOnline').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('registeredAt').alignment = { horizontal: 'center', vertical: 'middle' };

    if (m.tierKey === 'vip') {
      row.getCell('totalDeposit').font = { bold: true, color: { argb: 'FFD97706' } };
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'FFFFFBEB' : 'FFFFFDF5' } };
      });
    } else if (m.tierKey === 'general') {
      row.getCell('totalDeposit').font = { bold: true, color: { argb: 'FF2563EB' } };
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
        });
      }
    } else {
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
    }
  });

  const totalRow = sheet.addRow({
    totalDeposit: sumDeposit,
    username: 'รวมทั้งหมด',
    phone: `${list.length.toLocaleString('th-TH')} คน`,
    name: '',
    lastOnline: '',
    registeredAt: ''
  });

  totalRow.height = 26;
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF475569' } }
    };
  });
  totalRow.getCell('totalDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('totalDeposit').numFmt = '#,##0.00';
  totalRow.getCell('username').alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
}

async function exportMonthlyTopDepositorsWorkbook(savePath = null, config = null) {
  let members = cachedMonthlyRankingData.rows;
  let normalized = cachedMonthlyRankingData.config || config;

  if (!members || !members.length) {
    await fetchMonthlyTopDepositors(normalized || {});
    members = cachedMonthlyRankingData.rows;
    normalized = cachedMonthlyRankingData.config;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  // Sheet 1: ยอดฝากทั้งหมด_ทุกลูกค้า
  const sheetAll = workbook.addWorksheet('ยอดฝากทั้งหมด_ทุกลูกค้า', { views: [{ showGridLines: true }] });
  populateRankingSheet(sheetAll, members, 'ยอดฝากทั้งหมด_ทุกลูกค้า', 'FF1E293B');

  // Sheet 2: กลุ่ม VIP
  const vipList = members.filter((m) => m.tierKey === 'vip');
  const sheetVip = workbook.addWorksheet('กลุ่ม VIP (1M-100M)', { views: [{ showGridLines: true }] });
  populateRankingSheet(sheetVip, vipList, 'กลุ่ม VIP', 'FFD97706');

  // Sheet 3: กลุ่มทั่วไป
  const generalList = members.filter((m) => m.tierKey === 'general');
  const sheetGeneral = workbook.addWorksheet('กลุ่มทั่วไป (100K-999K)', { views: [{ showGridLines: true }] });
  populateRankingSheet(sheetGeneral, generalList, 'กลุ่มทั่วไป', 'FF2563EB');

  // Sheet 4: กลุ่มใหม่
  const newList = members.filter((m) => m.tierKey === 'new');
  const sheetNew = workbook.addWorksheet('กลุ่มใหม่ (0-99K)', { views: [{ showGridLines: true }] });
  populateRankingSheet(sheetNew, newList, 'กลุ่มใหม่', 'FF059669');

  const d = new Date();
  const defaultFilename = `NK_จัดอันดับยอดฝากทั้งหมด_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  const finalState = {
    status: 'done',
    config: normalized,
    message: `ส่งออกรายงานจัดอันดับสำเร็จ ${members.length.toLocaleString('th-TH')} รายการ`,
    rowCount: members.length,
    summary: cachedMonthlyRankingData.summary,
    filePath: outputPath,
    finishedAt: Date.now()
  };
  store.set('monthlyRankingState', finalState);

  return { ok: true, filePath: outputPath, rowCount: members.length, summary: cachedMonthlyRankingData.summary };
}

// ====================================================
// 3. ดึงรายงานลูกค้าฝากเดือนล่าสุด (Latest Month Depositors Engine)
// วิเคราะห์ยูสเซอร์ทั้งหมด แยกกลุ่ม VIP/ทั่วไป/ใหม่
// กรองเฉพาะฝากล่าสุดเดือนที่แล้ว หรือฝากต่อเนื่อง 2 เดือน (เดือนที่แล้ว + เดือนนี้)
// ====================================================
let isLatestMonthCancelled = false;
let cachedLatestMonthData = {
  config: null,
  rows: [],
  summary: null,
  curMonth: null,
  prevMonth: null,
  fetchedAt: null
};

function cancelLatestMonthDepositors() {
  isLatestMonthCancelled = true;
}

function sendLatestMonthProgress(data) {
  try {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('latest-month-depositors-progress', data);
      }
    });
  } catch (e) {}
}

function getCohortCachePath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'nk-cohort-cache.json');
  } catch (e) {
    return path.join(os.homedir(), '.nk-cohort-cache.json');
  }
}

function loadSharedCohortCache() {
  try {
    const p = getCohortCachePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    }
  } catch (e) {}
  return { months: {} };
}

function saveSharedCohortCache(cache) {
  try {
    const p = getCohortCachePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {}
}

function getTwoRecentMonths(refDate = new Date()) {
  let now = refDate;
  if (typeof refDate === 'string' && refDate) {
    if (/^\d{4}-\d{2}$/.test(refDate)) {
      const [y, m] = refDate.split('-').map(Number);
      now = new Date(y, m - 1, 15);
    } else {
      now = new Date(refDate);
    }
  }
  const bkk = apiEngine.getBangkokDateParts
    ? apiEngine.getBangkokDateParts(now)
    : {
        year: String(now.getFullYear()),
        month: pad(now.getMonth() + 1),
        day: pad(now.getDate())
      };

  const curY = Number(bkk.year);
  const curM = Number(bkk.month);

  const curKey = `${curY}-${pad(curM)}`;
  const curStartDate = `${curKey}-01`;
  const daysInCurM = new Date(curY, curM, 0).getDate();
  const curEndDate = `${curKey}-${pad(daysInCurM)}`;

  let prevM = curM - 1;
  let prevY = curY;
  if (prevM <= 0) {
    prevM = 12;
    prevY -= 1;
  }
  const prevKey = `${prevY}-${pad(prevM)}`;
  const daysInPrevM = new Date(prevY, prevM, 0).getDate();
  const prevStartDate = `${prevKey}-01`;
  const prevEndDate = `${prevKey}-${pad(daysInPrevM)}`;

  const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  return {
    curMonth: {
      key: curKey,
      year: curY,
      month: curM,
      startDate: curStartDate,
      endDate: curEndDate,
      shortLabel: `${THAI_MONTHS[curM]} ${curY + 543}`,
      fullLabel: `เดือนนี้ (${THAI_MONTHS[curM]} ${curY + 543})`
    },
    prevMonth: {
      key: prevKey,
      year: prevY,
      month: prevM,
      startDate: prevStartDate,
      endDate: prevEndDate,
      shortLabel: `${THAI_MONTHS[prevM]} ${prevY + 543}`,
      fullLabel: `เดือนที่แล้ว (${THAI_MONTHS[prevM]} ${prevY + 543})`
    }
  };
}

async function fetchMonthDepositMap(monthKey, startDate, endDate, monthLabel, onProgressStep) {
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
          lastDepositAt: ''
        };
      }
      userAgg[username].totalDeposit += amt;
      userAgg[username].depositCount += 1;

      const dtStr = tx.transaction_at || tx.created_at || tx.action_at || tx.date || '';
      if (dtStr && (!userAgg[username].lastDepositAt || dtStr > userAgg[username].lastDepositAt)) {
        userAgg[username].lastDepositAt = dtStr;
      }
    }
  }

  processBatch(firstData);

  if (onProgressStep) {
    onProgressStep(1, Math.max(1, totalPages));
  }

  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const concurrency = 10;
    let cursor = 0;
    let completed = 1;

    const worker = async () => {
      while (cursor < pages.length) {
        if (isLatestMonthCancelled) break;
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
          processBatch(apiEngine.apiDataArray(payload));
        } catch (err) {
          console.warn(`[LatestMonth] Error page ${page} of ${monthKey}:`, err?.message);
        } finally {
          completed++;
          if (onProgressStep) {
            onProgressStep(completed, totalPages);
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, pages.length) }, () => worker());
    await Promise.all(workers);
  }

  return userAgg;
}

async function fetchLatestMonthDepositors(config = {}) {
  isLatestMonthCancelled = false;

  const vipMin = Number(config.vipMin) || 1000000;
  const generalMin = Number(config.generalMin) || 100000;
  const forceRefresh = Boolean(config.forceRefresh);

  const months = getTwoRecentMonths(config.yearMonth || config.refDate);
  const { curMonth, prevMonth } = months;

  const startedAt = Date.now();
  const startMsg = `กำลังเตรียมข้อมูลวิเคราะห์ลูกค้าฝากล่าสุด (${prevMonth.shortLabel} และ ${curMonth.shortLabel})...`;

  sendLatestMonthProgress({
    status: 'running',
    step: 1,
    totalSteps: 3,
    percent: 0,
    message: startMsg
  });

  try {
    const context = await apiEngine.getApiBusinessContext();

    // 1. Fetch Previous Month Deposits (check shared cohort cache first)
    const cache = loadSharedCohortCache();
    if (!cache.months) cache.months = {};
    let prevAgg = null;

    if (!forceRefresh && cache.months[prevMonth.key] && cache.months[prevMonth.key].isComplete && cache.months[prevMonth.key].userAgg) {
      prevAgg = cache.months[prevMonth.key].userAgg;
      sendLatestMonthProgress({
        status: 'running',
        step: 1,
        totalSteps: 3,
        percent: 30,
        message: `⚡ โหลดข้อมูลฝาก ${prevMonth.fullLabel} จาก Cache สำเร็จ (${Object.keys(prevAgg).length.toLocaleString('th-TH')} ยูสเซอร์)`
      });
    } else {
      sendLatestMonthProgress({
        status: 'running',
        step: 1,
        totalSteps: 3,
        percent: 5,
        message: `⏳ กำลังดึงประวัติการฝากเงิน ${prevMonth.fullLabel}...`
      });

      prevAgg = await fetchMonthDepositMap(
        prevMonth.key,
        prevMonth.startDate,
        prevMonth.endDate,
        prevMonth.fullLabel,
        (cur, tot) => {
          const p = Math.round((cur / tot) * 30);
          sendLatestMonthProgress({
            status: 'running',
            step: 1,
            totalSteps: 3,
            percent: Math.min(30, Math.max(5, p)),
            message: `กำลังดึง ${prevMonth.fullLabel} · หน้า ${cur}/${tot} (${Math.round((cur / tot) * 100)}%)`
          });
        }
      );

      // Save to cache
      cache.months[prevMonth.key] = {
        isComplete: true,
        userAgg: prevAgg,
        totalUsers: Object.keys(prevAgg).length,
        updatedAt: Date.now()
      };
      saveSharedCohortCache(cache);
    }

    if (isLatestMonthCancelled) {
      return { ok: false, isCancelled: true, message: 'ยกเลิกการดึงข้อมูลแล้ว' };
    }

    // 2. Fetch Current Month Deposits (fresh live transactions)
    sendLatestMonthProgress({
      status: 'running',
      step: 2,
      totalSteps: 3,
      percent: 35,
      message: `⏳ กำลังดึงประวัติการฝากเงิน ${curMonth.fullLabel}...`
    });

    const curAgg = await fetchMonthDepositMap(
      curMonth.key,
      curMonth.startDate,
      curMonth.endDate,
      curMonth.fullLabel,
      (cur, tot) => {
        const p = 35 + Math.round((cur / tot) * 30);
        sendLatestMonthProgress({
          status: 'running',
          step: 2,
          totalSteps: 3,
          percent: Math.min(65, Math.max(35, p)),
          message: `กำลังดึง ${curMonth.fullLabel} · หน้า ${cur}/${tot} (${Math.round((cur / tot) * 100)}%)`
        });
      }
    );

    if (isLatestMonthCancelled) {
      return { ok: false, isCancelled: true, message: 'ยกเลิกการดึงข้อมูลแล้ว' };
    }

    // 3. Fetch All Members from /members
    sendLatestMonthProgress({
      status: 'running',
      step: 3,
      totalSteps: 3,
      percent: 70,
      message: '⏳ กำลังดึงข้อมูลสมาชิกทั้งหมด เพื่อจัดกลุ่มลูกค้า (VIP / ทั่วไป / ใหม่)...'
    });

    const pageSize = 200;
    const firstMembersPayload = await apiEngine.apiFetchJson('/members', {
      page: 1,
      limit: pageSize,
      website_id: context.websiteId,
      website_agent_id: context.agentId || undefined
    });

    const firstMembersRaw = apiEngine.apiDataArray(firstMembersPayload);
    const memPaging = apiEngine.apiPagination(firstMembersPayload, 1, pageSize, firstMembersRaw.length);
    let memTotalPages = memPaging.totalPages || (firstMembersRaw.length < pageSize ? 1 : 0);
    const allMembersRaw = [...firstMembersRaw];

    if (memTotalPages > 1) {
      const pages = Array.from({ length: memTotalPages - 1 }, (_, i) => i + 2);
      const concurrency = 10;
      let cursor = 0;
      let memCompleted = 1;

      const memWorker = async () => {
        while (cursor < pages.length) {
          if (isLatestMonthCancelled) break;
          const p = pages[cursor++];
          try {
            const pagePayload = await apiEngine.apiFetchJson('/members', {
              page: p,
              limit: pageSize,
              website_id: context.websiteId,
              website_agent_id: context.agentId || undefined
            });
            allMembersRaw.push(...apiEngine.apiDataArray(pagePayload));
          } catch (fetchErr) {
            console.warn(`[LatestMonth] Warning members page ${p}:`, fetchErr?.message);
          } finally {
            memCompleted++;
            const pct = 70 + Math.round((memCompleted / memTotalPages) * 25);
            sendLatestMonthProgress({
              status: 'running',
              step: 3,
              totalSteps: 3,
              percent: Math.min(95, pct),
              message: `ดึงข้อมูลสมาชิก · หน้า ${memCompleted}/${memTotalPages} (${allMembersRaw.length.toLocaleString('th-TH')} ยูสเซอร์)`
            });
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => memWorker()));
    }

    // 4. Map and Merge Data
    const memberMap = new Map();
    for (const mem of allMembersRaw) {
      const username = String(mem.game_username || mem.username || '').trim();
      if (!username || username === '-' || memberMap.has(username)) continue;

      const lifetimeDeposit = extractMemberDeposit(mem);
      const regDateRaw = mem.created_at || mem.registered_at || mem.register_at || '';
      const onlineRaw = mem.last_login || mem.last_online || mem.online_at || mem.updated_at || '';
      const code = String(mem.bankcode || mem.bank_code || '').toUpperCase();
      const acct = mem.banknumber || mem.bank_number || '';

      memberMap.set(username, {
        username,
        name: mem.fullname || mem.name || [mem.first_name, mem.last_name].filter(Boolean).join(' ') || '-',
        phone: apiEngine.apiDisplayPhone(mem.phone || mem.line || '') || '-',
        bank: (apiEngine.apiBankName(code) || code || '-') + (acct ? ` (${acct})` : ''),
        lifetimeDeposit,
        registeredAt: formatDateDisplay(regDateRaw),
        lastOnline: formatDateTimeDisplay(onlineRaw)
      });
    }

    // Ensure all users who deposited exist in map
    const allDepositUsers = new Set([...Object.keys(prevAgg), ...Object.keys(curAgg)]);
    for (const uname of allDepositUsers) {
      if (!memberMap.has(uname)) {
        memberMap.set(uname, {
          username: uname,
          name: '-',
          phone: '-',
          bank: '-',
          lifetimeDeposit: (prevAgg[uname]?.totalDeposit || 0) + (curAgg[uname]?.totalDeposit || 0),
          registeredAt: '-',
          lastOnline: '-'
        });
      }
    }

    // 5. Build final list of depositors
    const rows = [];
    for (const [username, mem] of memberMap.entries()) {
      const prevData = prevAgg[username];
      const curData = curAgg[username];

      const prevMonthDeposit = prevData ? prevData.totalDeposit : 0;
      const prevMonthCount = prevData ? prevData.depositCount : 0;
      const curMonthDeposit = curData ? curData.totalDeposit : 0;
      const curMonthCount = curData ? curData.depositCount : 0;

      const hasPrev = prevMonthDeposit > 0;
      const hasCur = curMonthDeposit > 0;
      const hasBoth = hasPrev && hasCur;

      // Only include users who deposited in at least one of these two months
      if (!hasPrev && !hasCur) continue;

      let lastDepAt = curData?.lastDepositAt || prevData?.lastDepositAt || '';
      if (lastDepAt) {
        lastDepAt = formatDateTimeDisplay(lastDepAt);
      }

      let depositStatus = 'ฝากทั้ง 2 เดือน';
      let depositStatusKey = 'both';
      if (hasBoth) {
        depositStatus = 'ฝากทั้ง 2 เดือน';
        depositStatusKey = 'both';
      } else if (hasPrev && !hasCur) {
        depositStatus = 'ฝากเดือนที่แล้วเท่านั้น';
        depositStatusKey = 'prev_only';
      } else if (!hasPrev && hasCur) {
        depositStatus = 'ฝากเฉพาะเดือนนี้';
        depositStatusKey = 'cur_only';
      }

      const totalRecent = prevMonthDeposit + curMonthDeposit;
      const depositForTier = Math.max(mem.lifetimeDeposit, totalRecent);
      let tier = 'ใหม่';
      let tierKey = 'new';
      if (depositForTier >= vipMin) {
        tier = 'VIP';
        tierKey = 'vip';
      } else if (depositForTier >= generalMin) {
        tier = 'ทั่วไป';
        tierKey = 'general';
      }

      rows.push({
        username,
        name: mem.name,
        phone: mem.phone,
        bank: mem.bank,
        tier,
        tierKey,
        lifetimeDeposit: mem.lifetimeDeposit,
        prevMonthDeposit,
        prevMonthCount,
        curMonthDeposit,
        curMonthCount,
        recentTotalDeposit: totalRecent,
        hasPrevDeposit: hasPrev,
        hasCurDeposit: hasCur,
        hasBothMonths: hasBoth,
        depositStatus,
        depositStatusKey,
        lastDepositAt: lastDepAt || '-',
        lastOnline: mem.lastOnline,
        registeredAt: mem.registeredAt
      });
    }

    // Sort descending by recent total deposit
    rows.sort((a, b) => b.recentTotalDeposit - a.recentTotalDeposit);
    rows.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    // Compute Summaries
    const bothList = rows.filter((r) => r.hasBothMonths);
    const prevList = rows.filter((r) => r.hasPrevDeposit);

    const calcGroup = (arr) => {
      const vip = arr.filter((r) => r.tierKey === 'vip');
      const gen = arr.filter((r) => r.tierKey === 'general');
      const nw = arr.filter((r) => r.tierKey === 'new');
      return {
        totalCount: arr.length,
        totalPrevDeposit: arr.reduce((s, r) => s + r.prevMonthDeposit, 0),
        totalCurDeposit: arr.reduce((s, r) => s + r.curMonthDeposit, 0),
        totalRecentDeposit: arr.reduce((s, r) => s + r.recentTotalDeposit, 0),
        vip: {
          count: vip.length,
          prevDeposit: vip.reduce((s, r) => s + r.prevMonthDeposit, 0),
          curDeposit: vip.reduce((s, r) => s + r.curMonthDeposit, 0),
          totalDeposit: vip.reduce((s, r) => s + r.recentTotalDeposit, 0)
        },
        general: {
          count: gen.length,
          prevDeposit: gen.reduce((s, r) => s + r.prevMonthDeposit, 0),
          curDeposit: gen.reduce((s, r) => s + r.curMonthDeposit, 0),
          totalDeposit: gen.reduce((s, r) => s + r.recentTotalDeposit, 0)
        },
        new: {
          count: nw.length,
          prevDeposit: nw.reduce((s, r) => s + r.prevMonthDeposit, 0),
          curDeposit: nw.reduce((s, r) => s + r.curMonthDeposit, 0),
          totalDeposit: nw.reduce((s, r) => s + r.recentTotalDeposit, 0)
        }
      };
    };

    const summary = {
      bothMonths: calcGroup(bothList),
      prevMonth: calcGroup(prevList),
      allRecent: calcGroup(rows)
    };

    cachedLatestMonthData = {
      config,
      curMonth,
      prevMonth,
      rows,
      summary,
      fetchedAt: Date.now()
    };

    sendLatestMonthProgress({
      status: 'done',
      step: 3,
      totalSteps: 3,
      percent: 100,
      message: `ดึงข้อมูลสำเร็จ! รวม ${rows.length.toLocaleString('th-TH')} ยูสเซอร์ (ฝากทั้ง 2 เดือน: ${bothList.length.toLocaleString('th-TH')} คน, ฝากเดือนที่แล้ว: ${prevList.length.toLocaleString('th-TH')} คน)`
    });

    return {
      ok: true,
      curMonth,
      prevMonth,
      totalMembersScanned: memberMap.size,
      totalDepositors: rows.length,
      summary,
      rows,
      config
    };
  } catch (error) {
    console.error('[LatestMonth] Error in fetchLatestMonthDepositors:', error);
    sendLatestMonthProgress({
      status: 'error',
      step: 3,
      totalSteps: 3,
      percent: 100,
      message: `❌ เกิดข้อผิดพลาด: ${error?.message || error}`
    });
    throw error;
  }
}

function populateLatestMonthSheet(sheet, list, sheetTitle, curMonth, prevMonth, headerBgColor = 'FF1E293B') {
  const prevLabel = prevMonth ? prevMonth.shortLabel : 'เดือนที่แล้ว';
  const curLabel = curMonth ? curMonth.shortLabel : 'เดือนนี้';

  sheet.columns = [
    { header: 'อันดับ', key: 'rank', width: 9 },
    { header: 'ยูสเซอร์', key: 'username', width: 19 },
    { header: 'ชื่อ-นามสกุล', key: 'name', width: 25 },
    { header: 'เบอร์โทร', key: 'phone', width: 17 },
    { header: 'กลุ่มลูกค้า', key: 'tier', width: 14 },
    { header: `ยอดฝาก (${prevLabel})`, key: 'prevMonthDeposit', width: 20 },
    { header: 'จำนวนครั้ง', key: 'prevMonthCount', width: 13 },
    { header: `ยอดฝาก (${curLabel})`, key: 'curMonthDeposit', width: 20 },
    { header: 'จำนวนครั้ง', key: 'curMonthCount', width: 13 },
    { header: 'ยอดฝากรวม 2 เดือน', key: 'recentTotalDeposit', width: 22 },
    { header: 'ยอดฝากสะสมตลอดชีพ', key: 'lifetimeDeposit', width: 22 },
    { header: 'สถานะการฝาก', key: 'depositStatus', width: 22 },
    { header: 'วันที่ฝากล่าสุด', key: 'lastDepositAt', width: 20 },
    { header: 'ออนไลน์ล่าสุด', key: 'lastOnline', width: 20 },
    { header: 'วันที่สมัคร', key: 'registeredAt', width: 16 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let sumPrev = 0;
  let sumCur = 0;
  let sumRecent = 0;
  let sumLifetime = 0;

  list.forEach((m, idx) => {
    sumPrev += m.prevMonthDeposit;
    sumCur += m.curMonthDeposit;
    sumRecent += m.recentTotalDeposit;
    sumLifetime += m.lifetimeDeposit;

    const row = sheet.addRow({
      rank: idx + 1,
      username: m.username,
      name: m.name,
      phone: m.phone,
      tier: m.tier,
      prevMonthDeposit: m.prevMonthDeposit,
      prevMonthCount: m.prevMonthCount,
      curMonthDeposit: m.curMonthDeposit,
      curMonthCount: m.curMonthCount,
      recentTotalDeposit: m.recentTotalDeposit,
      lifetimeDeposit: m.lifetimeDeposit,
      depositStatus: m.depositStatus,
      lastDepositAt: m.lastDepositAt || '-',
      lastOnline: m.lastOnline || '-',
      registeredAt: m.registeredAt || '-'
    });

    row.height = 22;

    row.getCell('rank').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('username').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('name').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('tier').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('prevMonthDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('prevMonthDeposit').numFmt = '#,##0.00';
    row.getCell('prevMonthCount').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('curMonthDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('curMonthDeposit').numFmt = '#,##0.00';
    row.getCell('curMonthCount').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('recentTotalDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('recentTotalDeposit').numFmt = '#,##0.00';
    row.getCell('recentTotalDeposit').font = { bold: true };
    row.getCell('lifetimeDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('lifetimeDeposit').numFmt = '#,##0.00';
    row.getCell('depositStatus').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('lastDepositAt').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('lastOnline').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('registeredAt').alignment = { horizontal: 'center', vertical: 'middle' };

    if (m.tierKey === 'vip') {
      row.getCell('tier').font = { bold: true, color: { argb: 'FFD97706' } };
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'FFFFFBEB' : 'FFFFFDF5' } };
      });
    } else if (m.tierKey === 'general') {
      row.getCell('tier').font = { bold: true, color: { argb: 'FF2563EB' } };
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
        });
      }
    } else {
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
    }
  });

  const totalRow = sheet.addRow({
    rank: '',
    username: 'รวมทั้งหมด',
    name: '',
    phone: `${list.length.toLocaleString('th-TH')} คน`,
    tier: '',
    prevMonthDeposit: sumPrev,
    prevMonthCount: '',
    curMonthDeposit: sumCur,
    curMonthCount: '',
    recentTotalDeposit: sumRecent,
    lifetimeDeposit: sumLifetime,
    depositStatus: '',
    lastDepositAt: '',
    lastOnline: '',
    registeredAt: ''
  });

  totalRow.height = 28;
  totalRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF475569' } }
    };
  });
  totalRow.getCell('prevMonthDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('prevMonthDeposit').numFmt = '#,##0.00';
  totalRow.getCell('curMonthDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('curMonthDeposit').numFmt = '#,##0.00';
  totalRow.getCell('recentTotalDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('recentTotalDeposit').numFmt = '#,##0.00';
  totalRow.getCell('lifetimeDeposit').alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell('lifetimeDeposit').numFmt = '#,##0.00';
}

async function exportLatestMonthDepositorsWorkbook(savePath = null, options = {}) {
  let rows = cachedLatestMonthData.rows;
  let curMonth = cachedLatestMonthData.curMonth;
  let prevMonth = cachedLatestMonthData.prevMonth;

  if (!rows || !rows.length) {
    const fetchRes = await fetchLatestMonthDepositors(options);
    rows = fetchRes.rows;
    curMonth = fetchRes.curMonth;
    prevMonth = fetchRes.prevMonth;
  }

  const mode = options.filterMode || 'both';
  let targetList = [...rows];
  let filterName = 'ฝากทั้ง2เดือน';

  if (mode === 'cur' || mode === 'current') {
    targetList = targetList.filter((r) => r.hasCurDeposit);
    targetList.sort((a, b) => b.curMonthDeposit - a.curMonthDeposit);
    filterName = `ฝากเดือนนี้_${curMonth?.shortLabel || 'เดือนปัจจุบัน'}`;
  } else if (mode === 'prev') {
    targetList = targetList.filter((r) => r.hasPrevDeposit);
    targetList.sort((a, b) => b.prevMonthDeposit - a.prevMonthDeposit);
    filterName = `ฝากเดือนที่แล้ว_${prevMonth?.shortLabel || 'เดือนก่อนหน้า'}`;
  } else {
    // default: both
    targetList = targetList.filter((r) => r.hasBothMonths);
    targetList.sort((a, b) => b.recentTotalDeposit - a.recentTotalDeposit);
    filterName = `ฝากทั้ง2เดือน_${curMonth?.shortLabel || 'ด.นี้'}+${prevMonth?.shortLabel || 'ด.ก่อน'}`;
  }

  // Recalculate rank for exported list
  targetList.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  // Sheet 1: สรุปผู้ฝากตามเงื่อนไข
  const sheetAll = workbook.addWorksheet(`สรุป_${filterName}`.slice(0, 31), { views: [{ showGridLines: true }] });
  populateLatestMonthSheet(sheetAll, targetList, 'สรุปผู้ฝากตามเงื่อนไข', curMonth, prevMonth, 'FF1E293B');

  // Sheet 2: กลุ่ม VIP
  const vipList = targetList.filter((m) => m.tierKey === 'vip');
  const sheetVip = workbook.addWorksheet('กลุ่ม VIP (1M+)', { views: [{ showGridLines: true }] });
  populateLatestMonthSheet(sheetVip, vipList, 'กลุ่ม VIP', curMonth, prevMonth, 'FFD97706');

  // Sheet 3: กลุ่มทั่วไป
  const generalList = targetList.filter((m) => m.tierKey === 'general');
  const sheetGeneral = workbook.addWorksheet('กลุ่มทั่วไป (100K-999K)', { views: [{ showGridLines: true }] });
  populateLatestMonthSheet(sheetGeneral, generalList, 'กลุ่มทั่วไป', curMonth, prevMonth, 'FF2563EB');

  // Sheet 4: กลุ่มใหม่
  const newList = targetList.filter((m) => m.tierKey === 'new');
  const sheetNew = workbook.addWorksheet('กลุ่มใหม่ (0-99K)', { views: [{ showGridLines: true }] });
  populateLatestMonthSheet(sheetNew, newList, 'กลุ่มใหม่', curMonth, prevMonth, 'FF059669');

  const d = new Date();
  const defaultFilename = `NK_รายงานลูกค้าฝากล่าสุด_${filterName}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  return {
    ok: true,
    filePath: outputPath,
    rowCount: targetList.length,
    filterName
  };
}

async function runRewardReport(config = {}, savePath = null) {
  await fetchRewardData(config);
  return exportRewardWorkbook(savePath, config);
}

/**
 * 5. ดึงข้อมูลรายงานกระทบยอดการเงิน (Reconciliation & Audit Engine)
 * วิเคราะห์เงินสดจริง (Cash In / Out) เทียบกับ เครดิตลม (ปรับยอด/โบนัส/แต้ม)
 * พร้อมระบบตามหายอดเงินขาด (เช่น 1,092 บาท)
 */
async function fetchReconciliationData(config = {}) {
  const bkk = apiEngine.getBangkokDateParts ? apiEngine.getBangkokDateParts(new Date()) : { year: new Date().getFullYear(), month: '01', day: '01' };
  const todayStr = `${bkk.year}-${bkk.month}-${bkk.day}`;
  const rawTarget = config.targetDiscrepancy;
  const hasTarget = rawTarget != null && String(rawTarget).trim() !== '' && !isNaN(Number(rawTarget)) && Number(rawTarget) > 0;
  const targetDiscrepancy = hasTarget ? Math.abs(Number(rawTarget)) : 0;
  const normalized = {
    startDate: config.startDate || todayStr,
    endDate: config.endDate || todayStr,
    targetDiscrepancy,
    hasTarget,
    pageSize: Number(config.pageSize) || 200
  };

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('reconciliationState', {
    status: 'starting',
    requestId,
    config: normalized,
    message: 'กำลังเชื่อมต่อ API เพื่อดึงข้อมูลแมนนวล · ปรับมือ · กิจกรรม...',
    currentPage: 0,
    totalPages: 0,
    matchedCount: 0,
    startedAt
  });

  try {
    const context = await apiEngine.getApiBusinessContext();
    const combined = [];
    const seen = new Set();

    // Helper to fetch all pages for an endpoint without arbitrary truncation
    const fetchAllPages = async (endpoint, baseParams, maxPages = 200) => {
      let page = 1;
      const results = [];
      while (page <= maxPages) {
        try {
          const payload = await apiEngine.apiFetchJson(endpoint, {
            ...baseParams,
            page,
            limit: 200,
            website_id: context.websiteId,
            website_agent_id: context.agentId || undefined
          });
          const raw = apiEngine.apiDataArray(payload);
          if (!raw || !raw.length) break;
          results.push(...raw);
          if (raw.length < 200) break;
          page++;
        } catch (err) {
          console.warn(`[Reconciliation] Error fetching ${endpoint} page ${page}:`, err?.message || err);
          break;
        }
      }
      return results;
    };
    const fetchPages = fetchAllPages;

    // 1. Fetch Manual Deposits from /transactions (เมนู 1.4 ฝากมือ โดยตรง ไม่โดนออโต้เบียด)
    const rawDeposits = await fetchAllPages('/transactions', {
      type: 'deposit',
      process_type: 'manual',
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      sort: 'transaction_at',
      order: 'desc'
    });

    for (const item of rawDeposits) {
      const pType = String(item.process_type || '').toLowerCase();
      const meth = String(item.method || '').toLowerCase();
      const isManual = pType === 'manual' || meth === 'manual' || item.type === 'manual' || !item.process_type;
      if (!isManual && item.process_type && item.process_type !== 'manual') continue;

      const key = `TX_DEP:${String(item?.id ?? item?.transaction_id)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bankCode = String(item.to_bank_code || item.bank?.code || '').trim();
      const bankNumber = String(item.to_bank_number || item.bank?.account || '').trim();
      const hasBank = Boolean(
        (bankCode && bankCode !== '-' && bankCode !== 'null' && bankCode !== 'undefined') ||
        (bankNumber && bankNumber !== '-' && bankNumber !== 'null' && bankNumber !== 'undefined')
      );
      const bankNameText = bankCode ? (apiEngine.apiBankName ? apiEngine.apiBankName(bankCode) : bankCode) : '';
      const bankFull = hasBank ? `${bankNameText} ${bankNumber}`.trim() : 'ไม่ระบุบัญชี';
      const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : 'แอดมิน');
      const amount = Math.abs(Number(item.amount || 0));

      const sourceCategory = hasBank ? 'manual_deposit_bank' : 'manual_deposit_nobank';
      const typeLabel = hasBank ? '🟢 ฝากมือ (ระบุบัญชี)' : '🟡 ฝากมือ (ไม่ระบุบัญชี)';
      const isRealCash = hasBank;
      const flowGroup = hasBank ? 'cash_in' : 'suspicious_cash';

      combined.push({
        id: key,
        rawId: String(item?.id ?? item?.transaction_id ?? ''),
        sourceCategory,
        flowGroup,
        isRealCash,
        groupLabel: isRealCash ? 'เงินสดรับจริง' : 'ฝากมือ (ไม่ระบุบัญชี/เสี่ยงเงินขาด)',
        typeLabel,
        flowType: 'IN',
        username: item.game_username || item.member?.game_username || '-',
        name: item.member?.fullname || item.fullname || item.from_bank_name || item.to_bank_name || '-',
        phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
        amount,
        signedAmount: amount,
        bankInfo: bankFull,
        bankName: bankNameText || '-',
        bankAccount: bankNumber || '-',
        bankType: hasBank ? 'ระบุบัญชีปลายทาง' : 'ไม่ระบุบัญชี',
        admin,
        createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
        rawDate: item.transaction_at || item.created_at || '',
        status: /success|approved|complete/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || 'สำเร็จ'),
        note: item.note || '-'
      });
    }

    // 2. Fetch Manual Withdrawals from /transactions (เมนู 1.4 ถอนมือ โดยตรง ไม่ปนถอนออโต้)
    const rawWithdrawals = await fetchAllPages('/transactions', {
      type: 'withdraw',
      process_type: 'manual',
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      sort: 'transaction_at',
      order: 'desc'
    });

    for (const item of rawWithdrawals) {
      const pType = String(item.process_type || '').toLowerCase();
      const meth = String(item.method || '').toLowerCase();
      const isManual = pType === 'manual' || meth === 'manual' || item.type === 'manual' || !item.process_type;
      if (!isManual && item.process_type && item.process_type !== 'manual') continue;

      const key = `TX_WTH:${String(item?.id ?? item?.transaction_id)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bankCode = String(item.to_bank_code || item.bank?.code || item.from_bank_code || '').trim();
      const bankNumber = String(item.to_bank_number || item.bank?.account || item.from_bank_number || '').trim();
      const hasBank = Boolean(
        (bankCode && bankCode !== '-' && bankCode !== 'null' && bankCode !== 'undefined') ||
        (bankNumber && bankNumber !== '-' && bankNumber !== 'null' && bankNumber !== 'undefined')
      );
      const bankNameText = bankCode ? (apiEngine.apiBankName ? apiEngine.apiBankName(bankCode) : bankCode) : '';
      const bankFull = hasBank ? `${bankNameText} ${bankNumber}`.trim() : 'ไม่ระบุบัญชี';
      const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : 'แอดมิน');
      const amount = Math.abs(Number(item.amount || 0));

      combined.push({
        id: key,
        rawId: String(item?.id ?? item?.transaction_id ?? ''),
        sourceCategory: 'manual_withdraw',
        flowGroup: 'cash_out',
        isRealCash: true,
        groupLabel: 'เงินสดจ่ายจริง',
        typeLabel: '🔴 ถอนมือ',
        flowType: 'OUT',
        username: item.game_username || item.member?.game_username || '-',
        name: item.member?.fullname || item.fullname || item.from_bank_name || item.to_bank_name || '-',
        phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
        amount,
        signedAmount: -amount,
        bankInfo: bankFull,
        bankName: bankNameText || '-',
        bankAccount: bankNumber || '-',
        bankType: hasBank ? 'ระบุบัญชีปลายทาง' : 'ไม่ระบุบัญชี',
        admin,
        createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
        rawDate: item.transaction_at || item.created_at || '',
        status: /success|approved|complete/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || 'สำเร็จ'),
        note: item.note || '-'
      });
    }

    // 3. Fetch Balance Adjustments (ปรับยอดหน้าสมาชิก)
    const rawAdjustments = await fetchAllPages('/credit-history', {
      start_date: normalized.startDate,
      end_date: normalized.endDate
    });

    for (const item of rawAdjustments) {
      const txid = String(item.transaction_id || '');
      if (!txid.startsWith('manual_adjust:') && item.category !== 'adjustment' && !/increase_credit|decrease_credit/i.test(String(item.method || ''))) continue;

      const key = `CH_ADJ:${String(item?.id ?? txid)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isDeduct = /decrease|deduct/i.test(String(item.method || '')) || String(item.direction || '') === 'out';
      const rawAmt = Math.abs(Number(item.amount || 0));
      const amount = rawAmt;
      const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

      combined.push({
        id: key,
        rawId: String(item?.id ?? txid),
        sourceCategory: isDeduct ? 'adjust_decrease' : 'adjust_increase',
        flowGroup: 'non_cash',
        isRealCash: false,
        groupLabel: 'เครดิตลม (ปรับยอดหน้าสมาชิก)',
        typeLabel: isDeduct ? '🟠 ปรับลด (-)' : '🔵 ปรับเพิ่ม (+)',
        flowType: isDeduct ? 'ADJUST_OUT' : 'ADJUST_IN',
        username: item.game_username || item.member?.game_username || '-',
        name: item.member?.fullname || item.fullname || '-',
        phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
        amount,
        signedAmount: isDeduct ? -amount : amount,
        creditBeforeAfter: (item.before_credit != null && item.after_credit != null) ? `${item.before_credit} → ${item.after_credit}` : '-',
        bankInfo: 'ไม่ระบุบัญชี (ปรับเครดิตตรง)',
        bankName: '-',
        bankAccount: '-',
        bankType: 'ไม่ระบุบัญชี',
        admin,
        createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
        rawDate: item.transaction_at || item.created_at || '',
        status: 'สำเร็จ',
        note: item.note || '-'
      });
    }

    // 4. Fetch Bonus from /reports/bonus
    const rawBonuses = await fetchAllPages('/reports/bonus', {
      start_date: normalized.startDate,
      end_date: normalized.endDate,
      sort: 'transaction_at',
      order: 'desc'
    });

    for (const item of rawBonuses) {
      const key = `BONUS:${String(item?.id ?? item?.transaction_id)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const amount = Math.abs(Number(item.amount || 0));
      const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

      combined.push({
        id: key,
        rawId: String(item?.id ?? item?.transaction_id ?? ''),
        sourceCategory: 'bonus',
        flowGroup: 'non_cash',
        isRealCash: false,
        groupLabel: 'โบนัส (Bonus)',
        typeLabel: '🎁 โบนัส',
        flowType: 'BONUS',
        username: item.game_username || item.member?.game_username || '-',
        name: item.member?.fullname || item.fullname || '-',
        phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
        amount,
        signedAmount: amount,
        bankInfo: '-',
        bankName: '-',
        bankAccount: '-',
        bankType: 'ไม่ระบุบัญชี',
        admin,
        createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.transaction_at || item.created_at) : (item.transaction_at || '-'),
        rawDate: item.transaction_at || item.created_at || '',
        status: /success|approved/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || '-'),
        note: item.note || item.campaign_name || '-'
      });
    }

    // 5. Fetch Reward from /reward-redeems
    const rawRewards = await fetchAllPages('/reward-redeems', {
      sort: 'created_at',
      order: 'desc'
    });

    for (const item of rawRewards) {
      const dStr = String(item.created_at || '').slice(0, 10);
      if (dStr && (dStr < normalized.startDate || dStr > normalized.endDate)) continue;

      const key = `REWARD:${String(item?.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const amount = Math.abs(Number(item.credit_amount || 0));
      const admin = item.admin?.username || item.admin?.name || (item.admin_id ? `Admin #${item.admin_id}` : '-');

      combined.push({
        id: key,
        rawId: String(item?.id ?? ''),
        sourceCategory: 'reward',
        flowGroup: 'non_cash',
        isRealCash: false,
        groupLabel: 'แลกแต้ม 1.9',
        typeLabel: '🎟️ แลกแต้ม',
        flowType: 'REWARD',
        username: item.game_username || item.member?.game_username || '-',
        name: item.member?.fullname || item.fullname || '-',
        phone: apiEngine.apiDisplayPhone ? apiEngine.apiDisplayPhone(item.phone || item.member?.phone || '') : (item.phone || item.member?.phone || '-'),
        amount,
        signedAmount: amount,
        points: Math.abs(Number(item.points || 0)),
        bankInfo: '-',
        bankName: '-',
        bankAccount: '-',
        bankType: 'ไม่ระบุบัญชี',
        admin,
        createdAt: apiEngine.apiFormatDateTime ? apiEngine.apiFormatDateTime(item.created_at) : (item.created_at || '-'),
        rawDate: item.created_at || '',
        status: /approved|success/i.test(String(item.status || '')) ? 'สำเร็จ' : (item.status || '-'),
        note: item.note || item.reward_name || '-'
      });
    }

    // Sort chronologically descending
    combined.sort((a, b) => {
      const timeA = new Date(a.rawDate || a.createdAt).getTime() || 0;
      const timeB = new Date(b.rawDate || b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    combined.forEach((r, idx) => { r.seq = idx + 1; });

    // Financial KPI Aggregations
    let autoDepositCount = 0;
    let autoDepositAmount = 0;
    let manualDepositWithBankCount = 0;
    let manualDepositWithBankAmount = 0;
    let manualDepositNoBankCount = 0;
    let manualDepositNoBankAmount = 0;

    let autoWithdrawCount = 0;
    let autoWithdrawAmount = 0;
    let manualWithdrawCount = 0;
    let manualWithdrawAmount = 0;

    let adjustIncreaseCount = 0;
    let adjustIncreaseAmount = 0;
    let adjustDecreaseCount = 0;
    let adjustDecreaseAmount = 0;

    let bonusCount = 0;
    let bonusAmount = 0;
    let rewardCount = 0;
    let rewardAmount = 0;

    for (const r of combined) {
      const amt = Number(r.amount) || 0;
      if (r.sourceCategory === 'auto_deposit') {
        autoDepositCount++;
        autoDepositAmount += amt;
      } else if (r.sourceCategory === 'manual_deposit_bank') {
        manualDepositWithBankCount++;
        manualDepositWithBankAmount += amt;
      } else if (r.sourceCategory === 'manual_deposit_nobank') {
        manualDepositNoBankCount++;
        manualDepositNoBankAmount += amt;
      } else if (r.sourceCategory === 'auto_withdraw') {
        autoWithdrawCount++;
        autoWithdrawAmount += amt;
      } else if (r.sourceCategory === 'manual_withdraw') {
        manualWithdrawCount++;
        manualWithdrawAmount += amt;
      } else if (r.sourceCategory === 'adjust_increase') {
        adjustIncreaseCount++;
        adjustIncreaseAmount += amt;
      } else if (r.sourceCategory === 'adjust_decrease') {
        adjustDecreaseCount++;
        adjustDecreaseAmount += amt;
      } else if (r.sourceCategory === 'bonus') {
        bonusCount++;
        bonusAmount += amt;
      } else if (r.sourceCategory === 'reward') {
        rewardCount++;
        rewardAmount += amt;
      }
    }

    const realCashInAmount = autoDepositAmount + manualDepositWithBankAmount;
    const realCashOutAmount = autoWithdrawAmount + manualWithdrawAmount;
    const netBankCashBalance = realCashInAmount - realCashOutAmount;
    const netAdjustmentAmount = adjustIncreaseAmount - adjustDecreaseAmount;
    const totalNonCashAmount = netAdjustmentAmount + bonusAmount + rewardAmount;

    // Discrepancy Detective Algorithm for targetDiscrepancy (if specified > 0)
    const T = targetDiscrepancy;
    const exactMatches = [];
    const suspiciousItems = [];
    const combinationMatches = [];

    if (T > 0) {
      for (const r of combined) {
        const amt = Number(r.amount) || 0;
        // Exact match check (tolerance 0.01)
        if (Math.abs(amt - T) < 0.01) {
          exactMatches.push({
            row: r,
            reason: `ยอดเงินตรงกับยอดขาด ${T.toLocaleString('th-TH')} บ. พอดี 100%`,
            severity: (r.sourceCategory === 'manual_deposit_nobank' || r.sourceCategory === 'adjust_increase') ? 'high' : 'medium'
          });
        }
      }

      // Combination Matching (Pairs) for T (e.g. 1000 + 92)
      const candidateRows = combined.filter((r) => {
        const a = Number(r.amount) || 0;
        return a > 0 && a <= T + 50 && ['adjust_increase', 'adjust_decrease', 'manual_deposit_nobank', 'manual_deposit_bank', 'manual_withdraw'].includes(r.sourceCategory);
      }).slice(0, 100);

      for (let i = 0; i < candidateRows.length; i++) {
        for (let j = i + 1; j < candidateRows.length; j++) {
          const r1 = candidateRows[i];
          const r2 = candidateRows[j];
          const sum = (Number(r1.amount) || 0) + (Number(r2.amount) || 0);
          if (Math.abs(sum - T) < 0.01) {
            combinationMatches.push({
              type: 'pair',
              items: [r1, r2],
              total: sum,
              description: `[${r1.typeLabel}] ฿${r1.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${r1.username} โดย ${r1.admin}) + [${r2.typeLabel}] ฿${r2.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${r2.username} โดย ${r2.admin}) = ฿${sum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
            });
          }
          if (combinationMatches.length >= 6) break;
        }
        if (combinationMatches.length >= 6) break;
      }
    }

    // Suspicious items check (e.g. manual deposit without bank, suspicious notes)
    for (const r of combined) {
      const note = String(r.note || '').toLowerCase();
      const hasSuspiciousKeyword = /ดึงคืน|แก้|ผิด|ชดเชย|ค้าง|ซ้ำ|ลดยอด|ตัดยอด/.test(note);
      if (r.sourceCategory === 'manual_deposit_nobank' || (r.sourceCategory === 'adjust_increase' && hasSuspiciousKeyword)) {
        suspiciousItems.push({
          row: r,
          reason: r.sourceCategory === 'manual_deposit_nobank' ? 'ฝากมือแต่ไม่ระบุบัญชีธนาคาร (เสี่ยงเงินไม่เข้าบัญชีจริง)' : `ปรับยอดเพิ่มมีหมายเหตุต้องสงสัย: "${r.note}"`,
          severity: 'high'
        });
      }
    }

    const summary = {
      totalRows: combined.length,
      // 1. Cash In
      autoDepositCount,
      autoDepositAmount,
      manualDepositWithBankCount,
      manualDepositWithBankAmount,
      realCashInCount: autoDepositCount + manualDepositWithBankCount,
      realCashInAmount,
      manualDepositNoBankCount,
      manualDepositNoBankAmount,

      // 2. Cash Out
      autoWithdrawCount,
      autoWithdrawAmount,
      manualWithdrawCount,
      manualWithdrawAmount,
      realCashOutCount: autoWithdrawCount + manualWithdrawCount,
      realCashOutAmount,

      // 3. Expected Net Bank Balance
      netBankCashBalance,

      // 4. Non-cash Credits
      adjustIncreaseCount,
      adjustIncreaseAmount,
      adjustDecreaseCount,
      adjustDecreaseAmount,
      netAdjustmentAmount,
      bonusCount,
      bonusAmount,
      rewardCount,
      rewardAmount,
      totalNonCashCount: adjustIncreaseCount + adjustDecreaseCount + bonusCount + rewardCount,
      totalNonCashAmount,

      // 5. Findings
      targetDiscrepancy: T,
      exactMatchesCount: exactMatches.length,
      combinationMatchesCount: combinationMatches.length,
      suspiciousCount: suspiciousItems.length
    };

    const findings = {
      targetDiscrepancy: T,
      exactMatches,
      combinationMatches,
      netAdjustmentMatch: Math.abs(netAdjustmentAmount - T) < 0.01,
      adjustIncreaseMatch: Math.abs(adjustIncreaseAmount - T) < 0.01,
      manualNoBankMatch: Math.abs(manualDepositNoBankAmount - T) < 0.01,
      suspiciousItems: suspiciousItems.slice(0, 30)
    };

    cachedReconciliationData = {
      config: normalized,
      rows: combined,
      summary,
      findings,
      fetchedAt: Date.now()
    };

    const finalState = {
      status: 'preview',
      requestId,
      config: normalized,
      message: `ดึงข้อมูลกระทบยอดสำเร็จ ${combined.length.toLocaleString('th-TH')} รายการ (พบยอดตรง ${exactMatches.length} รายการ · ชุดรวม ${combinationMatches.length} ชุด)`,
      matchedCount: combined.length,
      summary,
      findings,
      finishedAt: Date.now()
    };
    store.set('reconciliationState', finalState);

    return { ok: true, summary, findings, rows: combined, rowCount: combined.length, config: normalized };
  } catch (error) {
    store.set('reconciliationState', {
      status: 'error',
      requestId,
      config: normalized,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

/**
 * 6. ส่งออกรายงานกระทบยอดการเงิน (Reconciliation & Audit Excel Workbook)
 * จัดเป็นตาราง 5 ชีท ธีมพาสเทล พร้อมบทวิเคราะห์ยอดเงินขาด
 */
async function exportReconciliationWorkbook(savePath = null, config = null) {
  let combined = cachedReconciliationData.rows;
  let normalized = cachedReconciliationData.config || config;

  if (!combined || !combined.length) {
    await fetchReconciliationData(normalized || {});
    combined = cachedReconciliationData.rows;
    normalized = cachedReconciliationData.config;
  }

  const summary = cachedReconciliationData.summary || {};
  const findings = cachedReconciliationData.findings || {};
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NK Helper Desktop';
  workbook.created = new Date();

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  const headerBorder = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  function applyHeaderStyle(row, bgHex = 'FF0F766E', height = 28) {
    row.height = height;
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = headerBorder;
    });
  }

  function applyDataRowStyle(row, idx, amountKey = 'amount') {
    row.height = 22;
    const isAlt = idx % 2 === 1;
    const bg = isAlt ? 'FFF8FAFC' : 'FFFFFFFF';
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
    });

    const amtCell = row.getCell(amountKey);
    if (amtCell && amtCell.value != null && Number.isFinite(Number(amtCell.value))) {
      amtCell.numFmt = '#,##0.00';
      amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (Number(amtCell.value) < 0) {
        amtCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
      } else if (Number(amtCell.value) > 0) {
        amtCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF166534' } };
      }
    }
  }

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Sheet 1: สรุปภาพรวม (Executive Summary - 4 Core Categories)
  // -------------------------------------------------------------
  const sheetSummary = workbook.addWorksheet('สรุปภาพรวม', { views: [{ showGridLines: true }] });
  sheetSummary.columns = [
    { key: 'colA', width: 6 },
    { key: 'colB', width: 44 },
    { key: 'colC', width: 22 },
    { key: 'colD', width: 22 },
    { key: 'colE', width: 34 }
  ];

  // Header banner
  sheetSummary.mergeCells('B2:E2');
  const titleCell = sheetSummary.getCell('B2');
  titleCell.value = '📊 รายงานสรุปภาพรวม: แมนนวล · ปรับมือ · กิจกรรม · ยอดต้องสงสัย';
  titleCell.font = { name: 'Segoe UI', bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(2).height = 36;

  sheetSummary.mergeCells('B3:E3');
  const subTitleCell = sheetSummary.getCell('B3');
  const targetDesc = (normalized?.targetDiscrepancy && normalized.targetDiscrepancy > 0)
    ? `฿${normalized.targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
    : 'ไม่ได้ระบุ';
  subTitleCell.value = `ช่วงวันที่: ${normalized?.startDate || '-'} ถึง ${normalized?.endDate || '-'}  ·  ยอดขาดเป้าหมาย: ${targetDesc}  ·  สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}`;
  subTitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheetSummary.getRow(3).height = 24;

  let rIdx = 5;

  const addSectionHeader = (title, bg = 'FF1E293B') => {
    sheetSummary.mergeCells(`B${rIdx}:E${rIdx}`);
    const c = sheetSummary.getCell(`B${rIdx}`);
    c.value = title;
    c.font = { name: 'Segoe UI', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c.alignment = { vertical: 'middle', indent: 1 };
    sheetSummary.getRow(rIdx).height = 25;
    rIdx++;
  };

  const addSummaryRow = (label, count, amount, note = '', isTotal = false, color = 'FF1E293B') => {
    const row = sheetSummary.getRow(rIdx);
    row.height = isTotal ? 24 : 20;

    row.getCell(2).value = label;
    row.getCell(3).value = count != null ? `${count.toLocaleString('th-TH')} รายการ` : '-';
    row.getCell(4).value = amount;
    row.getCell(5).value = note;

    row.getCell(2).font = { name: 'Segoe UI', bold: isTotal, size: isTotal ? 10.5 : 10, color: { argb: color } };
    row.getCell(3).font = { name: 'Segoe UI', size: 10, color: { argb: 'FF64748B' } };
    row.getCell(4).font = { name: 'Segoe UI', bold: isTotal, size: isTotal ? 11 : 10, color: { argb: color } };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF64748B' } };

    const bg = isTotal ? 'FFF1F5F9' : (rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF');
    for (let c = 2; c <= 5; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      row.getCell(c).border = thinBorder;
      row.getCell(c).alignment = { vertical: 'middle', horizontal: c === 4 ? 'right' : (c === 3 ? 'center' : 'left') };
    }
    rIdx++;
  };

  // Section 1: แมนนวล
  const manualTotalDepCount = (summary.manualDepositWithBankCount || 0) + (summary.manualDepositNoBankCount || 0);
  const manualTotalDepAmount = (summary.manualDepositWithBankAmount || 0) + (summary.manualDepositNoBankAmount || 0);
  const manualNet = manualTotalDepAmount - (summary.manualWithdrawAmount || 0);

  addSectionHeader('1. แมนนวล (เมนู 1.4 ฝาก-ถอนมือ)', 'FF0D9488');
  addSummaryRow('1.1 ฝากมือ (รวม)', manualTotalDepCount, manualTotalDepAmount, 'แอดมินกรอกฝากมือ');
  addSummaryRow('1.2 ถอนมือ (รวม)', summary.manualWithdrawCount || 0, -(summary.manualWithdrawAmount || 0), 'แอดมินโอนมือ/อนุมัติมือ');
  addSummaryRow('  • 🟢 ระบุบัญชีปลายทาง', summary.manualDepositWithBankCount || 0, summary.manualDepositWithBankAmount || 0, 'มีเลขบัญชี/Statement ธนาคาร');
  addSummaryRow('  • 🟡 ไม่ระบุบัญชีปลายทาง', summary.manualDepositNoBankCount || 0, summary.manualDepositNoBankAmount || 0, '⚠️ เสี่ยงเงินไม่เข้าจริง');
  addSummaryRow('รวมสุทธิแมนนวล', manualTotalDepCount + (summary.manualWithdrawCount || 0), manualNet, 'ยอดเงินฝากมือ - ถอนมือ', true, 'FF0D9488');
  rIdx++;

  // Section 2: ปรับมือ
  const adjustNet = (summary.adjustIncreaseAmount || 0) - (summary.adjustDecreaseAmount || 0);
  addSectionHeader('2. ปรับมือ (ปรับยอดเครดิตหน้าสมาชิก)', 'FF2563EB');
  addSummaryRow('2.1 ฝาก (ปรับเพิ่ม +)', summary.adjustIncreaseCount || 0, summary.adjustIncreaseAmount || 0, 'บวกเครดิตให้ลูกค้าฟรี (ไม่มีเงินเข้า)');
  addSummaryRow('2.2 ถอน (ปรับลด -)', summary.adjustDecreaseCount || 0, -(summary.adjustDecreaseAmount || 0), 'ตัดเครดิต / ดึงเงินคืน');
  addSummaryRow('รวมสุทธิปรับมือ', (summary.adjustIncreaseCount || 0) + (summary.adjustDecreaseCount || 0), adjustNet, 'ผลต่างการปรับเครดิตระบบ (ไม่มีเงินสด)', true, 'FF2563EB');
  rIdx++;

  // Section 3: กิจกรรม
  const actTotal = (summary.bonusAmount || 0) + (summary.rewardAmount || 0);
  addSectionHeader('3. กิจกรรม (โบนัส & แลกแต้ม)', 'FF8B5CF6');
  addSummaryRow('3.1 โบนัส (Bonus)', summary.bonusCount || 0, summary.bonusAmount || 0, 'เครดิตโปรโมชั่น / กิจกรรม');
  addSummaryRow('3.2 แลกแต้ม (Reward 1.9)', summary.rewardCount || 0, summary.rewardAmount || 0, 'ใช้แต้มแลกเครดิต');
  addSummaryRow('รวมสุทธิกิจกรรม', (summary.bonusCount || 0) + (summary.rewardCount || 0), actTotal, 'เครดิตกิจกรรมทั้งหมด', true, 'FF8B5CF6');
  rIdx++;

  // Section 4: ยอดต้องสงสัย
  const sec4Title = (normalized?.targetDiscrepancy && normalized.targetDiscrepancy > 0)
    ? `4. ยอดต้องสงสัย (เป้าหมายตรวจสอบเงินขาด: ฿${normalized.targetDiscrepancy.toLocaleString('th-TH', { minimumFractionDigits: 2 })})`
    : '4. ยอดต้องสงสัย & รายการเสี่ยง';
  addSectionHeader(sec4Title, 'FFDC2626');
  if (normalized?.targetDiscrepancy && normalized.targetDiscrepancy > 0) {
    addSummaryRow(`ยอดตรงเงินขาด ฿${normalized.targetDiscrepancy} พอดี`, findings.exactMatches?.length || 0, (findings.exactMatches?.length || 0) * (normalized.targetDiscrepancy || 0), findings.exactMatches?.length ? '🎯 ตรวจพบรายการตรงเป้าหมาย!' : 'ไม่พบรายการเดี่ยวที่ยอดตรง');
    addSummaryRow(`ชุดรวมที่รวมกันได้ ฿${normalized.targetDiscrepancy}`, findings.combinationMatches?.length || 0, null, findings.combinationMatches?.length ? '🎯 ตรวจพบคู่รายการที่รวมกันได้ยอดขาด' : 'ไม่พบคู่รายการ');
  } else {
    addSummaryRow('ยอดตรงเงินขาดที่ระบุ', null, null, 'ไม่ได้ระบุยอดเงินขาดที่ต้องการค้นหา');
  }
  addSummaryRow('ฝากมือไม่ระบุบัญชี (เสี่ยงเงินไม่เข้า)', summary.manualDepositNoBankCount || 0, summary.manualDepositNoBankAmount || 0, (summary.manualDepositNoBankCount || 0) > 0 ? '⚠️ ควรตรวจสอบ Statement ธนาคาร' : 'ปลอดภัย');
  rIdx++;

  // -------------------------------------------------------------
  // Sheet 2: แมนนวล (Manual: Deposits & Withdrawals)
  // -------------------------------------------------------------
  const sheetManual = workbook.addWorksheet('แมนนวล', { views: [{ showGridLines: true }] });
  sheetManual.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'วันเวลาที่ทำรายการ', key: 'createdAt', width: 20 },
    { header: 'ประเภทรายการ', key: 'typeLabel', width: 22 },
    { header: 'การระบุบัญชี', key: 'bankType', width: 20 },
    { header: 'ยูสเซอร์เนม', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 15 },
    { header: 'ยอดเงิน (฿)', key: 'amount', width: 18 },
    { header: 'ธนาคาร/ช่องทาง', key: 'bankName', width: 18 },
    { header: 'เลขที่บัญชี', key: 'bankAccount', width: 18 },
    { header: 'ผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'สถานะ', key: 'status', width: 12 },
    { header: 'หมายเหตุ', key: 'note', width: 30 }
  ];
  applyHeaderStyle(sheetManual.getRow(1), 'FF0D9488');

  const manualRows = combined.filter((r) =>
    ['manual_deposit_bank', 'manual_deposit_nobank', 'manual_withdraw'].includes(r.sourceCategory)
  );
  manualRows.forEach((r, idx) => {
    const row = sheetManual.addRow({
      seq: idx + 1,
      createdAt: r.createdAt,
      typeLabel: r.typeLabel,
      bankType: r.bankType,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.signedAmount,
      bankName: r.bankName,
      bankAccount: r.bankAccount,
      admin: r.admin,
      status: r.status,
      note: r.note
    });
    applyDataRowStyle(row, idx, 'amount');
  });

  // -------------------------------------------------------------
  // Sheet 3: ปรับมือ (Adjustments: Increase & Decrease)
  // -------------------------------------------------------------
  const sheetAdjust = workbook.addWorksheet('ปรับมือ', { views: [{ showGridLines: true }] });
  sheetAdjust.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'วันเวลาที่ทำรายการ', key: 'createdAt', width: 20 },
    { header: 'ประเภท', key: 'typeLabel', width: 22 },
    { header: 'ยูสเซอร์เนม', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 15 },
    { header: 'ยอดเงิน (฿)', key: 'amount', width: 18 },
    { header: 'เครดิต ก่อน → หลัง', key: 'creditBeforeAfter', width: 20 },
    { header: 'ผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'หมายเหตุ', key: 'note', width: 30 }
  ];
  applyHeaderStyle(sheetAdjust.getRow(1), 'FF2563EB');

  const adjustRows = combined.filter((r) =>
    ['adjust_increase', 'adjust_decrease'].includes(r.sourceCategory)
  );
  adjustRows.forEach((r, idx) => {
    const row = sheetAdjust.addRow({
      seq: idx + 1,
      createdAt: r.createdAt,
      typeLabel: r.typeLabel,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.signedAmount,
      creditBeforeAfter: r.creditBeforeAfter || '-',
      admin: r.admin,
      note: r.note
    });
    applyDataRowStyle(row, idx, 'amount');
  });

  // -------------------------------------------------------------
  // Sheet 4: กิจกรรม (Activities: Bonus & Rewards)
  // -------------------------------------------------------------
  const sheetActivity = workbook.addWorksheet('กิจกรรม', { views: [{ showGridLines: true }] });
  sheetActivity.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'วันเวลาที่ทำรายการ', key: 'createdAt', width: 20 },
    { header: 'ประเภทรายการ', key: 'typeLabel', width: 22 },
    { header: 'ยูสเซอร์เนม', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 15 },
    { header: 'ยอดเครดิต (฿)', key: 'amount', width: 18 },
    { header: 'แต้มที่ใช้', key: 'points', width: 14 },
    { header: 'ผู้ทำรายการ', key: 'admin', width: 18 },
    { header: 'หมายเหตุ', key: 'note', width: 30 }
  ];
  applyHeaderStyle(sheetActivity.getRow(1), 'FF8B5CF6');

  const activityRows = combined.filter((r) => ['bonus', 'reward'].includes(r.sourceCategory));
  activityRows.forEach((r, idx) => {
    const row = sheetActivity.addRow({
      seq: idx + 1,
      createdAt: r.createdAt,
      typeLabel: r.typeLabel,
      username: r.username,
      name: r.name,
      phone: r.phone,
      amount: r.signedAmount,
      points: r.points || 0,
      admin: r.admin,
      note: r.note
    });
    applyDataRowStyle(row, idx, 'amount');
  });

  // -------------------------------------------------------------
  // Sheet 5: ยอดต้องสงสัย (Suspect & Target Discrepancy Findings)
  // -------------------------------------------------------------
  const sheetFindings = workbook.addWorksheet('ยอดต้องสงสัย', { views: [{ showGridLines: true }] });
  sheetFindings.columns = [
    { header: 'ลำดับ', key: 'seq', width: 8 },
    { header: 'ผลการตรวจสอบ', key: 'matchType', width: 24 },
    { header: 'วันเวลา', key: 'createdAt', width: 20 },
    { header: 'ประเภทรายการ', key: 'typeLabel', width: 22 },
    { header: 'ยูสเซอร์เนม', key: 'username', width: 18 },
    { header: 'ชื่อลูกค้า', key: 'name', width: 22 },
    { header: 'ยอดเงิน (฿)', key: 'amount', width: 18 },
    { header: 'แอดมินที่ทำรายการ', key: 'admin', width: 18 },
    { header: 'บัญชีปลายทาง', key: 'bankInfo', width: 24 },
    { header: 'เหตุผล / ข้อสังเกต', key: 'reason', width: 44 }
  ];
  applyHeaderStyle(sheetFindings.getRow(1), 'FFDC2626');

  let fIdx = 0;
  // 1. Exact matches
  (findings.exactMatches || []).forEach((m) => {
    fIdx++;
    const r = m.row;
    const row = sheetFindings.addRow({
      seq: fIdx,
      matchType: '🎯 ยอดตรง 100%',
      createdAt: r.createdAt,
      typeLabel: r.typeLabel,
      username: r.username,
      amount: r.amount,
      admin: r.admin,
      bankInfo: r.bankInfo,
      reason: m.reason
    });
    applyDataRowStyle(row, fIdx, 'amount');
  });

  // 2. Combination matches
  (findings.combinationMatches || []).forEach((c) => {
    c.items.forEach((r) => {
      fIdx++;
      const row = sheetFindings.addRow({
        seq: fIdx,
        matchType: '🧩 ชุดรายการรวมได้ยอดขาด',
        createdAt: r.createdAt,
        typeLabel: r.typeLabel,
        username: r.username,
        amount: r.amount,
        admin: r.admin,
        bankInfo: r.bankInfo,
        reason: c.description
      });
      applyDataRowStyle(row, fIdx, 'amount');
    });
  });

  // 3. Suspicious items
  (findings.suspiciousItems || []).forEach((s) => {
    fIdx++;
    const r = s.row;
    const row = sheetFindings.addRow({
      seq: fIdx,
      matchType: '⚠️ รายการต้องสงสัย',
      createdAt: r.createdAt,
      typeLabel: r.typeLabel,
      username: r.username,
      amount: r.amount,
      admin: r.admin,
      bankInfo: r.bankInfo,
      reason: s.reason
    });
    applyDataRowStyle(row, fIdx, 'amount');
  });

  const d = new Date();
  const discTag = (normalized?.targetDiscrepancy && normalized.targetDiscrepancy > 0)
    ? `_(ยอดขาด_${normalized.targetDiscrepancy}บ)`
    : '';
  const defaultFilename = `NK_กระทบยอดการเงิน_${normalized?.startDate || ''}_ถึง_${normalized?.endDate || ''}${discTag}.xlsx`;
  const outputPath = savePath || path.join(os.homedir(), 'Downloads', defaultFilename);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  return {
    ok: true,
    filePath: outputPath,
    rowCount: combined.length,
    summary,
    findings
  };
}

module.exports = {
  fetchDepositData,
  exportDepositWorkbook,
  runDepositReport,
  fetchRewardData,
  exportRewardWorkbook,
  runRewardReport,
  fetchReconciliationData,
  exportReconciliationWorkbook,
  fetchMonthlyTopDepositors,
  cancelMonthlyRanking,
  exportMonthlyTopDepositorsWorkbook,
  fetchLatestMonthDepositors,
  cancelLatestMonthDepositors,
  exportLatestMonthDepositorsWorkbook,
  getTwoRecentMonths,
  getMonthDateRanges
};
