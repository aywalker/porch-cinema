const fs=require('fs'),assert=require('assert/strict'),{EventEmitter}=require('events');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
class Signal { handlers=new Set();subscribe(fn){this.handlers.add(fn);return {unsubscribe:()=>this.handlers.delete(fn)}} emit(x){for(const f of [...this.handlers])f(x)}}
const motion=new Signal(),terminal=new EventEmitter(),logs=[];let concurrent=0,maxConcurrent=0,plays=0,active,playbackMs=5;
const camera={async subscribeToDingEvents(){},name:'Front Door',onNewNotification:motion,async startLiveCall(){concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);let ended=false;const s={onAudioRtp:new Signal(),onCallEnded:new Signal(),activateCameraSpeaker(){},async transcodeReturnAudio(){plays++;setTimeout(()=>s.stop(),playbackMs)},stop(){if(!ended){ended=true;concurrent--;s.onCallEnded.emit()}}};setTimeout(()=>s.onAudioRtp.emit({}),2);active=s;return s;}};
class FakeRing {onRefreshTokenUpdated=new Signal();async getCameras(){return [camera]}disconnect(){}}
let code=fs.readFileSync(require('path').join(__dirname,'..','listener','motion-runner.mjs'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(require('url').pathToFileURL(require('path').join(__dirname,'..','listener','motion-runner.mjs')).href));
const read=(path,encoding)=>path.endsWith('.ring-token')?'a'.repeat(120):path.endsWith('clips.json')?JSON.stringify(JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','listener','clips.example.json'),'utf8')).map(c=>({...c,spokenSeconds:1}))):fs.readFileSync(path,encoding);
const proc={env:{NAPOLEON_TRIGGER_MODE: "motion-and-button"},stdin:{},stdout:{},on(){},exit(code){throw Error('Unexpected exit '+code)}};
const fn=new AsyncFunction('readFileSync','writeFileSync','renameSync','existsSync','appendFileSync','dirname','join','resolve','fileURLToPath','execFileSync','spawn','createInterface','RingApi','PushNotificationAction','setFfmpegPath','useLogger','process','console','setTimeout','clearTimeout',code);
(async()=>{
 await fn(read,()=>{},()=>{},()=>true,()=>{},require('path').dirname,require('path').join,require('path').resolve,require('url').fileURLToPath,()=>'/usr/bin/ffmpeg',()=>{},()=>terminal,FakeRing,{Motion:'motion',Ding:'ding'},()=>{},()=>{},proc,{log:s=>logs.push(s)},(fn,ms)=>setTimeout(fn,Math.min(ms,40)),clearTimeout);
 motion.emit({android_config:{category:'motion'},data:{event:{ding:{id:'early-close-test'}}}});
 await new Promise(r=>setTimeout(r,300));
 assert.equal(plays,2);assert.equal(maxConcurrent,1);
 assert.equal(logs.filter(s=>s.includes('retrying this audio once')).length,1);
 assert(logs.some(s=>s.includes('Playback failed: Audio connection ended early')));
 console.log('Passed: early audio-session ending triggers exactly one retry, then reports failure; no overlapping playback or endless retries.');
})().catch(e=>{console.error(e);process.exitCode=1});
