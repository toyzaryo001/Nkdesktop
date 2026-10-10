'use strict';

function register({ ipcMain, mainWindow, store, auth, apiEngine, withdrawEngine, reportEngine, analyzerEngine, remoteControlEngine, dialog, shell }) {
  // Store access
  ipcMain.handle('store-get', (_e, key, defaultVal) => store.get(key, defaultVal));
  ipcMain.handle('store-set', (_e, key, val) => { store.set(key, val); return true; });
  ipcMain.handle('store-get-all', () => store.getAll());

  // Password change
  ipcMain.handle('auth-change-password', (_e, { oldPassword, newPassword }) => {
    const user = store.get('session.user');
    if (!user) return { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' };
    return auth.changePassword(user.id, oldPassword, newPassword);
  });

  // Session capture (from webview or manual)
  ipcMain.handle('api-save-session', (_e, session) => apiEngine.saveApiSession(session));
  ipcMain.handle('api-get-session', () => {
    try {
      return { ok: true, session: apiEngine.getApiSession() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Member Note
  ipcMain.handle('member-run-note', (_e, phone) => apiEngine.runMemberNote(phone));
  ipcMain.handle('member-find-reset', (_e, phone) => apiEngine.findMemberForReset(phone));
  ipcMain.handle('member-reset-password', (_e, { memberId, password }) => apiEngine.resetMemberPassword(memberId, password));

  // Points history
  ipcMain.handle('points-run-history', (_e, search) => apiEngine.runPointsHistory(search));
  ipcMain.handle('points-clear', () => apiEngine.clearPointsHistory());

  // Withdraw
  ipcMain.handle('withdraw-start', (_e, config) => withdrawEngine.start(config));
  ipcMain.handle('withdraw-stop', () => withdrawEngine.stop());
  ipcMain.handle('withdraw-update-config', (_e, config) => withdrawEngine.updateConfig(config));
  ipcMain.handle('withdraw-set-auto-approve', (_e, enabled, options) => withdrawEngine.setAutoApprove(enabled, options));
  ipcMain.handle('withdraw-tick-now', () => withdrawEngine.pollWithdrawApi());
  ipcMain.handle('withdraw-manual-approve', (_e, itemOrId, provider) => withdrawEngine.manualApproveWithdraw(itemOrId, provider));
  ipcMain.handle('withdraw-manual-reject', (_e, { txId, note }) => withdrawEngine.manualRejectWithdraw(txId, note));

  // Turnover & Member summary
  ipcMain.handle('member-turnover-summary', (_e, { memberId, username }) => apiEngine.getMemberTurnoverSummary(memberId, username));

  // Version Check & Remote Control
  ipcMain.handle('app-check-update', async () => {
    if (remoteControlEngine && typeof remoteControlEngine.checkControlStatus === 'function') {
      const res = await remoteControlEngine.checkControlStatus();
      if (res && res.ok && res.status) {
        return {
          currentVersion: res.status.currentVersion,
          latestVersion: res.status.latestVersion,
          minSupportedVersion: res.status.minSupportedVersion,
          hasUpdate: res.status.hasNewerVersion,
          forceUpdate: res.status.forceUpdate,
          belowMinimum: res.status.belowMinimum,
          downloadUrl: res.status.downloadUrl,
          releaseNotes: res.status.releaseNotes || 'ไม่มีรายละเอียดเพิ่มเติม'
        };
      }
    }
    return {
      currentVersion: '3.8.10',
      latestVersion: '3.8.10',
      updateAvailable: false,
      releaseNotes: 'NK BackOffice Helper v3.8.10 (Support Gateway Provider Selection: SwiftPay & CRS)'
    };
  });

  ipcMain.handle('remote-control-check-now', async () => {
    if (remoteControlEngine) {
      return remoteControlEngine.checkControlStatus();
    }
    return { ok: false, error: 'RemoteControlEngine not ready' };
  });

  ipcMain.handle('remote-control-get-telemetry', () => {
    if (!remoteControlEngine) return null;
    return {
      deviceUuid: remoteControlEngine.getDeviceUuid(),
      serverUrl: remoteControlEngine.getServerUrl(),
      isOnline: remoteControlEngine.isOnline,
      latency: remoteControlEngine.lastLatency,
      lastSuccessfulContact: remoteControlEngine.lastSuccessfulContact
    };
  });

  ipcMain.handle('open-external-url', (_e, url) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('app-download-update', async (event, url) => {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const path = require('path');
      const { app, shell } = require('electron');
      const https = require('https');
      
      const tmpDir = app.getPath('temp');
      const destFile = path.join(tmpDir, 'NK_Helper_Update_' + Date.now() + '.exe');
      
      const file = fs.createWriteStream(destFile);
      let downloaded = 0;
      
      https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          https.get(response.headers.location, handleResponse).on('error', handleError);
          return;
        }
        handleResponse(response);
      }).on('error', handleError);

      function handleResponse(response) {
        if (response.statusCode !== 200) {
          return reject(new Error('Failed to download: ' + response.statusCode));
        }
        const total = parseInt(response.headers['content-length'], 10) || 0;
        
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          event.sender.send('update-download-progress', { downloaded, total });
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          shell.openPath(destFile);
          setTimeout(() => app.quit(), 2000); // Quit after opening installer
          resolve(true);
        });
      }

      function handleError(err) {
        fs.unlink(destFile, () => {});
        reject(err.message);
      }
    });
  });

  // Reports
  ipcMain.handle('report-select-save-path', async (_e, defaultFilename) => {
    const win = mainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'เลือกตำแหน่งบันทึกไฟล์ Excel',
      defaultPath: defaultFilename,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  ipcMain.handle('report-fetch-deposit', (_e, config) => reportEngine.fetchDepositData(config));
  ipcMain.handle('report-export-deposit', (_e, savePath, config) => reportEngine.exportDepositWorkbook(savePath, config));
  ipcMain.handle('report-run-deposit', (_e, config, savePath) => reportEngine.runDepositReport(config, savePath));

  ipcMain.handle('report-fetch-reward', (_e, config) => reportEngine.fetchRewardData(config));
  ipcMain.handle('report-export-reward', (_e, savePath, config) => reportEngine.exportRewardWorkbook(savePath, config));
  ipcMain.handle('report-run-reward', (_e, config, savePath) => reportEngine.runRewardReport(config, savePath));

  ipcMain.handle('report-fetch-reconciliation', (_e, config) => reportEngine.fetchReconciliationData(config));
  ipcMain.handle('report-export-reconciliation', (_e, savePath, config) => reportEngine.exportReconciliationWorkbook(savePath, config));

  ipcMain.handle('report-get-month-ranges', () => reportEngine.getMonthDateRanges());
  ipcMain.handle('report-fetch-monthly-ranking', (_e, config) => reportEngine.fetchMonthlyTopDepositors(config));
  ipcMain.handle('report-cancel-monthly-ranking', () => {
    reportEngine.cancelMonthlyRanking?.();
    return true;
  });
  ipcMain.handle('report-export-monthly-ranking', (_e, savePath, config) => reportEngine.exportMonthlyTopDepositorsWorkbook(savePath, config));

  ipcMain.handle('report-open-file', (_e, filePath) => {
    if (filePath) shell.openPath(filePath);
    return true;
  });

  // Analyzer & Observer
  ipcMain.handle('analyzer-set-enabled', (_e, { enabled, observerEnabled, intervalSec }) =>
    analyzerEngine.setAnalyzerEnabled(enabled, observerEnabled, intervalSec)
  );
  ipcMain.handle('analyzer-tick-observer', () => analyzerEngine.runObserverTick());
  ipcMain.handle('analyzer-clear', () => analyzerEngine.clearAnalyzerData());

  // Settings
  ipcMain.handle('settings-get', () => store.get('settings', {}));
  ipcMain.handle('settings-save', (_e, newSettings) => {
    const auth = require('./auth');
    const old = store.get('settings', {});
    const merged = { ...old, ...newSettings, updatedAt: Date.now() };

    if (newSettings.backofficeUrl !== undefined && newSettings.backofficeUrl !== '') {
      const normalized = auth.normalizeBackofficeUrl(newSettings.backofficeUrl);
      merged.backofficeUrl = normalized;

      if (old.backofficeUrl !== normalized) {
        // Website URL changed: Re-evaluate target website
        try {
          const host = new URL(normalized).host.toLowerCase();
          const profileData = store.get('userProfileData', null);
          const websites = profileData?.websites || [];
          const matched = websites.find(w => {
            const d = String(w.domain || w.site_url || w.name || '').toLowerCase();
            return d && host.includes(d);
          });

          if (matched) {
            merged.targetWebsiteId = Number(matched.id);
            merged.targetWebsiteName = matched.site_name || matched.name || auth.deriveSiteNameFromUrl(normalized);
          } else {
            // New site is not in current account profile
            merged.targetWebsiteName = auth.deriveSiteNameFromUrl(normalized);
            merged.targetWebsiteId = null;
          }
        } catch {
          merged.targetWebsiteName = auth.deriveSiteNameFromUrl(normalized);
          merged.targetWebsiteId = null;
        }

        // Update apiBusinessContext
        const currentCtx = store.get('apiBusinessContext', {}) || {};
        store.set('apiBusinessContext', {
          ...currentCtx,
          websiteId: merged.targetWebsiteId,
          siteName: merged.targetWebsiteName,
          updatedAt: Date.now()
        });

        // Update user site display
        const currentUser = store.get('session.user');
        if (currentUser) {
          store.set('session.user', {
            ...currentUser,
            websiteId: merged.targetWebsiteId,
            siteName: merged.targetWebsiteName
          });
        }

        // Website changed: clear daily report cache and reset observer cache
        store.delete('dailyReportCache');
        analyzerEngine.clearAnalyzerData?.();
      }
    }

    store.set('settings', merged);
    if (merged.observerInterval) {
      analyzerEngine.startObserver(merged.observerInterval);
    }
    return merged;
  });

  // Factory Reset (รีเซ็ตเป็นเหมือนโปรแกรมใหม่ ล้างการตั้งค่าและเซสชั่นทั้งหมด)
  ipcMain.handle('app-factory-reset', () => {
    try {
      analyzerEngine.stopObserver?.();
      withdrawEngine.stop?.();
      store.clear();
      store.set('session.loggedIn', false);
      store.set('installedVersion', '3.6.2');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  // Temp credentials for webview auto-login
  ipcMain.handle('auth-get-temp-credentials', () => store.get('tempCredentials', null));

  // Notification Logs
  ipcMain.handle('notifications-get-logs', (_e, options) => {
    const notifEngine = require('./notification-engine');
    return notifEngine.fetchNotificationLogs(options);
  });

  // Dark mode
  ipcMain.handle('toggle-dark-mode', (_e, enabled) => {
    store.set('darkMode', enabled);
    return enabled;
  });

  // SwiftPay Summary
  ipcMain.handle('swiftpay-get-summary', (_e, options) => {
    return apiEngine.getSwiftPaySummary(options);
  });

  // Clipboard image copy
  ipcMain.handle('clipboard-write-image', (_e, dataUrl) => {
    try {
      const { clipboard, nativeImage } = require('electron');
      if (!dataUrl) return { success: false, error: 'No data provided' };
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return { success: false, error: 'Empty image' };
      clipboard.writeImage(img);
      return { success: true };
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      return { success: false, error: err.message };
    }
  });

  // Save Captured Image to File
  ipcMain.handle('capture-save-file', async (_e, { dataUrl, defaultName }) => {
    try {
      const { dialog, nativeImage } = require('electron');
      const fs = require('fs');
      if (!dataUrl) return { success: false, error: 'No data provided' };
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return { success: false, error: 'Empty image' };
      const buffer = img.toPNG();
      
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'บันทึกภาพหน้าจอ Dashboard',
        defaultPath: defaultName || `NK_Dashboard_${new Date().toISOString().slice(0, 10)}.png`,
        filters: [{ name: 'PNG Image (*.png)', extensions: ['png'] }]
      });
      
      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      console.error('Failed to save captured image:', err);
      return { success: false, error: err.message };
    }
  });

  // Daily Summary Report Table
  const dailyReportEngine = require('./daily-report-engine');
  ipcMain.handle('daily-report-get', async (_e, { yearMonth, forceSync } = {}) => {
    try {
      return await dailyReportEngine.getMonthTableData(yearMonth, forceSync);
    } catch (err) {
      console.error('Failed to get daily report:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('daily-report-export', async (_e, { yearMonth } = {}) => {
    try {
      const win = mainWindow ? mainWindow() : null;
      const path = require('path');
      const os = require('os');
      const defaultName = `ตารางสรุปรายวัน_${yearMonth || 'current'}.xlsx`;
      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        title: 'ส่งออกตารางสรุปรายวันเป็น Excel',
        defaultPath: path.join(os.homedir(), 'Downloads', defaultName),
        filters: [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }]
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      return await dailyReportEngine.exportToExcel(yearMonth, filePath);
    } catch (err) {
      console.error('Failed to export daily report:', err);
      return { ok: false, error: err.message };
    }
  });

  // Customer Retention & Cohort Segmentation
  const cohortEngine = require('./cohort-engine');
  ipcMain.handle('cohort-get-months', (_e, refDate) => cohortEngine.getCohortMonths(refDate));
  ipcMain.handle('cohort-fetch-data', (_e, options) => cohortEngine.fetchCohortData(options));
  ipcMain.handle('cohort-cancel-fetch', () => { cohortEngine.cancelCohortFetch(); return true; });
  ipcMain.handle('cohort-get-state', () => cohortEngine.getCohortState());
  ipcMain.handle('cohort-export-excel', async (_e, { savePath, options } = {}) => {
    try {
      const win = mainWindow ? mainWindow() : null;
      let targetPath = savePath;
      if (!targetPath) {
        const path = require('path');
        const os = require('os');
        const d = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        const defaultName = `NK_กลุ่มลูกค้า_Retention_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.xlsx`;
        const { filePath, canceled } = await dialog.showSaveDialog(win, {
          title: 'ส่งออกรายงานกลุ่มลูกค้าเป็น Excel',
          defaultPath: path.join(os.homedir(), 'Downloads', defaultName),
          filters: [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }]
        });
        if (canceled || !filePath) return { ok: false, canceled: true };
        targetPath = filePath;
      }
      return await cohortEngine.exportCohortExcel(targetPath, options);
    } catch (err) {
      console.error('Failed to export cohort Excel:', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
