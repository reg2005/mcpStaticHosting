// Run only inside the disposable Pebble edge container after smoke.mjs.
import { createHash, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import assert from 'node:assert/strict';
import postgres from '/app/packages/db/node_modules/postgres/src/index.js';
assert.equal(process.env.ACME_SERVER,'https://pebble:14000/dir','this fixture is for the disposable Pebble stack only');
const sql=postgres(process.env.DATABASE_URL,{max:1});
const ca='https://pebble:14000/dir';
const store='/edge/acme/'+createHash('sha256').update(ca).digest('hex').slice(0,16);
const certFile=store+'/certificates/adas.test.crt';
// Obtain a genuine six-day test certificate. Only preparation chooses this profile;
// the unchanged production worker must notice its expiry and renew automatically.
await sql`UPDATE domains SET next_attempt_at = now() + interval '5 minutes' WHERE hostname = 'adas.test'`;
execFileSync('lego',['run','--path',store,'--server',ca,'--email','test@example.test','--accept-tos','--domains','adas.test','--http','--http.webroot','/edge/challenges','--profile','shortlived','--renew-force','--ari-disable','--no-random-sleep'],{stdio:'pipe',timeout:120000});
const short=new X509Certificate(await readFile(certFile));
assert.ok(short.issuer.includes('Pebble'));
assert.ok(new Date(short.validTo).getTime()-Date.now()<7*86400000);
await sql`UPDATE domains SET next_attempt_at = now(), last_checked_at = NULL WHERE hostname = 'adas.test'`;
await sql.end();
const until=Date.now()+240000;
let issued;
while(Date.now()<until) {
  await new Promise(r=>setTimeout(r,2000));
  const cert=new X509Certificate(await readFile(certFile));
  if(cert.issuer.includes('Pebble') && cert.serialNumber!==short.serialNumber && new Date(cert.validTo).getTime()>=new Date(short.validTo).getTime()) { issued=cert;break; }
}
assert.ok(issued,'worker automatically renews a certificate with less than 30 days left');
async function servedSerial() {return new Promise((resolve,reject)=>{
  const r=https.request({host:'127.0.0.1',port:8443,servername:'adas.test',rejectUnauthorized:false,headers:{host:'adas.test'}},res=>{
    const cert=res.socket.getPeerCertificate();res.resume();res.on('end',()=>resolve(cert.serialNumber));
  });r.on('error',reject);r.end();
});}
let serial;
for(let n=0;n<15;n++){serial=await servedSerial();if(serial?.toUpperCase()===issued.serialNumber.toUpperCase())break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(serial.toUpperCase(),issued.serialNumber.toUpperCase());
console.log('PASS automatic certificate renewal and Nginx reload with the new certificate');
