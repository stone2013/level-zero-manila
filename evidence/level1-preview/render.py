import bpy,json,os,sys,math
from mathutils import Vector
base=os.path.dirname(os.path.abspath(__file__));zone=sys.argv[-1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
cache={}; texbase='/workspace/scratch/ba66c468c368/level1-assets/pack/textures'
for ob in json.load(open(base+'/'+zone+'.json')):
 d=ob['material'];key=json.dumps(d)
 if key not in cache:
  m=bpy.data.materials.new(d['name']);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*d['color'],1);p.inputs['Roughness'].default_value=.75;p.inputs['Emission Color'].default_value=(*d['emission'],1);p.inputs['Emission Strength'].default_value=d['intensity']
  texture=next((f for n,f in [('Concrete','concrete'),('Blue textured','blue-paint'),('Warm oak','wood'),('Brushed galvanized','metal')] if n in d['name']),None)
  if texture and d['map']:
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(texbase+'/'+texture+'.png',check_existing=True);m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  cache[key]=m
 mesh=bpy.data.meshes.new(ob['name']);ii=ob['indices'];mesh.from_pydata(ob['vertices'],[],[ii[i:i+3] for i in range(0,len(ii),3)]);mesh.update();o=bpy.data.objects.new(ob['name'],mesh);bpy.context.collection.objects.link(o);mesh.materials.append(cache[key])
 if ob['uv']:
  uv=mesh.uv_layers.new()
  for p in mesh.polygons:
   for li in p.loop_indices:uv.data[li].uv=ob['uv'][mesh.loops[li].vertex_index]
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=False;scene.render.resolution_x=960;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.49,.51,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
# CPU layout review lighting; intentionally not described as runtime illumination.
for x,y in ([(-3,-2),(3,-2)] if zone=='hub' else [(0,y) for y in [0,6,12,18,26,33,39]]):
 bpy.ops.object.light_add(type='AREA',location=(x,y,3.6));bpy.context.object.data.energy=100;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=4
loc=(0,-5.7,1.63) if zone=='hub' else (0,-4.5,1.63);target=(2,-1,1.63) if zone=='hub' else (0,15,1.63)
bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=23;scene.camera=o;scene.view_settings.view_transform='AgX'
scene.render.filepath=base+'/'+zone+'-assembled-cpu.png';bpy.ops.render.render(write_still=True)
