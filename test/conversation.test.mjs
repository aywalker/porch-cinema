import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { selectConversation, prepareConversation } from '../listener/conversation.mjs';
const clips=['a','b','c','d'].map(id=>({id,label:id,file:id+'.mp3',seconds:3,tailSilenceSeconds:1.5}));
test('conversation selects three unique clips without repeating the previous ending',()=>{
 const chosen=selectConversation(clips,'a',3,()=>0);
 assert.equal(chosen.length,3);assert.notEqual(chosen[0].id,'a');assert.equal(new Set(chosen.map(c=>c.id)).size,3);
});
test('conversation renders every complete input once with no truncation and cleans temporary media',()=>{
 let args,list;
 const prepared=prepareConversation(clips.slice(0,3),'/tmp/clip folder',{run(command,a){args=a;assert.equal(command,'ffmpeg');list=readFileSync(a[a.indexOf('-i')+1],'utf8');writeFileSync(a.at(-1),'fixture');}});
 assert.equal(list.trim().split('\n').length,3);assert(!args.includes('-t'));assert(!args.includes('-shortest'));assert.equal(prepared.clip.seconds,9);assert.equal(prepared.clip.spokenSeconds,7.5);assert(existsSync(prepared.clip.file));prepared.cleanup();assert(!existsSync(prepared.clip.file));
});
