import https from 'node:https';
import assert from 'node:assert/strict';
const mode=process.env.EXPECTED_MODE,label=process.env.SYSTEM_LABEL;
assert.ok(['path','subdomain'].includes(mode));assert.match(label,/^[a-z0-9-]+$/);
function get(host,path) {return new Promise((resolve,reject)=>{
 const r=https.request({hostname:'edge',port:8443,servername:host,rejectUnauthorized:false,path,headers:{host}},res=>{const cert=res.socket.getPeerCertificate();const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString(),cert}));});r.on('error',reject);r.setTimeout(15000,()=>r.destroy(new Error('timeout')));r.end();
});}
const end=Date.now()+240000;
let ready=false;
while(Date.now()<end){try{
 const main=await get('example.test','/healthz');
 const prod=mode==='path'?await get('example.test',`/sites/${label}/`):await get(`${label}.example.test`,'/');
 if(main.status===200&&prod.status===200&&prod.text.includes('path release test')&&(mode==='path'||main.cert.subjectaltname.includes('DNS:*.example.test'))){ready=true;break;}
}catch{}await new Promise(r=>setTimeout(r,2000));}
assert.ok(ready,`mode switch to ${mode} never became ready`);
const preview=mode==='path'?await get('example.test',`/preview/${label}/`):await get(`preview--${label}.example.test`,'/');assert.equal(preview.status,200);
const old=mode==='path'?await get(`${label}.example.test`,'/').catch(()=>({status:0})):await get('example.test',`/sites/${label}/`);assert.notEqual(old.status,200);
assert.equal((await get('adas.test','/')).status,200);
console.log(`PASS switch to ${mode}: existing project/preview/custom domain preserved, old system URL disabled`);
