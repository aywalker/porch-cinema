const fs=require('fs'),assert=require('assert/strict'),{EventEmitter}=require('events');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
class Signal { handlers=new Set();subscribe(fn){this.handlers.add(fn);return {unsubscribe:()=>this.handlers.delete(fn)}} emit(x){for(const f of [...this.handlers])f(x)}}
const motion=new Signal(),terminal=new EventEmitter(),logs=[];let concurrent=0,maxConcurrent=0,plays=0,active,playbackMs=5;
const camera={async subscribeToDingEvents(){},name:'Front Door',onNewNotification:motion,async startLiveCall(){concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);let ended=false;const s={onAudioRtp:new Signal(),onCallEnded:new Signal(),activateCameraSpeaker(){},async transcodeReturnAudio(){plays++;setTimeout(()=>s.stop(),playbackMs)},stop(){if(!ended){ended=true;concurrent--;s.onCallEnded.emit()}}};setTimeout(()=>s.onAudioRtp.emit({}),2);active=s;return s;}};
class FakeRing {onRefreshTokenUpdated=new Signal();async getCameras(){return [camera]}disconnect(){}}
let code=fs.readFileSync(require('path').join(__dirname,'..','listener','motion-runner.mjs'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(require('url').pathToFileURL(require('path').join(__dirname,'..','listener','motion-runner.mjs')).href));
const read=(path,encoding)=>path.endsWith('.ring-token')?'a'.repeat(120):path.endsWith('clips.json')?JSON.stringify(JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','listener','clips.example.json'),'utf8')).map(c=>({...c,spokenSeconds:0.001}))):fs.readFileSync(path,encoding);
const proc={env:{NAPOLEON_TRIGGER_MODE: "motion-priority"},stdin:{},stdout:{},on(){},exit(code){throw Error('Unexpected exit '+code)}};
const fn=new AsyncFunction('readFileSync','writeFileSync','renameSync','existsSync','appendFileSync','dirname','join','resolve','fileURLToPath','execFileSync','spawn','createInterface','RingApi','PushNotificationAction','setFfmpegPath','useLogger','process','console','setTimeout','clearTimeout','selectConversation','prepareConversation',code);
(async()=>{
 const {selectConversation}=await import('../listener/conversation.mjs');
 let preparedCount=0,cleaned=0;
 const prepare=(selected)=>{preparedCount=selected.length;return {clip:{id:'conversation',label:'three clips',file:'/tmp/mock-conversation.wav',seconds:0.001,spokenSeconds:0.001},cleanup(){cleaned++;}}};
 await fn(read,()=>{},()=>{},()=>true,()=>{},require('path').dirname,require('path').join,require('path').resolve,require('url').fileURLToPath,()=>'/usr/bin/ffmpeg',()=>{},()=>terminal,FakeRing,{Motion:'motion',Ding:'ding'},()=>{},()=>{},proc,{log:s=>logs.push(s)},(fn,ms)=>setTimeout(fn,Math.min(ms,40)),clearTimeout,selectConversation,prepare);
 const event=(id,category='motion')=>({android_config:{category},data:{event:{ding:{id}}}});
 motion.emit(event('visit'));await new Promise(r=>setTimeout(r,10));
 motion.emit(event('extra-motion'));motion.emit(event('button-during-visit','ding'));
 await new Promise(r=>setTimeout(r,100));
 assert.equal(preparedCount,3);assert.equal(plays,1);assert.equal(cleaned,1);assert.equal(maxConcurrent,1);
 assert(logs.some(s=>s.includes('continuing motion audio')));
 assert(!logs.some(s=>s.includes('Previous playback cancelled')));
 motion.emit(event('button-while-idle','ding'));await new Promise(r=>setTimeout(r,130));
 assert.equal(plays,2);assert.equal(maxConcurrent,1);
 console.log('Passed: motion combines three clips into one session; extra motion and button events do not interrupt or queue stale sessions; an idle button still plays.');
})().catch(e=>{console.error(e);process.exitCode=1});
