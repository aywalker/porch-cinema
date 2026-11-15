const fs=require('fs'),assert=require('assert/strict'),{EventEmitter}=require('events');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
class Signal { handlers=new Set();subscribe(fn){this.handlers.add(fn);return {unsubscribe:()=>this.handlers.delete(fn)}} emit(x){for(const f of [...this.handlers])f(x)}}
const motion=new Signal(),terminal=new EventEmitter(),logs=[];let concurrent=0,maxConcurrent=0,plays=0,active,playbackMs=5;
const camera={async subscribeToDingEvents(){},name:'Front Door',onNewNotification:motion,async startLiveCall(){concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);let ended=false;const s={onAudioRtp:new Signal(),onCallEnded:new Signal(),activateCameraSpeaker(){},async transcodeReturnAudio(){plays++;setTimeout(()=>s.stop(),playbackMs)},stop(){if(!ended){ended=true;concurrent--;s.onCallEnded.emit()}}};setTimeout(()=>s.onAudioRtp.emit({}),2);active=s;return s;}};
class FakeRing {onRefreshTokenUpdated=new Signal();async getCameras(){return [camera]}disconnect(){}}
let code=fs.readFileSync(require('path').join(__dirname,'..','listener','motion-runner.mjs'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(require('url').pathToFileURL(require('path').join(__dirname,'..','listener','motion-runner.mjs')).href));
const read=(path,encoding)=>path.endsWith('.ring-token')?'a'.repeat(120):path.endsWith('clips.json')?JSON.stringify(JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','listener','clips.example.json'),'utf8')).map(c=>({...c,spokenSeconds:0.001}))):fs.readFileSync(path,encoding);
const proc={env:{NAPOLEON_TRIGGER_MODE: "motion-and-button"},stdin:{},stdout:{},on(){},exit(code){throw Error('Unexpected exit '+code)}};
const fn=new AsyncFunction('readFileSync','writeFileSync','renameSync','existsSync','appendFileSync','dirname','join','fileURLToPath','execFileSync','spawn','createInterface','RingApi','PushNotificationAction','setFfmpegPath','useLogger','process','console','setTimeout','clearTimeout',code);
(async()=>{
 await fn(read,()=>{},()=>{},()=>true,()=>{},require('path').dirname,require('path').join,require('url').fileURLToPath,()=>'/usr/bin/ffmpeg',()=>{},()=>terminal,FakeRing,{Motion:'motion',Ding:'ding'},()=>{},()=>{},proc,{log:s=>logs.push(s)},(fn,ms)=>setTimeout(fn,Math.min(ms,40)),clearTimeout);
 const event=id=>({android_config:{category:'motion'},data:{event:{ding:{id}}}});
 motion.emit(event('one'));motion.emit(event('one'));motion.emit(event('two'));
 await new Promise(r=>setTimeout(r,160));assert.equal(plays,2);assert.equal(maxConcurrent,1);
 terminal.emit('line','mute');motion.emit(event('three'));await new Promise(r=>setTimeout(r,60));assert.equal(plays,2);
 terminal.emit('line','unmute');motion.emit(event('four'));await new Promise(r=>setTimeout(r,100));assert.equal(plays,3);
 motion.emit({android_config:{category:'ding'},data:{event:{ding:{id:'four'}}}});
 motion.emit({android_config:{category:'ding'},data:{event:{ding:{id:'four'}}}});
 await new Promise(r=>setTimeout(r,100));assert.equal(plays,4);assert.equal(maxConcurrent,1);
 assert(logs.some(s=>s.includes('Doorbell pressed')));
 playbackMs=200;
 motion.emit(event('interrupt-current'));
 await new Promise(r=>setTimeout(r,60));
 assert.equal(plays,5);
 motion.emit(event('discard-this-queued-motion'));
 motion.emit({android_config:{category:'ding'},data:{event:{ding:{id:'priority-button'}}}});
 motion.emit({android_config:{category:'ding'},data:{event:{ding:{id:'priority-button'}}}});
 await new Promise(r=>setTimeout(r,200));
 assert.equal(plays,6);assert.equal(maxConcurrent,1);
 assert(logs.some(s=>s.includes('Previous playback cancelled')));
 assert(!logs.join('\n').includes('a'.repeat(120)));
 console.log('Passed: repeated unique motion queues sequential clips; duplicate events ignored; mute blocks motion; unmute resumes; doorbell press also plays once even with a matching motion ID; priority press cancels an active clip and discards queued motion; no overlap or duplicate button playback; no token printed.');
})().catch(e=>{console.error(e);process.exitCode=1});
