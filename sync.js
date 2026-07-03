/**
 * ============================================
 * sync.js - 四川作战系统 数据同步脚本（全量版）
 * 注入到 index.html 中，自动同步所有 localStorage 数据到 Google Sheets
 * ============================================
 *
 * 使用方式：在 index.html 的 </body> 前加一行：
 *   <script src="sync.js"></script>
 */

// ==================== ⚠️ 必须配置 ====================

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwd6v93YS7ko3Gc-lK7HiKTqTzzPOB4Cr0Rf0UNsDXVWk_ZtD3ML2f-1tB8rXHpQJCv/exec';
// ↑ 部署 Apps Script 后把真实地址填到这里

// ==================== 配置结束 ====================

(function () {
  'use strict';

  // 防止重复加载
  if (window.__syncJsLoaded) return;
  window.__syncJsLoaded = true;

  var logPrefix = '[数据同步]';
  var syncTimer = null;
  var DEBOUNCE_MS = 500; // 500ms 防抖，减少频繁请求
  var SYNC_RECORD_KEY = '_full_snapshot'; // 云端存储用的记录 key

  // ---- 工具 ----

  function log(msg) { console.log(logPrefix, msg); }
  function warn(msg) { console.warn(logPrefix, msg); }

  // 获取所有 localStorage 数据的快照（排除浏览器自身/扩展的 key）
  function getSnapshot() {
    var snapshot = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      // 跳过浏览器扩展和框架自带的 key
      if (key.indexOf('__') === 0) continue;  // 跳过 __ 开头的
      if (key === 'debug' || key === 'loglevel') continue;
      try {
        var val = localStorage.getItem(key);
        // 尝试解析 JSON
        try { snapshot[key] = JSON.parse(val); }
        catch (e) { snapshot[key] = val; }
      } catch (e) {
        warn('读取 ' + key + ' 失败: ' + e.message);
      }
    }
    return snapshot;
  }

  // 把云端快照写回 localStorage
  function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
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
    return count;
  }

  // ---- API 调用 ----

  function apiCall(action, params) {
    var url = WEB_APP_URL + '?action=' + action + '&origin=' + encodeURIComponent(window.location.origin);

    if (action === 'write') {
      return fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      }).then(function (res) { return res.json(); });
    } else {
      return fetch(url, { method: 'GET', mode: 'cors' })
        .then(function (res) { return res.json(); });
    }
  }

  // ---- 上传（全量快照 → 云端）----

  function pushToCloud() {
    var snapshot = getSnapshot();
    var keyCount = Object.keys(snapshot).length;
    if (keyCount === 0) return Promise.resolve();

    log('上传中: 全量快照（' + keyCount + ' 个 key）');

    return apiCall('write', {
      key: SYNC_RECORD_KEY,
      data: snapshot,
      syncedAt: new Date().toISOString(),
      source: window.location.origin
    }).then(function (res) {
      if (res.success) {
        log('✅ 已同步云端，' + keyCount + ' 个 key');
        showSyncStatus('✅ 数据已同步到云端', 'success');
      } else {
        warn('❌ 同步失败: ' + (res.error || '未知错误'));
        showSyncStatus('❌ 同步失败，请检查网络', 'error');
      }
      return res;
    }).catch(function (err) {
      warn('❌ 网络错误: ' + err.message);
      showSyncStatus('❌ 网络错误: ' + err.message, 'error');
      return null;
    });
  }

  // ---- 下载（云端 → 本地）----

  function pullFromCloud() {
    log('正在从云端拉取最新数据...');

    return apiCall('read').then(function (res) {
      if (!res || res.error) {
        warn('拉取失败: ' + (res && res.error ? res.error : '网络错误'));
        return null;
      }
      if (!res.records || res.records.length === 0) {
        log('云端暂无数据');
        return null;
      }

      // 找到我们的快照记录
      var snapshotRecord = null;
      for (var i = 0; i < res.records.length; i++) {
        if (res.records[i].key === SYNC_RECORD_KEY) {
          snapshotRecord = res.records[i];
          break;
        }
      }

      if (!snapshotRecord) {
        log('云端暂无快照数据');
        return null;
      }

      // 解析快照
      var cloudSnapshot = typeof snapshotRecord.data === 'string'
        ? JSON.parse(snapshotRecord.data)
        : snapshotRecord.data;

      if (!cloudSnapshot || typeof cloudSnapshot !== 'object') {
        warn('云端数据格式异常');
        return null;
      }

      // 比较时间戳：云端新还是本地新？
      var cloudTime = cloudSnapshot.syncedAt || '';
      var localSnapshot = getSnapshot();
      var localTime = localSnapshot._sync_timestamp || '';

      // 把云端数据写回 localStorage
      var restoredCount = restoreSnapshot(cloudSnapshot);
      localStorage.setItem('_sync_timestamp', new Date().toISOString());

      log('✅ 拉取完成，恢复 ' + restoredCount + ' 个 key');

      // 触发页面刷新
      dispatchStorageEvent();

      showSyncStatus('✅ 云端数据已加载（' + restoredCount + ' 个字段）', 'success');
      return cloudSnapshot;
    }).catch(function (err) {
      warn('拉取失败: ' + err.message);
      showSyncStatus('❌ 拉取失败: ' + err.message, 'error');
      return null;
    });
  }

  // ---- 触发页面更新 ----

  function dispatchStorageEvent() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: key,
          newValue: localStorage.getItem(key),
          oldValue: null,
          url: location.href
        }));
      } catch (e) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('__sync_data_updated__', {
        detail: { timestamp: Date.now(), source: 'cloud-pull' }
      }));
    } catch (e) {}
  }

  // ---- 拦截 localStorage.setItem ----

  var originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);

    // 所有 key 都触发同步（排除同步本身的时间戳防止死循环）
    if (key !== '_sync_timestamp' && key.indexOf('__sync') !== 0) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(pushToCloud, DEBOUNCE_MS);
    }
  };

  // ---- 拦截 localStorage.removeItem ----

  var originalRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key) {
    originalRemoveItem(key);
    if (key !== '_sync_timestamp' && key.indexOf('__sync') !== 0) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(pushToCloud, DEBOUNCE_MS);
    }
  };

  // ---- 初始化 ----

  function initSync() {
    if (!WEB_APP_URL || WEB_APP_URL.indexOf('YOUR_WEB_APP_ID') !== -1) {
      warn('⚠️ 请先配置 WEB_APP_URL！当前为占位值，无法同步。');
      showConfigHint();
      return;
    }

    log('初始化全量数据同步...');

    // 先拉云端再推本地（云端数据优先）
    pullFromCloud().then(function () {
      pushToCloud();
    });
  }

  // ---- UI ----

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
      'cursor: 'pointer',
      'transition: opacity 0.3s',
      'max-width: 360px',
      'opacity: 1'
    ].join(';'));

    statusBar.textContent = message;
    statusBar.title = '点击关闭';
    statusBar.onclick = function () {
      statusBar.style.opacity = '0';
      statusTimeout = setTimeout(function () { if (statusBar && statusBar.parentNode) statusBar.remove(); }, 300);
    };

    document.body.appendChild(statusBar);

    statusTimeout = setTimeout(function () {
      if (statusBar && statusBar.parentNode) {
        statusBar.style.opacity = '0';
        setTimeout(function () { if (statusBar && statusBar.parentNode) statusBar.remove(); }, 300);
      }
    }, 5000);
  }

  function showConfigHint() {
    var hint = document.createElement('div');
    hint.setAttribute('style', [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 99999',
      'padding: 10px 20px',
      'background: #fff6dc',
      'border-bottom: 2px solid #c68100',
      'font-size: 13px',
      'font-family: Microsoft YaHei UI, PingFang SC, sans-serif',
      'color: #8a6d00',
      'text-align: center'
    ].join(';'));
    hint.innerHTML = '<strong>⚠️ 数据同步未配置</strong> — 请打开 sync.js 填入你的 Web App URL。<button onclick="this.parentElement.remove()" style="margin-left:12px;cursor:pointer;background:#c68100;color:#fff;border:none;padding:2px 10px;border-radius:3px;font-size:12px;">知道了</button>';
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
      pullFromCloud().then(function () {
        return pushToCloud();
      }).then(function () {
        btn.textContent = '🔄 同步数据';
        btn.disabled = false;
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

  // ---- 调试 ----

  window.__syncApi = {
    push: pushToCloud,
    pull: pullFromCloud,
    snapshot: getSnapshot,
    status: function () { return { url: WEB_APP_URL }; },
    setUrl: function (url) { WEB_APP_URL = url; log('URL 已更新'); }
  };
})();
