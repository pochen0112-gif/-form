const WORKER_URL = "https://aged-wave-21ae.pochen0112.workers.dev/";


/**
 * =========================
 * 网页 → Worker → 飞书
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
      "❌ Worker发送失败:",
      err
    );


  }

}




/**
 * =========================
 * 监听 localStorage变化
 * 本地 → 飞书
 * =========================
 */
(function(){


  const oldSetItem =
    localStorage.setItem;


  localStorage.setItem =
  function(key,value){


    oldSetItem.apply(
      this,
      arguments
    );


    try{


      const snapshot = {};


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
        Date.now(),

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





    /**
     * 找 syncTime 最大的数据
     */

    let latest =
    records[0];


    records.forEach(item=>{


      if(
        (item.data?.syncTime || 0)
        >
        (latest.data?.syncTime || 0)
      ){

        latest=item;

      }


    });





    const payload =
    latest.data;



    console.log(
      "📥 飞书同步:",
      payload
    );





    /**
     * 兼容当前格式:
     *
     * {
     * key:"",
     * value:""
     * }
     */

    if(
      payload.key &&
      payload.value !== undefined
    ){



      const oldValue =
      localStorage.getItem(
        payload.key
      );



      if(
        oldValue !== payload.value
      ){


        localStorage.setItem(
          payload.key,
          payload.value
        );



        console.log(
          "✅ 更新localStorage:",
          payload.key
        );



        /**
         * 给React重新加载机会
         */

        setTimeout(()=>{


          console.log(
            "🔄 数据更新，刷新页面"
          );


          window.location.reload();



        },800);



      }
      else{


        console.log(
          "ℹ️ 数据无变化"
        );


      }



      return;

    }







    /**
     * 兼容旧格式:
     *
     * {
     * type:"storage_update",
     * data:{}
     * }
     */

    if(
      payload.type==="storage_update" &&
      payload.data
    ){


      let changed=false;



      Object.keys(payload.data)
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


          changed=true;


        }


      });




      if(changed){


        setTimeout(()=>{


          window.location.reload();


        },800);


      }



    }



  }catch(err){


    console.error(
      "❌ 飞书同步失败:",
      err
    );


  }


}







/**
 * =========================
 * 页面打开同步
 * =========================
 */

syncFromFeishu();






/**
 * =========================
 * 每10秒同步
 * =========================
 */

setInterval(()=>{


  syncFromFeishu();


},10000);







/**
 * =========================
 * 测试函数
 * =========================
 */

async function testSend(){


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
    "📦 testSend:",
    result
  );


}
