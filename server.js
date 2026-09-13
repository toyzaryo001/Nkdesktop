'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'nk_admin_secret_key_railway_2026';

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==== 1. Independent Master Auth Storage ====
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
}

function loadAdminAuth() {
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

  // Default credentials (creator can change anytime in UI or via Railway Env)
  const defaultUser = process.env.ADMIN_USERNAME || 'admin';
  const defaultPass = process.env.ADMIN_PASSWORD || 'admin888';
  const salt = crypto.randomBytes(16).toString('hex');
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

function saveAdminAuth(authData) {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving admin auth:', err.message);
    return false;
  }
}

let adminAuth = loadAdminAuth();

// ==== 2. Control Config Storage ====
const CONFIG_FILE = path.join(DATA_DIR, 'control-config.json');

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
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('Error loading config, using default:', err.message);
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving config:', err.message);
    return false;
  }
}

let appConfig = loadConfig();

// In-memory active sessions: token -> { user, expiresAt }
const sessions = new Map();

// In-memory connected clients: clientId -> { clientId, username, siteName, websiteId, version, os, hostname, lastSeen, ip }
const activeClients = new Map();

// Clean up stale sessions and clients every 60s
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (sess.expiresAt < now) {
      sessions.delete(token);
    }
  }
  for (const [clientId, client] of activeClients.entries()) {
    if (now - client.lastSeen > 10 * 60 * 1000) {
      activeClients.delete(clientId);
    }
  }
}, 60 * 1000);

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
app.post('/api/admin/change-password', requireAuth, (req, res) => {
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

    saveAdminAuth(adminAuth);

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
app.post('/api/admin/config', requireAuth, (req, res) => {
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

    saveConfig(appConfig);

    res.json({ ok: true, config: appConfig, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'บันทึกไม่สำเร็จ: ' + err.message });
  }
});

// Get Connected Active Clients
app.get('/api/admin/clients', requireAuth, (_req, res) => {
  const now = Date.now();
  const list = [];

  for (const client of activeClients.values()) {
    const diffSec = Math.floor((now - client.lastSeen) / 1000);
    const status = diffSec <= 180 ? 'online' : (diffSec <= 360 ? 'idle' : 'offline');
    list.push({
      ...client,
      diffSec,
      status
    });
  }

  // Sort by lastSeen descending
  list.sort((a, b) => b.lastSeen - a.lastSeen);

  res.json({
    ok: true,
    clients: list,
    totalOnline: list.filter(c => c.status === 'online').length
  });
});

// Fallback to index.html for Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 NK Master Admin Server running on port ${PORT}`);
  console.log(`📍 Web Dashboard: http://localhost:${PORT}`);
  console.log(`🔑 Master User:   ${adminAuth.username}`);
  console.log(`🔌 Desktop API:   http://localhost:${PORT}/api/app-control`);
  console.log(`=============================================`);
});
