import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { selectConversation, prepareConversation } from './conversation.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RingApi, PushNotificationAction } from 'ring-client-api';
import { setFfmpegPath } from 'ring-client-api/ffmpeg';
import { useLogger } from 'ring-client-api/util';

const root = dirname(fileURLToPath(import.meta.url));
const tokenPath = join(root, '.ring-token');
const clips = JSON.parse(readFileSync(join(root, 'clips.json'), 'utf8'));
const queue = [];
const seen = new Set();
let ring, camera, session, busy = false, muted = false, stopping = false;
let lastClip = '', audioError = '', token = '';
let activeAbort;
const chimePauseMs = 2000;
const triggerMode=process.env.NAPOLEON_TRIGGER_MODE || 'motion-priority';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function report(message) { console.log(`[${new Date().toLocaleTimeString()}] ${message}`); }
function safeMessage(error) {
  let text = String(error?.message || error);
  if(token) text = text.split(token).join('[private token]');
  return text.replace(/\beyJ[A-Za-z0-9_./+=-]{50,}/g, '[private token]');
}
function record(event) {
  try { appendFileSync(join(root, 'motion-history.jsonl'), JSON.stringify({time: new Date().toISOString(), ...event})+'\n', {mode:0o600}); }
  catch { report('Could not save the local activity log.'); }
}
function saveToken(newToken) {
  const temp = tokenPath + '.tmp';
  writeFileSync(temp, newToken, {mode:0o600});
  renameSync(temp, tokenPath);
  token = newToken;
}
function aborted() { const e=new Error('Interrupted by a newer event.');e.name='AbortError';return e; }
function checkAbort(signal) {if(signal.aborted)throw aborted();}
function pause(ms,signal) {
  checkAbort(signal);
  return new Promise((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(aborted());};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},Math.max(0,ms));
    signal.addEventListener('abort',cancel,{once:true});
  });
}
function waitForAudio(activeSession,signal) {
  return new Promise((resolve,reject)=>{
    let audioSub,endSub,timer;
    const finish=error=>{clearTimeout(timer);audioSub?.unsubscribe();endSub?.unsubscribe();signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
    const cancel=()=>finish(aborted());
    if(signal.aborted)return finish(aborted());
    timer=setTimeout(()=>finish(new Error('Doorbell audio did not connect within 20 seconds.')),20000);
    audioSub=activeSession.onAudioRtp.subscribe(()=>finish());
    endSub=activeSession.onCallEnded.subscribe(()=>finish(new Error('Doorbell connection closed before audio was ready.')));
    signal.addEventListener('abort',cancel,{once:true});
  });
}
async function play(clip,signal,notBefore=0) {
  audioError='';
  let active,timer,sub,onAbort;
  try {
    if(notBefore>Date.now())await pause(notBefore-Date.now(),signal);
    checkAbort(signal);
    report(`Opening Front Door: ${clip.label}`);
    active=await camera.startLiveCall();session=active;
    checkAbort(signal);
    active.activateCameraSpeaker();
    await waitForAudio(active,signal);
    await pause(3000,signal);
    checkAbort(signal);
    const finished=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>{audioError='Audio session exceeded its time limit.';active.stop();resolve();},(clip.seconds+20)*1000);
      sub=active.onCallEnded.subscribe(resolve);
      onAbort=()=>{active.stop();reject(aborted());};
      signal.addEventListener('abort',onAbort,{once:true});
    });
    // Observe immediately, including if the transcoder fails before it can start.
    finished.catch(()=>{});
    report(`Sending movie clip: ${clip.label}`);
    const audioStartedAt=Date.now();
    await active.transcodeReturnAudio({input:[resolve(root,clip.file)]});
    await finished;
    checkAbort(signal);
    if(audioError)throw new Error(audioError);
    const sentSeconds=(Date.now()-audioStartedAt)/1000;
    if(sentSeconds < Math.max(0,(clip.spokenSeconds ?? clip.seconds)-0.4)) {
      const error=new Error(`Audio connection ended early: ${sentSeconds.toFixed(1)}s of ${(clip.spokenSeconds ?? clip.seconds).toFixed(1)}s spoken audio.`);
      error.code='EARLY_AUDIO_END';throw error;
    }
    report(`Finished sending: ${clip.label}`);
    record({type:'playback',clipId:clip.id,title:clip.label});
  } finally {
    clearTimeout(timer);sub?.unsubscribe();if(onAbort)signal.removeEventListener('abort',onAbort);
    active?.stop();if(session===active)session=null;
  }
}
async function drain() {
  if(busy || stopping)return;
  busy=true;
  try {
    while(queue.length && !muted && !stopping) {
      const event=queue.shift();let prepared;
      const conversation=triggerMode==='motion-priority' && event.eventType==='motion';
      let clip;
      try {
        if(conversation) {
          const selected=selectConversation(clips,lastClip,3);
          prepared=prepareConversation(selected,root);clip=prepared.clip;
          lastClip=selected.at(-1).id;
          report(`Motion conversation: ${selected.length} complete random clips in one audio session.`);
        } else {
          const options=clips.filter(c=>c.id!==lastClip);
          clip=options[Math.floor(Math.random()*options.length)] || clips[0];lastClip=clip.id;
        }
        activeAbort=new AbortController();
        try {await play(clip,activeAbort.signal,event.notBefore || 0);}
        catch(error) {
          if(error.code!=='EARLY_AUDIO_END')throw error;
          report(error.message+' Reconnecting and retrying this audio once.');
          record({type:'audio-retry',clipId:clip.id,message:error.message});
          await pause(1000,activeAbort.signal);await play(clip,activeAbort.signal);
        }
      } catch(error) {
        if(error.name==='AbortError')report('Previous playback cancelled.');
        else {report('Playback failed: '+safeMessage(error));record({type:'playback-error',clipId:clip?.id,message:safeMessage(error)});}
        session?.stop();session=null;
      } finally {prepared?.cleanup();}
      if(queue.length && queue[0].eventType!=='doorbell')await sleep(1000);
    }
  } finally {busy=false;}
}
function enqueue(eventId,manual=false,eventType='motion') {
  if(muted || stopping) return;
  if(!manual && seen.has(eventId)) return;
  if(!manual) {seen.add(eventId);if(seen.size>1000)seen.delete(seen.values().next().value);}
  if(triggerMode==='motion-priority' && busy) {
    record({type:'event-during-conversation',eventType,eventId});
    report(eventType==='doorbell'?'Doorbell received during active conversation — continuing motion audio.':'Motion received during active conversation — already talking; not adding another session.');
    return;
  }
  if(eventType==='doorbell') {
    queue.length=0;
    activeAbort?.abort();session?.stop();
    queue.push({eventId,eventType,notBefore:Date.now()+chimePauseMs});
  } else queue.push({eventId,eventType});
  record({type:manual?'manual-test':eventType,eventId});
  if(eventType==='doorbell')report('Doorbell pressed — interrupting playback, clearing motion queue, then playing after the native chime.');
  else report(`${manual?'Manual test':'New motion'} — ${busy?'queued after the current clip':'choosing a random clip'}.`);
  void drain();
}
function shutdown() {
  if(stopping)return;
  stopping=true;queue.length=0;activeAbort?.abort();session?.stop();ring?.disconnect();
  report('Stopped. Automatic outdoor playback is off.');
  process.exit(0);
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
try {
  if(!existsSync(tokenPath)) throw new Error('Place motion-runner.mjs, clips.json and the clips folder in the same napoleon-doorbell folder as your existing .ring-token.');
  token=readFileSync(tokenPath,'utf8').trim();
  if(token.length<100 || /\s/.test(token))throw new Error('The saved Ring token is not valid.');
  for(const clip of clips)if(!existsSync(join(root,clip.file)))throw new Error('Missing clip file: '+clip.file);
  setFfmpegPath(execFileSync('which',['ffmpeg'],{encoding:'utf8'}).trim());
  useLogger({logInfo:()=>{},logError:message=>{const safe=safeMessage(message);if(safe.includes('Return Audio'))audioError=safe;report('Ring: '+safe);}});
  ring=new RingApi({refreshToken:token,cameraStatusPollingSeconds:20});
  ring.onRefreshTokenUpdated.subscribe(({newRefreshToken})=>saveToken(newRefreshToken));
  const cameras=await ring.getCameras();camera=cameras.find(c=>c.name==='Front Door');
  if(!camera)throw new Error('Could not find your camera named Front Door.');
  // BUTTON_SUBSCRIPTION_REPAIR
  setTimeout(async()=>{
    try {
      await camera.subscribeToDingEvents();
      report('Doorbell button subscription confirmed.');
    } catch(error) {report('Doorbell subscription failed: '+safeMessage(error));}
  },5000);
  camera.onNewNotification.subscribe(notification=>{
    const category=notification.android_config?.category;
    report('Received Ring event category: '+String(category));
    const eventType=category===PushNotificationAction.Motion?'motion':category===PushNotificationAction.Ding?'doorbell':null;
    if(!eventType || (eventType==='motion' && triggerMode==='button-only'))return;
    const id=notification.data?.event?.ding?.id;
    if(id!=null)enqueue(eventType+':'+String(id),false,eventType);
  });
  report(`Connected to Front Door. ${clips.length} Napoleon Dynamite clips ready.`);
  report(triggerMode==='motion-priority'?'MOTION PRIORITY ON: three random clips per motion visit, in one continuous session. Button presses do not interrupt.':triggerMode==='motion-and-button'?'EXPERIMENTAL: motion and button playback enabled. Live calls may suppress button events.':'BUTTON-ONLY MODE: each received doorbell press plays a random clip after a pause for the native chime.');
  if(process.env.NAPOLEON_BACKGROUND === '1') {
    const awake=spawn('/usr/bin/caffeinate',['-i','-w',String(process.pid)],{stdio:'ignore'});
    awake.on('error',()=>report('Could not prevent idle sleep. Check your Mac sleep settings.'));
    report('Background mode is running. Screen lock is fine; keep the laptop lid open.');
  } else {
    report('Commands: mute | unmute | test | status | stop — type one and press Enter.');
    report('Keep this window open and your Mac awake. Close other Ring Live View sessions.');
  }
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  terminal.on('line',line=>{
    switch(line.trim().toLowerCase()) {
      case 'mute':muted=true;queue.length=0;activeAbort?.abort();session?.stop();report('Muted. Queue cleared.');break;
      case 'unmute':muted=false;report('Motion playback is on again.');break;
      case 'test':if(muted)report('Muted — type unmute first.');else enqueue('test-'+Date.now(),true);break;
      case 'status':report(`${muted?'Muted':'Armed'} | ${busy?'Playing':'Idle'} | ${queue.length} queued`);break;
      case 'stop':shutdown();break;
      default:report('Commands: mute | unmute | test | status | stop');
    }
  });
} catch(error) {report(safeMessage(error));ring?.disconnect();process.exit(1);}
