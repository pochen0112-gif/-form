const WORKER_URL =
"https://aged-wave-21ae.pochen0112.workers.dev/";



/**
 * =================================
 * 网页 → Worker → 飞书
 * =================================
 */

async function sendToWorker(payload){

  try{

    const res =
    await fetch(
      WORKER_URL,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:
        JSON.stringify(payload)
      }
    );


    const text =
    await res.text();


    console.log(
      "✅ Worker返回:",
      text
    );


    return text;


  }catch(err){

    console.error(
      "❌ Worker错误:",
      err
    );

  }

}





/**
 * =================================
 * 监听 localStorage变化
 * 本地填写 → 同步飞书
 * =================================
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


    const snapshot={};



    for(
      let i=0;
      i<localStorage.length;
      i++
    ){

      const k =
      localStorage.key(i);


      snapshot[k]=
      localStorage.getItem(k);

    }



    sendToWorker({

      type:
      "storage_update",


      data:
      snapshot,


      syncTime:
      Date.now(),


      source:
      "github-pages"


    });



  }catch(e){


    console.error(
      "同步异常:",
      e
    );


  }


};



})();







/**
 * =================================
 * 飞书 → localStorage
 * =================================
 */

async function syncFromFeishu(){


try{


const res =
await fetch(
  WORKER_URL
);



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
 * 遍历全部飞书记录
 */

let changed=false;



records.forEach(item=>{



 const data =
 item.data;



 if(
   !data
 ){

   return;

 }



 /**
  * 当前格式
  *
  * {
  * key:"",
  * value:"",
  * syncTime:""
  * }
  */


 if(
   data.key &&
   data.value !== undefined
 ){


   const oldValue =
   localStorage.getItem(
      data.key
   );



   if(
     oldValue !== data.value
   ){


      localStorage.setItem(
        data.key,
        data.value
      );


      console.log(
        "✅ 飞书更新:",
        data.key
      );


      changed=true;


   }



 }




});





/**
 * 数据更新
 * 通知React
 */

if(changed){


 console.log(
 "🔄 数据发生变化"
 );



 window.dispatchEvent(
   new Event("storage")
 );



 /**
  * 首次同步自动刷新
  */

 if(
   !sessionStorage.getItem(
    "feishu_sync_refresh"
   )
 ){


   sessionStorage.setItem(
     "feishu_sync_refresh",
     "1"
   );



   setTimeout(()=>{


     console.log(
     "🔄 自动刷新页面"
     );


     location.reload();


   },800);



 }



}else{


 console.log(
 "ℹ️ 数据无变化"
 );


}





}catch(err){


console.error(
"❌ 飞书同步失败:",
err
);


}



}








/**
 * =================================
 * 页面启动同步
 * =================================
 */

syncFromFeishu();







/**
 * =================================
 * 定时同步
 * 每10秒检查一次
 * =================================
 */

setInterval(()=>{


 syncFromFeishu();


},10000);







/**
 * =================================
 * 测试接口
 * =================================
 */

async function testSend(){


const result =
await sendToWorker({

 type:"test",

 data:{

  message:
  "hello",

  time:
  new Date()
  .toISOString()

 }

});



console.log(
"📦测试结果:",
result
);


}
