import https from 'node:https';
import assert from 'node:assert/strict';
const main='example.test';
const customDomain=process.env.PATH_CUSTOM_DOMAIN??'adas.test';
let cookie='';
function request(host,path,method='GET',body,headers={}) {return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body);
  const req=https.request({hostname:'edge',port:8443,servername:host,rejectUnauthorized:false,path,method,headers:{host,...(host===main&&cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{}),...headers}},res=>{
    const certificate=res.socket.getPeerCertificate();const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,text,json,headers:res.headers,certificate});});
  });req.on('error',reject);req.setTimeout(30000,()=>req.destroy(new Error(`Timeout: ${method} ${path}`)));if(data)req.write(data);req.end();
});}
async function until(fn){const end=Date.now()+240000;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await new Promise(r=>setTimeout(r,2000));}throw new Error('Timed out');}
let r=await until(async()=>{const r=await request(main,'/healthz');return r.status===200?r:null;});
assert.ok(r.certificate.subjectaltname.includes('DNS:example.test'));
assert.ok(!r.certificate.subjectaltname.includes('*'));
console.log('PASS main HTTP-01 certificate without wildcard or DNS credentials');
r=await request(main,'/api/auth/sign-up/email','POST',{name:'Path Test',email:`path-${Date.now()}@example.test`,password:'test-only-path-password'},{origin:`https://${main}`});assert.equal(r.status,200,r.text);
cookie=(r.headers['set-cookie']??[]).map(c=>c.split(';')[0]).join('; ');
assert.equal((await request(main,'/dashboard')).status,200);
const created=await request(main,'/api/projects','POST',{name:'Path test'});assert.equal(created.status,200,created.text);
const project=created.json.project??created.json;const id=project.id;
const production=new URL(project.productionUrl),preview=new URL(project.previewUrl);
assert.equal(production.hostname,main);assert.match(production.pathname,/^\/sites\/path-test-[a-z0-9]{8}\/$/);
assert.match(preview.pathname,/^\/preview\/path-test-[a-z0-9]{8}\/$/);
const endpoint=`/api/projects/${id}`;
for(const [path,content] of [['index.html','<!doctype html><link rel="stylesheet" href="assets/style.css"><h1>path release test</h1><a href="about">About</a><script>document.body.dataset.script="ran"</script><script type="module" src="assets/module.js"></script>'],['assets/style.css','h1 { color: rgb(12, 34, 56); }'],['assets/module.js','document.body.dataset.module = "ran";'],['about.html','<h1>path about page</h1>']]) {
 r=await request(main,endpoint+'/files','PUT',{path,content});assert.equal(r.status,200,r.text);
}
r=await request(main,endpoint+'/publish','POST');assert.equal(r.status,200,r.text);
for(const base of [production.pathname,preview.pathname]) {
 r=await request(main,base);assert.equal(r.status,200,r.text);assert.ok(r.headers['content-security-policy'].includes('sandbox allow-scripts'));assert.ok(!r.headers['content-security-policy'].includes('allow-same-origin'));
 assert.equal((await request(main,base+'assets/style.css')).status,200);
 assert.equal((await request(main,base+'about')).status,200);
 r=await request(main,base.slice(0,-1)+'?q=1');assert.equal(r.status,308);assert.equal(r.headers.location,base+'?q=1');
 for(const tail of ['.git/config','%2e%2e/dashboard','functions/private.ts']) assert.notEqual((await request(main,base+tail)).status,200);
}
assert.equal((await request(main,'/sites/missing-abc12345/')).status,404);
assert.equal((await request(main,'/api/projects','POST',{name:'forged'},{origin:'null'})).status,403);
console.log('PASS path assets, preview, canonical slash, route boundaries and opaque-origin mutation rejection');
r=await request(main,endpoint+'/password','POST',{password:'test-only-site-password'});assert.equal(r.status,200,r.text);
const bypass=new URL(r.json.previewSrc);assert.ok(bypass.pathname.startsWith(preview.pathname+'__mcphosting/'));
r=await request(main,production.pathname);assert.equal(r.status,401);assert.ok(r.text.includes(`action="${production.pathname}__mcphosting/unlock"`));
r=await request(main,production.pathname+'__mcphosting/unlock','POST','password=test-only-site-password&next=%2Fabout',{'content-type':'application/x-www-form-urlencoded'});
assert.equal(r.status,303);assert.equal(r.headers.location,production.pathname+'about');
const access=r.headers['set-cookie'][0];assert.ok(access.includes(`Path=${production.pathname}`));
assert.equal((await request(main,production.pathname, 'GET',undefined,{cookie:access.split(';')[0]})).status,200);
r=await request(main,bypass.pathname+bypass.search);assert.equal(r.status,303);assert.equal(r.headers.location,preview.pathname);
assert.ok(r.headers['set-cookie'][0].includes(`Path=${preview.pathname}`));
await request(main,endpoint+'/password','DELETE');
console.log('PASS password forms, project-scoped cookies and owner preview bypass');
r=await request(main,endpoint+'/domains','POST',{hostname:customDomain});assert.equal(r.status,201,r.text);assert.equal(r.json.setup.dns.value,'10.77.42.20');
assert.equal((await request(main,endpoint+'/domains','POST',{hostname:'nested.example.test'})).status,422);
await fetch('http://dns-provider:8055/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostname:customDomain,ip:'10.77.42.20'})});
await until(async()=> (await request(main,endpoint+'/domains')).json.domains[0]?.tls==='active');
r=await request(customDomain,'/');assert.equal(r.status,200,r.text);assert.equal(r.headers['content-security-policy'],undefined);
assert.equal((await request(customDomain,'/assets/style.css')).status,200);
await request(main,endpoint+'/domains','PATCH',{systemDomainEnabled:false});
assert.equal((await request(main,production.pathname)).status,404);assert.equal((await request(main,preview.pathname)).status,404);assert.equal((await request(customDomain,'/')).status,200);
await request(main,endpoint+'/domains','PATCH',{systemDomainEnabled:true});
console.log('PASS custom HTTP-01 domains stay at / and work with the system path disabled');
console.log('BROWSER_PATH='+production.pathname);
r=await request(main,'/api/projects','POST',{name:'Browser locked'});assert.equal(r.status,200);
const locked=r.json.project??r.json;
for(const [path,content] of [['index.html','<!doctype html><link rel="stylesheet" href="assets/style.css"><h1>locked browser test</h1>'],['assets/style.css','h1 { color: rgb(12, 34, 56); }']]) await request(main,`/api/projects/${locked.id}/files`,'PUT',{path,content});
await request(main,`/api/projects/${locked.id}/publish`,'POST');await request(main,`/api/projects/${locked.id}/password`,'POST',{password:'test-only-site-password'});
console.log('BROWSER_LOCKED_PATH='+new URL(locked.productionUrl).pathname);
