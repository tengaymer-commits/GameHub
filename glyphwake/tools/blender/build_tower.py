"""Glyphwake overgrown watchtower (walk in at the door -> you come out on top; chest on the roof).

Run:  python build_tower.py OUT.glb

Local layout (metres, Blender: X east, Y north (game -Z), Z up). The game places it at L.tower in js/world.js
and mirrors these numbers (TOWER there):
  round tower r 3.3 (tapering to 3.07), 13 m high, door facing south at y = -3.3
  roof platform z 13, walkable inside r ~2.9, crenellated parapet broken on the west
  hatch down at (1.6, -0.4), chest at (-0.6, 1.2)
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, noise

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/tower.glb'
random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = {}
def mat(n):
    if n not in MATS: MATS[n] = bpy.data.materials.new(n)
    return MATS[n]

def apply(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def bake(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def box(name, size, loc, material='cobble', rot=(0, 0, 0), sub=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat(material)); ob.location = loc; ob.rotation_euler = rot
    if sub:
        m = ob.modifiers.new('s', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = sub; apply(ob)
    bev = ob.modifiers.new('b', 'BEVEL'); bev.width = 0.04; bev.segments = 1; apply(ob)
    return ob

def cyl(name, r, h, loc, material='cobble', segs=20, r2=None, open_top=False):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=not open_top, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    for v in bm.verts: v.co.z += h / 2
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat(material)); ob.location = loc
    return ob

def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('x', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'; apply(ob)
    bpy.data.objects.remove(cutter, do_unlink=True)

def weather(ob, amt, scale, seed):
    off = Vector((seed * 3.1, seed * 1.3, seed * 2.7))
    for v in ob.data.vertices:
        v.co += v.normal * noise.noise((v.co + off) / scale) * amt

def ruin_top(ob, z_top, depth, seed, fx=1.0):
    """Chew the top edge: vertices near the top are lowered by noise (broken, uneven masonry)."""
    for v in ob.data.vertices:
        if v.co.z > z_top - depth:
            n = noise.noise(Vector((v.co.x * 0.35 * fx, v.co.y * 0.35, seed)))
            v.co.z = min(v.co.z, z_top - depth * max(0.0, n * 1.6))

ALL = []
def keep(o): ALL.append(o); return o


# ---------------------------------------------------------------- the watchtower
R0, HT, TOPZ = 3.3, 13.0, 13.0
body = cyl('tower', R0, HT, (0, 0, 0), 'cobble', segs=28, r2=R0 * 0.93)
m = body.modifiers.new('s', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 2; apply(body)
weather(body, 0.09, 0.8, 1)
# door recess (pointed arch) facing south (-Y) and arrow slits
def arch_prism(name, w, spring, depth, loc, segs=8):
    r = w; pts = [(-w / 2, -0.3), (w / 2, -0.3), (w / 2, spring)]
    for i in range(1, segs + 1):
        a = math.radians(60) * (i / segs); pts.append((-w / 2 + r * math.cos(a), spring + r * math.sin(a)))
    for i in range(segs - 1, -1, -1):
        a = math.radians(60) * (i / segs); pts.append((w / 2 - r * math.cos(a), spring + r * math.sin(a)))
    bm = bmesh.new(); vf = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]; vb = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(vf[::-1]); bm.faces.new(vb)
    for i in range(len(pts)): bm.faces.new((vf[i], vf[(i + 1) % len(pts)], vb[(i + 1) % len(pts)], vb[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    return ob
boolean(body, arch_prism('door', 1.7, 1.6, 2.4, (0, -R0, 0)))
keep(box('doorDark', (1.6, 0.3, 2.5), (0, -R0 + 1.0, 1.25), 'void'))
for i, (a, z) in enumerate(((0.9, 4.0), (2.6, 6.5), (-1.9, 8.5), (0.3, 10.2), (3.6, 3.2))):
    s = box('slit', (0.28, 2.0, 1.1), (math.sin(a) * R0, -math.cos(a) * R0, z), 'cobble', rot=(0, 0, -a)); boolean(body, s)
keep(body)
# corbel ring and crenellated parapet (broken on the west)
cor = cyl('corbel', R0 + 0.45, 0.6, (0, 0, TOPZ - 0.6), 'cobbleDark', segs=28); weather(cor, 0.05, 0.4, 2); keep(cor)
plat = cyl('platform', R0 + 0.4, 0.25, (0, 0, TOPZ - 0.05), 'cobbleDark', segs=28); keep(plat)
for k in range(14):
    a = k / 14 * math.tau
    if 2.6 < a < 3.6: continue                    # gap: crumbled merlons on the west side
    h = 1.1 if k % 2 == 0 else 0.55
    mer = box('merlon', (0.95, 0.45, h), (math.cos(a) * (R0 + 0.15), math.sin(a) * (R0 + 0.15), TOPZ + h / 2 + 0.15), 'cobble', rot=(0, 0, a + math.pi / 2), sub=1)
    weather(mer, 0.05, 0.25, k); keep(mer)
# hatch down (dark square) and the chest
keep(box('hatch', (0.9, 0.9, 0.04), (1.6, -0.4, TOPZ + 0.1), 'void'))
keep(box('hatchRim', (1.1, 1.1, 0.08), (1.6, -0.4, TOPZ + 0.06), 'woodDark'))
ch = box('chest', (1.0, 0.65, 0.55), (-0.6, 1.2, TOPZ + 0.36), 'wood'); keep(ch)
lid = cyl('chestLid', 0.33, 1.0, (-1.1, 1.2, TOPZ + 0.63), 'wood', segs=10); lid.rotation_euler = (0, math.pi / 2, 0); keep(lid)
for x in (-1.0, -0.2):
    keep(box('band', (0.08, 0.7, 0.75), (x, 1.2, TOPZ + 0.5), 'iron'))
keep(box('lock', (0.16, 0.06, 0.2), (-0.6, 0.86, TOPZ + 0.55), 'gold'))
# overgrowth: moss/ivy clumps hanging down the sides and spilling over the parapet
for i in range(70):
    a = random.uniform(0, math.tau); z = random.uniform(0.2, TOPZ + 0.6) if i < 55 else TOPZ + random.uniform(0.2, 0.8)
    r = (R0 * (1 - 0.07 * z / HT)) + 0.1
    s = random.uniform(0.5, 1.3) * (1.3 if z < 3 else 1.0)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    me = bpy.data.meshes.new('ivy'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('ivy', me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat('moss'))
    ob.location = (math.cos(a) * r, math.sin(a) * r, z); ob.scale = (s, s * 0.45, s * random.uniform(1.0, 2.2)); ob.rotation_euler = (0, 0, a + math.pi / 2)
    if abs(a - 1.5 * math.pi) < 0.35 and z < 3.2: bpy.data.objects.remove(ob, do_unlink=True); continue   # keep the door clear
    bake(ob); weather(ob, 0.25, 0.5, i); keep(ob)
# rubble and fallen merlons at the foot (west)
for i in range(12):
    a = random.uniform(2.3, 3.9); r = R0 + random.uniform(0.6, 3.5); s = random.uniform(0.3, 0.7)
    rb = box('rubble', (s * 1.4, s, s * 0.8), (math.cos(a) * r, math.sin(a) * r, s * 0.3), 'cobble', (random.random(), random.random(), random.random() * 3), sub=1)
    weather(rb, 0.06, 0.2, i); keep(rb)

for o in ALL: bake(o)
root = bpy.data.objects.new('tower', None); bpy.context.scene.collection.objects.link(root)
for o in ALL: o.parent = root
print('parts', len(ALL), 'faces', sum(len(o.data.polygons) for o in ALL))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_texcoords=False)
print('wrote', OUT)
