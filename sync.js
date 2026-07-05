/***********************
 * 飞书配置（你已填好）
 ***********************/
const APP_TOKEN = "GytxwLLRBiVPEyk096EcfEm1neg";
const TABLE_ID = "tbl2SIu43stcfoae";
const APP_ID = "cli_aaa52804f9395cca";
const APP_SECRET = "y9XDi31WF1OVS1EscOQdDAIzi87AKCDk";

/***********************
 * 缓存控制（防重复写入）
 ***********************/
let lastPushHash = "";
let isSyncing = false;

/***********************
 * 获取飞书 token
 ***********************/
async function getToken() {
  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET
      })
    }
  );

  const data = await res.json();
  return data.tenant_access_token;
}

/***********************
 * PUSH：网页 → 飞书
 ***********************/
async function pushToFeishu(snapshot) {
  const hash = JSON.stringify(snapshot);

  // 防重复提交
  if (hash === lastPushHash) return;
  lastPushHash = hash;

  const token = await getToken();

  await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          data: JSON.stringify(snapshot),
          time: new Date().toISOString()
        }
      })
    }
  );
}

/***********************
 * PULL：飞书 → 网页
 ***********************/
async function pullFromFeishu() {
  const token = await getToken();

  const res = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=50`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const json = await res.json();
  return json?.data?.items || [];
}

/***********************
 * 同步到前端UI（你可自定义）
 ***********************/
async function syncFromCloud() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const records = await pullFromFeishu();

    // 暴露给页面使用
    window.FEISHU_DATA = records;

    // 你可以在这里接你的UI渲染
    console.log("📦 飞书数据更新：", records);
  } catch (err) {
    console.log("pull error:", err);
  }

  isSyncing = false;
}

/***********************
 * 监听 localStorage（网页 → 飞书）
 ***********************/
(function () {
  const originalSetItem = localStorage.setItem;

  localStorage.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);

    try {
      const snapshot = {};

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        snapshot[k] = localStorage.getItem(k);
      }

      pushToFeishu(snapshot);
    } catch (e) {
      console.log("sync error:", e);
    }
  };
})();

/***********************
 * 定时同步（飞书 → 网页）
 ***********************/
setInterval(syncFromCloud, 5000);

// 首次加载
syncFromCloud();
