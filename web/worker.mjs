// assets, recordedAudio, napoleonClips and motionSetupZip are injected by the build script.
const personas = {napoleon: {name: "Napoleon Dynamite", scenes: []}};

let settings = { active: true, persona: 'napoleon', audioClip: 'pigskin82', indoorEnabled: false, cooldownSeconds: 25 };
const history = [];
let lastRealRingAt = 0;


export default {async fetch(req, env = {}) {
const route = new URL(req.url).pathname;
if(route === '/downloads/napoleon-motion-setup.zip' && req.method === 'GET') {
 if(!motionSetupZip)return new Response('Local setup archive is not configured.',{status:404});
 return new Response(Uint8Array.from(atob(motionSetupZip),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="napoleon-motion-setup.zip"','Cache-Control':'no-store'}});
}

const audioMatch = /^\/audio\/([a-z0-9]+)\.mp3$/.exec(route);
if(audioMatch && (req.method === 'GET' || req.method === 'HEAD')) {
  const encoded = recordedAudio[audioMatch[1]];
  if(!encoded) return new Response('Audio not found',{status:404});
  const bytes = Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return new Response(req.method === 'HEAD' ? null : bytes, {headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length),'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}

const token = env.PORCH_TOKEN || '';
const authorized = req => !token || req.headers.get('x-porch-token') === token;
const json = (status, value) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
const readBody = async req => {const raw = await req.text(); if(raw.length > 8192) throw new Error('Request too large'); return raw ? JSON.parse(raw) : {};};
const record = entry => {
  history.unshift({ time: new Date().toISOString(), ...entry });
  history.length = Math.min(history.length, 20);
};
const chooseScene = () => {
  const clip = napoleonClips.find(c => c.id === settings.audioClip) || napoleonClips[0];
  return {inside: clip.label, outside: clip.label, audioUrl: clip.url};
};
async function announceOnAlexa(message) {
  const base = env.HA_URL?.replace(/\/$/, '');
  const haToken = env.HA_TOKEN;
  const entity = env.ALEXA_NOTIFY_ENTITY;
  if (!base || !haToken || !entity || entity.includes('replace_with')) {
    return { ok: false, reason: 'Configure HA_URL, HA_TOKEN, and ALEXA_NOTIFY_ENTITY in hosted runtime settings' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${base}/api/services/notify/send_message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${haToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entity, message }),
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, reason: `Home Assistant HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  } finally {
    clearTimeout(timeout);
  }
}
const onRing = async ({ simulate }) => {
  if (!settings.active) return { status: 'paused' };
  const now = Date.now();
  if (!simulate && now - lastRealRingAt < settings.cooldownSeconds * 1000) {
    return { status: 'cooldown' };
  }
  if (!simulate) lastRealRingAt = now;
  const scene = chooseScene();
  const indoor = settings.persona === 'napoleon' ? {ok:false, reason:'Recorded clip playback on Echo is not connected'} : (!simulate && settings.indoorEnabled)
    ? await announceOnAlexa(scene.inside)
    : { ok: false, reason: simulate ? 'Preview only' : 'Indoor audio disabled' };
  const entry = {
    type: simulate ? 'simulation' : 'ring', persona: settings.persona,
    inside: scene.inside, outside: scene.outside, audioUrl: scene.audioUrl || null,
    indoorResult: indoor.ok ? 'sent' : indoor.reason,
    outdoorResult: 'not connected: manual experimental adapter required'
  };
  record(entry);
  return { status: 'handled', entry };
};

  if (req.method === 'GET' && route === '/api/status') {
    return json(200, { settings, personas: Object.fromEntries(Object.entries(personas).map(([id, v]) => [id, v.name])), history, napoleonClips, alexaConfigured: Boolean(env.HA_TOKEN && env.ALEXA_NOTIFY_ENTITY && !env.ALEXA_NOTIFY_ENTITY.includes('replace_with')), outdoorConfigured: false });
  }
  if (req.method === 'GET' && assets[route]) return new Response(assets[route].body, {headers:{'Content-Type':assets[route].type,'Cache-Control':'no-store'}});
  if (req.method !== 'POST') return json(404, { error: 'Not found' });
  if (!authorized(req)) return json(401, { error: 'Invalid X-Porch-Token' });
  try {
    if (route === '/api/simulate') return json(200, await onRing({ simulate: true }));
    if (route === '/api/ring-event') return json(200, await onRing({ simulate: false }));
    if (route === '/api/test-alexa') {
      const result = await announceOnAlexa('Napoleon Dynamite Doorbell Club speaker test.');
      record({ type: 'alexa-test', indoorResult: result.ok ? 'sent' : result.reason });
      return json(result.ok ? 200 : 503, result);
    }
    if (route === '/api/settings') {
      const body = await readBody(req);
      if(napoleonClips.some(c => c.id === body.audioClip)) settings.audioClip = body.audioClip;
      if (typeof body.active === 'boolean') settings.active = body.active;
      if (typeof body.indoorEnabled === 'boolean') settings.indoorEnabled = body.indoorEnabled;
      if (typeof body.persona === 'string' && Object.hasOwn(personas, body.persona)) settings.persona = body.persona;
      if (Number.isInteger(body.cooldownSeconds) && body.cooldownSeconds >= 10 && body.cooldownSeconds <= 300) settings.cooldownSeconds = body.cooldownSeconds;
      return json(200, { settings });
    }
    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Request failed:', err.message);
    return json(400, { error: err.message });
  }
}};
