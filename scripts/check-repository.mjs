import { execFileSync } from 'node:child_process';
const names=execFileSync('git',['ls-files','--cached','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const errors=[];
const privatePath=/(^|\/)(?:\.ring-token[^/]*|\.env(?:\..*)?|node_modules|private|dist|\.openai|recordings|backups|logs)(?:\/|$)|\.(?:mp3|wav|m4a|mp4|mov|webm|zip|tar|tgz|log|jsonl|pem|key|p12|pfx|sqlite\w*|db)$/i;
const secretPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bart_v2_[A-Za-z0-9_]{20,}\b/,/\beyJ[A-Za-z0-9_-]{70,}\b/,/\bAKIA[A-Z0-9]{16}\b/];
for(const name of names) {
 if(privatePath.test(name) && !name.endsWith('.env.example')){errors.push(name+': private/runtime file must not be committed');continue;}
 const blob=execFileSync('git',['show',':'+name]);
 if(blob.includes(0)){errors.push(name+': binary file is not allowed');continue;}
 const text=blob.toString('utf8');
 if(secretPatterns.some(pattern=>pattern.test(text)))errors.push(name+': possible credential detected');
 if(/const\s+(?:recordedAudio|motionSetupZip)\s*=\s*["{]/.test(text) && text.length>300000)errors.push(name+': embedded binary payload detected');
}
if(errors.length){console.error('Commit blocked:\n'+errors.join('\n'));process.exitCode=1;}else console.log('Staged-file privacy checks passed ('+names.length+' files).');
