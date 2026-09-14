'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'nk_admin_secret_key_railway_2026';

// Ensure data directory exists (Supports Railway Volume, e.g. /app/data or /data)
function resolveDataDir() {
  const envPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  if (fs.existsSync('/app/data')) {
    return '/app/data';
  }
  if (fs.existsSync('/data')) {
    return '/data';
  }
  const localDir = path.join(__dirname, 'data');
  if (!fs.existsSync(localDir)) {
    try { fs.mkdirSync(localDir, { recursive: true }); } catch (e) {}
  }
  return localDir;
}

const DATA_DIR = resolveDataDir();
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

// ==== 1. Independent Master Auth Storage ====
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const BUNDLED_AUTH_FILE = path.join(__dirname, 'data', 'admin-auth.json');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
}

function loadAdminAuth() {
  // 1. Load from persistent volume file
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.username && data.passwordHash && data.salt) {
        return data;
      }
    }
  } catch (err) {
    console.error('Error loading admin auth:', err.message);
  }

  // 2. Load from bundled baseline file if in a new container
  try {
    if (BUNDLED_AUTH_FILE !== AUTH_FILE && fs.existsSync(BUNDLED_AUTH_FILE)) {
      const raw = fs.readFileSync(BUNDLED_AUTH_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.username && data.passwordHash && data.salt) {
        saveAdminAuth(data);
        return data;
      }
    }
  } catch (e) {}

  // 3. Default credentials fallback
  const defaultUser = process.env.ADMIN_USERNAME || 'admin';
  const defaultPass = process.env.ADMIN_PASSWORD || 'admin888';
  const salt = 'a1b2c3d4e5f67890';
  const passwordHash = hashPassword(defaultPass, salt);

  const initialAuth = {
    username: defaultUser,
    salt,
    passwordHash,
    updatedAt: new Date().toISOString()
  };

  saveAdminAuth(initialAuth);
  return initialAuth;
}

