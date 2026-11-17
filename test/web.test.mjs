import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../scripts/build-web.mjs';
const root=new URL('../',import.meta.url).pathname;
test('web build refuses missing private audio',()=>assert.throws(()=>build(root,{audioDir:'/nonexistent-audio'}),/Private movie audio/));
test('web build preserves flat Napoleon-only choices and serves private supplied audio',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'napoleon-test-'));
 try {
  const clips=JSON.parse(readFileSync(join(root,'web','clips.json'),'utf8'));
  for(const clip of clips)writeFileSync(join(dir,clip.id+'.mp3'),Buffer.from('test-only-audio'));
  const entry=build(root,{audioDir:dir,outDir:join(dir,'dist')});
  const app=(await import(pathToFileURL(entry).href)).default;
  const status=await(await app.fetch(new Request('https://test/api/status'),{})).json();
  assert.equal(status.napoleonClips.length,13);assert.deepEqual(Object.keys(status.personas),['napoleon']);
  const html=await(await app.fetch(new Request('https://test/'),{})).text();assert(!html.includes('<iframe'));
  const js=await(await app.fetch(new Request('https://test/app.js'),{})).text();assert(!js.includes('optgroup'));assert(!js.includes('SpeechSynthesisUtterance'));
  const audio=await app.fetch(new Request('https://test/audio/'+clips[0].id+'.mp3'),{});assert.equal(audio.status,200);assert.equal(await audio.text(),'test-only-audio');
 } finally{rmSync(dir,{recursive:true,force:true});}
});
test('listener defaults to both triggers and retains early-audio recovery',()=>{
 const code=readFileSync(join(root,'listener','motion-runner.mjs'),'utf8');assert.match(code,/NAPOLEON_TRIGGER_MODE \|\| 'motion-and-button'/);assert.match(code,/eventType==='motion' && triggerMode!=='motion-and-button'/);assert.match(code,/EARLY_AUDIO_END/);
 const installer=readFileSync(join(root,'listener','install-background.mjs'),'utf8');assert.match(installer,/<key>NAPOLEON_TRIGGER_MODE<\/key><string>motion-and-button<\/string>/);
});
