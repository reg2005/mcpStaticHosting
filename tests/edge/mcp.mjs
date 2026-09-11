import https from 'node:https';
import assert from 'node:assert/strict';
let cookie=''; let token='';let seq=0;
function req(host,path,method='GET',body,headers={}) {return new Promise((resolve,reject)=>{
 const r=https.request({hostname:'edge',port:8443,servername:host,rejectUnauthorized:false,path,method,headers:{host,cookie,origin:'https://example.test',...(body?{'content-type':'application/json'}:{}),...headers}},res=>{
 const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,text,json,headers:res.headers});});});r.on('error',reject);r.setTimeout(10000,()=>r.destroy(new Error('timeout')));if(body)r.write(JSON.stringify(body));r.end();
});}
async function rpc(method,params={}) {
 const res=await req('example.test','/mcp','POST',{jsonrpc:'2.0',id:++seq,method,params},{authorization:`Bearer ${token}`,accept:'application/json, text/event-stream'});
 assert.equal(res.status,200,res.text);const data=res.json??JSON.parse(res.text.split('\n').find(l=>l.startsWith('data:')).slice(5));assert.equal(data.error,undefined);return data.result;
}
async function tool(name,args={}) {const r=await rpc('tools/call',{name,arguments:args});assert.notEqual(r.isError,true,name);return JSON.parse(r.content[0].text);}
assert.equal((await req('example.test','/api/auth/api-key/create','POST',{})).status,401);
let r=await req('example.test','/api/auth/sign-up/email','POST',{name:'MCP Edge Test',email:`mcp-${Date.now()}@example.test`,password:'test-only-mcp-password'});assert.equal(r.status,200,r.text);
cookie=r.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');
r=await req('example.test','/api/auth/api-key/create','POST',{name:'edge-test'});assert.equal(r.status,200,r.text);token=r.json.key;const keyId=r.json.id;
assert.ok((await rpc('tools/list')).tools.some(t=>t.name==='set_system_domain'));
const project=await tool('create_project',{name:'MCP HTTPS'});
const prod=new URL(project.productionUrl).hostname;const preview=new URL(project.previewUrl).hostname;
await tool('write_file',{project:project.id,path:'index.html',content:'first'});
assert.equal((await req(preview,'/')).text,'first');
await tool('publish',{project:project.id});assert.equal((await req(prod,'/')).text,'first');
await tool('write_file',{project:project.id,path:'index.html',content:'second'});
assert.equal((await req(preview,'/')).text,'second');assert.equal((await req(prod,'/')).text,'first');
await tool('publish',{project:project.id});await tool('rollback',{project:project.id,version:1});assert.equal((await req(prod,'/')).text,'first');
await tool('set_system_domain',{project:project.id,enabled:false});assert.equal((await req(prod,'/')).status,404);assert.equal((await req(preview,'/')).status,404);
await tool('set_system_domain',{project:project.id,enabled:true});assert.equal((await req(preview,'/')).status,200);
const bad=await rpc('tools/call',{name:'add_domain',arguments:{project:project.id,hostname:'reserved.example.test'}});assert.equal(bad.isError,true);assert.equal(JSON.parse(bad.content[0].text).errors[0].rule,'RESERVED_DOMAIN');
for(const path of ['/.git/config','/.env','/functions/secret.ts']) assert.notEqual((await req(prod,path)).status,200);
const escaped=await rpc('tools/call',{name:'write_file',arguments:{project:project.id,path:'../../escape',content:'blocked'}});assert.equal(escaped.isError,true);
await tool('set_password',{project:project.id,password:'only-test'});assert.equal((await req(prod,'/')).status,401);await tool('remove_password',{project:project.id});
assert.ok((await req('example.test','/dashboard/settings/tokens')).text.includes('https://example.test/mcp'));
assert.equal((await req('example.test','/monaco/vs/loader.js')).status,200);
await req('example.test','/api/auth/api-key/delete','POST',{keyId});
assert.equal((await req('example.test','/mcp','POST',{}, {authorization:`Bearer ${token}`})).status,401);
console.log('PASS MCP over Nginx HTTPS: tokens, system toggle, domain errors, preview/publish/rollback, passwords, traversal, runtime URL and revocation');
