self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let data={};try{data=event.data?event.data.json():{}}catch(e){data={body:event.data?.text()||"변경사항이 있습니다."}}
  const title=data.title||"강신나 자금관리";
  const options={body:data.body||"변경사항이 있습니다.",icon:"/icon-192.png",badge:"/icon-192.png",tag:`ksn-${data.team||"all"}-${Date.now()}`,data:{url:data.url||"/"},renotify:false};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();const url=new URL(event.notification.data?.url||"/",self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const c of list){if(c.url.startsWith(self.location.origin)){c.focus();if("navigate" in c)c.navigate(url);return}}return self.clients.openWindow(url)}));
});
