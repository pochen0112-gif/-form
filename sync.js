
const WORKER_URL = "https://aged-wave-21ae.pochen0112.workers.dev/";

/**
 * =========================
 * 统一发送入口（网页 → Worker）
 * =========================
 */
async function sendToWorker(payload) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    console.log("✅ Worker返回：", text);

    return text;
  } catch (err) {
    console.error("❌ 发送失败：", err);
  }
}

/**
 * =========================
 * 自动监听 localStorage（核心同步逻辑）
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

      sendToWorker({
        type: "storage_update",
        data: snapshot,
        timestamp: new Date().toISOString(),
        source: "github-pages"
      });

    } catch (e) {
      console.error("sync error:", e);
    }
  };
})();

/**
 * =========================
 * 手动测试函数（用于验证链路）
 * =========================
 */
async function testSend() {
  console.log("🚀 testSend start");

  const result = await sendToWorker({
    type: "test",
    data: {
      message: "hello",
      time: new Date().toISOString()
    }
  });

  console.log("📦 testSend result:", result);
}
