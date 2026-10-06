// Small build-time diffuse bake, not a realtime light or an offline rendered image.
// Computed in linear colour space. Static surface materials use this ONCE rather
// than multiplying it by the previous strong HemisphereLight a second time.
export const BAKE=Object.freeze({sampleStep:.42,wallAmbient:.19,floorAmbient:.13,ceilingAmbient:.39,
 lampWidth:1.04,lampDepth:.40,baseboardHeight:.065,topMoldingHeight:.025});

export function segmentHitsBox(a,b,wall,height=3.6){
 let lo=0,hi=1;
 const mins=[wall.x-wall.w/2,wall.ymin??0,wall.z-wall.d/2];
 const maxs=[wall.x+wall.w/2,wall.ymax??height,wall.z+wall.d/2];
 for(let axis=0;axis<3;axis++){
  const delta=b[axis]-a[axis];
  if(Math.abs(delta)<1e-9){if(a[axis]<mins[axis]||a[axis]>maxs[axis])return false;continue;}
  let near=(mins[axis]-a[axis])/delta,far=(maxs[axis]-a[axis])/delta;
  if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);
  if(lo>hi)return false;
 }
 return hi>1e-4&&lo<.9999;
}

export function directIrradiance(position,normal,lamps,walls=[]){
 const origin=position.map((v,i)=>v+normal[i]*.012);
 let sum=0;
 // Four by two samples soften the fixed fixture shadow at a small one-off cost.
 for(const lamp of lamps){
  let contribution=0;
  for(let u=0;u<4;u++)for(let v=0;v<2;v++){
   const source=[lamp.x+((u+.5)/4-.5)*BAKE.lampWidth,lamp.y??3.545,
    lamp.z+((v+.5)/2-.5)*BAKE.lampDepth];
   const delta=source.map((c,i)=>c-origin[i]),r2=delta.reduce((s,c)=>s+c*c,0),r=Math.sqrt(r2);
   const incident=Math.max(0,delta.reduce((s,c,i)=>s+c*normal[i],0)/r);
   const emitted=Math.max(0,delta[1]/r); // underside emitter faces down
   if(!incident||!emitted||r>12)continue;
   if(walls.some(w=>segmentHitsBox(origin,source,w)))continue;
   contribution+=incident*emitted*(lamp.power??8.8)/Math.max(1.3,r2);
  }
  sum+=contribution/8;
 }
 return sum;
}

export function contactFactor(position,normal,walls=[],height=3.6){
 const origin=position.map((v,i)=>v+normal[i]*.016);
 // Local, short-range visibility only. Floor/ceiling contacts use distance;
 // nearby perpendicular walls use an outward hemisphere and never darken a flat
 // wall just because its own surface is near the sample.
 const tangent=Math.abs(normal[1])>.8?[1,0,0]:[0,1,0];
 const side=[normal[1]*tangent[2]-normal[2]*tangent[1],normal[2]*tangent[0]-normal[0]*tangent[2],normal[0]*tangent[1]-normal[1]*tangent[0]];
 let blocked=0;
 for(let k=0;k<8;k++){
  const angle=k*Math.PI/4,end=origin.map((p,i)=>p+.12*normal[i]+.34*(Math.cos(angle)*tangent[i]+Math.sin(angle)*side[i]));
  if(walls.some(w=>segmentHitsBox(origin,end,w)))blocked++;
 }
 let contact=1-.24*blocked/8;
 if(Math.abs(normal[1])<.8)contact*=1-.19*Math.exp(-Math.max(0,position[1])/.16)-.13*Math.exp(-Math.max(0,height-position[1])/.16);
 return Math.max(.58,contact);
}

export function bakedLight(position,normal,lamps,walls=[]){
 const ceiling=normal[1]<-.8;
 // Ceiling receives broad bounced fill, not direct light from its own underside.
 // This is an explicitly approximate bounce term; no GI claim is made.
 let ambient=ceiling?BAKE.ceilingAmbient:normal[1]>.8?BAKE.floorAmbient:BAKE.wallAmbient;
 if(ceiling){let nearest=Infinity;for(const l of lamps)nearest=Math.min(nearest,(l.x-position[0])**2+(l.z-position[2])**2);ambient+=.13*Math.exp(-nearest/9);}
 const direct=ceiling?0:directIrradiance(position,normal,lamps,walls);
 const ao=contactFactor(position,normal,walls);
 // Neutral bounce retains wallpaper colour; only direct fluorescent contribution is warm.
 return [1,.96,.87].map((warm,i)=>Math.min(1.35,(ambient+direct*warm)*ao));
}
