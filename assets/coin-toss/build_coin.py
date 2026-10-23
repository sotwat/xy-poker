"""Blender 5.2: create editable coin and render a 48-frame rotation atlas source."""
import bpy, math, os
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
scene = bpy.data.scenes.new('XY Coin Toss')
bpy.context.window.scene = scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 48
scene.world = bpy.data.worlds.new('Coin studio')
scene.world.use_nodes = True
next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[0].default_value = (.16,.19,.26,1)
next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[1].default_value = .4
scene.view_settings.view_transform = 'AgX'

def material(name, color, metal, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*color,1)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = roughness
    return m
silver = material('Brushed platinum',(.62,.69,.78),.92,.25)
blue = material('P1 cobalt enamel',(.028,.12,.42),.55,.24)
red = material('P2 vermilion enamel',(.48,.035,.022),.55,.24)
root = bpy.data.objects.new('Coin rotation',None)
scene.collection.objects.link(root)

def finish(o,name,mat,bevel=0):
    o.name = name
    o.data.materials.append(mat)
    o.parent = root
    if bevel:
        mod=o.modifiers.new('Machined edge','BEVEL'); mod.width=bevel; mod.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    for p in o.data.polygons: p.use_smooth=True
    return o

def cylinder(name,r,depth,z,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=r,depth=depth,location=(0,0,z))
    return finish(bpy.context.object,name,mat,.018)

cylinder('Solid platinum edge',1,.17,0,silver)
for side,mat in [(1,blue),(-1,red)]:
    cylinder('Enamel face '+str(side),.87,.025,side*.087,mat)
    for radius in [.91,.75]:
        bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=.016,major_segments=128,minor_segments=8,location=(0,0,side*.107))
        finish(bpy.context.object,'Concentric minted rim',silver)
    # Raised Roman seat marks use simple geometry, readable at small sizes.
    for x in ([0] if side==1 else [-.16,.16]):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,side*.115))
        o=bpy.context.object; o.scale=(.11,.78,.035)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        finish(o,'Seat I' if side==1 else 'Seat II',silver,.018)
    for y in [-.4,.4]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,y,side*.115))
        o=bpy.context.object;o.scale=(.42 if side==1 else .68,.085,.035)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        finish(o,'Roman cap',silver,.014)
for i in range(80):
    a=i*math.tau/80
    bpy.ops.mesh.primitive_cube_add(size=1,location=(math.cos(a)*.997,math.sin(a)*.997,0))
    o=bpy.context.object;o.rotation_euler.z=a;o.scale=(.016,.022,.125)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,'Reeded edge %02d'%i,silver,.006)

bpy.ops.object.camera_add(location=(0,-.4,7))
camera=bpy.context.object;camera.name='Orthographic studio camera'
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.65;scene.camera=camera
for name,loc,power,size,color in [('Softbox key',(-3,-2,5),650,4,(.83,.9,1)),('Warm rim',(3,1,3),900,2,(1,.83,.66)),('Edge strip',(0,4,1),700,2,(.65,.78,1))]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color
    o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
for frame in range(1,49):
    root.rotation_euler=(math.tau*(frame-1)/48,0,-.12)
    root.keyframe_insert('rotation_euler',frame=frame)
scene.frame_set(1)
scene.render.filepath = '//frames/'
bpy.data.libraries.write(os.path.join(ROOT,'coin-toss.blend'), {scene})
scene.render.filepath=os.path.join(ROOT,'preview.png')
bpy.ops.render.render(write_still=True)
print('COIN_READY',scene.render.filepath)
