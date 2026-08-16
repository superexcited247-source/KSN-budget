const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = String(process.env.APP_PASSWORD || '9899');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PUSH_FILE = path.join(DATA_DIR, 'push-subscriptions.json');
const VAPID_FILE = path.join(DATA_DIR, 'push-vapid.json');
const sessions = new Map();
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function seedState(){return {
  accounts:{'강신나':0,'허슬':0,'엘리븐':0,'로아미':0},
  budgets:{'허슬':{approved:0,unused:0,extra:0},'엘리븐':{approved:0,unused:0,extra:0},'로아미':{approved:0,unused:0,extra:0}},
  weeklyBudgets:{},budgetRequests:[],calendarNotes:{},weekStandard:'sunday',
  sales:[],expenses:[],plans:[],recurringExpenses:[],fixedCosts:[],debts:[],
  notifications:{'강신나':[],'허슬':[],'엘리븐':[],'로아미':[]}
};}
function ensureDirs(){fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(BACKUP_DIR,{recursive:true});}
function atomicJsonWrite(file,obj){ensureDirs();const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2),'utf8');fs.renameSync(tmp,file);}
function loadPushSubscriptions(){ensureDirs();try{if(!fs.existsSync(PUSH_FILE))return [];const x=JSON.parse(fs.readFileSync(PUSH_FILE,'utf8'));return Array.isArray(x)?x:[]}catch(e){console.error('push subscription load failed',e);return []}}
function savePushSubscriptions(){try{atomicJsonWrite(PUSH_FILE,pushSubscriptions)}catch(e){console.error('push subscription save failed',e)}}
function loadVapid(){
  ensureDirs();
  const envPublic=String(process.env.VAPID_PUBLIC_KEY||'').trim(),envPrivate=String(process.env.VAPID_PRIVATE_KEY||'').trim();
  if(envPublic&&envPrivate)return {publicKey:envPublic,privateKey:envPrivate,subject:String(process.env.VAPID_SUBJECT||'mailto:admin@example.com')};
  try{if(fs.existsSync(VAPID_FILE)){const x=JSON.parse(fs.readFileSync(VAPID_FILE,'utf8'));if(x.publicKey&&x.privateKey)return x}}catch(e){console.error('vapid load failed',e)}
  const keys=webpush.generateVAPIDKeys();const x={...keys,subject:String(process.env.VAPID_SUBJECT||'mailto:admin@example.com')};atomicJsonWrite(VAPID_FILE,x);return x;
}
function validTeam(team){return ['강신나','허슬','엘리븐','로아미'].includes(team)}
function newNotifications(prevState,nextState){
  const out=[];
  for(const team of ['강신나','허슬','엘리븐','로아미']){
    const before=Array.isArray(prevState?.notifications?.[team])?prevState.notifications[team]:[];
    const after=Array.isArray(nextState?.notifications?.[team])?nextState.notifications[team]:[];
    const added=Math.max(0,after.length-before.length);
    after.slice(0,added).reverse().forEach(n=>out.push({team,title:String(n?.title||'강신나 자금관리'),text:String(n?.text||'변경사항이 있습니다.')}));
  }
  return out;
}
async function sendTeamPush(item){
  if(!item||!validTeam(item.team)||!pushSubscriptions.length)return;
  const targets=pushSubscriptions.filter(x=>x.team===item.team&&x.subscription?.endpoint);
  const stale=new Set();
  await Promise.allSettled(targets.map(async x=>{
    try{await webpush.sendNotification(x.subscription,JSON.stringify({title:item.title,body:item.text,team:item.team,url:'/'}),{TTL:3600})}
    catch(e){if(e?.statusCode===404||e?.statusCode===410)stale.add(x.subscription.endpoint);else console.error('push send failed',e?.statusCode||e?.message||e)}
  }));
  if(stale.size){pushSubscriptions=pushSubscriptions.filter(x=>!stale.has(x.subscription?.endpoint));savePushSubscriptions()}
}
function contentType(file){if(file.endsWith('.webmanifest'))return 'application/manifest+json; charset=utf-8';if(file.endsWith('.js'))return 'application/javascript; charset=utf-8';if(file.endsWith('.png'))return 'image/png';if(file.endsWith('.html'))return 'text/html; charset=utf-8';return 'application/octet-stream'}
function servePublicFile(res,name){try{const file=path.join(PUBLIC_DIR,name);const buf=fs.readFileSync(file);res.writeHead(200,{'Content-Type':contentType(name),'Cache-Control':name==='sw.js'?'no-cache':'public, max-age=3600'});res.end(buf)}catch(e){text(res,404,'Not found')}}
function loadStore(){
  ensureDirs();
  if(!fs.existsSync(STATE_FILE)){const init={version:0,state:seedState()};atomicWrite(init);return init;}
  try{const x=JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));return {version:Number(x.version)||0,state:x.state||seedState()};}
  catch(e){const bad=STATE_FILE+'.corrupt-'+Date.now();try{fs.copyFileSync(STATE_FILE,bad)}catch(_){}const init={version:0,state:seedState()};atomicWrite(init);return init;}
}
function atomicWrite(obj){ensureDirs();const tmp=STATE_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2),'utf8');fs.renameSync(tmp,STATE_FILE);}
function backup(store){
  try{
    const file=path.join(BACKUP_DIR,`state-v${store.version}-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(store,null,2),'utf8');
    const files=fs.readdirSync(BACKUP_DIR).filter(x=>x.endsWith('.json')).sort((a,b)=>fs.statSync(path.join(BACKUP_DIR,b)).mtimeMs-fs.statSync(path.join(BACKUP_DIR,a)).mtimeMs);
    files.slice(50).forEach(f=>fs.unlinkSync(path.join(BACKUP_DIR,f)));
  }catch(e){console.error('backup failed',e);}
}
let store=loadStore();
let pushSubscriptions=loadPushSubscriptions();
const vapid=loadVapid();
webpush.setVapidDetails(vapid.subject||'mailto:admin@example.com',vapid.publicKey,vapid.privateKey);
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function authenticated(req){const sid=cookies(req).sid;if(!sid)return false;const exp=sessions.get(sid);if(!exp||exp<Date.now()){sessions.delete(sid);return false;}sessions.set(sid,Date.now()+SESSION_MS);return true;}
function json(res,status,obj,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(obj));}
function text(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);}
function readBody(req,limit=5*1024*1024){return new Promise((resolve,reject)=>{let s='',n=0;req.on('data',c=>{n+=c.length;if(n>limit){reject(new Error('too large'));req.destroy();return;}s+=c});req.on('end',()=>resolve(s));req.on('error',reject)});}
function serveIndex(res){try{text(res,200,fs.readFileSync(path.join(PUBLIC_DIR,'index.html'),'utf8'),'text/html; charset=utf-8')}catch(e){text(res,500,'index missing')}}

const server=http.createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET' && (url.pathname==='/'||url.pathname==='/index.html')) return serveIndex(res);
    if(req.method==='GET' && url.pathname==='/manifest.webmanifest') return servePublicFile(res,'manifest.webmanifest');
    if(req.method==='GET' && url.pathname==='/sw.js') return servePublicFile(res,'sw.js');
    if(req.method==='GET' && url.pathname==='/icon-192.png') return servePublicFile(res,'icon-192.png');
    if(req.method==='GET' && url.pathname==='/icon-512.png') return servePublicFile(res,'icon-512.png');
    if(req.method==='GET' && url.pathname==='/health') return json(res,200,{ok:true,version:store.version});
    if(req.method==='GET' && url.pathname==='/api/session') return json(res,200,{authenticated:authenticated(req)});
    if(req.method==='POST' && url.pathname==='/api/login'){
      const body=JSON.parse((await readBody(req))||'{}');
      const a=Buffer.from(String(body.password||''));const b=Buffer.from(APP_PASSWORD);
      const ok=a.length===b.length && crypto.timingSafeEqual(a,b);
      if(!ok)return json(res,401,{ok:false});
      const sid=crypto.randomBytes(24).toString('hex');sessions.set(sid,Date.now()+SESSION_MS);
      return json(res,200,{ok:true},{'Set-Cookie':`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS/1000)}`});
    }
    if(req.method==='POST' && url.pathname==='/api/logout'){
      const sid=cookies(req).sid;if(sid)sessions.delete(sid);
      return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
    }
    if(url.pathname.startsWith('/api/') && !authenticated(req)) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET' && url.pathname==='/api/push/config') return json(res,200,{enabled:!!vapid.publicKey,publicKey:vapid.publicKey});
    if(req.method==='POST' && url.pathname==='/api/push/subscribe'){
      const body=JSON.parse((await readBody(req))||'{}'),sub=body.subscription,team=String(body.team||'');
      if(!validTeam(team)||!sub?.endpoint)return json(res,400,{error:'invalid_subscription'});
      const item={team,subscription:sub,updatedAt:new Date().toISOString()};
      const idx=pushSubscriptions.findIndex(x=>x.subscription?.endpoint===sub.endpoint);if(idx>=0)pushSubscriptions[idx]=item;else pushSubscriptions.push(item);savePushSubscriptions();return json(res,200,{ok:true});
    }
    if(req.method==='POST' && url.pathname==='/api/push/unsubscribe'){
      const body=JSON.parse((await readBody(req))||'{}'),endpoint=String(body.endpoint||'');
      pushSubscriptions=pushSubscriptions.filter(x=>x.subscription?.endpoint!==endpoint);savePushSubscriptions();return json(res,200,{ok:true});
    }
    if(req.method==='GET' && url.pathname==='/api/state') return json(res,200,store);
    if(req.method==='PUT' && url.pathname==='/api/state'){
      const body=JSON.parse((await readBody(req))||'{}');
      if(Number(body.version)!==store.version)return json(res,409,store);
      if(!body.state||typeof body.state!=='object')return json(res,400,{error:'invalid state'});
      const prevState=store.state;const pushes=newNotifications(prevState,body.state);backup(store);store={version:store.version+1,state:body.state};atomicWrite(store);if(pushes.length)Promise.allSettled(pushes.map(sendTeamPush)).catch(()=>{});return json(res,200,{ok:true,version:store.version});
    }
    return text(res,404,'Not found');
  }catch(e){console.error(e);return json(res,500,{error:'server_error'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`강신나 자금관리 running on :${PORT}`));
