"""CPU Cycles renders of unmodified runtime Three.js geometry, not gameplay.

Usage: node evidence/supply-models/export-actual-geometry.mjs
       blender -b -t 8 --python evidence/supply-models/render-actual-geometry.py
"""
import bpy
import json
import math
import os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'actual-geometry.json')) as file:
    data = json.load(file)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.resolution_x = 1600
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast' if 'Medium High Contrast' in [i.identifier for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.58, 0.58, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.42

def matte(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    shader = material.node_tree.nodes.new('ShaderNodeBsdfDiffuse')
    shader.inputs['Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = 0
    output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return material

asset_material = matte('Original runtime vertex colors / Lambert matte', (1, 1, 1))
color = asset_material.node_tree.nodes.new('ShaderNodeVertexColor')
color.layer_name = 'SupplyColor'
asset_material.node_tree.links.new(color.outputs['Color'], asset_material.node_tree.nodes.get('Diffuse BSDF').inputs['Color'])

# Only the backdrop is authored here. Supply geometry is imported verbatim.
floor_material = matte('Muted warm room floor', (0.285, 0.245, 0.167))
wall_material = matte('Muted warm plaster', (0.42, 0.393, 0.295))
trim_material = matte('Low dark baseboard', (0.125, 0.115, 0.086))

def cube(name, dimensions, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj

cube('Backdrop floor; surface exactly z=0', (8, 8, 0.08), (0, 0, -0.04), floor_material)
wall = cube('Backdrop rear wall', (8, .10, 2.6), (0, 1.65, 1.3), wall_material)
cube('Backdrop baseboard', (8, .03, .08), (0, 1.58, .04), trim_material)

def area(name, location, energy, size, target):
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = energy
    light_data.shape = 'DISK'
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector(target) - light.location).to_track_quat('-Z', 'Y').to_euler()
    return light

area('Soft room key', (-1.4, -1.4, 2.5), 100, 2.3, (0, 0, .15))
area('Soft room fill', (1.9, .3, 1.7), 30, 2.0, (0, 0, .15))

camera_data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.lens = 52

def point_camera(location, target, scale):
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.ortho_scale = scale

meshes = {}
for kind, source_meshes in data['models'].items():
    assert len(source_meshes) == 1, 'Expected actual single shared runtime mesh'
    original = source_meshes[0]
    p, n, c = original['positions'], original['normals'], original['colors']
    vertices = [(p[i], -p[i+2], p[i+1]) for i in range(0, len(p), 3)]
    normals = [(n[i], -n[i+2], n[i+1]) for i in range(0, len(n), 3)]
    indices = original['indices'] or list(range(len(vertices)))
    faces = [indices[i:i+3] for i in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new('Actual runtime ' + kind)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    attribute = mesh.color_attributes.new(name='SupplyColor', type='FLOAT_COLOR', domain='CORNER')
    for loop in mesh.loops:
        i = loop.vertex_index * 3
        attribute.data[loop.index].color = (c[i], c[i+1], c[i+2], 1)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.normals_split_custom_set_from_vertices(normals)
    mesh.materials.append(asset_material)
    meshes[kind] = mesh

items = []
placement_checks = []

def place(kind, x, y, angle=0, flipped=False):
    obj = bpy.data.objects.new('Actual ' + kind, meshes[kind])
    scene.collection.objects.link(obj)
    obj.rotation_euler = (math.pi if flipped else 0, 0, angle)
    obj.location = (x, y, 0)
    bpy.context.view_layer.update()
    min_z = min((obj.matrix_world @ Vector(corner)).z for corner in obj.bound_box)
    obj.location.z -= min_z
    bpy.context.view_layer.update()
    actual_min = min((obj.matrix_world @ Vector(corner)).z for corner in obj.bound_box)
    placement_checks.append({'object': obj.name, 'kind': kind, 'flipped': flipped, 'ground_min_z': actual_min})
    assert abs(actual_min) < 1e-7, f'Floating asset {obj.name}: {actual_min}'
    items.append(obj)
    return obj

def clear_items():
    for obj in items:
        bpy.data.objects.remove(obj, do_unlink=True)
    items.clear()

def render(filename):
    scene.render.filepath = os.path.join(HERE, filename)
    bpy.ops.render.render(write_still=True)

place('food', -.19, -.09, -.08)
place('water', .19, .07, -.12)
point_camera((.84, -1.65, 1.0), (0, 0, .16), .87)
render('actual-assets-front-closeup.png')

clear_items()
place('food', -.19, -.09, .08, flipped=True)
place('water', .19, .07, math.pi-.12)
point_camera((.84, -1.65, 1.0), (0, 0, .16), .87)
render('actual-assets-reverse-closeup.png')

clear_items()
positions = [(-.61,-.43),(-.10,-.55),(.42,-.42),(-.45,.04),(.17,-.02)]
for i, (x,y) in enumerate(positions):
    place('food', x, y, [.20,-.45,.80,-.12,.35][i])
positions = [(-.75,.42),(-.21,.47),(.38,.38),(.73,-.03),(.05,.91)]
for i, (x,y) in enumerate(positions):
    place('water', x, y, [-.2,.35,-.55,2.7,-1.3][i])
point_camera((2.5,-3.7,3.0), (0,.16,.06), 2.48)
render('actual-assets-ground-scale-10-items.png')

with open(os.path.join(HERE, 'render-verification.json'), 'w') as file:
    json.dump({'engine': 'Cycles CPU', 'resolution': [1600, 1200], 'samples': 64,
               'source': data['source'], 'sourceStats': data['stats'],
               'sourceSha256': data['sourceSha256'],
               'coordinateMapping': '(Three x, Three y, Three z) -> (x, -z, y)',
               'placementChecks': placement_checks,
               'notGameplayScreenshot': True}, file, indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'actual-supply-previews.blend'))
print('ACTUAL SUPPLY PREVIEWS COMPLETE')
