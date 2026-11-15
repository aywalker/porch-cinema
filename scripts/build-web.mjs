import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
export function build(root=process.cwd(), {audioDir=join(root,'private','audio'),outDir=join(root,'dist')}={}) {
 const clips=JSON.parse(readFileSync(join(root,'web','clips.json'),'utf8'));
 const missing=clips.filter(c=>!existsSync(join(audioDir,c.id+'.mp3')));
 if(missing.length)throw new Error('Private movie audio is not bundled with this repository. Add these MP3 files under private/audio/: '+missing.map(c=>c.id+'.mp3').join(', '));
 const recordedAudio=Object.fromEntries(clips.map(c=>[c.id,readFileSync(join(audioDir,c.id+'.mp3')).toString('base64')]));
 const assets={};
 for(const [route,file,type] of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/app.css','app.css','text/css']])assets[route]={body:readFileSync(join(root,'web','public',file),'utf8'),type:type+'; charset=utf-8'};
 const source=readFileSync(join(root,'web','worker.mjs'),'utf8');
 const setup=join(root,'private','napoleon-motion-setup.zip');
 const constants={assets,recordedAudio,napoleonClips:clips,motionSetupZip:existsSync(setup)?readFileSync(setup).toString('base64'):''};
 const bundled=Object.entries(constants).map(([key,value])=>'const '+key+' = '+JSON.stringify(value)+';').join('\n')+'\n'+source;
 mkdirSync(join(outDir,'server'),{recursive:true});writeFileSync(join(outDir,'server','index.mjs'),bundled);
 return join(outDir,'server','index.mjs');
}
if(process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
 try {console.log('Built '+build());}catch(error){console.error(error.message);process.exitCode=1;}
}
