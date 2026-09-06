import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export function createViewport(container,onSelect){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#f1f3f8');
 const camera=new THREE.PerspectiveCamera(36,1,.1,2000);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=10;controls.maxDistance=650;controls.maxPolarAngle=Math.PI/2.06;
 scene.add(new THREE.HemisphereLight(0xffffff,0xb4bfd5,2.8));
 const sun=new THREE.DirectionalLight(0xffffff,3.1);sun.position.set(-40,85,50);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-100,right:100,top:100,bottom:-100,near:1,far:250});sun.shadow.normalBias=.03;scene.add(sun);
 let content=new THREE.Group();scene.add(content);let dynamic=new THREE.Group();content.add(dynamic);let result=null,params=null,polygon=null,moduleMesh=null,moduleData=[],selected=-1,center=new THREE.Vector3(),radius=35;let explode=false,floor=0,envelope=false,mode='iso';
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let down=null;
 renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||!moduleMesh)return;const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObject(moduleMesh)[0];if(selected>=0)moduleMesh.setColorAt(selected,new THREE.Color(moduleData[selected].level%2?'#a8b7e3':'#bac6e9'));selected=hit?.instanceId??-1;if(selected>=0){moduleMesh.setColorAt(selected,new THREE.Color('#5d7acf'));onSelect(moduleData[selected]);}else onSelect(null);if(moduleMesh.instanceColor)moduleMesh.instanceColor.needsUpdate=true;});
 function dispose(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});group.clear();}
 function box(parent,x,y,z,w,h,d,color,opacity=1){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.82,transparent:opacity<1,opacity}));mesh.position.set(x+w/2,y+h/2,z+d/2);mesh.castShadow=opacity===1;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function line(parent,points,color='#a2afcd',dash=false){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,dash?new THREE.LineDashedMaterial({color,dashSize:.7,gapSize:.45,transparent:true,opacity:.8}):new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));if(dash)l.computeLineDistances();parent.add(l);return l;}
 function label(parent,text,x,z){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.font='24px sans-serif';ctx.fillStyle='#8290ad';ctx.textAlign='center';ctx.fillText(text,128,42);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));sprite.position.set(x,.1,z);sprite.scale.set(12,3,1);parent.add(sprite);}
 function setCamera(){controls.target.set(center.x,result?result.height*.3:0,center.z);const distance=radius*2.2;if(mode==='plan')camera.position.set(center.x,Math.max(65,distance*1.3),center.z+.01);else camera.position.set(center.x+distance*.96,distance*.83,center.z+distance*1.03);controls.update();}
 function ground(){
  const xs=polygon[0].map(p=>p[0]),ys=polygon[0].map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);center.set((minX+maxX)/2,0,(minY+maxY)/2);radius=Math.max(maxX-minX,maxY-minY,result?.height||0,20);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(radius*8,radius*8),new THREE.MeshStandardMaterial({color:'#f1f3f8',roughness:1}));plane.rotation.x=-Math.PI/2;plane.position.set(center.x,-.18,center.z);plane.receiveShadow=true;content.add(plane);
  const grid=new THREE.GridHelper(Math.ceil(radius*4/5)*5,Math.ceil(radius*4/5),0xdde3ef,0xe6eaf2);grid.position.set(center.x,-.15,center.z);grid.material.transparent=true;grid.material.opacity=.65;content.add(grid);
  const shape=new THREE.Shape(polygon[0].map(([x,y])=>new THREE.Vector2(x,-y)));polygon.slice(1).forEach(r=>shape.holes.push(new THREE.Path(r.map(([x,y])=>new THREE.Vector2(x,-y)))));
  const site=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:'#e4e9f4',roughness:1,side:THREE.DoubleSide}));site.rotation.x=-Math.PI/2;site.position.y=-.09;site.receiveShadow=true;content.add(site);
  polygon.forEach(r=>line(content,r.map(([x,y])=>[x,-.06,y]),'#7990c9',true));
  line(content,[[minX,-.02,maxY+3],[maxX,-.02,maxY+3]],'#b2bed4');line(content,[[maxX+3,-.02,minY],[maxX+3,-.02,maxY]],'#b2bed4');label(content,`${(maxX-minX).toFixed(1)} m`,center.x,maxY+5);label(content,`${(maxY-minY).toFixed(1)} m`,maxX+7,center.z);
 }
 function draw(){
  dispose(dynamic);moduleMesh=null;selected=-1;if(!result)return;
  const building=new THREE.Group();building.position.set(result.x,0,result.y);building.rotation.y=-result.angle;dynamic.add(building);
  const yAt=l=>(l-1)*(params.moduleHeight+(explode?2.5:0));
  const levels=result.levels.filter(l=>!floor||l.level===floor);
  for(const l of levels){box(building,0,yAt(l.level),0,l.width,.12,result.depth,'#e2e6ef');}
  for(const c of result.commons.filter(c=>!floor||c.level===floor)){const h=c.type==='core'?params.moduleHeight-.12:.13;box(building,c.x,yAt(c.level)+.12,c.y,c.w,h,c.d,c.type==='core'?'#d8a783':'#bdc8dd');}
  moduleData=result.modules.filter(m=>!floor||m.level===floor);
  const geometry=new THREE.BoxGeometry(params.width,params.moduleHeight-.18,params.length),material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.78});moduleMesh=new THREE.InstancedMesh(geometry,material,moduleData.length);moduleMesh.castShadow=true;moduleMesh.receiveShadow=true;building.add(moduleMesh);
  const edges=new THREE.EdgesGeometry(geometry),edgePositions=edges.attributes.position.array,lineArray=[],dummy=new THREE.Object3D();
  const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(params.width*.68,params.moduleHeight*.48,.025),new THREE.MeshStandardMaterial({color:'#d9e2f6',roughness:.4,metalness:.1}),moduleData.length);building.add(windows);
  moduleData.forEach((m,i)=>{
   const x=m.x+params.width/2,y=yAt(m.level)+.12+(params.moduleHeight-.18)/2,z=m.y+params.length/2;dummy.position.set(x,y,z);dummy.updateMatrix();moduleMesh.setMatrixAt(i,dummy.matrix);moduleMesh.setColorAt(i,new THREE.Color(m.level%2?'#a8b7e3':'#bac6e9'));
   for(let j=0;j<edgePositions.length;j+=3)lineArray.push(edgePositions[j]+x,edgePositions[j+1]+y,edgePositions[j+2]+z);
   dummy.position.set(x,y,m.y===0?-.014:result.depth+.014);dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);
  });edges.dispose();
  const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.Float32BufferAttribute(lineArray,3));building.add(new THREE.LineSegments(lineGeo,new THREE.LineBasicMaterial({color:'#7184ba',transparent:true,opacity:.52})));
  if(envelope){const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(result.width,params.maxHeight,result.depth));const outer=new THREE.LineSegments(geo,new THREE.LineDashedMaterial({color:'#8193bf',dashSize:.6,gapSize:.4,transparent:true,opacity:.65}));outer.position.set(result.width/2,params.maxHeight/2,result.depth/2);outer.computeLineDistances();building.add(outer);}
 }
 const compass=container.querySelector('.north span'),northPoint=new THREE.Vector3(),targetPoint=new THREE.Vector3();
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(container);let frame;function animate(){frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);if(compass){targetPoint.copy(controls.target).project(camera);northPoint.copy(controls.target).add(new THREE.Vector3(0,0,10)).project(camera);compass.style.transform=`rotate(${Math.atan2((northPoint.x-targetPoint.x)*camera.aspect,northPoint.y-targetPoint.y)*180/Math.PI}deg)`;}}animate();
 return {setData(poly,alt,p,reset=false){const changed=polygon!==poly;polygon=poly;result=alt;params=p;dispose(content);dynamic=new THREE.Group();ground();content.add(dynamic);floor=0;draw();if(changed||reset)setCamera();resize();},setMode(value){mode=value;setCamera();},setOptions(options){if('explode'in options)explode=options.explode;if('floor'in options)floor=options.floor;if('envelope'in options)envelope=options.envelope;draw();onSelect(null);},resize,reset:setCamera,destroy(){cancelAnimationFrame(frame);ro.disconnect();controls.dispose();dispose(content);renderer.dispose();renderer.domElement.remove();}};
}
