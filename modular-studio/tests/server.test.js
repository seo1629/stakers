import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {app,registeredDomain} from '../server.js';
import {SAMPLES,DEFAULTS} from '../src/solver.js';
let server,url;
before(async()=>{await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve)});url=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));});
test('registered service URL preserves path and trailing slash',()=>{for(const value of ['http://localhost:8791','https://example.com/project/','https://example.com/'])assert.equal(registeredDomain(value),value);assert.throws(()=>registeredDomain('javascript:alert(1)'));assert.throws(()=>registeredDomain('https://example.com\nKEY=bad'));});
test('search success alone cannot save a connection rejected by parcel API',async t=>{
 const original=globalThis.fetch,domain='http://localhost:8791/registered/';
 t.mock.method(globalThis,'fetch',async(request,options)=>{const u=new URL(request);if(u.hostname!=='api.vworld.kr')return original(request,options);assert.equal(u.searchParams.get('domain'),domain);assert.equal(options.headers.Referer,domain);return Response.json({response:u.pathname==='/req/search'?{status:'OK',result:{items:[]}}:{status:'ERROR',error:{code:'INCORRECT_KEY'}}});});
 const r=await fetch(url+'/api/vworld/connect',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({key:'test-placeholder-key',domain})});assert.equal(r.status,400);const d=await r.json();assert.equal(d.code,'VWORLD_PARCEL_AUTH');assert.match(d.error,/기존 설정은 변경하지 않았습니다/);
});
test('homepage and locally installed graphics/map assets are served',async()=>{for(const p of ['/','/app.js','/viewport.js','/style.css','/vendor/three/build/three.module.js','/vendor/leaflet/leaflet.js'])assert.equal((await fetch(url+p)).status,200,p);});
test('config supplies samples but never a VWorld credential',async()=>{const config=await(await fetch(url+'/api/config')).json();assert.equal(config.samples.length,3);assert.equal(typeof config.vworld,'boolean');assert.equal('VWORLD_API_KEY'in config,false);});
test('solver endpoint returns usable modules',async()=>{const r=await fetch(url+'/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({polygon:[SAMPLES[0].ring],params:DEFAULTS})});assert.equal(r.status,200);assert.ok((await r.json()).alternatives[0].count>0);});
test('malformed requests are rejected without server stack traces',async()=>{const r=await fetch(url+'/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(r.status,400);assert.ok((await r.json()).error);});
test('server source, environment and lockfile are not public',async()=>{for(const p of ['/server.js','/.env','/package-lock.json','/src/solver.js'])assert.equal((await fetch(url+p)).status,404,p);});
test('invalid search and tile coordinates are rejected locally',async()=>{assert.equal((await fetch(url+'/api/search?q=a')).status,400);assert.equal((await fetch(url+'/api/tile/999/1/1')).status,400);});
test('cadastral proxy validates bounds and fixes layer and CRS server-side',async t=>{
 assert.equal((await fetch(url+'/api/cadastral?bbox=0,0,999999,999999&width=256&height=256')).status,400);
 const original=globalThis.fetch,oldKey=process.env.VWORLD_API_KEY;process.env.VWORLD_API_KEY='test-placeholder';
 t.after(()=>{if(oldKey===undefined)delete process.env.VWORLD_API_KEY;else process.env.VWORLD_API_KEY=oldKey;});
 t.mock.method(globalThis,'fetch',async(request,options)=>{const u=new URL(request);if(u.hostname!=='api.vworld.kr')return original(request,options);assert.equal(u.pathname,'/req/wms');assert.equal(u.searchParams.get('layers'),'lt_c_landinfobasemap');assert.equal(u.searchParams.get('crs'),'EPSG:3857');return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});});
 const r=await fetch(url+'/api/cadastral?BBOX=14144000,4511000,14144500,4511500&WIDTH=256&HEIGHT=256&layers=untrusted');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);assert.equal((await r.arrayBuffer()).byteLength,4);
});
test('credential setup rejects foreign origins and malformed keys without saving',async()=>{
 const send=(origin,body)=>fetch(url+'/api/vworld/connect',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
 assert.equal((await send('https://untrusted.example',{key:'test-key-not-real'})).status,403);
 assert.equal((await send(url,{key:'bad',domain:url})).status,400);
});
test('network denial has a specific message and does not expose entered credentials',async t=>{
 const original=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(request,options)=>{if(new URL(request).hostname==='api.vworld.kr')throw new TypeError('fetch failed',{cause:{code:'EACCES'}});return original(request,options);});
 const r=await fetch(url+'/api/vworld/connect',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({key:'private-test-placeholder',domain:url})});
 assert.equal(r.status,502);const body=await r.json();assert.match(body.error,/외부 통신이 차단/);assert.equal(JSON.stringify(body).includes('private-test-placeholder'),false);
});
test('address and single-part multipolygon responses reach the app without credentials',async t=>{
 const originalFetch=globalThis.fetch,previousKey=process.env.VWORLD_API_KEY;
 process.env.VWORLD_API_KEY='test-only-key-not-a-credential';
 t.after(()=>{if(previousKey===undefined)delete process.env.VWORLD_API_KEY;else process.env.VWORLD_API_KEY=previousKey;});
 t.mock.method(globalThis,'fetch',async(request,options)=>{
  const target=new URL(request);
  if(target.hostname!=='api.vworld.kr')return originalFetch(request,options);
  assert.equal(target.searchParams.get('key'),'test-only-key-not-a-credential');
  if(target.pathname==='/req/search')return Response.json({response:{status:'OK',result:{items:[{address:{road:'테스트로 1',parcel:'테스트동 1'},point:{x:'127',y:'37.5'}}]}}});
  return Response.json({response:{status:'OK',result:{featureCollection:{features:[{type:'Feature',properties:{pnu:'1234567890123456789',addr:'테스트동 1'},geometry:{type:'MultiPolygon',coordinates:[[[[127,37.5],[127.0003,37.5],[127.0003,37.5003],[127,37.5003],[127,37.5]]]]}}]}}}});
 });
 const search=await(await fetch(url+'/api/search?q=테스트&type=road')).json();assert.equal(search.items[0].address.road,'테스트로 1');
 const r=await fetch(url+'/api/parcel?lon=127&lat=37.5');assert.equal(r.status,200);const site=await r.json();assert.equal(site.feature.geometry.type,'Polygon');assert.equal(site.pnu,'1234567890123456789');assert.ok(site.polygon[0][1][0]>20);assert.ok(site.polygon[0][2][1]>20);assert.equal(JSON.stringify(site).includes('test-only-key'),false);
});
