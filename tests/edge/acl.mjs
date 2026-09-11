import https from 'node:https';
import assert from 'node:assert/strict';
function get(host,path,headers={}) { return new Promise((resolve,reject)=>{
  const r=https.request({hostname:'edge',port:8443,servername:host,rejectUnauthorized:false,path,headers:{host,...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  r.on('error',reject);r.setTimeout(10000,()=>r.destroy(new Error('timeout')));r.end();
}); }
for(const path of ['/login','/api/auth/get-session','/mcp','/dashboard']) {
  assert.equal(await get('example.test',path),403);
  assert.equal(await get('example.test',path,{'x-forwarded-for':'192.0.2.5','x-real-ip':'192.0.2.5','forwarded':'for=192.0.2.5'}),403);
}
assert.equal(await get('adas.test','/'),200);
if (process.env.ACL_PUBLIC_PATH) assert.equal(await get('example.test',process.env.ACL_PUBLIC_PATH),200);
console.log('PASS management denied, forged forwarded IP denied, hosted site remains accessible');
