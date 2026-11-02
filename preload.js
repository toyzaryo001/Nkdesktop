'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nkAPI', {
  // Window controls
  closeWindow: () => ipcRenderer.invoke('window-control', 'close'),
  minimizeWindow: () => ipcRenderer.invoke('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-control', 'maximize'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('auth-login', credentials),
  logout: () => ipcRenderer.invoke('auth-logout'),
  getUser: () => ipcRenderer.invoke('auth-get-user'),
  changePassword: (data) => ipcRenderer.invoke('auth-change-password', data),

  // Store
  getStore: (key, defaultVal) => ipcRenderer.invoke('store-get', key, defaultVal),
  setStore: (key, val) => ipcRenderer.invoke('store-set', key, val),
  getAllStore: () => ipcRenderer.invoke('store-get-all'),

  // API Session
  saveSession: (session) => ipcRenderer.invoke('api-save-session', session),
  getSession: () => ipcRenderer.invoke('api-get-session'),

  // Members & Passwords
  runMemberNote: (phone) => ipcRenderer.invoke('member-run-note', phone),
  findMemberForReset: (phone) => ipcRenderer.invoke('member-find-reset', phone),
  resetMemberPassword: (data) => ipcRenderer.invoke('member-reset-password', data),

  // Points history
  runPointsHistory: (search) => ipcRenderer.invoke('points-run-history', search),
  clearPointsHistory: () => ipcRenderer.invoke('points-clear'),

  // Withdraw
  startWithdraw: (config) => ipcRenderer.invoke('withdraw-start', config),
  stopWithdraw: () => ipcRenderer.invoke('withdraw-stop'),
  updateWithdrawConfig: (config) => ipcRenderer.invoke('withdraw-update-config', config),
  setWithdrawAutoApprove: (...args) => ipcRenderer.invoke('withdraw-set-auto-approve', ...args),
  pollWithdrawNow: () => ipcRenderer.invoke('withdraw-tick-now'),
  approveWithdraw: (itemOrId, provider) => ipcRenderer.invoke('withdraw-manual-approve', itemOrId, provider),
  rejectWithdraw: (txId, note) => ipcRenderer.invoke('withdraw-manual-reject', { txId, note }),

  // Turnover & Member summary
  getMemberTurnoverSummary: (memberId, username) => ipcRenderer.invoke('member-turnover-summary', { memberId, username }),

  // Version Check & Remote Control
  checkAppUpdate: () => ipcRenderer.invoke('app-check-update'),
  getAppVersion: () => ipcRenderer.invoke('app-get-version'),
  checkRemoteControlNow: () => ipcRenderer.invoke('remote-control-check-now'),
  getRemoteTelemetry: () => ipcRenderer.invoke('remote-control-get-telemetry'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  downloadAppUpdate: (url) => ipcRenderer.invoke('app-download-update', url),
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (_event, data) => callback(data));
  },
  onRemoteControlStatus: (callback) => {
    ipcRenderer.on('remote-control-status', (_event, data) => callback(data));
  },
  onRemoteControlBroadcast: (callback) => {
    ipcRenderer.on('remote-control-broadcast', (_event, data) => callback(data));
  },

  // Reports
  selectSavePath: (defaultFilename) => ipcRenderer.invoke('report-select-save-path', defaultFilename),
  fetchDepositReport: (config) => ipcRenderer.invoke('report-fetch-deposit', config),
  exportDepositReport: (savePath, config) => ipcRenderer.invoke('report-export-deposit', savePath, config),
  runDepositReport: (config, savePath) => ipcRenderer.invoke('report-run-deposit', config, savePath),
  fetchRewardReport: (config) => ipcRenderer.invoke('report-fetch-reward', config),
  exportRewardReport: (savePath, config) => ipcRenderer.invoke('report-export-reward', savePath, config),
  runRewardReport: (config, savePath) => ipcRenderer.invoke('report-run-reward', config, savePath),
  fetchReconciliationReport: (config) => ipcRenderer.invoke('report-fetch-reconciliation', config),
  exportReconciliationReport: (savePath, config) => ipcRenderer.invoke('report-export-reconciliation', savePath, config),
  getMonthRanges: () => ipcRenderer.invoke('report-get-month-ranges'),
  fetchMonthlyRanking: (config) => ipcRenderer.invoke('report-fetch-monthly-ranking', config),
  cancelMonthlyRanking: () => ipcRenderer.invoke('report-cancel-monthly-ranking'),
  onMonthlyRankingProgress: (callback) => {
    ipcRenderer.on('monthly-ranking-progress', (_event, data) => callback(data));
  },
  exportMonthlyRanking: (savePath, config) => ipcRenderer.invoke('report-export-monthly-ranking', savePath, config),

  // 3. รายงานลูกค้าฝากเดือนล่าสุด
  fetchLatestMonthDepositors: (config) => ipcRenderer.invoke('report-fetch-latest-month-depositors', config),
  cancelLatestMonthDepositors: () => ipcRenderer.invoke('report-cancel-latest-month-depositors'),
  onLatestMonthDepositorsProgress: (callback) => {
    ipcRenderer.on('latest-month-depositors-progress', (_event, data) => callback(data));
  },
  exportLatestMonthDepositorsExcel: (savePath, config) => ipcRenderer.invoke('report-export-latest-month-depositors', savePath, config),
  getTwoRecentMonths: (refDate) => ipcRenderer.invoke('report-get-two-recent-months', refDate),
  openFile: (filePath) => ipcRenderer.invoke('report-open-file', filePath),

  // Analyzer
  setAnalyzerEnabled: (options) => ipcRenderer.invoke('analyzer-set-enabled', options),
  tickObserverNow: () => ipcRenderer.invoke('analyzer-tick-observer'),
  clearAnalyzer: () => ipcRenderer.invoke('analyzer-clear'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
  factoryReset: () => ipcRenderer.invoke('app-factory-reset'),

  // Temp credentials for webview auto-login
  getTempCredentials: () => ipcRenderer.invoke('auth-get-temp-credentials'),

  // Realtime notifications listener
  onNotification: (callback) => {
    ipcRenderer.on('app-notification', (_event, data) => callback(data));
  },

  // Notification logs
  getNotificationLogs: (options) => ipcRenderer.invoke('notifications-get-logs', options),

  // Dark mode
  toggleDarkMode: (enabled) => ipcRenderer.invoke('toggle-dark-mode', enabled),

  // SwiftPay Summary
  getSwiftPaySummary: (options) => ipcRenderer.invoke('swiftpay-get-summary', options),

  // Clipboard & Capture
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke('clipboard-write-image', dataUrl),
  saveCaptureFile: (data) => ipcRenderer.invoke('capture-save-file', data),

  // Daily Summary Report Table
  getDailyReport: (options) => ipcRenderer.invoke('daily-report-get', options),
  exportDailyReportExcel: (options) => ipcRenderer.invoke('daily-report-export', options),
  onDailyReportUpdated: (callback) => {
    ipcRenderer.on('daily-report-updated', (_event, data) => callback(data));
  },

  // Customer Retention & Cohort Segmentation
  getCohortMonths: (refDate) => ipcRenderer.invoke('cohort-get-months', refDate),
  fetchCohortData: (options) => ipcRenderer.invoke('cohort-fetch-data', options),
  cancelCohortFetch: () => ipcRenderer.invoke('cohort-cancel-fetch'),
  getCohortState: () => ipcRenderer.invoke('cohort-get-state'),
  exportCohortExcel: (options) => ipcRenderer.invoke('cohort-export-excel', options),
  onCohortProgress: (callback) => {
    ipcRenderer.on('cohort-progress', (_event, data) => callback(data));
  }
});
