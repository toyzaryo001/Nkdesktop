'use strict';

const store = require('./store');

function getBackofficeBaseUrl() {
  const context = store ? store.get('apiBusinessContext', null) : null;
  if (context?.backofficeUrl) return context.backofficeUrl;
  const settings = store ? store.get('settings', {}) : {};
  return settings.backofficeUrl || 'https://nklaos-adminapi.logicxking.com';
}
const API_ORIGIN = 'https://nklaos-adminapi.logicxking.com';

const API_PROFILE_ALLOWED_KEYS = new Set([
  'type', 'status', 'process_type', 'sort', 'order', 'limit', 'page',
  'start_date', 'end_date', 'website_id', 'website_agent_id', 'search'
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function apiDisplayPhone(value = '') {
  const d = apiDigits(value);
  if (/^66\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^660\d{9}$/.test(d)) return d.slice(2);
  return d;
}

function apiPhoneVariants(value = '') {
  const d = apiDisplayPhone(value);
  const out = new Set([d]);
  if (/^0\d{9}$/.test(d)) out.add(`66${d.slice(1)}`);
  return [...out];
}

function apiBankName(code = '') {
  const c = String(code || '').trim().toUpperCase();
  const map = {
    KBANK: 'ธนาคารกสิกรไทย',
    KTB: 'ธนาคารกรุงไทย',
    BBL: 'ธนาคารกรุงเทพ',
    SCB: 'ธนาคารไทยพาณิชย์',
    BAY: 'ธนาคารกรุงศรีอยุธยา',
    TTB: 'ธนาคารทหารไทยธนชาต',
    TMB: 'ธนาคารทหารไทยธนชาต',
    GSB: 'ธนาคารออมสิน',
    BAAC: 'ธ.ก.ส.',
    CIMB: 'ธนาคารซีไอเอ็มบี ไทย',
    UOB: 'ธนาคารยูโอบี',
    LH: 'ธนาคารแลนด์ แอนด์ เฮ้าส์',
    GHB: 'ธนาคารอาคารสงเคราะห์',
    TRUEWALLET: 'ทรูมันนี่ วอลเล็ท',
    TRUEMONEY: 'ทรูมันนี่ วอลเล็ท'
  };
  return map[c] || c || '-';
}

function apiBankEmoji(code = '') {
  const c = String(code || '').toUpperCase();
  if (c === 'KBANK') return '🟢';
  if (['KTB', 'BBL'].includes(c)) return '🔵';
  if (c === 'SCB') return '🟣';
  if (c === 'BAY') return '🟡';
  if (['TTB', 'TMB'].includes(c)) return '🟠';
  if (c === 'GSB') return '🩷';
  if (/TRUE/.test(c)) return '🟠';
  return '🏦';
}

function normalizeCapturedHeaders(headers = {}) {
  const out = {};
  const EXCLUDED = [
    'cookie', 'set-cookie', 'host', 'content-length', 'origin', 'referer',
    'accept-encoding', 'connection', 'content-encoding', 'keep-alive'
  ];
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = String(key).toLowerCase();
    if (!value || EXCLUDED.includes(lower) || lower.startsWith('sec-')) continue;
    out[key] = String(value);
  }
  return out;
}

function apiSafeProfileQuery(query = {}) {
  const out = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (!API_PROFILE_ALLOWED_KEYS.has(key) || value == null) continue;
    const text = String(value);
    if (text.length > 120) continue;
    out[key] = text;
  }
  return out;
}

function apiProfileKey(path = '', query = {}) {
  const cleanPath = String(path || '').split('?')[0];
  if (cleanPath === '/members') return 'members';
  if (cleanPath === '/reward-redeems') return 'reward-redeems';
  if (cleanPath === '/credit-history') return 'credit-history';
  if (cleanPath === '/reports/bonus') return 'reports/bonus';
  if (cleanPath === '/transactions' || cleanPath === '/transactions/summary') {
    const type = String(query?.type || '').toLowerCase();
    if (type === 'deposit' || type === 'withdraw') return `${cleanPath}:${type}`;
  }
  return '';
}

function learnApiQueryProfile(path = '', query = {}) {
  const key = apiProfileKey(path, query);
  if (!key) return;
  const safe = apiSafeProfileQuery(query);
  if (!Object.keys(safe).length) return;
  const profiles = store.get('apiQueryProfiles', {});
  profiles[key] = { ...(profiles[key] || {}), ...safe, updatedAt: Date.now() };
  store.set('apiQueryProfiles', profiles);
}

