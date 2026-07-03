/**
 * ============================================
 * sync.js - 四川作战系统 数据同步脚本（全量版 v3）
 * 注入到 index.html 中，自动同步所有 localStorage 数据到 Google Sheets
 * ============================================
 *
 * 使用方式：在 index.html 的 </body> 前加一行：
 *   <script src="sync.js"></script>
 *
 * 工作原理：
 *   1. 首次打开页面 → 从云端拉数据 → 写入 localStorage → 刷新页面
 *   2. 刷新后 → React 读取到最新数据正常渲染 → 开始监听本地变化自动上传
 *   3. 手动点「同步」按钮 → 拉取云端 → 刷新页面
 */

// ==================== ⚠️ 必须配置 ====================

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwd6v93YS7ko3Gc-lK7HiKTqTzzPOB4Cr0Rf0UNsDXVWk_ZtD3ML2f-1tB8rXHpQJCv/exec';
// ↑ 部署 Apps Script 后把真实地址填到这里

// ==================== 配置结束 ====================

(function () {
  'use strict';

  if (window.__syncJsLoaded) return;
  window.__syncJsLoaded = true;

  var logPrefix = '[数据同步]';
  var syncTimer = null;
  var DEBOUNCE_MS = 800;
  var SYNC_RECORD_KEY = '_full_snapshot';
  var RELOAD_FLAG = '_sync_just_pulled'; // 标记：刚从云端拉取过，需要跳过本次拉取
  var isRestoring = false; // 正在恢复数据时，不触发上传

  function log(msg) { console.log(logPrefix, msg); }
  function warn(msg) { console.warn(logPrefix, msg); }

  // ---- 快照工具 ----

  function getSnapshot() {
    var snapshot = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('__') === 0) continue;
      if (key === 'debug' || key === 'loglevel') continue;
      if (key === RELOAD_FLAG) continue;
      try {
        var val = localStorage.getItem(key);
        try { snapshot[key] = JSON.parse(val); }
        catch (e) { snapshot[key] = val; }
      } catch (e) {}
    }
    return snapshot;
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    isRestoring = true; // 暂停自动上传
    var count = 0;
    for (var key in snapshot) {
      if (!snapshot.hasOwnProperty(key)) continue;
      if (key === 'key' || key === 'syncedAt' || key === 'source' || key === '_rowIndex') continue;
      try {
        var val = snapshot[key];
        localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
        count++;
      } catch (e) {
        warn('恢复 ' + key + ' 失败: ' + e.message);
      }
    }
    isRestoring = false;
    return count;
  }

  // ---- API 调用 ----

  function apiCall(action, params) {
    var url = WEB_APP_URL + '?action=' + action;

    if (action === 'write') {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params)
      }).then(function (res) { return res.json(); });
    } else {
      return fetch(url, { method: 'GET' })
        .then(function (res) { return res.json(); });
    }
  }

  // ---- 上传 ----

  function pushToCloud() {
    if (isRestoring) return Promise.resolve();

    var snapshot = getSnapshot();
    var keyCount = Object.keys(snapshot).length;
    if (keyCount === 0) return Promise.resolve();

    log('上传中: ' + keyCount + ' 个 key');

    return apiCall('write', {
      key: SYNC_RECORD_KEY,
      data: snapshot,
      syncedAt: new Date().toISOString(),
      source: window.location.origin
    }).then(function (res) {
      if (res && res.success) {
        log('✅ 已同步 ' + keyCount + ' 个 key');
        showSyncStatus('✅ 已同步到云端', 'success');
      } else {
        warn('❌ 同步失败: ' + (res && res.error ? res.error : '未知错误'));
        showSyncStatus('❌ 同步失败', 'error');
      }
      return res;
    }).catch(function (err) {
      warn('❌ 网络错误: ' + err.message);
      showSyncStatus('❌ 网络错误', 'error');
      return null;
    });
  }

  // ---- 下载 ----

  function pullFromCloud() {
    log('从云端拉取数据...');

    return apiCall('read').then(function (res) {
      if (!res || res.error) {
        warn('拉取失败: ' + (res && res.error ? res.error : '网络错误'));
        showSyncStatus('❌ 拉取失败: ' + (res && res.error ? res.error : '网络错误'), 'error');
        return null;
      }
      if (!res.records || res.records.length === 0) {
        log('云端暂无数据');
        showSyncStatus('ℹ️ 云端暂无数据', 'info');
        return null;
      }

      // 找到快照记录
      var snapshotRecord = null;
      for (var i = 0; i < res.records.length; i++) {
        if (res.records[i].key === SYNC_RECORD_KEY) {
          snapshotRecord = res.records[i];
          break;
        }
      }

      if (!snapshotRecord) {
        log('云端暂无快照');
        showSyncStatus('ℹ️ 云端暂无快照数据', 'info');
        return null;
      }

      // 解析快照
      var cloudSnapshot = snapshotRecord.data;
      if (typeof cloudSnapshot === 'string') {
        try { cloudSnapshot = JSON.parse(cloudSnapshot); }
        catch (e) { warn('云端数据解析失败'); return null; }
      }

      if (!cloudSnapshot || typeof cloudSnapshot !== 'object') {
        warn('云端数据格式异常');
        return null;
      }

      // 恢复到 localStorage
      var restoredCount = restoreSnapshot(cloudSnapshot);
      log('✅ 恢复 ' + restoredCount + ' 个 key');
      return { count: restoredCount, data: cloudSnapshot };

    }).catch(function (err) {
      warn('❌ 拉取异常: ' + err.message);
      showSyncStatus('❌ 拉取异常: ' + err.message, 'error');
      return null;
    });
  }

  // ---- 拦截 localStorage（用于自动上传）----

  var originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (isRestoring) return;
    if (key === RELOAD_FLAG) return;
    if (key.indexOf('__sync') === 0) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToCloud, DEBOUNCE_MS);
  };

  var originalRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key) {
    originalRemoveItem(key);
    if (isRestoring) return;
    if (key === RELOAD_FLAG) return;
    if (key.indexOf('__sync') === 0) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToCloud, DEBOUNCE_MS);
  };

  // ---- 初始化逻辑 ----

  function initSync() {
    if (!WEB_APP_URL || WEB_APP_URL.indexOf('YOUR_WEB_APP_ID') !== -1) {
      warn('⚠️ 请先配置 WEB_APP_URL！');
      showConfigHint();
      return;
    }

    // 检查是否刚从云端拉取过（避免刷新死循环）
    if (localStorage.getItem(RELOAD_FLAG) === '1') {
      localStorage.removeItem(RELOAD_FLAG);
      log('✅ 云端数据已就绪，启动自动同步');
      showSyncStatus('✅ 云端数据已加载，自动同步已开启', 'success');
      // 上传一次当前数据（合并本地+云端）
      setTimeout(pushToCloud, 2000);
      return;
    }

    // 首次访问：从云端拉取数据
    log('首次访问，拉取云端数据...');
    showLoadingOverlay('正在同步云端数据...');

    pullFromCloud().then(function (result) {
      if (result && result.count > 0) {
        // 有云端数据 → 写入 localStorage → 刷新页面让 React 重新读取
        log('云端数据已恢复，刷新页面...');
        localStorage.setItem(RELOAD_FLAG, '1');
        setTimeout(function () { location.reload(); }, 500);
      } else {
        // 云端无数据 → 正常启动，等待本地数据上传
        hideLoadingOverlay();
        log('云端无数据，等待本地数据上传');
        showSyncStatus('ℹ️ 云端暂无数据，填写后将自动上传', 'info');
        setTimeout(pushToCloud, 2000);
      }
    });
  }

  // ---- UI: 加载遮罩 ----

  function showLoadingOverlay(text) {
    var existing = document.getElementById('_sync_overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = '_sync_overlay';
    overlay.setAttribute('style', [
      'position: fixed',
      'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
      'z-index: 999999',
      'background: rgba(255,255,255,0.9)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'font-family: Microsoft YaHei UI, PingFang SC, sans-serif',
      'font-size: 16px',
      'color: #333'
    ].join(';'));
    overlay.innerHTML = '<div style="text-align:center">' +
      '<div style="font-size:32px;margin-bottom:12px">⏳</div>' +
      '<div>' + text + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function hideLoadingOverlay() {
    var overlay = document.getElementById('_sync_overlay');
    if (overlay) overlay.remove();
  }

  // ---- UI: 状态提示 ----

  var statusBar = null;
  var statusTimeout = null;

  function showSyncStatus(message, type) {
    if (statusBar && statusBar.parentNode) statusBar.remove();
    if (statusTimeout) clearTimeout(statusTimeout);

    statusBar = document.createElement('div');
    statusBar.setAttribute('style', [
      'position: fixed',
      'bottom: 12px',
      'right: 12px',
      'z-index: 99999',
      'padding: 8px 16px',
      'border-radius: 6px',
      'font-size: 12px',
      'font-family: Microsoft YaHei UI, PingFang SC, sans-serif',
      'color: #fff',
      'background:' + (
        type === 'success' ? '#16865b' :
        type === 'error' ? '#cf2534' :
        type === 'warning' ? '#c68100' : '#1769e0'
      ),
      'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
      'cursor: pointer',
      'max-width: 360px'
    ].join(';'));

    statusBar.textContent = message;
    statusBar.title = '点击关闭';
    statusBar.onclick = function () {
      if (statusBar && statusBar.parentNode) statusBar.remove();
    };
    document.body.appendChild(statusBar);

    statusTimeout = setTimeout(function () {
      if (statusBar && statusBar.parentNode) statusBar.remove();
    }, 5000);
  }

  function showConfigHint() {
    var hint = document.createElement('div');
    hint.setAttribute('style', [
      'position: fixed', 'top: 0', 'left: 0', 'right: 0',
      'z-index: 99999',
      'padding: 10px 20px',
      'background: #fff6dc',
      'border-bottom: 2px solid #c68100',
      'font-size: 13px',
      'font-family: Microsoft YaHei UI, PingFang SC, sans-serif',
      'color: #8a6d00',
      'text-align: center'
    ].join(';'));
    hint.innerHTML = '<strong>⚠️ 数据同步未配置</strong> — 请打开 sync.js 填入 Web App URL';
    document.body.appendChild(hint);
  }

  // ---- 手动同步按钮 ----

  function addSyncButton() {
    var btn = document.createElement('button');
    btn.textContent = '🔄 同步数据';
    btn.setAttribute('style', [
      'position: fixed',
      'bottom: 48px',
      'right: 12px',
      'z-index: 99998',
      'padding: 8px 14px',
      'border-radius: 6px',
      'font-size: 12px',
      'font-family: Microsoft YaHei UI, PingFang SC, sans-serif',
      'background: #1769e0',
      'color: #fff',
      'border: none',
      'cursor: pointer',
      'box-shadow: 0 2px 8px rgba(23,105,224,0.3)'
    ].join(';'));

    btn.onclick = function () {
      btn.textContent = '⏳ 同步中...';
      btn.disabled = true;
      showLoadingOverlay('正在从云端同步数据...');

      pullFromCloud().then(function (result) {
        if (result && result.count > 0) {
          // 有新数据 → 刷新页面
          localStorage.setItem(RELOAD_FLAG, '1');
          setTimeout(function () { location.reload(); }, 500);
        } else {
          // 无新数据 → 只上传本地
          hideLoadingOverlay();
          return pushToCloud().then(function () {
            btn.textContent = '🔄 同步数据';
            btn.disabled = false;
          });
        }
      });
    };

    document.body.appendChild(btn);
  }

  // ---- 启动 ----

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initSync();
      addSyncButton();
    }, { once: true });
  } else {
    initSync();
    addSyncButton();
  }

  // ---- 调试接口 ----

  window.__syncApi = {
    push: pushToCloud,
    pull: pullFromCloud,
    snapshot: getSnapshot,
    status: function () { return { url: WEB_APP_URL }; }
  };
})();
