import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export function selectConversation(clips,previous='',count=3,random=Math.random) {
  if(!clips.length)throw new Error('No movie clips are configured.');
  const selected=[];let last=previous;
  for(let i=0;i<Math.min(count,clips.length);i++) {
    let options=clips.filter(c=>c.id!==last && !selected.some(s=>s.id===c.id));
    if(!options.length)options=clips.filter(c=>c.id!==last);
    if(!options.length)options=clips;
    const next=options[Math.min(options.length-1,Math.floor(random()*options.length))];
    selected.push(next);last=next.id;
  }
  return selected;
}
export function prepareConversation(selected,root,{run=execFileSync}={}) {
  const dir=mkdtempSync(join(tmpdir(),'porch-conversation-'));
  const cleanup=()=>rmSync(dir,{recursive:true,force:true});
  try {
    const list=join(dir,'playlist.txt'),file=join(dir,'conversation.wav');
    const quoted=path=>resolve(root,path).replaceAll("'","'\\''");
    writeFileSync(list,selected.map(c=>"file '"+quoted(c.file)+"'").join('\n')+'\n',{mode:0o600});
    // Render complete clips with their existing silent tails. No duration limit or truncation.
    run('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',list,'-map','0:a:0','-vn','-map_metadata','-1','-ac','1','-ar','24000','-c:a','pcm_s16le',file],{stdio:'pipe'});
    const seconds=selected.reduce((sum,c)=>sum+c.seconds,0);
    return {clip:{id:'conversation-'+selected.map(c=>c.id).join('-'),label:selected.map(c=>c.label).join(' / '),file,seconds,spokenSeconds:seconds-(selected.at(-1).tailSilenceSeconds || 0)},cleanup};
  } catch(error){cleanup();throw error;}
}
