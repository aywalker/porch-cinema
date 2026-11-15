import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
const label='com.napoleondoorbell.listener';
const domain='gui/'+process.getuid();
const service=domain+'/'+label;
const plist=join(homedir(),'Library','LaunchAgents',label+'.plist');
const action=process.argv[2] || 'status';
try {
 if(process.platform!=='darwin')throw new Error('Use this on your Mac.');
 if(action==='stop') {
  execFileSync('/bin/launchctl',['bootout',service],{stdio:'inherit'});
  console.log('Stopped. It stays off until you start it again or next log in.');
 } else if(action==='start') {
  const running=spawnSync('/bin/launchctl',['print',service],{stdio:'ignore'}).status===0;
  if(!running)execFileSync('/bin/launchctl',['bootstrap',domain,plist],{stdio:'inherit'});
  else console.log('Already loaded; checking or restarting the listener.');
  execFileSync('/bin/launchctl',['kickstart',service],{stdio:'inherit'});
  console.log('Background listener started.');
 } else if(action==='status') {
  const check=spawnSync('/bin/launchctl',['print',service],{encoding:'utf8'});
  if(check.status!==0)console.log('Background listener is not loaded. Run: node manage-background.mjs start');
  else console.log(check.stdout.split('\n').filter(line=>/^\s*(state|pid|last exit code|runs) =/.test(line)).join('\n'));
  console.log('Recent listener log:');
  spawnSync('/usr/bin/tail',['-n','15',join(homedir(),'Library','Logs','Napoleon Doorbell','listener.log')],{stdio:'inherit'});
 } else if(action==='uninstall') {
  spawnSync('/bin/launchctl',['bootout',service],{stdio:'ignore'});
  const {unlinkSync}=await import('node:fs');unlinkSync(plist);
  console.log('Automatic startup removed. Private token and audio remain in Library/Application Support/Napoleon Doorbell.');
 } else throw new Error('Use status, stop, start, or uninstall.');
} catch(error){console.error('Could not '+action+': '+error.message);process.exitCode=1;}
