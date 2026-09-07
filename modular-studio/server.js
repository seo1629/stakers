import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import proj4 from 'proj4';
import clipping from 'polygon-clipping';
import {readFile,writeFile} from 'node:fs/promises';
import {solve,DEFAULTS,SAMPLES,validatePolygon} from './src/solver.js';

const root=path.dirname(fileURLToPath(import.meta.url));
export const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'200kb'}));
app.use('/vendor/three',express.static(path.join(root,'node_modules/three')));
app.use('/vendor/leaflet',express.static(path.join(root,'node_modules/leaflet/dist')));
app.use(express.static(path.join(root,'public')));
app.get('/api/config',(_req,res)=>res.json({vworld:!!process.env.VWORLD_API_KEY,vworldDomain:process.env.VWORLD_DOMAIN||'http://localhost:8791',defaults:DEFAULTS,samples:SAMPLES}));
export function registeredDomain(value){
 if(typeof value!=='string'||value.length>1000||/[\r\n]/.test(value))throw new Error('등록 URL 형식을 확인하세요.');
 const exact=value.trim(),parsed=new URL(exact);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('등록 URL 형식을 확인하세요.');
 return exact;
}
// Local-only credential setup. Never accept cross-origin or non-JSON writes.
app.post('/api/vworld/connect',async(req,res)=>{
 const origin=req.get('origin');
 if(!origin||origin!==`http://${req.get('host')}`||!req.is('application/json'))return res.status(403).json({error:'현재 사이트의 연결 설정 화면에서 요청하세요.'});
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))return res.status(403).json({error:'이 PC의 localhost에서만 연결 설정을 변경할 수 있습니다.'});
 const key=(typeof req.body?.key==='string'?req.body.key.trim():'')||process.env.VWORLD_API_KEY||'';
 let domain;
 try{domain=registeredDomain(req.body.domain||origin);}catch{return res.status(400).json({error:'VWorld 인증키 관리에 등록한 서비스 URL을 그대로 입력하세요.'});}
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(key))return res.status(400).json({error:'발급받은 API 키를 확인하세요.'});
 let stage='network';
 try{
  const response=await vworld('/req/search',{service:'search',request:'search',version:'2.0',query:'서울특별시 중구 세종대로 110',type:'address',category:'road',size:1,format:'json'},{key,domain});
  const data=await response.json();
  if(!['OK','NOT_FOUND'].includes(data.response?.status)){
   const rawCode=data.response?.error?.code;
   const code=typeof rawCode==='string'&&/^[A-Z0-9_]{1,60}$/.test(rawCode)?rawCode:'UNKNOWN';
   return res.status(400).json({error:`VWorld가 요청을 거부했습니다 (${code}). API 키, 등록 URL, 검색 API 사용 권한을 확인하세요.`});
  }
  const parcel=await(await vworld('/req/data',{service:'data',request:'GetFeature',version:'2.0',data:'LP_PA_CBND_BUBUN',geomFilter:'POINT(126.9784 37.5666)',crs:'EPSG:4326',size:1,format:'json'},{key,domain})).json();
  if(!['OK','NOT_FOUND'].includes(parcel.response?.status)){
   const rawCode=parcel.response?.error?.code,code=typeof rawCode==='string'&&/^[A-Z0-9_]{1,60}$/.test(rawCode)?rawCode:'UNKNOWN';
   return res.status(400).json({code:'VWORLD_PARCEL_AUTH',error:`주소 검색은 성공했지만 필지 API에서 거부됐습니다 (${code}). 인증키 관리의 서비스 URL을 정확히 입력하고 2D데이터 API 사용 설정을 확인하세요. 기존 설정은 변경하지 않았습니다.`});
  }
  stage='save';
  const envPath=path.join(root,'.env');let previous='';try{previous=await readFile(envPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const kept=previous.split(/\r?\n/).filter(l=>!/^\s*(VWORLD_API_KEY|VWORLD_DOMAIN)\s*=/.test(l));
  await writeFile(envPath,[...kept,`VWORLD_API_KEY=${key}`,`VWORLD_DOMAIN=${JSON.stringify(domain)}`,''].join('\n'),'utf8');
  process.env.VWORLD_API_KEY=key;process.env.VWORLD_DOMAIN=domain;
  res.json({connected:true,domain,message:'주소 검색과 필지 조회 인증을 확인하고 저장했습니다.'});
 }catch(error){
  const code=error.cause?.code||error.code;
  const message=stage==='save'?'.env 설정 파일을 저장하지 못했습니다. 프로젝트 폴더의 쓰기 권한을 확인하세요.'
   :code==='EACCES'||code==='EPERM'?'서버의 외부 통신이 차단되었습니다. VS Code 터미널에서 npm start로 실행하거나 실행 환경의 네트워크 권한을 허용하세요.'
   :error.name==='TimeoutError'?'VWorld 연결 시간이 초과되었습니다. 잠시 후 다시 시도하세요.'
   :error instanceof SyntaxError?'VWorld에서 예상한 데이터 형식으로 응답하지 않았습니다. 잠시 후 다시 시도하세요.'
   :'VWorld 서버에 연결하지 못했습니다. 인터넷 연결·방화벽·서비스 상태를 확인하세요.';
  res.status(502).json({error:message});
 }
});
app.post('/api/solve',(req,res)=>{try{res.json(solve(req.body));}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/site/manual',(req,res)=>{
 try{
  const ring=req.body?.ring;
  if(!Array.isArray(ring)||ring.length<3||ring.length>300)throw new Error('경계점을 3개 이상 300개 이하로 찍어주세요.');
  const points=ring.map(pt=>{
   const lon=Number(pt?.[0]),lat=Number(pt?.[1]);
   if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<124||lon>132||lat<33||lat>39)throw new Error('대한민국 내 좌표만 사용할 수 있습니다.');
   return [lon,lat];
  });
  const closed=points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1]?points:[...points,points[0]];
  const unique=closed.slice(0,-1);
  const lon=unique.reduce((s,p)=>s+p[0],0)/unique.length,lat=unique.reduce((s,p)=>s+p[1],0)/unique.length;
  const crs=`+proj=aeqd +lat_0=${lat} +lon_0=${lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;
  const projected=closed.map(pt=>proj4('EPSG:4326',crs,pt));
  if(!projected.flat().every(Number.isFinite))throw new Error('좌표를 변환하지 못했습니다. 경계를 다시 그려주세요.');
  const {polygon}=validatePolygon([projected]);
  const name=typeof req.body?.name==='string'&&req.body.name.trim()?req.body.name.trim().slice(0,200):'직접 그린 경계';
  res.json({polygon,feature:{type:'Feature',properties:{addr:name},geometry:{type:'Polygon',coordinates:[closed]}},origin:[lon,lat],crs,name,pnu:'',source:'manual',retrievedAt:new Date().toISOString()});
 }catch(e){res.status(400).json({error:e.message});}
});
// Node's fetch() throws a bare "fetch failed" (with a .cause code) on network-level failures.
// Our own thrown Errors (bad input, VWorld rejected the request, etc.) already carry a useful
// Korean message and have no .cause, so only network-level failures get replaced here.
function friendlyFetchError(e,fallback){
 if(e.name==='TimeoutError')return '요청 시간이 초과되었습니다. 잠시 후 다시 시도하세요.';
 const code=e.cause?.code;
 if(code)return code==='EACCES'||code==='EPERM'?'서버의 외부 통신이 차단되었습니다. 네트워크 권한을 확인하세요.':`${fallback} (${code})`;
 if(e.message==='fetch failed')return fallback;
 return e.message||fallback;
}
app.post('/api/site/merge',(req,res)=>{
 try{
  const features=req.body?.features;
  if(!Array.isArray(features)||features.length<2||features.length>20)throw new Error('합칠 필지를 2개 이상 20개 이하로 선택하세요.');
  const polys=features.map(f=>{
   const geom=f?.geometry;
   if(geom?.type==='Polygon'&&Array.isArray(geom.coordinates))return geom.coordinates;
   if(geom?.type==='MultiPolygon'&&Array.isArray(geom.coordinates)&&geom.coordinates.length===1)return geom.coordinates[0];
   throw new Error('지원하지 않는 필지 형상이 포함되어 있습니다.');
  });
  const merged=clipping.union(...polys);
  if(!Array.isArray(merged)||merged.length!==1)throw new Error('선택한 필지들이 서로 붙어 있지 않습니다. 인접한 필지를 선택하세요.');
  const ring=merged[0],outer=ring[0];
  if(!Array.isArray(outer)||outer.length<4)throw new Error('합쳐진 필지 경계를 계산하지 못했습니다.');
  const unique=outer.slice(0,-1);
  const lon=unique.reduce((s,p)=>s+p[0],0)/unique.length,lat=unique.reduce((s,p)=>s+p[1],0)/unique.length;
  const crs=`+proj=aeqd +lat_0=${lat} +lon_0=${lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;
  const projected=ring.map(r=>r.map(pt=>proj4('EPSG:4326',crs,pt.slice(0,2))));
  if(!projected.flat().every(pt=>pt.every(Number.isFinite)))throw new Error('합쳐진 경계 좌표를 변환하지 못했습니다.');
  const {polygon}=validatePolygon(projected);
  const name=typeof req.body?.name==='string'&&req.body.name.trim()?req.body.name.trim().slice(0,200):`합필 (${features.length}필지)`;
  res.json({polygon,feature:{type:'Feature',properties:{addr:name},geometry:{type:'Polygon',coordinates:ring}},origin:[lon,lat],crs,name,pnu:'',source:'merged',retrievedAt:new Date().toISOString()});
 }catch(e){res.status(400).json({error:e.message});}
});
async function vworld(endpoint,params,credentials={}){
 const key=credentials.key||process.env.VWORLD_API_KEY;
 if(!key)throw new Error('주소 검색을 사용하려면 VWorld 연결 설정에서 API 키를 입력하세요.');
 const url=new URL(endpoint,'https://api.vworld.kr');
 Object.entries({...params,key,domain:credentials.domain||process.env.VWORLD_DOMAIN||'http://localhost:8791'}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
 const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Referer:credentials.domain||process.env.VWORLD_DOMAIN||'http://localhost:8791'}});
 if(!response.ok)throw new Error(`VWorld 응답 오류 (${response.status})`);
 return response;
}
app.get('/api/search',async(req,res)=>{
 try{
  const query=String(req.query.q||'').trim();if(query.length<2||query.length>150)return res.status(400).json({error:'주소를 2~150자로 입력하세요.'});
  const data=await(await vworld('/req/search',{service:'search',request:'search',version:'2.0',query,type:'address',category:req.query.type==='road'?'road':'parcel',size:8,format:'json'})).json();
  if(data.response?.status==='ERROR')throw new Error(data.response.error?.text||'주소를 조회하지 못했습니다.');
  res.json({items:data.response?.result?.items||[]});
 }catch(e){res.status(502).json({error:friendlyFetchError(e,'주소 조회 서버에 연결하지 못했습니다. 인터넷 연결과 VWorld 서비스 상태를 확인하세요.')});}
});
app.get('/api/parcel',async(req,res)=>{
 try{
  const lon=Number(req.query.lon),lat=Number(req.query.lat);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<124||lon>132||lat<33||lat>39)throw new Error('대한민국 내 위치를 선택하세요.');
  const data=await(await vworld('/req/data',{service:'data',request:'GetFeature',version:'2.0',data:'LP_PA_CBND_BUBUN',geomFilter:`POINT(${lon} ${lat})`,crs:'EPSG:4326',size:5,format:'json',geometry:'true',attribute:'true'})).json();
  if(data.response?.status==='ERROR'){
   const code=data.response.error?.code;
   if(['INCORRECT_KEY','INVALID_KEY','UNAVAILABLE_KEY','INVALID_DOMAIN'].includes(code))throw Object.assign(new Error(`필지 API 인증이 거부됐습니다 (${code}). VWorld 연결 설정에서 인증키에 등록한 서비스 URL과 2D데이터 API 사용 설정을 확인하세요. 주소 검색 성공과 필지 조회 인증은 별개입니다.`),{status:403,code:'VWORLD_PARCEL_AUTH'});
   throw new Error(data.response.error?.text||'필지를 조회하지 못했습니다.');
  }
  const features=data.response?.result?.featureCollection?.features||[];
  if(!features.length)throw new Error('이 위치의 필지 경계를 찾지 못했습니다. 필지 안쪽을 다시 선택하세요.');
  const feature=features[0];
  if(feature.geometry?.type==='MultiPolygon'&&feature.geometry.coordinates.length===1)feature.geometry={type:'Polygon',coordinates:feature.geometry.coordinates[0]};
  if(feature.geometry?.type!=='Polygon')throw new Error('이 필지는 여러 영역으로 분리돼 있어 현재 배치 엔진에서 지원하지 않습니다.');
  const crs=`+proj=aeqd +lat_0=${lat} +lon_0=${lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;
  const polygon=feature.geometry.coordinates.map(r=>r.map(pt=>proj4('EPSG:4326',crs,pt.slice(0,2))));
  if(!polygon.flat().every(pt=>pt.every(Number.isFinite)))throw new Error('필지 좌표를 변환하지 못했습니다. 다른 필지를 선택하세요.');
  res.json({polygon,feature,origin:[lon,lat],crs,name:feature.properties?.addr||feature.properties?.jibun||'선택한 필지',pnu:feature.properties?.pnu||'',source:'VWorld 연속지적도',retrievedAt:new Date().toISOString()});
 }catch(e){res.status(e.status||502).json({code:e.code,error:friendlyFetchError(e,'필지 조회 서버에 연결하지 못했습니다. 인터넷 연결과 VWorld 서비스 상태를 확인하세요.')});}
});
app.get('/api/tile/:z/:x/:y',async(req,res)=>{
 try{
  const {z,x,y}=req.params;if(![z,x,y].every(v=>/^\d{1,8}$/.test(v))||+z>19)return res.sendStatus(400);
  if(!process.env.VWORLD_API_KEY)return res.sendStatus(503);
  const url=`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(process.env.VWORLD_API_KEY)}/Base/${z}/${y}/${x}.png`;
  const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Referer:process.env.VWORLD_DOMAIN||'http://localhost:8791'}});
  if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))return res.sendStatus(502);res.type('png').send(Buffer.from(await r.arrayBuffer()));
 }catch{res.sendStatus(502);}
});
app.get('/api/cadastral',async(req,res)=>{
 const query=Object.fromEntries(Object.entries(req.query).map(([k,v])=>[k.toLowerCase(),v]));
 const bbox=String(query.bbox||'').split(',').map(Number),width=Number(query.width),height=Number(query.height);
 if(bbox.length!==4||!bbox.every(v=>Number.isFinite(v)&&Math.abs(v)<=20040000)||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[2]-bbox[0]>10000||bbox[3]-bbox[1]>10000||![256,512].includes(width)||![256,512].includes(height))return res.status(400).json({error:'유효한 지적도 지도 범위가 필요합니다.'});
 try{
  const r=await vworld('/req/wms',{service:'WMS',request:'GetMap',version:'1.3.0',layers:'lt_c_landinfobasemap',styles:'',crs:'EPSG:3857',bbox:bbox.join(','),width,height,format:'image/png',transparent:'true',exceptions:'text/xml'});
  if(!r.headers.get('content-type')?.startsWith('image/')){
   const body=await r.text(),code=body.match(/ServiceException\s+code=["']([A-Z0-9_]{1,60})["']/)?.[1]||'NO_IMAGE';
   return res.status(502).json({error:`지적도 요청이 거부되었습니다 (${code}). VWorld WMS 권한과 등록 URL을 확인하세요.`});
  }
  res.type('png').send(Buffer.from(await r.arrayBuffer()));
 }catch{res.status(502).json({error:'VWorld 지적도를 불러오지 못했습니다. 연결과 WMS 권한을 확인하세요.'});}
});
const ZONE_LIMITS={
 '제1종전용주거지역':{coverage:50,farMin:50,farMax:100},'제2종전용주거지역':{coverage:50,farMin:50,farMax:150},
 '제1종일반주거지역':{coverage:60,farMin:100,farMax:200},'제2종일반주거지역':{coverage:60,farMin:100,farMax:250},'제3종일반주거지역':{coverage:50,farMin:100,farMax:300},
 '준주거지역':{coverage:70,farMin:200,farMax:500},
 '중심상업지역':{coverage:90,farMin:200,farMax:1500},'일반상업지역':{coverage:80,farMin:200,farMax:1300},'근린상업지역':{coverage:70,farMin:200,farMax:900},'유통상업지역':{coverage:80,farMin:200,farMax:1100},
 '전용공업지역':{coverage:70,farMin:150,farMax:300},'일반공업지역':{coverage:70,farMin:150,farMax:350},'준공업지역':{coverage:70,farMin:150,farMax:400},
 '보전녹지지역':{coverage:20,farMin:50,farMax:80},'생산녹지지역':{coverage:20,farMin:50,farMax:100},'자연녹지지역':{coverage:20,farMin:50,farMax:100},
 '보전관리지역':{coverage:20,farMin:50,farMax:80},'생산관리지역':{coverage:20,farMin:50,farMax:80},'계획관리지역':{coverage:40,farMin:50,farMax:100},
 '농림지역':{coverage:20,farMin:50,farMax:80},'자연환경보전지역':{coverage:20,farMin:50,farMax:80}
};
function zoneLimits(name){
 if(typeof name!=='string')return null;
 const clean=name.trim();
 if(ZONE_LIMITS[clean])return {zone:clean,...ZONE_LIMITS[clean]};
 const found=Object.keys(ZONE_LIMITS).find(z=>clean.includes(z));
 return found?{zone:clean,...ZONE_LIMITS[found]}:null;
}
// 용도지역지구도는 별도 공공데이터 키가 필요 없다 — VWorld가 자체 데이터로 제공하는
// 레이어(lt_c_uq111 / LT_C_UQ111)라서 이미 연결된 VWorld 키를 그대로 재사용한다.
app.get('/api/zonemap',async(req,res)=>{
 const query=Object.fromEntries(Object.entries(req.query).map(([k,v])=>[k.toLowerCase(),v]));
 const bbox=String(query.bbox||'').split(',').map(Number),width=Number(query.width),height=Number(query.height);
 if(bbox.length!==4||!bbox.every(v=>Number.isFinite(v)&&Math.abs(v)<=20040000)||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[2]-bbox[0]>10000||bbox[3]-bbox[1]>10000||![256,512].includes(width)||![256,512].includes(height))return res.status(400).json({error:'유효한 지도 범위가 필요합니다.'});
 try{
  const r=await vworld('/req/wms',{service:'WMS',request:'GetMap',version:'1.3.0',layers:'lt_c_uq111',styles:'',crs:'EPSG:3857',bbox:bbox.join(','),width,height,format:'image/png',transparent:'true',exceptions:'text/xml'});
  if(!r.headers.get('content-type')?.startsWith('image/')){
   const body=await r.text(),code=body.match(/ServiceException\s+code=["']([A-Z0-9_]{1,60})["']/)?.[1]||'NO_IMAGE';
   return res.status(502).json({error:`용도지역지구도 요청이 거부되었습니다 (${code}). VWorld 연결과 WMS 권한을 확인하세요.`});
  }
  res.type('png').send(Buffer.from(await r.arrayBuffer()));
 }catch(e){res.status(502).json({error:friendlyFetchError(e,'용도지역지구도를 불러오지 못했습니다. VWorld 연결과 WMS 권한을 확인하세요.')});}
});
app.get('/api/zone',async(req,res)=>{
 try{
  const lon=Number(req.query.lon),lat=Number(req.query.lat);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<124||lon>132||lat<33||lat>39)throw new Error('대한민국 내 위치가 필요합니다.');
  const data=await(await vworld('/req/data',{service:'data',request:'GetFeature',version:'2.0',data:'LT_C_UQ111',geomFilter:`POINT(${lon} ${lat})`,crs:'EPSG:4326',size:1,format:'json',attribute:'true'})).json();
  if(data.response?.status==='ERROR')throw new Error(data.response.error?.text||'용도지역을 조회하지 못했습니다.');
  const feature=data.response?.result?.featureCollection?.features?.[0];
  if(!feature)throw new Error('이 위치의 용도지역 정보를 찾지 못했습니다.');
  const zoneName=feature.properties?.uname;
  const limits=zoneLimits(zoneName);
  if(!limits){console.error('[zone] 알 수 없는 용도지역 값:',JSON.stringify(feature.properties).slice(0,500));throw new Error(`용도지역명을 인식하지 못했습니다${zoneName?` (${zoneName})`:''}.`);}
  res.json({...limits,note:'국토계획법 시행령 별표 기준 전국 상한입니다. 실제 적용값은 지자체 조례를 확인하세요.'});
 }catch(e){res.status(502).json({error:friendlyFetchError(e,'용도지역 조회 서버에 연결하지 못했습니다. 인터넷 연결과 VWorld 서비스 상태를 확인하세요.')});}
});
app.use((error,_req,res,_next)=>res.status(400).json({error:error.type==='entity.too.large'?'입력 파일이 너무 큽니다.':'요청 형식을 확인하세요.'}));
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))app.listen(Number(process.env.PORT)||8791,'127.0.0.1',()=>console.log(`Module Ground: http://localhost:${Number(process.env.PORT)||8791}`));
