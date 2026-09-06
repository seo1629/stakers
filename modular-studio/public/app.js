import {createViewport} from './viewport.js';
const $=id=>document.getElementById(id),form=$('designForm');
const state={config:null,site:null,params:null,result:null,active:'maximum',dirty:false};
let viewport,map,parcelLayer,requestVersion=0,parcelVersion=0,searchVersion=0,toastTimer;
let baseLayer,cadastralLayer,mapMode='base',cadastralFailed=false;
let searchMarker;
function locateAddress(item){
 const lon=Number(item.point?.x),lat=Number(item.point?.y);
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<124||lon>132||lat<33||lat>39)return false;
 showView('map');if(!map)return false;
 if(searchMarker)map.removeLayer(searchMarker);
 map.stop();map.invalidateSize({pan:false});map.setView([lat,lon],18,{animate:false});
 const popup=document.createElement('div');popup.className='search-location-popup';
 const heading=document.createElement('strong');heading.textContent=item.address?.road||item.address?.parcel||item.title||'검색한 주소';
 const note=document.createElement('p');note.textContent='검색 위치입니다. 이 위치의 필지를 대지로 선택할 수 있습니다.';
 const button=document.createElement('button');button.type='button';button.className='button primary';button.textContent='이 위치의 필지 선택';
 button.addEventListener('click',async()=>{button.disabled=true;button.textContent='필지 불러오는 중…';const ok=await selectParcel(lon,lat,item.address?.parcel||item.address?.road||item.title);if(!ok){button.disabled=false;button.textContent='필지 다시 선택';}});
 popup.append(heading,note,button);
 searchMarker=L.circleMarker([lat,lon],{radius:10,color:'#fff',weight:3,fillColor:'#dc793f',fillOpacity:1,bubblingMouseEvents:false}).addTo(map);
 searchMarker.bindTooltip('검색한 주소',{direction:'bottom',permanent:true,className:'search-address-label',offset:[0,12]});
 searchMarker.bindPopup(popup,{maxWidth:270,autoPanPaddingTopLeft:[25,135],autoPanPaddingBottomRight:[25,165]}).openPopup();
 return true;
}
const mapChrome=document.createElement('div');mapChrome.className='map-mode-controls';mapChrome.innerHTML='<div class="segmented" role="group" aria-label="지도 종류"><button id="mapBase" class="active" aria-pressed="true">일반지도</button><button id="mapCadastral" aria-pressed="false">지적도</button><button id="mapOverlay" aria-pressed="false">중첩 보기</button></div><p id="cadastralStatus" role="status"></p>';$('mapPanel').append(mapChrome);
const selectedCard=document.createElement('section');selectedCard.id='selectedParcelCard';selectedCard.className='selected-parcel-card';selectedCard.hidden=true;selectedCard.setAttribute('aria-live','polite');selectedCard.innerHTML='<span class="selection-badge">✓ 필지 선택 완료</span><strong id="selectedParcelAddress"></strong><p id="selectedParcelFacts"></p><div><button id="zoomSelected" class="button">선택 필지로 이동</button><button id="selectedCadastral" class="button primary">지적도로 보기</button></div>';$('mapPanel').append(selectedCard);
function setMapMode(mode){if(!map){showView('map');if(!map)return;}mapMode=mode;cadastralFailed=false;if(mode==='cadastral'){if(map.hasLayer(baseLayer))map.removeLayer(baseLayer);}else if(!map.hasLayer(baseLayer))baseLayer.addTo(map);if(mode==='base'){if(cadastralLayer&&map.hasLayer(cadastralLayer))map.removeLayer(cadastralLayer);$('cadastralStatus').textContent='';}else{if(!cadastralLayer){cadastralLayer=L.tileLayer.wms('/api/cadastral',{layers:'lt_c_landinfobasemap',format:'image/png',transparent:true,version:'1.3.0',maxZoom:19,minZoom:14,attribution:'VWorld LX맵(편집지적도)'});cadastralLayer.on('loading',()=>{if(mapMode!=='base')$('cadastralStatus').textContent='지적도 불러오는 중…';});cadastralLayer.on('tileerror',()=>{if(mapMode==='base')return;setMapMode('base');cadastralFailed=true;$('cadastralStatus').textContent='지적도 로드 실패 · 일반지도를 유지합니다. WMS 키·권한을 확인하세요.';});cadastralLayer.on('load',()=>{if(mapMode!=='base'&&!cadastralFailed)$('cadastralStatus').textContent='LX 편집지적도 · 선택 필지는 파란색으로 표시';});}cadastralLayer.addTo(map);if(map.getZoom()<16)map.setZoom(16);cadastralLayer.redraw();}for(const [id,value]of [['mapBase','base'],['mapCadastral','cadastral'],['mapOverlay','overlay']]){$(id).classList.toggle('active',mode===value);$(id).setAttribute('aria-pressed',mode===value);}parcelLayer?.bringToFront();}
for(const [id,mode]of [['mapBase','base'],['mapCadastral','cadastral'],['mapOverlay','overlay'],['selectedCadastral','cadastral']])$(id).addEventListener('click',()=>setMapMode(mode));
function zoomSelection(){if(parcelLayer)map.fitBounds(parcelLayer.getBounds(),{paddingTopLeft:[35,140],paddingBottomRight:[35,170],maxZoom:19});}
$('zoomSelected').addEventListener('click',zoomSelection);
function syncSelectedParcel(){
 if(searchMarker&&map){map.removeLayer(searchMarker);searchMarker=null;}
 if(parcelLayer&&map){map.removeLayer(parcelLayer);parcelLayer=null;}
 const site=state.site,selected=site?.source!=='sample'&&site?.feature;
 selectedCard.hidden=!selected;if(!selected)return;
 $('selectedParcelAddress').textContent=site.name;$('selectedParcelFacts').textContent=`경계 면적 ${fmt(siteArea(site.polygon))}㎡ · PNU ${site.pnu||'미제공'}`;
 if(!map)return;
 const label=document.createElement('span');label.textContent='✓ 선택한 필지';
 parcelLayer=L.geoJSON(site.feature,{style:{color:'#244cd6',weight:4,fillColor:'#6387f6',fillOpacity:.28},interactive:false}).addTo(map);
 parcelLayer.bindTooltip(label,{permanent:true,direction:'center',className:'parcel-selection-label'}).openTooltip();parcelLayer.bringToFront();
}
function updateConnection(){const connected=state.config.vworld;$('connectionStatus').textContent=connected?'VWorld 연결 설정됨':'예시 대지 모드';$('connectVworld').textContent=connected?'연결 설정':'VWorld 연결';$('addressStatus').textContent=connected?'도로명·지번 주소로 검색한 후 대상 필지를 선택하세요.':'주소 검색을 사용하려면 VWorld API 키를 연결하세요.';}
function openConnection(){ $('vworldDomain').value=state.config?.vworldDomain||location.origin;$('vworldKey').required=!state.config?.vworld;$('vworldKey').placeholder=state.config?.vworld?'비워두면 저장된 키 사용':'발급받은 API 키';$('vworldStatus').textContent='VWorld 인증키 관리에 표시된 서비스 URL을 입력하세요. 현재 브라우저 주소와 다를 수 있습니다.';if(!$('vworldDialog').open)$('vworldDialog').showModal(); }
$('connectVworld').addEventListener('click',openConnection);
$('closeVworld').addEventListener('click',()=>$('vworldDialog').close());
$('vworldDialog').addEventListener('close',()=>$('vworldKey').value='');
$('vworldForm').addEventListener('submit',async e=>{e.preventDefault();$('submitVworld').disabled=true;$('vworldStatus').textContent='주소 검색과 필지 조회 인증을 확인하고 있습니다…';try{const r=await json('/api/vworld/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:$('vworldKey').value,domain:$('vworldDomain').value})});state.config.vworld=true;state.config.vworldDomain=r.domain;updateConnection();$('vworldDialog').close();if(!$('mapPanel').hidden)initMap();toast(r.message);}catch(error){$('vworldStatus').textContent=error.message;}finally{$('submitVworld').disabled=false;}});
const mapConnect=document.createElement('button');mapConnect.className='button primary';mapConnect.textContent='VWorld 키 연결';mapConnect.addEventListener('click',openConnection);$('mapSetup').insertBefore(mapConnect,$('return3d'));
async function searchAddress(query,type,container,status){
 if(!state.config?.vworld){openConnection();return;}
 query=query.trim();if(query.length<2){status.textContent='주소를 두 글자 이상 입력하세요.';return;}
 showView('map');$('siteAddress').value=query;$('addressInput').value=query;parcelVersion++;
 if(searchMarker){map.removeLayer(searchMarker);searchMarker=null;}
 const version=++searchVersion;container.replaceChildren();status.textContent='주소를 찾고 있습니다…';
 try{
  const types=type==='auto'?['road','parcel']:[type];
  const settled=await Promise.allSettled(types.map(t=>json(`/api/search?q=${encodeURIComponent(query)}&type=${t}`)));
  if(version!==searchVersion)return;
  const responses=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
  if(!responses.length)throw settled[0].reason;
  const seen=new Set(),items=responses.flatMap(r=>r.items).filter(item=>{const k=`${item.point?.x},${item.point?.y},${item.address?.parcel||item.address?.road}`;if(seen.has(k))return false;seen.add(k);return true;});
  const located=items.find(item=>{const lon=Number(item.point?.x),lat=Number(item.point?.y);return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=124&&lon<=132&&lat>=33&&lat<=39;});
  if(located)locateAddress(located);
  status.textContent=located?`${items.length}개 주소를 찾았습니다. ${items.length>1?'첫 번째 결과를':'검색 위치를'} 지도에 표시했습니다.`:items.length?'주소는 찾았지만 지도 좌표가 없습니다. 다른 주소로 검색하세요.':'검색 결과가 없습니다. 시·군·구와 번지까지 입력해 보세요.';
  for(const item of items){const button=document.createElement('button');button.type='button';const title=document.createElement('strong'),sub=document.createElement('span');title.textContent=item.address?.road||item.address?.parcel||item.title;sub.textContent=item.address?.parcel||'필지 경계 가져오기';button.append(title,sub);button.addEventListener('click',async()=>{container.replaceChildren();status.textContent='필지 경계를 가져오고 있습니다…';showView('map');const ok=await selectParcel(Number(item.point?.x),Number(item.point?.y),item.address?.parcel||item.address?.road||item.title);status.textContent=ok?'필지를 선택했습니다. 건축 조건을 확인한 후 배치를 생성하세요.':'필지를 가져오지 못했습니다. 주소를 다시 검색하세요.';});container.append(button);}
 }catch(e){if(version===searchVersion){status.textContent=e.message;toast(e.message,true);}}
}
$('findAddress').addEventListener('click',()=>searchAddress($('siteAddress').value,$('siteAddressType').value,$('siteAddressResults'),$('addressStatus')));
$('siteAddress').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('findAddress').click();}});
const fmt=(n,d=1)=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:d});
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
async function json(url,options={}){const response=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(30000)});let data;try{data=await response.json();}catch{throw new Error('서버 응답을 읽지 못했습니다. 서버 실행 상태를 확인하세요.');}if(!response.ok)throw Object.assign(new Error(data.error||'요청을 완료하지 못했습니다.'),{code:data.code});return data;}
function paramsFromForm(){return Object.fromEntries([...form.querySelectorAll('input[name]')].map(el=>[el.name,Number(el.value)]));}
function fillForm(p){for(const [key,value]of Object.entries(p)){const el=form.elements.namedItem(key);if(el)el.value=value;}}
function active(){return state.result?.alternatives.find(a=>a.id===state.active)||state.result?.alternatives[0];}
function siteArea(polygon){const a=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2;return a(polygon[0])-polygon.slice(1).reduce((s,r)=>s+a(r),0);}
function setSite(site){state.site=site;$('projectTitle').textContent=site.name;$('sourceBadge').textContent=site.source==='sample'?'예시 프로젝트':'필지 선택 완료';$('siteArea').replaceChildren(document.createTextNode(fmt(siteArea(site.polygon))+' '));const unit=document.createElement('small');unit.textContent='㎡';$('siteArea').append(unit);$('siteDescription').textContent=site.source==='sample'?'실제 주소와 관계없는 가상 경계입니다.':`✓ 선택 완료 · PNU ${site.pnu||'미제공'} · 규제값은 직접 확인하세요.`;$('sampleSelect').value=site.sampleId||'';syncSelectedParcel();}
function markDirty(){requestVersion++;state.dirty=true;document.body.classList.add('dirty');$('dirtyNote').textContent='조건이 변경되었습니다. 배치를 다시 생성하세요.';$('saveState').textContent='변경사항 있음';document.querySelector('.live-dot').textContent='이전 결과';$('generate').disabled=false;$('generate').innerHTML='<span aria-hidden="true">▦</span> 모듈 배치 생성';$('exportCsv').disabled=true;}
function projectData(){return {version:1,name:state.site.name,site:state.site,params:paramsFromForm(),active:state.active,savedAt:new Date().toISOString()};}
function persist(){try{localStorage.setItem('module-ground-project',JSON.stringify(projectData()));$('saveState').textContent='이 기기에 저장됨';}catch{toast('브라우저 저장 공간이 부족합니다. 프로젝트 파일로 저장하세요.',true);}}
async function generate({reset=false,save=true}={}){
 if(!form.reportValidity())return false;
 const version=++requestVersion,params=paramsFromForm(),site=state.site;
 $('generate').disabled=true;$('generate').textContent='배치 탐색 중…';
 try{
  const result=await json('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({polygon:site.polygon,params})});
  if(version!==requestVersion)return false;
  state.params=params;state.result=result;state.resultSite=site;state.dirty=false;document.body.classList.remove('dirty');$('dirtyNote').textContent='입력 조건 기준의 배치 후보입니다.';document.querySelector('.live-dot').textContent=result.alternatives.length?'계산 완료':'배치 없음';render(reset);if(save)persist();return true;
 }catch(e){if(version===requestVersion){toast(e.message,true);state.dirty=true;document.body.classList.add('dirty');$('dirtyNote').textContent='계산 실패 · 입력 조건을 확인하세요.';}return false;}
 finally{if(version===requestVersion){$('generate').disabled=false;$('generate').innerHTML='<span aria-hidden="true">▦</span> 모듈 배치 생성';}}
}
function miniBuilding(kind){return `<svg viewBox="0 0 42 40" aria-hidden="true"><path d="m4 23 23-9 12 7-23 10Z" fill="#dce3f7"/><path d="m4 23 12 8v6L4 30Z" fill="#b6c5e8"/><path d="m16 31 23-10v7l-23 9Z" fill="#ced8ef"/>${kind!=='low'?'<path d="m8 14 17-7 10 6-17 7Z" fill="#dce3f7"/><path d="m8 14 10 6v9L8 23Z" fill="#9db0de"/><path d="m18 20 17-7v9l-17 7Z" fill="#bccbec"/>':''}${kind==='compact'?'<path d="m13 6 11-4 7 4-11 4Z" fill="#dce3f7"/><path d="m13 6 7 4v8l-7-4Z" fill="#9db0de"/><path d="m20 10 11-4v8l-11 4Z" fill="#bdcbee"/>':''}</svg>`;}
function render(reset=false){
 const a=active(),result=state.result;
 $('moduleTooltip').hidden=true;$('moduleCount').textContent=a?fmt(a.count,0):'0';$('unitCount').textContent=a?`${state.params.modulesPerUnit}개/세대 가정 · ${fmt(a.units,0)}세대 환산${a.unassigned?` + 잔여 ${a.unassigned}개`:''}`:'현재 조건으로 배치를 찾지 못했습니다.';
 $('countBreakdown').replaceChildren();if(a){for(let i=0;i<Math.min(a.count,120);i++)$('countBreakdown').append(document.createElement('i'));if(a.count>120)$('countBreakdown').title=`총 ${a.count}개 (표시는 120개까지)`;}
 $('metricFootprint').textContent=a?fmt(a.footprint):'—';$('metricGfa').textContent=a?fmt(a.gfa):'—';$('metricHeight').textContent=a?fmt(a.height):'—';$('metricFloors').textContent=a?a.levels.length:'—';
 $('viewTitle').textContent=a?a.name:'배치 없음';$('floorRange').max=a?a.levels.length:0;$('floorRange').value=0;$('floorOutput').textContent='전체 층';
 $('utilization').replaceChildren();if(a){for(const [name,value,limit,unit]of [['건폐율',a.coverage,state.params.coverage,'%'],['용적률',a.far,state.params.far,'%'],['높이',a.height,state.params.maxHeight,'m']]){const div=document.createElement('div');div.className='usage-item';div.innerHTML=`<div class="usage-label"><span>${name}</span><strong>${fmt(value)} / ${fmt(limit)}${unit}</strong></div><div class="usage-track"><i style="width:${Math.min(100,value/limit*100)}%"></i></div>`;$('utilization').append(div);}}
 $('alternatives').replaceChildren();for(const candidate of result.alternatives){const button=document.createElement('button');button.className=`alternative ${a?.id===candidate.id?'active':''}`;button.setAttribute('aria-pressed',a?.id===candidate.id?'true':'false');button.innerHTML=`${miniBuilding(candidate.id)}<span class="alt-info"><strong>${candidate.name}</strong><small>${candidate.levels.length}층 · ${fmt(candidate.footprint)}㎡ 건축면적</small></span><span class="alt-count">${candidate.count}<small>개</small></span>`;button.addEventListener('click',()=>{state.active=candidate.id;render();if(!state.dirty)persist();});$('alternatives').append(button);}
 if(!a){const p=document.createElement('p');p.className='empty-result';p.textContent=result.message;$('alternatives').append(p);}
 $('insightText').textContent=a?`${a.reasons.join(' ')} 연면적의 ${fmt(a.moduleArea/a.gfa*100)}%가 모듈 외곽 면적입니다.`:result.message;
 $('floorList').replaceChildren();if(a)for(const l of [...a.levels].reverse()){const row=document.createElement('div');row.className='floor-row';row.innerHTML=`<span>${l.level}F</span><div class="floor-bar">${'<i></i>'.repeat(Math.min(l.pairs*2,22))}</div><strong>${l.pairs*2}개</strong>`;$('floorList').append(row);}
 $('solverStatus').textContent=`${result.attempts}개 배치 위치 검토 · 축 방향 및 필지 장변 기준 탐색`;
 $('exportCsv').disabled=!a||state.dirty;
 if(viewport)viewport.setData(state.resultSite.polygon,a,state.params,reset);
}
function showView(type){const isMap=type==='map';$('viewport').hidden=isMap;$('mapPanel').hidden=!isMap;for(const [id,on]of [['view3d',!isMap],['viewMap',isMap]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',on);}$('planView').disabled=isMap;$('isoView').disabled=isMap;$('resetView').disabled=isMap;if(isMap)initMap();else viewport?.resize();}
function initMap(){
 $('mapSetup').hidden=state.config.vworld;if(!state.config.vworld)return;
 if(!map){map=L.map('map',{zoomControl:false}).setView([37.5445,127.055],17);L.control.zoom({position:'bottomright'}).addTo(map);let tileErrorShown=false;baseLayer=L.tileLayer('/api/tile/{z}/{x}/{y}',{maxZoom:19,attribution:'© <a href="https://www.vworld.kr" target="_blank" rel="noopener">VWorld</a>'}).on('tileerror',()=>{if(!tileErrorShown){tileErrorShown=true;toast('배경지도를 불러오지 못했습니다. VWorld 지도 권한과 등록 URL을 확인하세요.',true);}}).addTo(map);map.on('click',e=>selectParcel(e.latlng.lng,e.latlng.lat));syncSelectedParcel();zoomSelection();}
 requestAnimationFrame(()=>map.invalidateSize());
}
async function selectParcel(lon,lat,address){
 const version=++parcelVersion;toast('필지 경계를 불러오는 중입니다…');
 try{const site=await json(`/api/parcel?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}`);if(version!==parcelVersion)return false;if(address)site.name=address;setSite(site);$('siteAddress').value=site.name;markDirty();zoomSelection();$('searchResults').replaceChildren();$('addressStatus').textContent='✓ 필지 선택 완료 · 지도에서 파란 경계를 확인하세요.';toast('필지를 선택했습니다. 지적도로 보기로 주변 필지를 함께 확인할 수 있습니다.');return true;}catch(e){if(version===parcelVersion){toast(e.message,true);if(e.code==='VWORLD_PARCEL_AUTH'){openConnection();$('vworldStatus').textContent=e.message;}}return false;}
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
form.addEventListener('submit',async e=>{e.preventDefault();if(await generate())showView('3d');});
form.addEventListener('input',e=>{if(e.target.name)markDirty();});
$('sampleSelect').addEventListener('change',()=>{const sample=state.config.samples.find(s=>s.id===$('sampleSelect').value);if(!sample)return;parcelVersion++;setSite({name:sample.name,source:'sample',sampleId:sample.id,polygon:[sample.ring]});markDirty();generate({reset:true});showView('3d');});
for(const id of ['showMap','viewMap'])$(id).addEventListener('click',()=>showView('map'));
for(const id of ['view3d','return3d'])$(id).addEventListener('click',()=>showView('3d'));
for(const [id,mode]of [['planView','plan'],['isoView','iso']])$(id).addEventListener('click',()=>{viewport?.setMode(mode);$('planView').classList.toggle('active',mode==='plan');$('isoView').classList.toggle('active',mode==='iso');});
$('resetView').addEventListener('click',()=>viewport?.reset());
$('envelopeToggle').addEventListener('change',e=>viewport?.setOptions({envelope:e.target.checked}));
$('explodeToggle').addEventListener('change',e=>viewport?.setOptions({explode:e.target.checked}));
$('floorRange').addEventListener('input',e=>{const floor=Number(e.target.value);$('floorOutput').textContent=floor?`${floor}층`:'전체 층';viewport?.setOptions({floor});});
$('searchForm').addEventListener('submit',e=>{e.preventDefault();searchAddress($('addressInput').value,$('addressType').value,$('searchResults'),$('addressStatus'));});
$('saveProject').addEventListener('click',()=>{if(!form.reportValidity())return;download(JSON.stringify(projectData(),null,2),'module-ground-project.json','application/json');persist();toast('프로젝트 입력 조건을 파일로 저장했습니다.');});
$('openProject').addEventListener('click',()=>$('projectFile').click());
async function validateProject(data){if(data?.version!==1||!data.site?.polygon||!data.params||typeof data.site.name!=='string'||data.site.name.length>200)throw new Error('지원하는 프로젝트 파일이 아닙니다.');await json('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({polygon:data.site.polygon,params:data.params})});return data;}
$('projectFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw new Error('프로젝트 파일은 200KB 이하여야 합니다.');const data=await validateProject(JSON.parse(await file.text()));parcelVersion++;requestVersion++;fillForm({...state.config.defaults,...data.params});setSite(data.site);state.active=data.active||'maximum';await generate({reset:true});showView('3d');toast('프로젝트를 불러왔습니다.');}catch(error){toast(error.message,true);}finally{e.target.value='';}});
$('exportCsv').addEventListener('click',()=>{const a=active();if(!a||state.dirty)return;const rows=[['모듈 ID','층','폭(m)','길이(m)','반복 높이(m)','배치안'],...a.modules.map(m=>[m.id,m.level,state.params.width,state.params.length,state.params.moduleHeight,a.name])];download('\uFEFF'+rows.map(r=>r.join(',')).join('\r\n'),'module-schedule.csv','text/csv;charset=utf-8');toast('모듈 목록을 CSV로 저장했습니다.');});
async function boot(){
 try{
  state.config=await json('/api/config');updateConnection();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='지도에서 선택한 필지';placeholder.disabled=true;$('sampleSelect').append(placeholder);
  for(const s of state.config.samples){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;$('sampleSelect').append(o);}
  fillForm(state.config.defaults);const sample=state.config.samples[0];setSite({name:sample.name,source:'sample',sampleId:sample.id,polygon:[sample.ring]});
  try{viewport=createViewport($('viewport'),module=>{const tip=$('moduleTooltip');tip.replaceChildren();tip.hidden=!module;if(!module)return;const title=document.createElement('strong');title.textContent=module.id;const p=document.createElement('div');p.textContent=`${state.params.width} × ${state.params.length} × ${state.params.moduleHeight} m`;const note=document.createElement('div');note.textContent=`${module.level}층 · ${fmt(state.params.width*state.params.length)}㎡ 외곽 면적`;tip.append(title,p,note);});}catch{ $('sceneError').hidden=false;$('sceneError').textContent='3D 표시를 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 하드웨어 가속을 켜주세요. 배치 수치 계산은 계속 사용할 수 있습니다.';}
  try{const raw=localStorage.getItem('module-ground-project');if(raw){const data=await validateProject(JSON.parse(raw));fillForm({...state.config.defaults,...data.params});setSite(data.site);state.active=data.active||'maximum';}}catch{toast('저장된 프로젝트를 복원하지 못해 예시 대지를 열었습니다.',true);}
  await generate({reset:true});
 }catch(e){toast(e.message,true);$('sceneError').hidden=false;$('sceneError').textContent='초기 데이터를 불러오지 못했습니다. 서버를 실행한 후 새로고침하세요.';}
}
boot();
