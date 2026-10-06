// Original cable-frame geometry authored from the user's two visual references.
// It is not an official Wiki asset or a claim about Level 0 canon. No downloads.
// One skinned mesh, one material, no textures. Open space remains genuinely open.
export function createShadowMesh(THREE){
 const root=new THREE.Group();root.name='Cable-frame creature · reference study';root.visible=false;root.userData.shadowEntity=true;
 const positions=[],indices=[],skinIndices=[],skinWeights=[],bones=[];
 function bone(name,parent,x,y,z){const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);if(parent)parent.add(b);bones.push(b);return b}
 const pelvis=bone('pelvis',null,0,1.22,0),spine=bone('spine',pelvis,0,.61,0),shoulders=bone('shoulders',spine,0,.67,0),head=bone('head',shoulders,.035,.36,-.02);
 const arms=[];for(const side of [-1,1]){const arm=bone(`arm.${side}`,shoulders,side*.54,-.025,0),elbow=bone(`elbow.${side}`,arm,side*.03,-.92,.015),wrist=bone(`wrist.${side}`,elbow,side*.16,-1.01,-.015);arms.push({arm,elbow,wrist,side})}
 const legs=[];for(const side of [-1,1]){const hip=bone(`hip.${side}`,pelvis,side*.18,-.06,0),knee=bone(`knee.${side}`,hip,side*.24,-.44,side<0?.015:-.02),ankle=bone(`ankle.${side}`,knee,-side*.05,-.64,.025);legs.push({hip,knee,ankle,side})}
 pelvis.updateMatrixWorld(true);
 function wire(path,radius,b0,b1=b0,segments=null){
  // Actual depth, not a rotated camera: keep x/y and the round cable radius.
  const depth=b0===head?1:b0===shoulders?3.25:b0===spine?3.4:b0===pelvis?3:2;
  const points=path.map(([x,y,z])=>new THREE.Vector3(x,y,z*depth)),curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const steps=segments??Math.max(4,Math.min(30,Math.ceil(curve.getLength()*13))),g=new THREE.TubeGeometry(curve,steps,radius,5,false),base=positions.length/3;
  for(let i=0;i<g.attributes.position.count;i++){
   positions.push(g.attributes.position.getX(i),g.attributes.position.getY(i),g.attributes.position.getZ(i));
   const t=Math.floor(i/6)/steps,weight=b0===b1?0:Math.max(0,Math.min(1,(t-.18)/.7));skinIndices.push(bones.indexOf(b0),bones.indexOf(b1),0,0);skinWeights.push(1-weight,weight,0,0);
  }
  for(const index of g.index.array)indices.push(base+index);g.dispose();
 }
 // A genuinely three-dimensional irregular yarn ball. The winding planes
 // cross at different angles, with loose ends and air gaps rather than a solid
 // sphere, eyes, or a flat ring viewed at a different camera angle.
 for(let strand=0;strand<12;strand++){
  const path=[],rotation=new THREE.Euler(strand*1.37+.2,strand*.91+.45,strand*2.13),radius=.185+(strand%4)*.011;
  for(let k=0;k<=16;k++){
   const a=k/16*Math.PI*2,wobble=1+.07*Math.sin(a*3+strand*1.1),v=new THREE.Vector3(Math.cos(a)*radius*wobble,Math.sin(a)*radius*wobble,.027*Math.sin(a*4+strand)).applyEuler(rotation);
   path.push([.035+v.x,2.815+v.y,-.022+v.z]);
  }
  wire(path,.018+(strand%3)*.0015,head,head,24);
 }
 for(const path of [
  [[-.12,2.92,-.08],[-.19,2.985,-.07],[-.23,3.01,-.045]],
  [[.19,2.82,.065],[.26,2.85,.07],[.285,2.90,.042]],
  [[-.065,2.67,-.12],[-.10,2.62,-.145],[-.065,2.585,-.155]],
  [[.035,2.93,.145],[.095,2.98,.19],[.16,2.965,.19]],
 ])wire(path,.015,head,head,6);
 // Thin neck descends into a flattened, horizontal bundle of shoulder loops.
 wire([[.04,2.76,-.025],[.08,2.65,.01],[-.05,2.59,-.01],[.01,2.50,0]],.027,head,shoulders,12);
 for(let s=0;s<3;s++)wire([[-.52,2.49+s*.055,.01],[-.37,2.55+s*.055,-.035],[.02,2.58+s*.035,-.055],[.46,2.59+s*.04,-.005],[.59,2.64+s*.02,.02],[.36,2.65+s*.017,.055],[-.11,2.60+s*.019,.035],[-.52,2.52+s*.04,.005]],.016+s*.0015,shoulders,shoulders,20);
 wire([[-.54,2.51,0],[-.18,2.52,-.025],[.13,2.53,.015],[.58,2.55,0],[.71,2.58,.005]],.019,shoulders,shoulders,18);
 // Empty torso with only two kinked central strands and a loose left rib loop.
 wire([[.01,2.51,.01],[.01,2.27,.018],[.045,2.06,.03],[-.10,1.92,-.014],[-.04,1.78,.018],[.01,1.57,.006],[-.03,1.31,.0]],.021,shoulders,pelvis,24);
 wire([[.11,2.48,-.015],[.15,2.26,.01],[.13,2.10,-.025],[-.05,1.95,.01],[.08,1.71,.024],[.015,1.52,-.025]],.018,shoulders,pelvis,24);
 for(let i=0;i<3;i++)wire([[-.64,1.45+i*.019,.008],[-.32,1.49+i*.018,-.02],[.06,1.50+i*.014,-.01],[.18,1.45+i*.017,.02],[.065,1.41+i*.018,.06],[-.37,1.43+i*.021,.027],[-.64,1.45+i*.019,.008]],.014,spine,pelvis,18);
 for(let i=0;i<3;i++)wire([[.10,1.47-i*.06,.04],[-.07,1.43-i*.05,-.02],[.065,1.39-i*.06,-.035],[-.03,1.33-i*.035,.04],[.10,1.47-i*.06,.04]],.019,pelvis,pelvis,12);
 // Both long arms are real slender cables, with asymmetric bends and three
 // separated, unusually long fingers. They are not a filled hand-shaped plate.
 for(const {arm,elbow,wrist,side:s}of arms){
  const upper=s<0?[[s*.53,2.51,0],[s*.54,2.26,.008],[s*.55,2.03,-.007],[s*.61,1.78,.003],[s*.65,1.56,.015]]:[[s*.53,2.51,0],[s*.54,2.27,-.004],[s*.55,2.08,.012],[s*.65,1.99,-.006],[s*.60,1.86,.002],[s*.65,1.65,-.009]];
  wire(upper,.023,arm,elbow,22);
  const lower=s<0?[[s*.65,1.56,.015],[s*.72,1.20,.006],[s*.80,1.12,.017],[s*.89,.78,-.018],[s*.92,.57,0]]:[[s*.65,1.65,-.009],[s*.61,1.41,.019],[s*.63,1.15,-.016],[s*.68,.86,.01],[s*.69,.59,0]];
  wire(lower,.024,elbow,wrist,22);
  const x=s<0?-.92:.69,y=s<0?.57:.59;
  for(let finger=0;finger<3;finger++){const dx=(finger-1)*.22,len=finger===1?.43:.36;wire([[x,y,0],[x+dx*.60,y-.13,-.025],[x+dx,y-len,-.035]],.021,wrist,wrist,8)}
 }
 // Crooked, differently bent legs, plus thin secondary struts and knotted
 // ankle loops. Their asymmetry comes directly from the reference silhouette.
 for(const {hip,knee,ankle,side:s}of legs){
  const thigh=s<0?[[0,1.25,0],[-.19,1.20,-.005],[-.25,1.02,-.015],[-.39,.87,.013],[-.43,.74,0]]:[[.02,1.23,0],[.23,1.19,.013],[.43,1.10,-.009],[.41,.94,.02],[.31,.85,0]];
  wire(thigh,.025,hip,knee,19);
  const shin=s<0?[[-.43,.74,0],[-.41,.56,.02],[-.34,.44,-.024],[-.41,.37,0],[-.35,.25,.009],[-.38,.06,0],[-.49,.035,-.07]]:[[.31,.85,0],[.45,.77,.02],[.46,.63,-.015],[.33,.47,.012],[.38,.34,0],[.38,.06,0],[.49,.032,-.066]];
  wire(shin,.024,knee,ankle,22);
  wire(s<0?[[-.19,1.20,-.005],[-.21,.93,.032],[-.41,.79,.025],[-.44,.67,.006],[-.33,.40,-.025]]:[[.23,1.19,.013],[.34,1.08,.04],[.38,.96,-.005],[.51,.88,.03],[.55,.75,.007],[.48,.64,-.02],[.34,.46,.025]],.018,hip,ankle,22);
  const x=s<0?-.375:.37;wire([[x,.39,0],[x+s*.037,.33,.022],[x-s*.035,.28,-.02],[x+s*.03,.26,-.03],[x,.36,0]],.021,ankle,ankle,12);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));g.computeVertexNormals();g.computeBoundingSphere();
 const material=new THREE.MeshLambertMaterial({color:0x171b17});const mesh=new THREE.SkinnedMesh(g,material);mesh.name='Original cable-frame mesh';mesh.add(pelvis);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;root.add(mesh);
 root.userData.modelStats={triangles:indices.length/3,vertices:positions.length/3,bones:bones.length,drawCalls:1,height:3.05,revision:2};
 root.userData.pose=(stride=0,moving=false)=>{const swing=moving?Math.sin(stride*2.7)*.055:0;for(const {arm,elbow,wrist,side}of arms){arm.rotation.x=-side*swing;elbow.rotation.x=side*swing*.5;wrist.rotation.z=side*swing*.2}for(const {hip,knee,ankle,side}of legs){hip.rotation.x=side*swing*1.5;knee.rotation.x=-Math.max(0,side*swing)*1.8;ankle.rotation.x=side*swing*.3}head.rotation.z=moving?Math.sin(stride*.7)*.02:0;root.updateMatrixWorld(true);mesh.skeleton.update()};root.userData.pose();return root;
}
export function syncShadowMesh(mesh,entity,game){mesh.visible=Boolean(entity?.visible&&!game.changed&&game.mode!=='menu');if(!mesh.visible)return;mesh.position.set(entity.x,0,entity.z);mesh.rotation.y=-entity.yaw;mesh.userData.pose(entity.distanceMoved,entity.lastMove>.0001)}
