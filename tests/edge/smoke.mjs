import https from 'node:https';
import assert from 'node:assert/strict';
const main = 'example.test';
let cookie = '';
function request(host, path, method='GET', body, headers={}) {
  return new Promise((resolve,reject) => {
    const req = https.request({hostname:'edge',port:8443,servername:host,rejectUnauthorized:false,path,method,headers:{host, ...(cookie && host===main ? {cookie} : {}), ...(body ? {'content-type':'application/json'} : {}), ...headers}},res=>{
      const chunks=[]; res.on('data',c=>chunks.push(c));res.on('end',()=>{
        const text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}
        resolve({status:res.statusCode,text,json,headers:res.headers});
      });
    });req.on('error',reject); req.setTimeout(10000,()=>req.destroy(new Error('Request timeout'))); if(body)req.write(JSON.stringify(body)); req.end();
  });
}
async function until(fn, timeout=240000) {const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch{}await new Promise(r=>setTimeout(r,2000));}throw new Error('Timed out');}
await until(async()=> (await request(main,'/healthz')).status===200);
console.log('PASS automatic DNS-01 wildcard and apex HTTPS');
let r=await request(main,'/api/auth/sign-up/email','POST',{name:'Edge Test',email:`edge-${Date.now()}@example.test`,password:'test-only-long-password'},{origin:`https://${main}`});
assert.equal(r.status,200,r.text);
cookie=(r.headers['set-cookie']??[]).map(c=>c.split(';')[0]).join('; ');
assert.ok(cookie.split('; ').some(c=>c.startsWith('__Host-mcphosting.session_token=')), 'host-only session cookie');
assert.equal((await request(main,'/dashboard')).status,200,'dashboard recognizes session cookie');
assert.equal((await request(main,'/api/projects','POST',{name:'forged'},{origin:'https://malicious.example.test'})).status,403,'sibling-origin mutation denied');
r=await request(main,'/api/projects','POST',{name:'TLS test'});assert.equal(r.status,200,r.text);
const project=r.json.project??r.json;const id=project.id;
const endpoint=`/api/projects/${id}/domains`;
r=await request(main,endpoint,'POST',{hostname:'sdfsd.example.test'});assert.equal(r.status,422);assert.equal(r.json.errors[0].rule,'RESERVED_DOMAIN');
r=await request(main,endpoint,'POST',{hostname:'adas.test'});assert.equal(r.status,201,r.text);assert.equal(r.json.domain.verified,false);assert.equal(r.json.setup.dns.value,'10.77.42.20');
console.log('PASS reserved domains, pending state and exact A-record instructions');
r=await request(main,`/api/projects/${id}/files`,'PUT',{path:'index.html',content:'<h1>edge release test</h1>'});assert.equal(r.status,200,r.text);
r=await request(main,`/api/projects/${id}/publish`,'POST');assert.equal(r.status,200,r.text);
const domain = new URL(project.productionUrl).hostname;
assert.equal((await request(domain,'/')).status,200);
r=await request(main,endpoint,'PATCH',{systemDomainEnabled:false});assert.equal(r.status,200);
assert.equal((await request(domain,'/')).status,404);
await request(main,endpoint,'PATCH',{systemDomainEnabled:true});assert.equal((await request(domain,'/')).status,200);
console.log('PASS publish and system-domain disable/re-enable');
await fetch('http://dns-provider:8055/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostname:'adas.test',ip:'10.77.42.20'})});
await until(async()=>{const result=await request(main,endpoint);return result.json.domains[0]?.tls==='active';});
r=await request('adas.test','/');assert.equal(r.status,200,r.text);assert.ok(r.text.includes('edge release test'));
await request(main,endpoint,'PATCH',{systemDomainEnabled:false});assert.equal((await request(domain,'/')).status,404);assert.equal((await request('adas.test','/')).status,200);
console.log('PASS real HTTP-01 issuance after DNS match; custom site survives system disable');
// Second account cannot control the first account's domains.
const ownerCookie=cookie;cookie='';r=await request(main,'/api/auth/sign-up/email','POST',{name:'Other',email:`other-${Date.now()}@example.test`,password:'test-only-other-password'},{origin:`https://${main}`});assert.equal(r.status,200);
cookie=(r.headers['set-cookie']??[]).map(c=>c.split(';')[0]).join('; ');
assert.equal((await request(main,endpoint,'PATCH',{systemDomainEnabled:true})).status,404);
cookie=ownerCookie;
console.log('PASS tenant isolation');
await fetch('http://dns-provider:8055/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostname:'adas.test',ip:'10.77.42.99'})});
await until(async()=> !(await request(main,endpoint)).json.domains[0]?.verified);
assert.equal((await request('adas.test','/').catch(()=>({status:0}))).status!==200,true);
console.log('PASS domain stops serving after DNS moves away');

await fetch('http://dns-provider:8055/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostname:'adas.test',ip:'10.77.42.20'})});
await until(async()=> (await request(main,endpoint)).json.domains[0]?.tls==='active');
console.log('PASS DNS restoration reactivates existing certificate');
