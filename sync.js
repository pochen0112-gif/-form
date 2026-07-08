const WORKER_URL = "https://aged-wave-21ae.pochen0112.workers.dev/";


/**
 * =========================
 * 网页 → Worker
 * 保存数据到飞书
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


    console.log(
      "✅ Worker返回:",
      text
    );


    return text;


  } catch (err) {


    console.error(
      "❌ 发送失败:",
      err
    );


  }

}





/**
 * =========================
 * 自动监听 localStorage变化
 * 本地 → 飞书
 * =========================
 */
(function(){


  const originalSetItem =
    localStorage.setItem;



  localStorage.setItem =
  function(key,value){


    originalSetItem.apply(
      this,
      arguments
    );


    try{


      const snapshot={};



      for(
        let i=0;
        i<localStorage.length;
        i++
      ){

        const k =
        localStorage.key(i);


        snapshot[k] =
        localStorage.getItem(k);


      }



      sendToWorker({

        type:"storage_update",

        data:snapshot,

        timestamp:
        new Date().toISOString(),


        source:
        "github-pages"


      });



    }catch(e){


      console.error(
        "sync error:",
        e
      );


    }


  };


})();








/**
 * =========================
 * 飞书 → localStorage
 * =========================
 */
async function syncFromFeishu(){


  try{


    const res =
    await fetch(WORKER_URL);



    const json =
    await res.json();



    console.log(
      "📥 飞书数据:",
      json
    );



    if(
      !json.ok ||
      !json.data ||
      !json.data.items
    ){

      return;

    }




    const records =
    json.data.items;



    if(
      records.length===0
    ){

      return;

    }




    // 获取最新一条数据

    const latest =
    records[
      records.length-1
    ];



    const payload =
    latest.data;



    console.log(
      "📥 飞书同步:",
      payload
    );



    if(
      payload.type !==
      "storage_update"
    ){

      return;

    }



    let needReload=false;



    Object.keys(payload.data || {})
    .forEach(key=>{


      const oldValue =
      localStorage.getItem(key);



      const newValue =
      payload.data[key];



      if(
        oldValue !== newValue
      ){

        localStorage.setItem(
          key,
          newValue
        );


        needReload=true;


        console.log(
          "✅ 更新:",
          key
        );

      }



    });




    /**
     * 如果数据变化
     * 刷新页面
     */
    if(needReload){


      console.log(
        "🔄 数据变化，刷新页面"
      );


      setTimeout(()=>{


        window.location.reload();


      },500);



    }



  }catch(e){


    console.error(
      "❌ 飞书同步失败:",
      e
    );


  }


}








/**
 * =========================
 * 页面启动同步一次
 * =========================
 */
syncFromFeishu();






/**
 * =========================
 * 每10秒检查一次
 * =========================
 */
setInterval(()=>{


  syncFromFeishu();


},10000);








/**
 * =========================
 * 测试发送
 * =========================
 */
async function testSend(){


  console.log(
    "🚀 testSend start"
  );



  const result =
  await sendToWorker({

    type:"test",

    data:{

      message:"hello",

      time:
      new Date().toISOString()

    }


  });



  console.log(
    "📦 testSend result:",
    result
  );


}
