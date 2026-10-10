'use strict';

const os = require('os');
const crypto = require('crypto');

class RemoteControlEngine {
  constructor() {
    this.store = null;
    this.getMainWindow = null;
    this.getLoginWindow = null;
    this.app = null;
    this.shell = null;
    this.analyzerEngine = null;
    this.withdrawEngine = null;
    this.forceLogout = null;

    this.timer = null;
    this.ws = null;
    this.wsPingTimer = null;
    this.wsReconnectTimer = null;
    this.lastConfig = null;
    this.isLocked = false;
    this.isForceUpdate = false;
    this.isHardLocked = false;
    this.isOnline = false;
    this.lastSuccessfulContact = 0;
    this.consecutiveFailures = 0;
    this.lastLatency = 0;

    // Production Railway URL
    this.DEFAULT_SERVER_URL = 'https://web-production-eaa42d1.up.railway.app';
  }

  init({ store, getMainWindow, getLoginWindow, app, shell, analyzerEngine, withdrawEngine, forceLogout }) {
    this.store = store;
    this.getMainWindow = getMainWindow;
    this.getLoginWindow = getLoginWindow;
    this.app = app;
    this.shell = shell;
    this.analyzerEngine = analyzerEngine;
    this.withdrawEngine = withdrawEngine;
    this.forceLogout = forceLogout || null;

    // Ensure unique persistent enterprise Device UUID
    let deviceUuid = this.store.get('deviceUuid');
    if (!deviceUuid) {
      deviceUuid = 'NK-DEV-' + crypto.randomUUID().toUpperCase();
      this.store.set('deviceUuid', deviceUuid);
    }
  }

  getDeviceUuid() {
    return this.store ? (this.store.get('deviceUuid') || 'NK-DEV-UNKNOWN') : 'NK-DEV-UNKNOWN';
  }

  getServerUrl() {
    const customUrl = this.store ? this.store.get('settings.remoteControlUrl', '').trim() : '';
    if (customUrl) {
      return customUrl.replace(/\/+$/, '');
    }
    return this.DEFAULT_SERVER_URL;
  }

  setServerUrl(url) {
    if (this.store) {
      this.store.set('settings.remoteControlUrl', String(url || '').trim().replace(/\/+$/, ''));
      this.connectWebSocket();
    }
  }

