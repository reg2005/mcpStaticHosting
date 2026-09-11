import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
const web = process.env.SMOKE_WEB_URL ?? 'http://localhost:3000';
const mcp = process.env.SMOKE_MCP_URL ?? 'http://localhost:3001/mcp';
const router = process.env.SMOKE_ROUTER_URL ?? 'http://127.0.0.1:3002';
const password = randomBytes(24).toString('hex');
let cookie = '';
async function api(route, body, authenticated = true) {
  const res = await fetch(`${web}/api/auth/${route}`, {method:'POST', headers:{'content-type':'application/json', origin:web, ...(authenticated ? {cookie} : {})}, body:JSON.stringify(body)});
  const cookies = res.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(c => c.split(';')[0]).join('; ');
  assert.equal(res.ok, true, `Auth ${route}: HTTP ${res.status}`);
  return res.json();
}
let requestId = 0;
async function rpc(token, method, params) {
  const res = await fetch(mcp, {method:'POST', headers:{authorization:`Bearer ${token}`, 'content-type':'application/json', accept:'application/json, text/event-stream'}, body:JSON.stringify({jsonrpc:'2.0', id:++requestId, method, params})});
  assert.equal(res.status, 200, `MCP ${method}: HTTP ${res.status}`);
  const text = await res.text();
  const data = res.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(text.split('\n').find(l=>l.startsWith('data:')).slice(5)) : JSON.parse(text);
  assert.equal(data.error, undefined, 'Unexpected JSON-RPC error');
  return data.result;
}
async function tool(token, name, args = {}) {
  const result = await rpc(token, 'tools/call', {name, arguments:args});
  assert.notEqual(result.isError, true, `Tool ${name} failed`);
  return JSON.parse(result.content[0].text);
}
function site(url, pathname = '/', headers = {}) {
  const host = new URL(url).host;
  return new Promise((resolve,reject)=>{
    http.get(`${router}${pathname}`, {headers:{host, ...headers}}, res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode, body}));
    }).on('error', reject);
  });
}
for (const base of [web, mcp.replace(/\/mcp$/, ''), router]) assert.equal((await fetch(`${base}/healthz`)).status, 200);
assert.equal((await fetch(mcp,{method:'POST'})).status,401);
const anonymousKey = await fetch(`${web}/api/auth/api-key/create`, {method:'POST',headers:{'content-type':'application/json',origin:web},body:'{}'});
assert.equal(anonymousKey.status,401);
await api('sign-up/email',{name:'Smoke Test',email:`smoke-${Date.now()}@example.com`,password},false);
const {key, id:keyId} = await api('api-key/create',{name:'smoke'});
assert.equal(typeof key,'string');
const listing = await rpc(key,'tools/list',{});
assert(listing.tools.some(t=>t.name==='create_project'));
const project = await tool(key,'create_project',{name:`smoke-${Date.now()}`});
assert.equal(new URL(project.previewUrl).protocol, new URL(router).protocol);
await tool(key,'write_file',{project:project.id,path:'index.html',content:'<h1>first release</h1>'});
assert.match((await site(project.previewUrl)).body,/first release/);
await tool(key,'write_file',{project:project.id,path:'functions/api/hello.ts',content:'export default () => Response.json({hello: true});'});
const functionResponse = await site(project.previewUrl,'/api/hello');
assert.equal(functionResponse.status,process.env.SMOKE_FUNCTIONS === 'true' ? 200 : 503);
if (process.env.SMOKE_FUNCTIONS === 'true') assert.equal(JSON.parse(functionResponse.body).hello,true);
await tool(key,'publish',{project:project.id});
assert.match((await site(project.productionUrl)).body,/first release/);
await tool(key,'write_file',{project:project.id,path:'index.html',content:'<h1>second draft</h1>'});
assert.match((await site(project.previewUrl)).body,/second draft/);
assert.match((await site(project.productionUrl)).body,/first release/);
await tool(key,'publish',{project:project.id});
assert.match((await site(project.productionUrl)).body,/second draft/);
await tool(key,'rollback',{project:project.id,version:1});
assert.match((await site(project.productionUrl)).body,/first release/);
for (const p of ['/.git/config','/.env','/functions/private.ts']) assert.notEqual((await site(project.previewUrl,p)).status,200);
const escape = await rpc(key,'tools/call',{name:'write_file',arguments:{project:project.id,path:'../../outside',content:'blocked'}});
assert.equal(escape.isError,true);
await tool(key,'set_password',{project:project.id,password:'smoke-site-password'});
assert.equal((await site(project.productionUrl)).status,401);
await tool(key,'remove_password',{project:project.id});
assert.equal((await site(project.productionUrl)).status,200);
const config = await fetch(`${web}/dashboard/settings/tokens`,{headers:{cookie}});
assert((await config.text()).includes(mcp),'Dashboard must use runtime MCP URL');
assert.equal((await fetch(`${web}/monaco/vs/loader.js`)).status,200);
const firstCookie = cookie;
await api('sign-up/email',{name:'Other Test',email:`other-${Date.now()}@example.com`,password},false);
const other = await api('api-key/create',{name:'other'});
const denied = await rpc(other.key,'tools/call',{name:'read_file',arguments:{project:project.id,path:'index.html'}});
assert.equal(denied.isError,true);
cookie = firstCookie;
await api('api-key/delete',{keyId});
assert.equal((await fetch(mcp,{method:'POST',headers:{authorization:`Bearer ${key}`}})).status,401);
console.log('PASS: health, auth, API keys, runtime MCP URL, local editor assets, publishing, preview isolation, dotfiles, traversal, site password, tenant isolation, revocation');
