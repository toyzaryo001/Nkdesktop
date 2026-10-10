'use strict';
const Store = require('electron-store');

const schema = {
  session: { type: 'object', default: {} },
  users: { type: 'array', default: [] },
  masterEnabled: { type: 'boolean', default: true },
  darkMode: { type: 'boolean', default: false },
  // API
  apiSession: { type: 'object', default: null, nullable: true },
  apiBusinessContext: { type: 'object', default: null, nullable: true },
  apiQueryProfiles: { type: 'object', default: {} },
  // Withdraw
  withdrawConfig: { type: 'object', default: { active: false, intervalSec: 15, maxAmount: 5000, autoApprove: false } },
  withdrawState: { type: 'object', default: { status: 'stopped' } },
  withdrawAlerts: { type: 'array', default: [] },
  withdrawSeen: { type: 'array', default: [] },
  withdrawApprovalLedger: { type: 'object', default: {} },
  withdrawApprovalLog: { type: 'array', default: [] },
  withdrawCrsBankCache: { type: 'object', default: null, nullable: true },
  // Member
  memberState: { type: 'object', default: { status: 'idle' } },
  memberRequest: { type: 'object', default: {} },
  resetMemberState: { type: 'object', default: { status: 'idle' } },
  pointsHistoryState: { type: 'object', default: { status: 'idle' } },
  // Deposit
  depositState: { type: 'object', default: { status: 'idle' } },
  depositConfig: { type: 'object', default: {} },
  // Reward/Bonus
  rewardState: { type: 'object', default: { status: 'idle' } },
  rewardConfig: { type: 'object', default: {} },
  rewardData: { type: 'object', default: null, nullable: true },
  // Analyzer
  analyzerConfig: { type: 'object', default: { enabled: false, globalObserverEnabled: true, captureBodies: true, maxBodyChars: 120000 } },
  analyzerEndpoints: { type: 'object', default: {} },
  analyzerHistory: { type: 'array', default: [] },
  analyzerMeta: { type: 'object', default: { totalRequests: 0, endpointCount: 0 } },
  manualApproveCapture: { type: 'object', default: { status: 'idle' } },
  globalObserverState: { type: 'object', default: { status: 'stopped', enabled: false } },
  floatingPos: { type: 'object', default: { side: 'right', yRatio: 0.88 } },
  routeCache: { type: 'object', default: {} },
  tempCredentials: { type: 'object', default: null, nullable: true },
  swiftpayPortalBalance: {
    type: 'object',
    default: {
      total: 35801.54,
      available: 35801.54,
      pending: 0,
      held: 0,
      merchantName: '',
      updatedAt: null
    }
  },
  swiftpayPortalUrl: {
    type: 'string',
    default: 'https://userswiftpay.kcta.app/#/dashboard/workbench'
  },
  agentPortalUrl: {
    type: 'string',
    default: 'https://ag.ismgaming6.com/'
  },
  settings: {
    type: 'object',
    default: {
      notifyDeposit: true,
      notifyWithdraw: true,
      notifyMemberEdit: true,
      notifyManual: true,
      notifyBonus: true,
      soundEnabled: true,
      osNotification: true,
      targetWebsiteId: null,
      targetWebsiteName: '',
      backofficeUrl: '',
      observerInterval: 15
    }
  },
  dailyReportCache: {
    type: 'object',
    default: {}
  },
  cohortState: {
    type: 'object',
    default: { status: 'idle' }
  }
};

let _store = null;

function init() {
  _store = new Store({ schema, name: 'nk-helper-data', clearInvalidConfig: true });
  return _store;
}

function get(key, defaultVal) {
  if (!_store) throw new Error('Store not initialized');
  return _store.get(key, defaultVal);
}

function set(key, value) {
  if (!_store) throw new Error('Store not initialized');
  return _store.set(key, value);
}

function del(key) {
  if (!_store) throw new Error('Store not initialized');
  return _store.delete(key);
}

function has(key) {
  if (!_store) throw new Error('Store not initialized');
  return _store.has(key);
}

function getAll() {
  if (!_store) return {};
  return _store.store;
}

function clear() {
  if (!_store) throw new Error('Store not initialized');
  return _store.clear();
}

module.exports = { init, get, set, delete: del, has, getAll, clear };
