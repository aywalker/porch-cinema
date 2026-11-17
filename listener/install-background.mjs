import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const label='com.napoleondoorbell.listener';
const source=dirname(fileURLToPath(import.meta.url));
const userHome=homedir();
const previous=join(userHome,'Documents','napoleon-doorbell');
const target=join(userHome,'Library','Application Support','Napoleon Doorbell');
const logs=join(userHome,'Library','Logs','Napoleon Doorbell');
const agents=join(userHome,'Library','LaunchAgents');
const plist=join(agents,label+'.plist');
const domain='gui/'+process.getuid();
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
try {
 if(process.platform!=='darwin')throw new Error('This installer is for your Mac.');
 const tokenSource=[join(target,'.ring-token'),join(source,'.ring-token'),join(previous,'.ring-token')].find(existsSync);
 if(!tokenSource)throw new Error('Save your Ring token locally first. See README.md.');
 if(!existsSync(tokenSource))throw new Error('Your .ring-token was not found in Documents/napoleon-doorbell.');
 const initialToken=readFileSync(tokenSource,'utf8').trim();
 if(initialToken.length<100 || /\s/.test(initialToken))throw new Error('Your saved Ring token does not look valid.');
 const moduleSource=existsSync(join(target,'node_modules','ring-client-api'))?null:[join(source,'..','node_modules'),join(previous,'node_modules')].find(p=>existsSync(join(p,'ring-client-api')));
 if(!existsSync(join(target,'node_modules','ring-client-api')) && !moduleSource)throw new Error('The installed Ring library was not found in Documents/napoleon-doorbell.');
 for(const file of ['motion-runner.mjs','conversation.mjs','clips.json','clips'])if(!existsSync(join(source,file)))throw new Error('Unzip the full download before running this installer. Missing: '+file);
 execFileSync('which',['ffmpeg'],{stdio:'ignore'});
 console.log('Stopping any previous background listener…');
 spawnSync('/bin/launchctl',['bootout',domain+'/'+label],{stdio:'ignore'});
 mkdirSync(target,{recursive:true,mode:0o700});chmodSync(target,0o700);
 mkdirSync(logs,{recursive:true,mode:0o700});mkdirSync(agents,{recursive:true});
 // The service lives outside Documents so login startup does not rely on Terminal folder permissions.
 const latestToken=readFileSync(tokenSource,'utf8').trim();
 writeFileSync(join(target,'.ring-token'),latestToken,{mode:0o600});chmodSync(join(target,'.ring-token'),0o600);
 for(const file of ['motion-runner.mjs','conversation.mjs','clips.json','clips'])cpSync(join(source,file),join(target,file),{recursive:true});
 if(moduleSource){console.log('Copying your installed Ring library…');cpSync(moduleSource,join(target,'node_modules'),{recursive:true});}
 const node=execFileSync('which',['node'],{encoding:'utf8'}).trim();
 const path=dirname(node)+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
 const content=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(target,'motion-runner.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(target)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string><key>NAPOLEON_BACKGROUND</key><string>1</string><key>NAPOLEON_TRIGGER_MODE</key><string>motion-priority</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string><key>ExitTimeOut</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(join(logs,'listener.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logs,'listener-error.log'))}</string>
</dict></plist>`;
 writeFileSync(plist,content,{mode:0o600});
 execFileSync('/usr/bin/plutil',['-lint',plist],{stdio:'inherit'});
 execFileSync('/bin/launchctl',['bootstrap',domain,plist],{stdio:'inherit'});
 console.log('\nBackground service installed and started.');
 console.log('It starts when you log in and restarts if it exits. Terminal can close.');
 console.log('Your Mac stays awake while it runs; locking the screen is fine. Keep the lid open.');
 console.log('Run: node manage-background.mjs status');
 console.log('Stop: node manage-background.mjs stop');
 console.log('Start: node manage-background.mjs start');
 console.log('Logs: '+logs);
 console.log('Only run this background service; stop any earlier foreground listener with Control+C.');
} catch(error){console.error('Setup did not complete: '+error.message);process.exitCode=1;}