function saveAdminAuthFile(authData) {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
    if (BUNDLED_AUTH_FILE !== AUTH_FILE && fs.existsSync(path.join(__dirname, 'data'))) {
      try { fs.writeFileSync(BUNDLED_AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8'); } catch (e) {}
    }
    return true;
  } catch (err) {
    console.error('Error saving admin auth:', err.message);
    return false;
  }
}

async function saveAdminAuth(authData) {
  saveAdminAuthFile(authData);
  if (dbPool) {
    try {
      // 1. Primary: Save in system_config with unique key = 'admin_auth'
      await dbPool.query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ('admin_auth', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW();`,
        [JSON.stringify(authData)]
      );
      // 2. Clean legacy table so old username is removed and only current username exists
      await dbPool.query(`DELETE FROM admin_auth WHERE username <> $1;`, [authData.username]).catch(() => {});
      await dbPool.query(
        `INSERT INTO admin_auth (username, salt, password_hash, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (username) DO UPDATE SET salt = $2, password_hash = $3, updated_at = NOW();`,
        [authData.username, authData.salt, authData.passwordHash]
      ).catch(() => {});
    } catch (err) {
      console.error('Error saving admin auth to PostgreSQL:', err.message);
    }
  }
}

let adminAuth = loadAdminAuth();

// ==== 2. Control Config Storage ====
const CONFIG_FILE = path.join(DATA_DIR, 'control-config.json');
const BUNDLED_CONFIG_FILE = path.join(__dirname, 'data', 'control-config.json');

const DEFAULT_CONFIG = {
  appEnabled: true,
  maintenance: {
    title: 'ระบบปิดปรับปรุงชั่วคราว',
    message: 'ขณะนี้ระบบ NK Helper อยู่ระหว่างการปรับปรุงระบบเพื่อความเสถียร กรุณารอสักครู่หรือติดต่อผู้ดูแลระบบ',
    contact: 'ติดต่อผู้ดูแลระบบ'
  },
  version: {
    latestVersion: '3.6.0',
    minSupportedVersion: '3.5.0',
    forceUpdate: false,
    downloadUrl: '',
    releaseNotes: 'NK Helper Desktop v3.6.0 (Enterprise Online) — ระบบควบคุมออนไลน์เต็มรูปแบบ ตารางเหลืองบวกรวมยอดเติม-ลดแม่นยำ 100%'
  },
  broadcast: {
    enabled: false,
    type: 'info', // 'info' | 'warning' | 'danger'
    message: ''
  },
  updatedAt: new Date().toISOString(),
  updatedBy: 'system'
};

function loadConfig() {
  // 1. Try persistent volume file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('Error loading config from persistent file:', err.message);
  }

  // 2. Try bundled git baseline file
  try {
    if (BUNDLED_CONFIG_FILE !== CONFIG_FILE && fs.existsSync(BUNDLED_CONFIG_FILE)) {
      const raw = fs.readFileSync(BUNDLED_CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_CONFIG, ...parsed };
      saveConfigFile(merged);
      return merged;
    }
  } catch (e) {}

  saveConfigFile(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfigFile(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    if (BUNDLED_CONFIG_FILE !== CONFIG_FILE && fs.existsSync(path.join(__dirname, 'data'))) {
      try { fs.writeFileSync(BUNDLED_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) {}
    }
    return true;
  } catch (err) {
    console.error('Error saving config:', err.message);
    return false;
  }
}

async function saveConfig(cfg) {
  saveConfigFile(cfg);
  if (dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ('app_config', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW();`,
        [JSON.stringify(cfg)]
      );
    } catch (err) {
      console.error('Error saving config to PostgreSQL:', err.message);
    }
  }
}

let appConfig = loadConfig();

// ==== 3. PostgreSQL Database Connection & Auto-Migration ====
let dbPool = null;
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (DATABASE_URL) {
  try {
    dbPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    dbPool.on('error', (err) => {
      console.error('PostgreSQL client pool error:', err.message);
    });
  } catch (err) {
    console.error('Failed to create PostgreSQL pool:', err.message);
  }
}

async function initDatabase() {
  if (!dbPool) {
    console.log('ℹ️ Running in JSON file storage mode (No DATABASE_URL configured).');
    return;
  }

  try {
    const client = await dbPool.connect();
    try {
      // 1. Create table for system configuration
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_config (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Create table for master admin credentials
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_auth (
          username VARCHAR(100) PRIMARY KEY,
          salt VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ PostgreSQL connected and tables verified.');

      // Load config from DB if exists
      const configRes = await client.query(`SELECT value FROM system_config WHERE key = 'app_config' LIMIT 1;`);
      if (configRes.rows.length > 0 && configRes.rows[0].value) {
        let loaded = configRes.rows[0].value;
        if (typeof loaded === 'string') {
          try { loaded = JSON.parse(loaded); } catch (e) {}
        }
        appConfig = { ...DEFAULT_CONFIG, ...loaded };
        saveConfigFile(appConfig);
        console.log('✅ Synchronized latest app_config from PostgreSQL.');
      } else {
        await client.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('app_config', $1, NOW()) ON CONFLICT (key) DO NOTHING;`,
          [JSON.stringify(appConfig)]
        );
        console.log('✅ Seeded initial app_config into PostgreSQL.');
      }

      // Load master admin auth from DB (Check system_config first, then fallback to most recent admin_auth)
      let authLoaded = false;
      const authConfigRes = await client.query(`SELECT value FROM system_config WHERE key = 'admin_auth' LIMIT 1;`);
      if (authConfigRes.rows.length > 0 && authConfigRes.rows[0].value) {
        let loadedAuth = authConfigRes.rows[0].value;
        if (typeof loadedAuth === 'string') {
          try { loadedAuth = JSON.parse(loadedAuth); } catch (e) {}
        }
        if (loadedAuth && loadedAuth.username && loadedAuth.passwordHash && loadedAuth.salt) {
          adminAuth = loadedAuth;
          saveAdminAuthFile(adminAuth);
          authLoaded = true;
          console.log(`✅ Synchronized latest admin_auth (${adminAuth.username}) from PostgreSQL.`);
        }
      }

      if (!authLoaded) {
        // Migration check: If existing rows exist in legacy admin_auth table, pick the latest updated one!
        const legacyRes = await client.query(`SELECT username, salt, password_hash, updated_at FROM admin_auth ORDER BY updated_at DESC LIMIT 1;`).catch(() => ({ rows: [] }));
        if (legacyRes.rows.length > 0) {
          const r = legacyRes.rows[0];
          adminAuth = {
            username: r.username,
            salt: r.salt,
            passwordHash: r.password_hash,
            updatedAt: r.updated_at
          };
          saveAdminAuthFile(adminAuth);
          await client.query(
            `INSERT INTO system_config (key, value, updated_at) VALUES ('admin_auth', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW();`,
            [JSON.stringify(adminAuth)]
          );
          authLoaded = true;
          console.log(`✅ Migrated latest admin_auth (${adminAuth.username}) from legacy table to PostgreSQL.`);
        }
      }

      if (!authLoaded) {
        // Seed default initial auth if DB is completely empty
        await client.query(
          `INSERT INTO system_config (key, value, updated_at) VALUES ('admin_auth', $1, NOW()) ON CONFLICT (key) DO NOTHING;`,
          [JSON.stringify(adminAuth)]
        );
        await client.query(
          `INSERT INTO admin_auth (username, salt, password_hash, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (username) DO NOTHING;`,
          [adminAuth.username, adminAuth.salt, adminAuth.passwordHash]
        ).catch(() => {});
        console.log(`✅ Seeded initial admin_auth (${adminAuth.username}) into PostgreSQL.`);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Error initializing PostgreSQL tables:', err.message);
  }
}

// In-memory active sessions: token -> { user, expiresAt }
const sessions = new Map();

// In-memory connected clients: clientId -> { clientId, username, siteName, websiteId, version, os, hostname, lastSeen, ip }
const activeClients = new Map();

// WebSocket tracking
const desktopSockets = new Map(); // ws -> { boundClientId, lastSeen }
const adminSockets = new Set();   // Set of ws

function broadcastToDesktops(payload) {
  const msg = JSON.stringify(payload);
  for (const [ws] of desktopSockets.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(msg);
      } catch (err) {
        console.error('WS Desktop broadcast error:', err.message);
      }
    }
  }
}

function broadcastToAdmins(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of adminSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(msg);
      } catch (err) {
        console.error('WS Admin broadcast error:', err.message);
      }
    }
  }
}

function getClientsData() {
  const now = Date.now();
  const list = [];
  for (const [clientId, client] of activeClients.entries()) {
    const diffSec = Math.floor((now - client.lastSeen) / 1000);

    // Verify if an active WebSocket connection exists for this client
    let hasActiveWs = false;
    for (const [ws, data] of desktopSockets.entries()) {
      if (data.boundClientId === clientId && ws.readyState === WebSocket.OPEN) {
        hasActiveWs = true;
        break;
      }
    }

    // Strictly online only: Active WebSocket or heartbeat within 40 seconds
    const isOnline = hasActiveWs || diffSec <= 40;
    if (isOnline) {
      list.push({
        ...client,
        diffSec,
        status: 'online'
      });
    } else {
      // Evict immediately if not online
      activeClients.delete(clientId);
    }
  }
  list.sort((a, b) => b.lastSeen - a.lastSeen);
  return {
    clients: list,
    totalOnline: list.length
  };
}

function broadcastClientsUpdateToAdmins() {
  const data = getClientsData();
  broadcastToAdmins({
    type: 'CLIENTS_UPDATED',
    clients: data.clients,
    totalOnline: data.totalOnline,
    timestamp: Date.now()
  });
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const url = req.url || '';

  // 1. Admin Dashboard WebSocket Connection
  if (url.startsWith('/ws/admin')) {
    adminSockets.add(ws);
    const clientData = getClientsData();
    ws.send(JSON.stringify({
      type: 'INIT',
      config: appConfig,
      clients: clientData.clients,
      totalOnline: clientData.totalOnline,
      serverTime: Date.now()
    }));

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', serverTime: Date.now() }));
        }
      } catch (err) {}
    });

    ws.on('close', () => {
      adminSockets.delete(ws);
    });

    ws.on('error', () => {
      adminSockets.delete(ws);
    });
    return;
  }

  // 2. Desktop Client WebSocket Connection (/ws/client or default)
  let boundClientId = null;
  desktopSockets.set(ws, { connectedAt: Date.now() });

  // Send current configuration immediately upon connecting
  ws.send(JSON.stringify({
    type: 'CONFIG_CHANGED',
    appEnabled: appConfig.appEnabled,
    maintenance: appConfig.maintenance,
    version: appConfig.version,
    broadcast: appConfig.broadcast,
    serverTime: Date.now()
  }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'HEARTBEAT' || data.type === 'HANDSHAKE') {
        const { deviceUuid, clientId, username, siteName, websiteId, version, build, os, arch, hostname, uptimeSeconds, memoryMb } = data;
        const effectiveId = deviceUuid || clientId;
        if (effectiveId) {
          boundClientId = effectiveId;
          const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
          activeClients.set(effectiveId, {
            clientId: effectiveId,
            deviceUuid: deviceUuid || effectiveId,
            username: username || 'นิรนาม',
            siteName: siteName || 'ไม่ระบุเว็บ',
            websiteId: websiteId || 0,
            version: version || '3.6.0',
            build: build || 'v3.6.0',
            os: os || 'Windows',
            arch: arch || 'x64',
            hostname: hostname || 'desktop-client',
            uptimeSeconds: Number(uptimeSeconds) || 0,
            memoryMb: Number(memoryMb) || 0,
            lastSeen: Date.now(),
            ip: String(clientIp).replace('::ffff:', '')
          });
          desktopSockets.set(ws, { boundClientId, lastSeen: Date.now() });
          broadcastClientsUpdateToAdmins();
        }

        ws.send(JSON.stringify({
          type: 'PONG',
          appEnabled: appConfig.appEnabled,
          serverTime: Date.now()
        }));
      }
    } catch (err) {
      // Ignore malformed WS message
    }
  });

  ws.on('close', () => {
    const data = desktopSockets.get(ws);
    desktopSockets.delete(ws);
    if (data && data.boundClientId) {
      let otherWsOpen = false;
      for (const [s, d] of desktopSockets.entries()) {
        if (d.boundClientId === data.boundClientId && s.readyState === WebSocket.OPEN) {
          otherWsOpen = true;
          break;
        }
      }
      if (!otherWsOpen) {
        activeClients.delete(data.boundClientId);
      }
    }
    broadcastClientsUpdateToAdmins();
  });

  ws.on('error', () => {
    const data = desktopSockets.get(ws);
    desktopSockets.delete(ws);
    if (data && data.boundClientId) {
      let otherWsOpen = false;
      for (const [s, d] of desktopSockets.entries()) {
        if (d.boundClientId === data.boundClientId && s.readyState === WebSocket.OPEN) {
          otherWsOpen = true;
          break;
        }
      }
      if (!otherWsOpen) {
        activeClients.delete(data.boundClientId);
      }
    }
    broadcastClientsUpdateToAdmins();
  });
});

// Clean up stale sessions and clients every 10s
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (sess.expiresAt < now) {
      sessions.delete(token);
    }
  }
  let changed = false;
  for (const [clientId, client] of activeClients.entries()) {
    let hasActiveWs = false;
    for (const [ws, data] of desktopSockets.entries()) {
      if (data.boundClientId === clientId && ws.readyState === WebSocket.OPEN) {
        hasActiveWs = true;
        break;
      }
    }
    if (!hasActiveWs && (now - client.lastSeen > 40 * 1000)) {
      activeClients.delete(clientId);
      changed = true;
    }
  }
  if (changed) {
    broadcastClientsUpdateToAdmins();
  }
}, 10 * 1000);

// Active Keep-Alive Ping (every 20s) to prevent cloud/Railway proxy WebSocket timeouts
setInterval(() => {
  const pingFrame = JSON.stringify({ type: 'PING', serverTime: Date.now() });
  for (const ws of adminSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(pingFrame); } catch (e) {}
    } else {
      adminSockets.delete(ws);
    }
  }
  for (const [ws] of desktopSockets.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(pingFrame); } catch (e) {}
    }
  }
}, 20 * 1000);

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Auth Helper
function getAuthToken(req) {
  if (req.cookies && req.cookies.nk_admin_token) {
    return req.cookies.nk_admin_token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'กรุณาเข้าสู่ระบบผู้ควบคุมก่อนดำเนินการ' });
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  req.user = session.user;
  next();
}

// ==== Public Endpoints for NK-Desktop Clients ====

// 1. App Control Config (NK Desktop polls this)
app.get('/api/app-control', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    ok: true,
    appEnabled: appConfig.appEnabled,
    maintenance: appConfig.maintenance,
    version: appConfig.version,
    broadcast: appConfig.broadcast,
    serverTime: Date.now()
  });
});

// 2. Heartbeat (NK Desktop reports its live status)
app.post('/api/app-heartbeat', (req, res) => {
  try {
    const { clientId, deviceUuid, username, siteName, websiteId, version, build, os, arch, hostname, uptimeSeconds, memoryMb } = req.body || {};
    const effectiveId = deviceUuid || clientId;
    if (!effectiveId) {
      return res.status(400).json({ ok: false, error: 'Missing clientId or deviceUuid' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    activeClients.set(effectiveId, {
      clientId: effectiveId,
      deviceUuid: deviceUuid || effectiveId,
      username: username || 'นิรนาม',
      siteName: siteName || 'ไม่ระบุเว็บ',
      websiteId: websiteId || 0,
      version: version || '3.6.0',
      build: build || 'v3.6.0',
      os: os || 'Windows',
      arch: arch || 'x64',
      hostname: hostname || 'desktop-client',
      uptimeSeconds: Number(uptimeSeconds) || 0,
      memoryMb: Number(memoryMb) || 0,
      lastSeen: Date.now(),
      ip: String(clientIp).replace('::ffff:', '')
    });

    broadcastClientsUpdateToAdmins();

    res.json({
      ok: true,
      appEnabled: appConfig.appEnabled,
      serverTime: Date.now()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeClientsCount: activeClients.size
  });
});

// ==== Master Controller Authentication Endpoints ====

// Login with Dedicated Master Credentials (NOT NK user/pass)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const u = String(username).trim();
  const p = String(password);

  // Check username match
  if (u.toLowerCase() !== adminAuth.username.toLowerCase()) {
    return res.status(401).json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านผู้ควบคุมไม่ถูกต้อง' });
  }

  // Check password hash
  const hash = hashPassword(p, adminAuth.salt);
  if (hash !== adminAuth.passwordHash) {
    return res.status(401).json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านผู้ควบคุมไม่ถูกต้อง' });
  }

  const masterUser = {
    id: 'master-owner',
    username: adminAuth.username,
    name: 'ผู้สร้างระบบ (Master Owner)',
    role: 'ผู้ดูแลระบบสูงสุด (Super Controller)'
  };

  const sessionToken = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionToken, {
    user: masterUser,
    expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days
  });

  res.cookie('nk_admin_token', sessionToken, {
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });

  return res.json({ ok: true, user: masterUser, token: sessionToken });
});

// Get Current User Profile
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Change Master Credentials (Username & Password)
app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
    }

    // Verify current password
    const currentHash = hashPassword(String(currentPassword), adminAuth.salt);
    if (currentHash !== adminAuth.passwordHash) {
      return res.status(401).json({ ok: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }

    if (String(newPassword).length < 4) {
      return res.status(400).json({ ok: false, error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(String(newPassword), newSalt);

    if (newUsername && String(newUsername).trim()) {
      adminAuth.username = String(newUsername).trim();
    }
    adminAuth.salt = newSalt;
    adminAuth.passwordHash = newHash;
    adminAuth.updatedAt = new Date().toISOString();

    await saveAdminAuth(adminAuth);

    const token = getAuthToken(req);
    if (token && sessions.has(token)) {
      const sess = sessions.get(token);
      sess.user.username = adminAuth.username;
      sess.user.name = adminAuth.username;
    }

    return res.json({
      ok: true,
      message: 'เปลี่ยนรหัสผ่านผู้ควบคุมสำเร็จเรียบร้อยแล้ว',
      username: adminAuth.username
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาด: ' + err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = getAuthToken(req);
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie('nk_admin_token');
  res.json({ ok: true });
});

// ==== Protected Admin Management Endpoints ====

// Get Full Config
app.get('/api/admin/config', requireAuth, (_req, res) => {
  res.json({ ok: true, config: appConfig });
});

// Update Config
app.post('/api/admin/config', requireAuth, async (req, res) => {
  try {
    const { appEnabled, maintenance, version, broadcast } = req.body || {};

    if (typeof appEnabled === 'boolean') {
      appConfig.appEnabled = appEnabled;
    }

    if (maintenance && typeof maintenance === 'object') {
      appConfig.maintenance = {
        title: String(maintenance.title || appConfig.maintenance.title),
        message: String(maintenance.message || appConfig.maintenance.message),
        contact: String(maintenance.contact || appConfig.maintenance.contact)
      };
    }

    if (version && typeof version === 'object') {
      appConfig.version = {
        latestVersion: String(version.latestVersion || appConfig.version.latestVersion).trim(),
        minSupportedVersion: String(version.minSupportedVersion || appConfig.version.minSupportedVersion).trim(),
        forceUpdate: Boolean(version.forceUpdate),
        downloadUrl: String(version.downloadUrl || '').trim(),
        releaseNotes: String(version.releaseNotes || '').trim()
      };
    }

    if (broadcast && typeof broadcast === 'object') {
      appConfig.broadcast = {
        enabled: Boolean(broadcast.enabled),
        type: ['info', 'warning', 'danger'].includes(broadcast.type) ? broadcast.type : 'info',
        message: String(broadcast.message || '').trim()
      };
    }

    appConfig.updatedAt = new Date().toISOString();
    appConfig.updatedBy = req.user.name || req.user.username;

    await saveConfig(appConfig);

    // Instant Real-time Broadcast to all connected Desktop clients & Admin Dashboards
    broadcastToDesktops({
      type: 'CONFIG_CHANGED',
      appEnabled: appConfig.appEnabled,
      maintenance: appConfig.maintenance,
      version: appConfig.version,
      broadcast: appConfig.broadcast,
      serverTime: Date.now()
    });

    broadcastToAdmins({
      type: 'CONFIG_UPDATED',
      config: appConfig,
      serverTime: Date.now()
    });

    res.json({ ok: true, config: appConfig, message: 'บันทึกการตั้งค่าและส่งคำสั่งเรียลไทม์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'บันทึกไม่สำเร็จ: ' + err.message });
  }
});

// Force Kick & Lockout All Connected Desktop Clients Immediately
app.post('/api/admin/kick-all', requireAuth, async (req, res) => {
  try {
    appConfig.appEnabled = false;
    appConfig.updatedAt = new Date().toISOString();
    appConfig.updatedBy = req.user.name || req.user.username;
    await saveConfig(appConfig);

    // Instant Real-time Kill Switch push to all desktop clients
    broadcastToDesktops({
      type: 'FORCE_LOCKOUT',
      appEnabled: false,
      maintenance: appConfig.maintenance,
      serverTime: Date.now()
    });

    broadcastToAdmins({
      type: 'CONFIG_UPDATED',
      config: appConfig,
      serverTime: Date.now()
    });

    res.json({ ok: true, config: appConfig, message: 'สั่งดีดผู้ใช้งานออกจากระบบและล็อกหน้าจอทุกเครื่องทันทีเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'คำสั่งล้มเหลว: ' + err.message });
  }
});

// Get Connected Active Clients
app.get('/api/admin/clients', requireAuth, (_req, res) => {
  const data = getClientsData();
  res.json({
    ok: true,
    clients: data.clients,
    totalOnline: data.totalOnline
  });
});

// Fallback to index.html for Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server (with WebSocket Support)
async function startServer() {
  await initDatabase();
  server.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`🚀 NK Master Admin Server running on port ${PORT}`);
    console.log(`📍 Web Dashboard: http://localhost:${PORT}`);
    console.log(`🔑 Master User:   ${adminAuth.username}`);
    console.log(`🔌 Desktop API:   http://localhost:${PORT}/api/app-control`);
    console.log(`⚡ WebSocket URL: ws://localhost:${PORT}/ws/client`);
    console.log(`=============================================`);
  });
}

startServer();
