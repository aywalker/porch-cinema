import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const guard=new URL('../scripts/check-repository.mjs',import.meta.url).pathname;
function stageAndCheck(name,content) {
 const dir=mkdtempSync(join(tmpdir(),'privacy-test-'));
 try {
  execFileSync('git',['init','-q'],{cwd:dir});writeFileSync(join(dir,name),content);
  execFileSync('git',['add','--',name],{cwd:dir});
  return spawnSync(process.execPath,[guard],{cwd:dir,encoding:'utf8'});
 } finally{rmSync(dir,{recursive:true,force:true});}
}
test('guard blocks a private token file without echoing its contents',()=>{
 const secret='fixture-private-value';const r=stageAndCheck('.ring-token',secret);assert.notEqual(r.status,0);assert(!r.stderr.includes(secret));
});
test('guard blocks a recognizable credential in an otherwise normal source file',()=>{
 const secret='ghp_'+'a'.repeat(40);const r=stageAndCheck('example.js','const credential = '+JSON.stringify(secret));assert.notEqual(r.status,0);assert(!r.stderr.includes(secret));
});
test('guard permits ordinary source code',()=>assert.equal(stageAndCheck('example.js','console.log("ready");').status,0));