  compareSemver(v1, v2) {
    const p1 = String(v1 || '0').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = String(v2 || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  getTelemetryData() {
    const user = this.store ? (this.store.get('session.user') || {}) : {};
    const currentVersion = this.app ? this.app.getVersion() : '3.6.0';
    return {
      clientId: this.getDeviceUuid(),
      deviceUuid: this.getDeviceUuid(),
      username: user.name || user.username || 'ไม่ได้เข้าสู่ระบบ',
      siteName: user.siteName || 'ไม่ได้เลือกเว็บ',
      websiteId: user.websiteId || 0,
      version: currentVersion,
      build: '2026.09.v3.6.0',
      os: `${process.platform} (${os.release()})`,
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
    };
  }

  // ==== WebSocket Real-Time Connection ====
  connectWebSocket() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    const serverUrl = this.getServerUrl();
    const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws/client';

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isOnline = true;
        this.lastSuccessfulContact = Date.now();
        this.consecutiveFailures = 0;
        this.sendWsHandshake();
        this.startWsPing();
      };

      this.ws.onmessage = (event) => {
        this.handleWsMessage(event.data);
      };

      this.ws.onclose = () => {
        this.stopWsPing();
        this.scheduleWsReconnect();
      };

      this.ws.onerror = () => {
        // Will close and trigger onclose
      };
    } catch (err) {
      this.scheduleWsReconnect();
    }
  }

  sendWs(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {}
    }
  }

  sendWsHandshake() {
    const telemetry = this.getTelemetryData();
    this.sendWs({
      type: 'HANDSHAKE',
      ...telemetry
    });
  }

  startWsPing() {
    this.stopWsPing();
    this.wsPingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingTime = Date.now();
        this.sendWs({
          type: 'PING',
          clientId: this.getDeviceUuid(),
          time: pingTime
        });
      }
    }, 20000); // 20s keepalive
  }

  stopWsPing() {
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
  }

  scheduleWsReconnect() {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket();
    }, 3000); // Reconnect in 3s
  }

  handleWsMessage(rawData) {
    try {
      const msg = typeof rawData === 'string' ? JSON.parse(rawData) : JSON.parse(rawData.toString());
      this.lastSuccessfulContact = Date.now();
      this.isOnline = true;

      if (msg.type === 'PONG') {
        if (msg.time) {
          this.lastLatency = Date.now() - msg.time;
        }
        return;
      }

      if (msg.type === 'INITIAL_STATE' || msg.type === 'CONFIG_CHANGED') {
        const config = msg.config || msg;
        this.applyConfig(config, false);
      } else if (msg.type === 'FORCE_LOCKOUT') {
        const config = msg.config || { appEnabled: false };
        if (msg.reason) {
          config.maintenance = {
            title: '🛑 ระบบถูกสั่งปิดโดยผู้ดูแลระบบ',
            message: msg.reason,
            contact: 'ติดต่อผู้ดูแลระบบ'
          };
        }
        this.applyConfig(config, true);
      } else if (msg.type === 'BROADCAST_ALERT') {
        if (this.lastConfig) {
          this.lastConfig.broadcast = msg.alert;
          this.applyConfig(this.lastConfig, false);
        }
      } else if (msg.type === 'FORMS_CHANGED') {
        this.broadcastToWindows('remote-control-broadcast', { type: 'FORMS_CHANGED', forms: msg.forms });
      }
    } catch (e) {}
  }

  applyConfig(config, forceKick = false) {
    if (!config) return;
    this.lastConfig = config;

    // 1. App Lockout / Kill Switch
    if (config.appEnabled === false || forceKick) {
      this.isLocked = true;
      // Immediately stop automated background routines
      if (this.analyzerEngine && typeof this.analyzerEngine.stopObserver === 'function') {
        this.analyzerEngine.stopObserver();
      }
      if (this.withdrawEngine && typeof this.withdrawEngine.stop === 'function') {
        this.withdrawEngine.stop();
      }
    } else {
      if (this.isLocked) {
        this.isLocked = false;
        // System reopened: auto resume analyzer if logged in
        const loggedIn = this.store ? this.store.get('session.loggedIn', false) : false;
        if (loggedIn && this.analyzerEngine) {
          this.analyzerEngine.startObserver(15);
        }
      }
    }

    // 2. Version Check & Lifecycle
    const currentVersion = this.app ? this.app.getVersion() : '3.6.0';
    const latestVersion = config.version?.latestVersion || currentVersion;
    const minSupportedVersion = config.version?.minSupportedVersion || '3.5.0';

    const hasNewerVersion = this.compareSemver(latestVersion, currentVersion) > 0;
    const belowMinimum = this.compareSemver(minSupportedVersion, currentVersion) > 0;
    const forceUpdate = Boolean((config.version?.forceUpdate && hasNewerVersion) || belowMinimum);

    this.isForceUpdate = forceUpdate;
    this.isHardLocked = belowMinimum;

    const statusPayload = {
      online: true,
      latency: this.lastLatency,
      locked: this.isLocked,
      forceKick: Boolean(this.isLocked || forceKick),
      maintenance: config.maintenance || {
        title: 'ระบบปิดปรับปรุงชั่วคราว',
        message: 'ขณะนี้ระบบ NK Helper อยู่ระหว่างการปรับปรุงระบบเพื่อความเสถียร',
        contact: 'ติดต่อผู้ดูแลระบบ'
      },
      currentVersion,
      latestVersion,
      minSupportedVersion,
      hasNewerVersion,
      forceUpdate,
      belowMinimum,
      downloadUrl: config.version?.downloadUrl || '',
      releaseNotes: config.version?.releaseNotes || '',
      broadcast: config.broadcast || { enabled: false, type: 'info', message: '' },
      serverTime: config.serverTime || Date.now(),
      deviceUuid: this.getDeviceUuid()
    };

    this.broadcastToWindows('remote-control-status', statusPayload);

    // If locked or forced kick, execute logout kick after letting renderer play alert sound
    if (this.isLocked && this.forceLogout) {
      const loggedIn = this.store ? this.store.get('session.loggedIn', false) : false;
      if (loggedIn) {
        setTimeout(() => {
          if (this.isLocked && this.forceLogout) {
            this.forceLogout();
          }
        }, 800);
      }
    }

    return statusPayload;
  }

  async checkControlStatus() {
    const serverUrl = this.getServerUrl();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(`${serverUrl}/api/app-control`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'X-Client-Device': this.getDeviceUuid(),
          'X-Client-Version': this.app ? this.app.getVersion() : '3.6.0'
        }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const config = await res.json();
      this.lastLatency = Date.now() - startTime;
      this.lastSuccessfulContact = Date.now();
      this.consecutiveFailures = 0;
      this.isOnline = true;

      const statusPayload = this.applyConfig(config, config.appEnabled === false);
      return { ok: true, status: statusPayload };
    } catch (err) {
      this.consecutiveFailures++;
      this.isOnline = false;

      const offlinePayload = {
        online: false,
        consecutiveFailures: this.consecutiveFailures,
        lastSuccessfulContact: this.lastSuccessfulContact,
        locked: this.isLocked,
        currentVersion: this.app ? this.app.getVersion() : '3.6.0',
        error: err.message,
        deviceUuid: this.getDeviceUuid()
      };

      this.broadcastToWindows('remote-control-status', offlinePayload);
      return { ok: false, error: err.message, status: offlinePayload };
    }
  }

  async sendHeartbeat() {
    const serverUrl = this.getServerUrl();
    const telemetry = this.getTelemetryData();

    // Also push telemetry over persistent WebSocket if connected
    this.sendWs({
      type: 'HEARTBEAT',
      ...telemetry
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(`${serverUrl}/api/app-heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(telemetry),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (typeof data.appEnabled === 'boolean' && data.appEnabled !== (!this.isLocked)) {
          // If server master switch toggled, sync instantly
          this.checkControlStatus();
        }
      }
    } catch (e) {
      // Graceful offline failure
    }
  }

  broadcastToWindows(channel, data) {
    const mainWin = this.getMainWindow ? this.getMainWindow() : null;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(channel, data);
    }
    const loginWin = this.getLoginWindow ? this.getLoginWindow() : null;
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.webContents.send(channel, data);
    }
  }

  start(intervalMs = 60000) { // Every 60 seconds HTTP fallback
    this.stop();

    // 1. Establish persistent WebSocket for instant sub-second push
    this.connectWebSocket();

    // 2. Initial HTTP check & heartbeat
    this.checkControlStatus();
    this.sendHeartbeat();

    // 3. Fallback polling
    this.timer = setInterval(() => {
      this.checkControlStatus();
      this.sendHeartbeat();
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopWsPing();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

module.exports = new RemoteControlEngine();
