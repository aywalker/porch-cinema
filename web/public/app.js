const $ = id => document.getElementById(id);
let currentToken = sessionStorage.getItem('porch_token') || '';
let latest = { inside: '', outside: '' };
let settings = {};
let clips = [];
let clipAudio;
function stopClip() { if(clipAudio) {clipAudio.pause(); clipAudio.currentTime=0;} if('speechSynthesis' in window) speechSynthesis.cancel(); }
async function playClip(url) {
  stopClip();
  const clip=clips.find(c=>c.id === $('audioClip').value) || clips[0];
  if(!clip && !url) return info('No clip is selected.');
  clipAudio = new Audio(url || clip.url);
  try {await clipAudio.play(); info('Playing Napoleon’s original movie recording in this browser.');}
  catch {info('Audio could not play. Tap Play selected clip to retry, and check your connection.');}
}
$('playClip').addEventListener('click',()=>playClip());
$('stopClip').addEventListener('click',stopClip);
$('audioClip').addEventListener('change',e=>{stopClip();save({audioClip:e.target.value});});
async function api(route, payload) {
  const request = async () => fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(currentToken ? { 'X-Porch-Token': currentToken } : {}) }, body: JSON.stringify(payload || {}) });
  let response = await request();
  if (response.status === 401) {
    const entered = prompt('Enter your doorbell access token:');
    if (!entered) throw new Error('Authorization required');
    currentToken = entered;
    sessionStorage.setItem('porch_token', currentToken);
    response = await request();
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.reason || `HTTP ${response.status}`);
  return data;
}
function speak() { return playClip(); }
function info(message) { $('statusMsg').textContent = message; }
function showLog(items) {
  $('history').replaceChildren();
  if (!items.length) { $('history').textContent = 'No doorbell moments yet. Try a movie clip.'; return; }
  for (const item of items) {
    const div = document.createElement('div'); div.className = 'entry';
    const time = document.createElement('time'); time.textContent = new Date(item.time).toLocaleTimeString();
    const title = document.createElement('b'); title.textContent = item.type === 'simulation' ? 'SIMULATED EVENT' : item.type === 'alexa-test' ? 'ALEXA DIAGNOSTIC' : 'DOORBELL PRESS';
    const detail = document.createElement('p'); detail.textContent = item.inside || item.indoorResult || '';
    div.append(time,title,detail); $('history').append(div);
  }
}
async function refresh() {
  const data = await fetch('/api/status').then(r => r.json());
  settings = data.settings;
  clips = data.napoleonClips || [];
  $('clipControls').hidden = settings.persona !== 'napoleon';
  $('audioClip').replaceChildren(...clips.map(c => new Option(c.label, c.id)));
  $('audioClip').value = settings.audioClip || 'pigskin82';
  if(settings.persona === 'napoleon') {const c=clips.find(c=>c.id===settings.audioClip)||clips[0]; if(c) {$('inside').textContent=c.label; $('outside').textContent=c.label;}}

  $('stateLabel').textContent = settings.active ? 'READY TO RING' : 'TAKING A BREAK';
  $('active').checked = settings.active;
  $('indoorEnabled').checked = settings.indoorEnabled;
  showLog(data.history);
}
async function save(patch) {
  try { await api('/api/settings', patch); await refresh(); info('Saved. Your doorbell has new skills.'); }
  catch(e) { info(e.message); await refresh(); }
}
$('active').addEventListener('change', e => save({ active: e.target.checked }));
$('indoorEnabled').addEventListener('change', e => save({ indoorEnabled: e.target.checked }));
$('simulate').addEventListener('click', async () => {
  try { const result = await api('/api/simulate'); if (result.entry) { latest = result.entry; $('inside').textContent = '“' + latest.inside + '”'; $('outside').textContent = '“' + latest.outside + '”'; } info(result.status === 'paused' ? 'System paused. Nothing happened.' : 'Simulated doorbell press. No real speakers were activated.'); await refresh(); if(result.entry?.audioUrl) await playClip(result.entry.audioUrl); }
  catch(e) { info(e.message); }
});
$('testAlexa').addEventListener('click', async () => {
  try { await api('/api/test-alexa'); info('Alexa test message sent to Home Assistant. Check your Echo.'); await refresh(); }
  catch(e) { info('Alexa test failed: ' + e.message); }
});
$('previewInside').addEventListener('click', () => speak(latest.inside || $('inside').textContent));
$('previewOutside').addEventListener('click', () => speak(latest.outside || $('outside').textContent));
refresh().catch(e => info(e.message));
