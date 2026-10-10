'use strict';
const { app, BrowserWindow, ipcMain, dialog, Notification, shell, session, net, Tray, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const auth = require('./auth');
const store = require('./store');
const apiEngine = require('./api-engine');
const withdrawEngine = require('./withdraw-engine');
const reportEngine = require('./report-engine');
const analyzerEngine = require('./analyzer-engine');
const remoteControlEngine = require('./remote-control-engine');
const ipcHandlers = require('./ipc-handlers');

// Prevent GC
let mainWindow = null;
let loginWindow = null;
let tray = null;
let isQuitting = false;

// Force Thai locale and 24-hour format
app.commandLine.appendSwitch('lang', 'th-TH');

// High performance Chromium flags for smooth 60fps rendering without UI stutters
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const isDev = process.argv.includes('--dev') || !app.isPackaged;

function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 420,
    height: 580,
    resizable: false,
    frame: false,
    transparent: false,
    center: true,
    title: 'NK Helper — เข้าสู่ระบบ',
    icon: path.join(__dirname, '../assets/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  loginWindow.loadFile(path.join(__dirname, '../renderer/login.html'));
  if (isDev) loginWindow.webContents.openDevTools({ mode: 'detach' });
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    center: true,
    title: 'NK Helper v3.8.1 (Enterprise Online)',
    icon: path.join(__dirname, '../assets/icons/icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    loginWindow = null;
    createTray();

    // Trigger initial check for yesterday's daily report data
    setTimeout(async () => {
      try {
        const dailyReportEngine = require('./daily-report-engine');
        await dailyReportEngine.checkMidnightSync(({ yesterdayStr, ym }) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('daily-report-updated', { yesterdayStr, ym });
          }
        });
      } catch (e) {}
    }, 3000);
  });

  // Minimize to System Tray when closing mainWindow (กากบาทแล้วทำงานต่อใน Tray)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'NK Helper ย่อลงถาดระบบแล้ว',
          body: 'โปรแกรมยังคงเฝ้าดู Server และแจ้งเตือนอยู่เบื้องหลัง คลิกไอคอนที่ถาดระบบเพื่อเปิดขึ้นมา',
          silent: true
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../assets/icons/icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('NK BackOffice Helper (กำลังทำงานเบื้องหลัง)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚡ เปิดหน้าต่าง NK Helper',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: '🌐 ระบบ: เฝ้าดู Server ตลอดเวลา',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🚪 ออกจากโปรแกรมถาวร',
      click: () => {
        isQuitting = true;
        withdrawEngine.stop();
        analyzerEngine.stopObserver();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// ==== App bootstrap ====
app.whenReady().then(async () => {
  // Init store
  store.init();

  // Init engines
  withdrawEngine.init(store);
  analyzerEngine.init(store);
  // Perform clean enterprise logout & return to login window
  const performLogout = () => {
    try {
      analyzerEngine.stopObserver();
      withdrawEngine.stop();
      auth.logout();
      store.set('session.loggedIn', false);
      store.delete('session.user');
      store.delete('session.loginTime');
      remoteControlEngine.sendHeartbeat();
      if (mainWindow && !mainWindow.isDestroyed()) {
        isQuitting = true;
        mainWindow.close();
        isQuitting = false;
      }
      createLoginWindow();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  remoteControlEngine.init({
    store,
    getMainWindow: () => mainWindow,
    getLoginWindow: () => loginWindow,
    app,
    shell,
    analyzerEngine,
    withdrawEngine,
    forceLogout: performLogout
  });

  // Register all IPC handlers
  ipcHandlers.register({
    ipcMain,
    mainWindow: () => mainWindow,
    store,
    auth,
    apiEngine,
    withdrawEngine,
    reportEngine,
    analyzerEngine,
    remoteControlEngine,
    dialog,
    Notification,
    shell
  });

  // Start Remote Control polling & heartbeats (every 60s)
  remoteControlEngine.start(60000);

  // Window close / minimize / maximize controls
  ipcMain.handle('window-control', (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (action === 'close') {
      // If closing main window, hide to system tray instead of exiting
      if (win === mainWindow) {
        win.hide();
        if (Notification.isSupported()) {
          new Notification({
            title: 'NK Helper ย่อลงถาดระบบแล้ว',
            body: 'โปรแกรมยังคงเฝ้าดู Server และแจ้งเตือนอยู่เบื้องหลัง',
            silent: true
          }).show();
        }
      } else {
        win.close();
      }
    } else if (action === 'minimize') {
      win.minimize();
    } else if (action === 'maximize') {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });

  // Login / open main window
  ipcMain.handle('auth-login', async (_e, { username, password, otp }) => {
    const result = await auth.login(username, password, otp);
    if (result.ok) {
      store.set('session.loginTime', Date.now());
      analyzerEngine.startObserver(15);
      const withdrawCfg = store.get('withdrawConfig', {});
      if (withdrawCfg.active) {
        withdrawEngine.start(withdrawCfg);
      }

      // Pre-seed session cookies for the BackOffice Webview partition
      if (result.user?.backofficeUrl && result.user.backofficeUrl.startsWith('http')) {
        try {
          const apiSession = store.get('apiSession', null);
          const rawToken = apiSession?.headers?.authorization?.replace(/^Bearer\s+/i, '');
          if (rawToken) {
            const boOrigin = new URL(result.user.backofficeUrl).origin;
            const pSession = session.fromPartition('persist:nkhelper');
            await pSession.cookies.set({
              url: boOrigin,
              name: 'token',
              value: rawToken,
              path: '/',
              expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400
            });
            await pSession.cookies.set({
              url: boOrigin,
              name: 'auth._token.local',
              value: 'Bearer ' + rawToken,
              path: '/',
              expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400
            });
            if (result.user.websiteId) {
              await pSession.cookies.set({
                url: boOrigin,
                name: 'website_id',
                value: String(result.user.websiteId),
                path: '/',
                expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400
              });
            }
          }
        } catch (cookieErr) {
          console.warn('[Session] Cookie pre-seed warning:', cookieErr?.message || cookieErr);
        }
      }

      createMainWindow();
      remoteControlEngine.sendHeartbeat();
    }
    return result;
  });

  ipcMain.handle('auth-logout', async () => {
    performLogout();
    return { ok: true };
  });

  ipcMain.handle('auth-get-user', () => {
    const u = store.get('session.user') || null;
    if (u) {
      if (!u.backofficeUrl) {
        u.backofficeUrl = store.get('settings.backofficeUrl') || store.get('apiBusinessContext.backofficeUrl') || '';
      }
      if (!u.siteName) {
        u.siteName = store.get('settings.targetWebsiteName') || store.get('apiBusinessContext.siteName') || '';
      }
      if (!u.websiteId) {
        u.websiteId = store.get('settings.targetWebsiteId') || store.get('apiBusinessContext.websiteId') || null;
      }
    }
    return u;
  });

  ipcMain.handle('app-get-version', () => app.getVersion());

  // Record current app version (preserve settings, sessions, and learned caches across updates)
  const currentAppVersion = app.getVersion();
  store.set('installedAppVersion', currentAppVersion);

  // Always require user login on app start (never bypass login screen)
  store.set('session.loggedIn', false);
  store.delete('session.loginTime');
  analyzerEngine.stopObserver();
  withdrawEngine.stop();
  createLoginWindow();

  // Intercept API headers on both default and partitioned webview sessions
  const attachInterceptor = (targetSession) => {
    targetSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.logicxking.com/*'] },
      (details, callback) => {
        try {
          const reqUrl = new URL(details.url);
          const headers = details.requestHeaders || {};
          if (headers.authorization || headers.Authorization) {
            const queryObj = {};
            reqUrl.searchParams.forEach((v, k) => { queryObj[k] = v; });
            apiEngine.saveApiSession({
              origin: reqUrl.origin,
              headers: headers,
              path: reqUrl.pathname,
              query: queryObj
            });
          }
        } catch (e) {}
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    // Auto-learn bank ID from manual approve requests performed in BackOffice webview
    targetSession.webRequest.onBeforeRequest(
      { urls: ['*://*.logicxking.com/transactions/*/approve*'] },
      (details, callback) => {
        try {
          if (details.uploadData && details.uploadData.length > 0) {
            const raw = details.uploadData[0].bytes ? details.uploadData[0].bytes.toString('utf8') : '';
            if (raw) {
              const body = JSON.parse(raw);
              if (body?.bank_id) {
                store.set('manualApproveCapture', { request: { body }, at: Date.now() });
                const currentCache = store.get('withdrawCrsBankCache', {});
                store.set('withdrawCrsBankCache', {
                  ...currentCache,
                  id: Number(body.bank_id),
                  updatedAt: Date.now()
                });
              }
            }
          }
        } catch (e) {}
        callback({});
      }
    );
  };

  attachInterceptor(session.defaultSession);
  attachInterceptor(session.fromPartition('persist:nkhelper'));

  // Periodic Midnight Auto-Sync Daemon (every 60s)
  setInterval(async () => {
    try {
      const dailyReportEngine = require('./daily-report-engine');
      await dailyReportEngine.checkMidnightSync(({ yesterdayStr, ym }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('daily-report-updated', { yesterdayStr, ym });
        }
      });
    } catch (e) {}
  }, 60000);

  app.on('activate', () => {
    if (!mainWindow && !loginWindow) createLoginWindow();
    else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (e) => {
  // Do not quit app when windows are closed (keep background daemon running in tray)
  e.preventDefault();
});

// Security: prevent new windows from opening external URLs in electron window
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
