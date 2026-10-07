import * as THREE from '../../vendor/three.module.min.js';
// Metres, Y up, resting on y=0. Purely visual: no item state or physics here.
// One shared vertex-colour mesh per item; no textures, transparency or refraction.
function builder(){
 const positions=[],normals=[],colors=[];
 function add(geo,color,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
  geo.applyMatrix4(m);const g=geo.index?geo.toNonIndexed():geo,c=new THREE.Color(color);
  positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
  for(let i=0;i<g.attributes.position.count;i++)colors.push(c.r,c.g,c.b);
  if(g!==geo)g.dispose();geo.dispose();
 }
 function box(w,h,d,color,x,y,z,rx=0,ry=0,rz=0){add(new THREE.BoxGeometry(w,h,d),color,x,y,z,rx,ry,rz)}
 function lathe(points,color){add(new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),16),color)}
 function finish(){const g=new THREE.BufferGeometry();for(const[n,a]of [['position',positions],['normal',normals],['color',colors]])g.setAttribute(n,new THREE.Float32BufferAttribute(a,3));g.computeBoundingBox();g.computeBoundingSphere();return g}
 return{add,box,lathe,finish};
}
function bottle(){
 const b=builder();
 // Ribbing is part of the silhouette, not stacked cylinders or transparent shells.
 b.lathe([[0,0],[.037,0],[.058,.009],[.065,.021],[.066,.035],[.063,.041],[.063,.046],[.066,.050],[.066,.073],[.063,.078],[.063,.083],[.066,.088],[.066,.115],[.066,.206],[.065,.222],[.062,.228],[.062,.233],[.065,.238],[.059,.251],[.047,.269],[.030,.283],[.025,.292],[.025,.318],[0,.318]],0x9fc5cc);
 // Foot petals, neck collar, tamper ring, closed cap and cap grip ribs.
 b.lathe([[.025,.296],[.030,.297],[.030,.302],[.025,.304]],0xd9e7df);
 b.lathe([[.025,.309],[.028,.309],[.028,.316],[.025,.316]],0xc9d4cf);
 b.add(new THREE.CylinderGeometry(.029,.029,.031,16),0xd3d8d3,0,.332,0);
 for(let j=0;j<16;j++){const a=j*Math.PI/8;b.box(.002,.023,.002,0xa0abaa,Math.sin(a)*.029,.332,Math.cos(a)*.029,0,a,0)}
 b.lathe([[.0663,.119],[.0663,.201]],0xe7e8d4);
 b.lathe([[.0666,.119],[.0666,.126]],0x30505a);b.lathe([[.0666,.194],[.0666,.201]],0x30505a);
 // Blue vertical front badge with a geometric water drop; back label/barcode.
 b.box(.048,.056,.002,0x3d7888,0,.160,.067);
 const drop=new THREE.Shape();drop.moveTo(0,.019);drop.bezierCurveTo(-.005,.011,-.012,.002,-.011,-.004);drop.bezierCurveTo(-.010,-.019,.010,-.019,.011,-.004);drop.bezierCurveTo(.012,.002,.005,.011,0,.019);
 b.add(new THREE.ShapeGeometry(drop,4),0xf0f6e9,0,.162,.0682);
 for(let j=0;j<9;j++)b.box(j%3===0?.003:.0015,.023,.001,0x54645e,-.019+j*.0046,.157,-.067,0,0,0);
 b.box(.040,.002,.001,0x54645e,0,.179,-.067);
 return b.finish();
}
function ration(){
 const b=builder();
 // A pillow-wrapped biscuit pack: rounded/bulging body with flattened sealed ends.
 const vertices=[],indices=[],rings=[[-.158,.091,.006],[-.136,.089,.019],[-.112,.083,.024],[.112,.083,.024],[.136,.089,.019],[.158,.091,.006]];
 // Eight-sided pillow cross-sections taper into each flat crimped end.
 for(const[x,w,h]of rings)for(const[yy,zz]of [[-1,-.72],[-.65,-1],[.65,-1],[1,-.72],[1,.72],[.65,1],[-.65,1],[-1,.72]])vertices.push(x,.025+yy*h,zz*w);
 for(let r=0;r<rings.length-1;r++)for(let j=0;j<8;j++){const a=r*8+j,c=r*8+(j+1)%8;indices.push(a,c,a+8,c,c+8,a+8)}
 for(let j=1;j<7;j++){indices.push(0,j+1,j);indices.push(40,40+j,41+j)}
 const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));body.setIndex(indices);body.computeVertexNormals();b.add(body,0xa29675);
 // Golden biscuit visible through clear-film styling, no overlapping alpha layers.
 b.box(.229,.003,.129,0xd9af65,0,.050,0);
 b.box(.216,.002,.116,0xe7c383,0,.052,0);
 for(let x=-3;x<=3;x++)for(let z=-2;z<=2;z++){
  b.add(new THREE.CylinderGeometry(.0027,.0027,.001,6),0x976b36,x*.029,.0537,z*.025);
 }
 // Scalloped biscuit edge and wrapper seam corrugation, baked into one draw call.
 for(const side of [-1,1]){
  b.box(.014,.010,.186,0xc7ba92,side*.161,.025,0);
  for(let j=-7;j<=7;j++)b.box(.013,.002,.003,0xe3d9b6,side*.161,.031,j*.012);
  b.box(.264,.004,.009,0xcfc19b,0,.047,side*.072);
  for(let j=-6;j<=6;j++)b.box(.012,.002,.004,0xf0ce8a,j*.017,.053,side*.062);
  // Folded corner facets and long crinkle highlight strips.
  for(const end of [-1,1])b.box(.031,.0015,.002,0xe9debb,end*.131,.046,side*.068,0,end*side*.55,0);
 }
 // Film wrinkles stay outside the biscuit centre so it remains readable from afar.
 b.box(.19,.001,.0015,0xf1dfb7,-.010,.0545,-.055,0,.025,0);
 b.box(.0015,.001,.090,0xefdbaf,-.100,.0545,.004,0,-.035,0);
 b.box(.070,.0006,.0015,0xf0d59b,-.064,.0545,.028,0,-.68,0);
 b.box(.053,.0006,.001,0xf2dbad,.063,.0545,-.029,0,-.65,0);
 // Reverse folded longitudinal seam, inset so the pack rests flat on its base.
 b.box(.285,.002,.013,0xcbbb93,0,.0005,0);
 b.box(.056,.001,.042,0xddd4b4,.068,.0005,.025);
 for(let j=0;j<7;j++)b.box(.0015,.001,.024,0x645b45,.047+j*.006,-.0001,.025);
 const g=b.finish();g.translate(0,-g.boundingBox.min.y,0);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function createSupplyModels(){
 let cache=null;
 function resources(){if(!cache){cache={material:new THREE.MeshLambertMaterial({vertexColors:true}),food:ration(),water:bottle()};cache.material.name='Supply shared matte polymer / foil'}return cache}
 return{
  create(kind){if(kind!=='food'&&kind!=='water')throw new Error('Unsupported supply kind');const c=resources(),g=new THREE.Group(),mesh=new THREE.Mesh(c[kind],c.material);mesh.name=kind==='water'?'Ribbed PET bottle with sealed cap':'Sealed biscuit wrapper';mesh.userData.sharedSupply=true;g.name='Supply '+kind;g.add(mesh);return g},
  dispose(){if(!cache)return;cache.food.dispose();cache.water.dispose();cache.material.dispose();cache=null},
  stats(){const c=resources();return Object.fromEntries(['food','water'].map(k=>[k,{triangles:c[k].attributes.position.count/3,drawCalls:1,bounds:{min:c[k].boundingBox.min.toArray(),max:c[k].boundingBox.max.toArray()}}]))}
 };
}