function getApiQueryProfile(path = '', type = '') {
  const key = type ? `${String(path).split('?')[0]}:${String(type).toLowerCase()}` : apiProfileKey(path, {});
  const profiles = store.get('apiQueryProfiles', {});
  return profiles[key] || {};
}

function saveApiSession(session = {}) {
  try {
    const origin = String(session.origin || '');
    if (origin !== API_ORIGIN && !origin.includes('logicxking.com')) {
      return { ok: false, ignored: true };
    }
    const headers = normalizeCapturedHeaders(session.headers || {});
    if (!Object.keys(headers).length) return { ok: false, ignored: true };

    const value = {
      origin: origin || API_ORIGIN,
      headers,
      path: String(session.path || ''),
      query: session.query || {},
      updatedAt: Date.now()
    };
    store.set('apiSession', value);

    try { learnApiQueryProfile(value.path, value.query || {}); } catch {}

    const websiteId = Number(value.query?.website_id || 0);
    const agentId = Number(value.query?.website_agent_id || 0);
    if (websiteId) {
      const old = store.get('apiBusinessContext', {}) || {};
      store.set('apiBusinessContext', {
        ...old,
        websiteId,
        agentId: agentId || Number(old.agentId || 0),
        updatedAt: Date.now()
      });
    }
    return { ok: true, session: value };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function getApiSession() {
  const session = store.get('apiSession', null);
  if (session?.headers && Object.keys(session.headers).length) {
    return session;
  }

  // Fallback: Check userProfileData from central login
  const profileData = store.get('userProfileData', null);
  const token = profileData?.access_token || profileData?.token;
  const user = store.get('session.user', null);
  const websiteId = user?.websiteId || store.get('settings.targetWebsiteId', null);

  if (token) {
    const bearer = String(token).startsWith('Bearer ') ? String(token) : `Bearer ${token}`;
    return {
      origin: API_ORIGIN,
      headers: {
        authorization: bearer,
        accept: 'application/json'
      },
      path: '/auth/profile',
      query: websiteId ? { website_id: websiteId } : {},
      updatedAt: Date.now()
    };
  }

  throw new Error('ยังไม่พบ API Session · กรุณาเปิดหรือล็อกอินหน้า NK BackOffice ในแท็บ BackOffice 1 ครั้ง');
}

function apiBuildUrl(path, params = {}) {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function apiFetchJson(path, params = {}, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const maxRetries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const session = getApiSession();
      const boUrl = getBackofficeBaseUrl();
      const headers = {
        ...normalizeCapturedHeaders(session.headers),
        Origin: boUrl,
        Referer: boUrl + '/',
        Accept: 'application/json'
      };
      if (options.body != null && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }

      const targetUrl = apiBuildUrl(path, params);
      const res = await fetch(targetUrl, {
        method,
        headers,
        body: options.body == null ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
        cache: 'no-store'
      });

      const text = await res.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

      if (res.status === 401 || res.status === 403) {
        store.delete('apiSession');
        const err = new Error('API Session หมดอายุหรือไม่มีสิทธิ์ · กรุณารีเฟรชหน้า BackOffice ในโปรแกรม');
        err.auth = true;
        throw err;
      }

      if (!res.ok) {
        const detail = typeof payload === 'object'
          ? (payload?.message || payload?.error || JSON.stringify(payload).slice(0, 300))
          : String(payload || '');
        const err = new Error(`API ${res.status}${detail ? ` · ${detail}` : ''}`);
        err.status = res.status;
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        err.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
        throw err;
      }

      return payload;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = !error?.auth && (status === 429 || status >= 500 || status === 0);
      if (!retryable || attempt >= maxRetries) throw error;
      const delay = Math.max(Number(error?.retryAfterMs || 0), 250 * (2 ** attempt));
      await sleep(Math.min(delay, 2500));
    }
  }
  throw lastError || new Error('API request failed');
}

function apiDataArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function apiPagination(payload, page, limit, rowsLength) {
  const meta = payload?.meta || payload?.pagination || payload?.paging || {};
  const total = Number(meta.total ?? meta.total_count ?? payload?.total ?? 0);
  let totalPages = Number(meta.total_pages ?? meta.totalPages ?? meta.last_page ?? payload?.total_pages ?? 0);
  if (!Number.isFinite(totalPages) || totalPages <= 0) {
    totalPages = total > 0 ? Math.ceil(total / limit) : (rowsLength < limit ? page : 0);
  }
  return { total: Number.isFinite(total) ? total : 0, totalPages: Number.isFinite(totalPages) ? totalPages : 0 };
}

async function getApiBusinessContext(force = false) {
  const cached = store.get('apiBusinessContext', null);
  if (!force && cached?.websiteId && Date.now() - Number(cached.updatedAt || 0) < 6 * 60 * 60 * 1000) {
    return cached;
  }

  const session = getApiSession();
  const sessionWebsiteId = Number(session?.query?.website_id || 0);
  if (!force && sessionWebsiteId) {
    const quick = {
      websiteId: sessionWebsiteId,
      agentId: Number(session?.query?.website_agent_id || 0),
      updatedAt: Date.now()
    };
    store.set('apiBusinessContext', quick);
    return quick;
  }

  if (!force) {
    try {
      const storedProfiles = store.get('apiQueryProfiles', {});
      const candidates = [
        storedProfiles['/transactions:deposit'],
        storedProfiles['/transactions:withdraw'],
        storedProfiles['members'],
        storedProfiles['reward-redeems']
      ].filter(Boolean);
      const learned = candidates.find((x) => Number(x?.website_id || 0));
      if (learned) {
        const quick = {
          websiteId: Number(learned.website_id),
          agentId: Number(learned.website_agent_id || 0),
          updatedAt: Date.now()
        };
        store.set('apiBusinessContext', quick);
        return quick;
      }
    } catch {}
  }

  const profile = await apiFetchJson('/auth/profile');
  const settings = store.get('settings', {}) || {};
  let websiteId = Number(settings.targetWebsiteId || 0);
  let siteName = settings.targetWebsiteName || '';

  if (!websiteId && profile?.websites?.length) {
    const boUrl = getBackofficeBaseUrl();
    try {
      const host = new URL(boUrl).host.toLowerCase();
      const matched = profile.websites.find(w => {
        const d = String(w.domain || w.site_url || w.name || '').toLowerCase();
        return d && host.includes(d);
      });
      if (matched) {
        websiteId = Number(matched.id);
        siteName = matched.site_name || matched.name || '';
      }
    } catch {}
  }

  if (!websiteId) {
    websiteId = Number(profile?.website_ids?.[0] ?? profile?.websites?.[0]?.id ?? 0);
    siteName = profile?.websites?.find?.((x) => Number(x?.id) === websiteId)?.site_name || '';
  }
  if (!websiteId) throw new Error('API ไม่พบ Website ID ที่บัญชีนี้เข้าถึงได้');

  let agentId = 0;
  try {
    const agentsPayload = await apiFetchJson('/website-agents', { website_id: websiteId });
    const agents = apiDataArray(agentsPayload);
    const agent = agents.find((x) => x?.is_main) || agents[0];
    agentId = Number(agent?.id || 0);
  } catch {}

  const finalSiteName = siteName || profile?.websites?.find?.((x) => Number(x?.id) === websiteId)?.site_name || 'BackOffice';

  const context = {
    websiteId,
    agentId,
    siteName: finalSiteName,
    updatedAt: Date.now()
  };
  store.set('apiBusinessContext', context);
  store.set('settings', {
    ...settings,
    targetWebsiteId: websiteId,
    targetWebsiteName: finalSiteName
  });
  return context;
}

function formatMemberNoteFromApi(member = {}) {
  const code = String(member.bankcode || member.bank_code || '').toUpperCase();
  const refObj = member.ref_member;
  const referrer = refObj && typeof refObj === 'object'
    ? (refObj.game_username || refObj.fullname || refObj.phone || '-')
    : (member.ref && Number(member.ref) > 0 ? String(member.ref) : '-');

  const record = {
    id: member.id ?? '-',
    username: member.game_username || member.username || '-',
    name: member.fullname || member.name || '-',
    phone: apiDisplayPhone(member.phone || member.line || '') || '-',
    bankName: apiBankName(code),
    bankCode: code,
    account: String(member.banknumber || member.bank_number || '-'),
    referrer,
    status: member.status || '-',
    point: Number.isFinite(Number(member.point)) ? Number(member.point) : 0,
    credit: Number.isFinite(Number(member.credit)) ? Number(member.credit) : 0,
    productId: member.product_id || '-',
    isContact: Boolean(member.is_contact),
    manualOnly: Boolean(member.manual_only),
    lastLogin: member.last_login || '',
    createdAt: member.created_at || '',
    websiteId: member.website_id ?? null,
    websiteAgentId: member.website_agent_id ?? null
  };

  const note = [
    '📌 ===== NOTE ข้อมูลสมาชิก =====',
    '',
    `👤 ยูสเซอร์ : ${record.username}`,
    `🪪 ชื่อ-สกุล : ${record.name}`,
    `📱 เบอร์โทร : ${record.phone}`,
    `🏦 ธนาคาร : ${apiBankEmoji(code)} ${record.bankName}`,
    `💳 เลขบัญชี : ${record.account}`,
    `🤝 ผู้แนะนำ : ${record.referrer}`
  ].join('\n');

  return { record, note };
}

async function findMemberUniversal(searchTerm, ctx, learned = {}) {
  const search = String(searchTerm || '').trim();
  const digits = apiDigits(search);
  const isPhone = /^0\d{9}$/.test(digits);
  const cleanPhone = isPhone ? apiDisplayPhone(digits) : '';

  const tryCall = async (queryTerm, useAgent = true) => {
    try {
      const payload = await apiFetchJson('/members', {
        search: queryTerm,
        page: 1,
        limit: 20,
        sort: learned.sort || 'created_at',
        order: learned.order || 'desc',
        website_id: ctx.websiteId,
        website_agent_id: useAgent ? (ctx.agentId || undefined) : undefined
      }, { retries: 1 });
      return apiDataArray(payload);
    } catch {
      return [];
    }
  };

  // 1. Try search with agent_id
  let rows = await tryCall(cleanPhone || search, true);

  // 2. If empty and agent was used, try without agent filter (website-wide)
  if (!rows.length && ctx.agentId) {
    rows = await tryCall(cleanPhone || search, false);
  }

  // 3. If phone, try phone variants (e.g. 66...)
  if (!rows.length && isPhone) {
    for (const alt of apiPhoneVariants(cleanPhone)) {
      if (alt === cleanPhone) continue;
      rows = await tryCall(alt, false);
      if (rows.length) break;
    }
  }

  // 4. Try dedicated direct phone search endpoint if phone
  if (!rows.length && isPhone) {
    try {
      const direct = await apiFetchJson(`/members/search/phone/${cleanPhone}`, { website_id: ctx.websiteId }, { retries: 1 });
      if (direct?.data?.member) {
        const m = { ...direct.data.member };
        if (direct.data.bank) {
          m.bankcode = m.bankcode || direct.data.bank.code;
          m.banknumber = m.banknumber || direct.data.bank.account;
        }
        return m;
      }
    } catch {}
  }

  // 5. Match from rows
  let member = null;
  if (isPhone) {
    const wanted = new Set(apiPhoneVariants(cleanPhone));
    member = rows.find((x) => wanted.has(apiDigits(x?.phone || ''))) ||
             rows.find((x) => wanted.has(apiDigits(x?.line || '')));
  } else {
    const q = search.toLowerCase();
    member = rows.find((x) => String(x?.game_username || x?.username || '').toLowerCase() === q);
  }
  if (!member && rows.length === 1) member = rows[0];
  if (!member && rows.length > 0) member = rows[0];

  return member;
}

async function runMemberNote(phoneOrUser) {
  const raw = String(phoneOrUser || '').trim();
  if (!raw) throw new Error('กรุณากรอก Username หรือเบอร์โทรศัพท์');
  const digits = apiDigits(raw);
  const isPhone = /^0\d{9}$/.test(digits);
  const query = isPhone ? apiDisplayPhone(digits) : raw;

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('memberState', {
    status: 'running',
    requestId,
    search: query,
    message: 'กำลังค้นหาสมาชิกผ่าน Smart API...',
    startedAt
  });

  try {
    const ctx = await getApiBusinessContext();
    const learned = getApiQueryProfile('/members');
    const member = await findMemberUniversal(query, ctx, learned);

    if (!member) throw new Error(`ไม่พบข้อมูลสมาชิกสำหรับ "${query}"`);

    const { record, note } = formatMemberNoteFromApi(member);
    const result = {
      status: 'done',
      requestId,
      search: query,
      record,
      note,
      message: `ค้นพบข้อมูลสำเร็จ (${Date.now() - startedAt} ms)`,
      finishedAt: Date.now()
    };
    store.set('memberState', result);
    return { ok: true, ...result };
  } catch (error) {
    const errState = {
      status: 'error',
      requestId,
      search: query,
      message: error?.message || String(error),
      finishedAt: Date.now()
    };
    store.set('memberState', errState);
    throw error;
  }
}

async function findMemberForReset(phoneOrUser) {
  const raw = String(phoneOrUser || '').trim();
  if (!raw) throw new Error('กรุณากรอก Username หรือเบอร์โทรศัพท์');
  const digits = apiDigits(raw);
  const isPhone = /^0\d{9}$/.test(digits);
  const query = isPhone ? apiDisplayPhone(digits) : raw;

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('resetMemberState', {
    status: 'running',
    requestId,
    search: query,
    record: null,
    message: 'กำลังค้นหาสมาชิก...',
    startedAt
  });

  try {
    const ctx = await getApiBusinessContext();
    const learned = getApiQueryProfile('/members');
    const member = await findMemberUniversal(query, ctx, learned);

    if (!member) throw new Error(`ไม่พบข้อมูลสมาชิกสำหรับ "${query}"`);

    const { record } = formatMemberNoteFromApi(member);
    const result = {
      status: 'done',
      requestId,
      search: query,
      record,
      message: `พบสมาชิกแล้ว (${Date.now() - startedAt} ms)`,
      finishedAt: Date.now()
    };
    store.set('resetMemberState', result);
    return { ok: true, memberId: Number(record.id) || null, record };
  } catch (error) {
    store.set('resetMemberState', {
      status: 'error',
      requestId,
      search: query,
      record: null,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

async function resetMemberPassword(memberId, password) {
  const id = Number(memberId);
  const newPassword = String(password ?? '');
  if (!Number.isInteger(id) || id <= 0) throw new Error('ไม่พบ Member ID สำหรับรีเซ็ตรหัสผ่าน');
  if (!newPassword) throw new Error('กรุณากรอกรหัสผ่านใหม่');
  if (newPassword.length > 128) throw new Error('รหัสผ่านยาวเกินไป');

  const payload = await apiFetchJson(`/members/${id}/reset-password`, {}, {
    method: 'PUT',
    body: { id, password: newPassword },
    retries: 0
  });

  if (payload && payload.success === false) {
    throw new Error(payload.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
  }
  return { ok: true, memberId: id, message: payload?.message || 'รีเซ็ตรหัสผ่านสำเร็จ' };
}

function pointsStatusThai(status = '') {
  const s = String(status || '').toLowerCase();
  if (/approved|approve|success|complete/.test(s)) return 'อนุมัติแล้ว';
  if (/rejected|reject|denied|cancel|fail/.test(s)) return 'ปฏิเสธ';
  if (/pending|wait|new/.test(s)) return 'รออนุมัติ';
  return status || '-';
}

function pointsApprovedByLabel(value) {
  if (!value) return '-';
  if (typeof value === 'object') return value.username || value.name || value.fullname || (value.id ? `Admin #${value.id}` : '-');
  return String(value);
}

function apiRewardTypeThai(type = '') {
  const s = String(type || '').toLowerCase();
  if (s === 'credit') return 'เครดิต';
  if (/cash/.test(s)) return 'เงินสด';
  if (/item|gift/.test(s)) return 'ของรางวัล';
  return type || '-';
}

// ==========================================
// THAILAND TIMEZONE (Asia/Bangkok, UTC+7)
// ==========================================
function parseToBangkokDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) && !s.includes('+') && !s.endsWith('Z')) {
    return new Date(s.replace(' ', 'T') + '+07:00');
  }
  return new Date(s);
}

function getBangkokDateParts(dateInput = new Date()) {
  const d = parseToBangkokDate(dateInput) || new Date();
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

function formatBangkokDateTime(val, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!val) return '-';
  const d = parseToBangkokDate(val);
  if (!d || isNaN(d.getTime())) return String(val);
  const p = getBangkokDateParts(d);
  if (format === 'DD/MM/YYYY HH:mm:ss') return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  if (format === 'DD/MM/YYYY') return `${p.day}/${p.month}/${p.year}`;
  if (format === 'YYYY-MM-DD') return `${p.year}-${p.month}-${p.day}`;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function apiFormatDateTime(value) {
  return formatBangkokDateTime(value, 'YYYY-MM-DD HH:mm:ss');
}

async function findMemberForPointsHistory(searchValue) {
  const search = String(searchValue || '').trim();
  if (search.length < 3) throw new Error('กรอกเบอร์โทรหรือ Username อย่างน้อย 3 ตัวอักษร');

  const ctx = await getApiBusinessContext();
  const learned = getApiQueryProfile('/members');
  const member = await findMemberUniversal(search, ctx, learned);

  if (!member) throw new Error(`ไม่พบสมาชิกจากข้อมูล: ${search}`);
  return { member, context: ctx };
}

async function runPointsHistory(searchValue) {
  const search = String(searchValue || '').trim();
  if (search.length < 3) throw new Error('กรอกเบอร์โทรหรือ Username อย่างน้อย 3 ตัวอักษร');

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  store.set('pointsHistoryState', {
    status: 'starting',
    requestId,
    search,
    message: 'กำลังค้นหาสมาชิก...',
    startedAt
  });

  try {
    const { member, context } = await findMemberForPointsHistory(search);
    const memberId = Number(member.id);
    if (!Number.isInteger(memberId) || memberId <= 0) throw new Error('ไม่พบ Member ID');

    const currentPoints = Number.isFinite(Number(member.point)) ? Number(member.point) : 0;
    const safeMember = {
      id: memberId,
      username: member.game_username || member.username || '-',
      name: member.fullname || member.name || '-',
      phone: apiDisplayPhone(member.phone || member.line || '') || '-',
      point: currentPoints,
      status: member.status || '-',
      websiteId: member.website_id ?? context.websiteId ?? null,
      websiteAgentId: member.website_agent_id ?? context.agentId ?? null
    };

    store.set('pointsHistoryState', {
      status: 'running',
      requestId,
      search,
      member: safeMember,
      records: [],
      message: 'พบสมาชิกแล้ว · กำลังดึงประวัติแลกแต้ม...',
      currentPage: 0,
      totalPages: 0,
      startedAt
    });

    const limit = 200;
    const records = [];
    const seen = new Set();
    let page = 1;
    let total = 0;
    let totalPages = 0;

    while (page <= 200) {
      const payload = await apiFetchJson('/reward-redeems', {
        page,
        limit,
        sort: 'created_at',
        order: 'desc',
        website_id: context.websiteId,
        website_agent_id: context.agentId || undefined
      });
      const rows = apiDataArray(payload);
      const actualLimit = Math.max(1, Number(payload?.limit || limit));
      total = Number(payload?.total || total || 0);
      totalPages = total > 0 ? Math.ceil(total / actualLimit) : totalPages;

      for (const item of rows) {
        if (Number(item?.member_id || item?.member?.id || 0) !== memberId) continue;
        const key = String(item?.id ?? [item?.member_id, item?.created_at, item?.reward_id].join('|'));
        if (seen.has(key)) continue;
        seen.add(key);

        const status = pointsStatusThai(item?.status);
        const rawStatus = String(item?.status || '');
        const approved = /approved|approve|success|complete/i.test(rawStatus);

        records.push({
          id: item?.id ?? null,
          rewardId: item?.reward_id ?? null,
          rewardName: item?.reward_name || '-',
          rewardType: apiRewardTypeThai(item?.reward_type || ''),
          pointsUsed: Number.isFinite(Number(item?.points)) ? Number(item.points) : 0,
          creditAmount: Number.isFinite(Number(item?.credit_amount)) ? Number(item.credit_amount) : 0,
          status,
          rawStatus,
          approved,
          isAuto: Boolean(item?.is_auto),
          approvedBy: pointsApprovedByLabel(item?.approved_by),
          createdAt: apiFormatDateTime(item?.created_at),
          createdAtRaw: String(item?.created_at || ''),
          approvedAt: apiFormatDateTime(item?.approved_at || (approved ? item?.updated_at : '')),
          note: String(item?.note || '').trim() || '-'
        });
      }

      store.set('pointsHistoryState', {
        status: 'running',
        requestId,
        search,
        member: safeMember,
        records,
        message: `กำลังดึงประวัติแลกแต้ม · หน้า ${page}/${totalPages || '?'}`,
        currentPage: page,
        totalPages,
        startedAt
      });

      if (!rows.length || rows.length < actualLimit || (totalPages && page >= totalPages)) break;
      page += 1;
    }

    records.sort((a, b) => String(b.createdAtRaw || '').localeCompare(String(a.createdAtRaw || '')));
    const approved = records.filter((x) => x.approved);
    const pending = records.filter((x) => /รออนุมัติ/.test(x.status));
    const rejected = records.filter((x) => /ปฏิเสธ/.test(x.status));

    const summary = {
      currentPoints,
      totalRecords: records.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
      approvedPointsSpent: approved.reduce((sum, x) => sum + Number(x.pointsUsed || 0), 0),
      approvedCreditReceived: approved.reduce((sum, x) => sum + Number(x.creditAmount || 0), 0)
    };

    const finalResult = {
      status: 'done',
      requestId,
      search,
      member: safeMember,
      records,
      summary,
      message: `ดึงประวัติสำเร็จ ${records.length.toLocaleString('th-TH')} รายการ`,
      finishedAt: Date.now(),
      elapsedMs: Date.now() - startedAt
    };
    store.set('pointsHistoryState', finalResult);
    return { ok: true, ...finalResult };
  } catch (error) {
    store.set('pointsHistoryState', {
      status: 'error',
      requestId,
      search,
      message: error?.message || String(error),
      finishedAt: Date.now()
    });
    throw error;
  }
}

function clearPointsHistory() {
  store.set('pointsHistoryState', {
    status: 'idle',
    search: '',
    member: null,
    records: [],
    summary: null,
    message: 'พร้อมค้นหา'
  });
  return { ok: true };
}

async function rejectTransaction(txId, note = '') {
  const id = Number(txId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Transaction ID ไม่ถูกต้อง');
  const body = { id, note: String(note || '').trim() };
  const payload = await apiFetchJson(`/transactions/${id}/reject`, {}, {
    method: 'POST',
    body,
    retries: 0
  });
  return { ok: true, payload };
}

async function getMemberTurnoverSummary(memberId, username = '') {
  const mId = Number(memberId);
  if (!Number.isInteger(mId) || mId <= 0) {
    if (!username) throw new Error('ต้องระบุ Member ID หรือ Username');
  }

  let memberData = null;
  if (mId > 0) {
    try {
      const res = await apiFetchJson(`/members/${mId}`, {}, { retries: 1 });
      memberData = res?.data || res;
    } catch (e) {}
  }

  const queryUser = username || memberData?.game_username || memberData?.username || '';
  let txList = [];
  if (queryUser) {
    try {
      const dynamicWebId = store ? (store.get('apiBusinessContext.websiteId') || store.get('settings.targetWebsiteId') || undefined) : undefined;
      const txParams = {
        search: queryUser,
        limit: 15,
        sort: 'transaction_at',
        order: 'desc'
      };
      if (dynamicWebId) txParams.website_id = dynamicWebId;
      const txRes = await apiFetchJson('/transactions', txParams, { retries: 1 });
      txList = apiDataArray(txRes);
    } catch (e) {}
  }

  const turnoverReq = Number(memberData?.turnover || 0);
  const turnoverBet = Number(memberData?.turnover_bet || 0);
  const turnoverRemaining = Math.max(0, turnoverReq - turnoverBet);
  const passed = turnoverRemaining <= 0;

  let totalDeposit = 0;
  let totalWithdraw = 0;
  for (const t of txList) {
    const amt = Number(t.amount || 0);
    const status = String(t.status || '').toLowerCase();
    if (status === 'success' || status === 'approved') {
      if (t.direction === 'in' || t.category === 'deposit') totalDeposit += amt;
      if (t.direction === 'out' || t.category === 'withdraw') totalWithdraw += amt;
    }
  }

  return {
    ok: true,
    member: {
      id: memberData?.id || mId,
      username: queryUser,
      fullname: memberData?.fullname || memberData?.name || '-',
      phone: apiDisplayPhone(memberData?.phone || '') || '-',
      bankcode: memberData?.bankcode || '-',
      banknumber: memberData?.banknumber || '-',
      point: Number(memberData?.point || 0),
      balance: Number(memberData?.credit ?? memberData?.balance ?? 0),
      createdAt: memberData?.created_at || null
    },
    turnover: {
      required: turnoverReq,
      bet: turnoverBet,
      remaining: turnoverRemaining,
      passed,
      turnoverAt: memberData?.turnover_at || null
    },
    totals: {
      deposit: totalDeposit,
      withdraw: totalWithdraw
    },
    recentTransactions: txList.slice(0, 10).map(t => ({
      id: t.id,
      direction: t.direction,
      category: t.category,
      type: t.category || (t.direction === 'out' ? 'withdraw' : 'deposit'),
      amount: Number(t.amount || 0),
      status: t.status,
      bank: t.to_bank_code || t.from_bank_code || t.method || '-',
      at: t.transaction_at || t.created_at
    }))
  };
}

async function getSwiftPaySummary(options = {}) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayStr = options.date || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const websiteId = options.websiteId || (store ? (store.get('apiBusinessContext.websiteId') || store.get('settings.targetWebsiteId') || null) : null);

  let dailyStats = {
    amount: 0,
    count: 0,
    name: 'SwiftPay'
  };

  let config = {
    enable: false,
    provider: 'swiftpay',
    username: '',
    channels: ['PROMPTPAY', 'BANK_CARD'],
    minDeposit: 200,
    maxDeposit: 50000,
    maintenanceStart: '22:30',
    maintenanceEnd: '02:30',
    isMaintenance: false,
    callbackIps: ['54.179.68.21']
  };

  let recentTransactions = [];

  // 1. Fetch /dashboard/daily for SwiftPay daily totals
  try {
    const dailyRes = await apiFetchJson('/dashboard/daily', {
      website_id: websiteId,
      start_date: todayStr,
      end_date: todayStr
    }, { retries: 1 });

    const accounts = dailyRes?.accounts || [];
    const spAccount = accounts.find(a =>
      a.type === 'PAYMENT_GATEWAY' ||
      String(a.name || '').toLowerCase().includes('swift')
    );

    if (spAccount) {
      dailyStats.amount = Number(spAccount.deposit?.amount || 0);
      dailyStats.count = Number(spAccount.deposit?.count || 0);
      if (spAccount.name) dailyStats.name = spAccount.name;
    }
  } catch (e) {
    // Silently continue or log debug
  }

  // 2. Fetch /websites for payment_gateway config
  try {
    const webRes = await apiFetchJson('/websites', {}, { retries: 1 });
    const list = Array.isArray(webRes) ? webRes : (webRes?.data || []);
    const site = list.find(w => w.id === websiteId);
    let rawPg = site?.payment_gateway;
    if (typeof rawPg === 'string') {
      try { rawPg = JSON.parse(rawPg); } catch (_) {}
    }
    if (Array.isArray(rawPg) && rawPg.length > 0) {
      const spCfg = rawPg.find(p => p.provider === 'swiftpay') || rawPg[0];
      config.enable = Boolean(spCfg.enable);
      config.provider = spCfg.provider || 'swiftpay';
      config.username = spCfg.username || 'jga88';
      config.channels = Array.isArray(spCfg.deposit_channels) ? spCfg.deposit_channels : ['PROMPTPAY', 'BANK_CARD'];
      config.minDeposit = Number(spCfg.min_deposit || 200);
      config.maxDeposit = Number(spCfg.max_deposit || 50000);
      config.maintenanceStart = spCfg.maintenance_start || '22:30';
      config.maintenanceEnd = spCfg.maintenance_end || '02:30';
      if (Array.isArray(spCfg.callback_ips)) config.callbackIps = spCfg.callback_ips;

      const nowBkk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
      const curHourMin = pad(nowBkk.getHours()) + ':' + pad(nowBkk.getMinutes());
      if (config.maintenanceStart <= config.maintenanceEnd) {
        config.isMaintenance = curHourMin >= config.maintenanceStart && curHourMin <= config.maintenanceEnd;
      } else {
        config.isMaintenance = curHourMin >= config.maintenanceStart || curHourMin <= config.maintenanceEnd;
      }
    }
  } catch (e) {
    // Silently continue
  }

  // 3. Fetch /transactions?method=payment_gateway for recent transaction activity
  try {
    const txRes = await apiFetchJson('/transactions', {
      website_id: websiteId,
      method: 'payment_gateway',
      limit: 10,
      sort: 'transaction_at',
      order: 'desc'
    }, { retries: 1 });

    const items = txRes?.data || (Array.isArray(txRes) ? txRes : []);
    recentTransactions = items.map(t => {
      let raw = null;
      if (typeof t.raw_json === 'string') {
        try { raw = JSON.parse(t.raw_json); } catch (_) {}
      } else if (typeof t.raw_json === 'object' && t.raw_json !== null) {
        raw = t.raw_json;
      }
      return {
        id: t.id,
        amount: Number(t.amount || raw?.actual_amount || 0),
        status: t.status || 'unknown',
        channelCode: raw?.channel_code || 'PROMPTPAY',
        orderNumber: raw?.order_number || (websiteId ? `w${websiteId}-${t.id}` : `tx-${t.id}`),
        systemOrderNumber: raw?.system_order_number || '-',
        receiverBank: raw?.receiver_bank_name || '-',
        receiverAccount: raw?.receiver_account || '-',
        receiverName: raw?.receiver_name || '-',
        casherUrl: raw?.casher_url || '',
        createdAt: t.transaction_at || t.created_at || raw?.created_at || ''
      };
    });
  } catch (e) {
    // Silently continue
  }

  return {
    ok: true,
    date: todayStr,
    stats: dailyStats,
    config,
    recentTransactions,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getBackofficeBaseUrl,
  API_ORIGIN,
  apiDigits,
  apiDisplayPhone,
  apiPhoneVariants,
  apiBankName,
  apiBankEmoji,
  saveApiSession,
  getApiSession,
  apiBuildUrl,
  apiFetchJson,
  apiDataArray,
  apiPagination,
  getApiBusinessContext,
  formatMemberNoteFromApi,
  runMemberNote,
  findMemberForReset,
  resetMemberPassword,
  runPointsHistory,
  clearPointsHistory,
  rejectTransaction,
  getMemberTurnoverSummary,
  getSwiftPaySummary,
  apiFormatDateTime,
  parseToBangkokDate,
  getBangkokDateParts,
  getBangkokDateString,
  formatBangkokDateTime
};
