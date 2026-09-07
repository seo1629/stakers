import clipping from 'polygon-clipping';

export const DEFAULTS = { width:3.3, length:6.6, moduleHeight:3.2, gap:0.1, corridor:2.0, core:3.3, coverage:60, far:200, maxHeight:20, maxFloors:8, setback:2, modulesPerUnit:2 };
export const SAMPLES = [
 {id:'courtyard',name:'성수 스터디 대지',description:'38 × 30m · 가상 직사각형 대지',ring:[[0,0],[38,0],[38,30],[0,30],[0,0]]},
 {id:'corner',name:'모서리가 잘린 대지',description:'도로 모서리 조건 · 가상 대지',ring:[[0,0],[44,0],[44,23],[32,34],[0,34],[0,0]]},
 {id:'narrow',name:'세장형 대지',description:'24 × 52m · 가상 대지',ring:[[0,0],[24,0],[24,52],[0,52],[0,0]]}
];
const EPS=1e-6;
export function ringArea(ring){return Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2;}
export function polygonArea(poly){return Math.max(0,ringArea(poly[0])-poly.slice(1).reduce((s,r)=>s+ringArea(r),0));}
const multiArea=m=>m.reduce((s,p)=>s+polygonArea(p),0);
export function bounds(ring){return {minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minY:Math.min(...ring.map(p=>p[1])),maxY:Math.max(...ring.map(p=>p[1]))};}
function pointSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function segmentDistance(a,b,c,d){return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));}
export function rectangle(x,y,w,d,angle=0){const c=Math.cos(angle),s=Math.sin(angle);return [[0,0],[w,0],[w,d],[0,d],[0,0]].map(([u,v])=>[x+u*c-v*s,y+u*s+v*c]);}
export function fits(rect,polygon,setback){
 const area=ringArea(rect); const intersection=clipping.intersection([rect],polygon);
 if(Math.abs(multiArea(intersection)-area)>EPS*Math.max(1,area))return false;
 if(setback<=0)return true;
 for(const ring of polygon)for(let i=0;i<ring.length-1;i++)for(let j=0;j<4;j++)if(segmentDistance(rect[j],rect[j+1],ring[i],ring[i+1])<setback-EPS)return false;
 return true;
}
export function validatePolygon(polygon){
 if(!Array.isArray(polygon)||!polygon.length||polygon.length>15)throw new Error('유효한 단일 필지 Polygon이 필요합니다.');
 let points=0;
 for(const ring of polygon){
  if(!Array.isArray(ring)||ring.length<4)throw new Error('필지 경계는 닫힌 다각형이어야 합니다.');
  for(const pt of ring){if(!Array.isArray(pt)||pt.length!==2||!pt.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<10000))throw new Error('필지 좌표가 올바르지 않습니다.');points++;}
  if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new Error('필지 경계가 닫혀 있지 않습니다.');
 }
 if(points>600)throw new Error('600개 이하의 경계 좌표를 사용하세요.');
 const area=polygonArea(polygon),b=bounds(polygon[0]);
 if(area<10||area>30000||b.maxX-b.minX>350||b.maxY-b.minY>350)throw new Error('현재 버전은 면적 10~30,000㎡, 가로·세로 350m 이하 대지를 지원합니다.');
 const union=clipping.union(polygon); if(Math.abs(multiArea(union)-area)>0.01)throw new Error('필지 경계가 교차하거나 구멍이 겹칩니다.');
 return {polygon,area};
}
export function validateInput(input){
 const p={...DEFAULTS,...input.params};
 const ranges={width:[1,15],length:[1,25],moduleHeight:[2,6],gap:[0,1],corridor:[1,6],core:[1,15],coverage:[1,100],far:[1,1500],maxHeight:[2,150],maxFloors:[1,40],setback:[0,20],modulesPerUnit:[1,10]};
 for(const [k,[min,max]]of Object.entries(ranges))if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw new Error(`${k}: ${min}~${max} 범위의 숫자를 입력하세요.`);
 if(!Number.isInteger(p.maxFloors)||!Number.isInteger(p.modulesPerUnit))throw new Error('최대 층수와 세대당 모듈 수는 정수여야 합니다.');
 const {polygon,area}=validatePolygon(input.polygon);
 return {params:p,polygon,area};
}
export function solve(input){
 const {params:p,polygon,area}=validateInput(input),b=bounds(polygon[0]);
 const caps={footprint:area*p.coverage/100,gfa:area*p.far/100,floors:Math.min(p.maxFloors,Math.floor((p.maxHeight+EPS)/p.moduleHeight))};
 const depth=2*p.length+p.corridor+2*p.gap;
 const candidates=[];
 // A finite search: two axes plus the longest parcel edge; translations sampled in each axis.
 let longest=0,edgeAngle=0;polygon[0].slice(1).forEach((q,i)=>{const a=polygon[0][i],len=Math.hypot(q[0]-a[0],q[1]-a[1]);if(len>longest){longest=len;edgeAngle=Math.atan2(q[1]-a[1],q[0]-a[0]);}});
 const angles=[...new Set([0,Math.PI/2,edgeAngle,edgeAngle+Math.PI/2].map(a=>+(((a%Math.PI)+Math.PI)%Math.PI).toFixed(6)))];
 let attempts=0;
 for(const angle of angles){
  const c=Math.cos(angle),s=Math.sin(angle),rot=polygon[0].map(([x,y])=>[x*c+y*s,-x*s+y*c]),rb=bounds(rot);
  const maxN=Math.min(40,Math.floor((rb.maxX-rb.minX-2*p.setback-p.core+p.gap)/(p.width+p.gap)));
  for(let n=1;n<=maxN;n++){
   const width=p.core+n*p.width+(n-1)*p.gap,footprint=width*depth;
   if(footprint>caps.footprint+EPS||caps.floors<1)continue;
   const dx=rb.maxX-rb.minX-2*p.setback-width,dy=rb.maxY-rb.minY-2*p.setback-depth;
   if(dx<-EPS||dy<-EPS)continue;
   let found=null;
   const fractions=[0.5,0,1,0.25,0.75];
   for(const fx of fractions){for(const fy of fractions){
    const rx=rb.minX+p.setback+Math.max(0,dx)*fx,ry=rb.minY+p.setback+Math.max(0,dy)*fy;
    const x=rx*c-ry*s,y=rx*s+ry*c;attempts++;
    if(fits(rectangle(x,y,width,depth,angle),polygon,p.setback)){found={x,y};break;}
   }if(found)break;}
   if(!found)continue;
   let remaining=caps.gfa;const levels=[];
   for(let level=0;level<caps.floors;level++){
    const count=Math.min(n,Math.floor(((remaining/depth)-p.core+p.gap+EPS)/(p.width+p.gap)));
    if(count<1)break;
    const floorWidth=p.core+count*p.width+(count-1)*p.gap;
    const floorArea=floorWidth*depth;
    levels.push({level:level+1,pairs:count,width:floorWidth,area:floorArea});remaining-=floorArea;
   }
   if(!levels.length)continue;
   const count=levels.reduce((s,l)=>s+2*l.pairs,0),gfa=levels.reduce((s,l)=>s+l.area,0);
   candidates.push({...found,angle,depth,width:levels[0].width,footprint:levels[0].area,levels,count,gfa,height:levels.length*p.moduleHeight});
  }
 }
 candidates.sort((a,b)=>b.count-a.count||a.height-b.height||a.footprint-b.footprint);
 if(!candidates.length)return {area,caps,attempts,alternatives:[],message:'지정한 대지·이격·모듈·공용공간 조건에 맞는 배치를 찾지 못했습니다. 이격거리나 모듈 규격, 건축 상한을 확인하세요.'};
 const best=candidates[0],near=candidates.filter(v=>v.count>=best.count*.8);
 const low=[...near].sort((a,b)=>a.height-b.height||b.count-a.count)[0];
 const compact=[...near].sort((a,b)=>a.footprint-b.footprint||b.count-a.count)[0];
 const alternatives=[['maximum','모듈 수 우선',best],['low','저층 우선',low],['compact','작은 건축면적',compact]].map(([id,name,v])=>{
  const modules=[],commons=[];
  for(const l of v.levels){
   commons.push({type:'core',level:l.level,x:0,y:0,w:p.core,d:v.depth},{type:'corridor',level:l.level,x:p.core,y:p.length+p.gap,w:l.width-p.core,d:p.corridor});
   for(let i=0;i<l.pairs;i++)for(let row=0;row<2;row++)modules.push({id:`${l.level}F-${String(i*2+row+1).padStart(2,'0')}`,level:l.level,x:p.core+i*(p.width+p.gap),y:row===0?0:p.length+p.corridor+2*p.gap,w:p.width,d:p.length});
  }
  const reasons=[];
  if(v.levels.length===caps.floors)reasons.push(Math.floor(p.maxHeight/p.moduleHeight)<=p.maxFloors?'높이 제한으로 추가 적층이 어렵습니다.':'최대 층수에 도달했습니다.');
  if(caps.gfa-v.gfa<(p.core+p.width)*depth)reasons.push('남은 용적률로는 공용공간을 포함한 다음 층을 만들기 어렵습니다.');
  if(!reasons.length)reasons.push('필지 경계·이격·건폐율 안에서 탐색한 배치입니다.');
  return {...v,id,name,modules,commons,units:Math.floor(v.count/p.modulesPerUnit),unassigned:v.count%p.modulesPerUnit,moduleArea:v.count*p.width*p.length,coverage:v.footprint/area*100,far:v.gfa/area*100,reasons};
 });
 return {area,caps,attempts,alternatives};
}
