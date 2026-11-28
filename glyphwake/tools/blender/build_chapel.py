"""Glyphwake gothic chapel ruin (the arched doorway from the reference clips), built with Blender's Python API.

Run:  python build_chapel.py OUT.glb

Local layout (metres, Blender: X east, Y north (game -Z), Z up); the game places it at L.chapel in js/world.js
and mirrors these numbers for colliders (CHAPEL there):
  facade:   x -6..6, y 0..1.1, eaves 7 m, gable peak 10.5 m, pointed door x -1.3..1.3 (4.4 m high)
  buttresses at x -6.35, -2.1, 2.1, 6.35 (front, y -1.2..0.4)
  nave:     walls x = +-5.45, y 1.1..12.1 (west wall broken from y 1.6 north), back wall y 12.1..13.2
  roof:     front half (y 1.1..7.1) survives; back half collapsed
  torch bracket at x 2.1, y -1.35, z 3.2 (on the east door buttress)
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, noise

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/chapel.glb'
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


# ---------------------------------------------------------------- the chapel
def arch_prism(name, w, spring, depth, loc, segs=10):
    """Pointed (equilateral) gothic arch opening, extruded along Y: used as a boolean cutter."""
    r = w; pts = [(-w / 2, -0.3), (w / 2, -0.3), (w / 2, spring)]
    for i in range(1, segs + 1):                       # right arc: centre at -w/2
        a = math.acos(1 - 0.5) * (i / segs); x = -w / 2 + r * math.cos(a); z = spring + r * math.sin(a)
        pts.append((x, z))
    for i in range(segs - 1, -1, -1):                  # left arc: centre at +w/2 (mirror)
        a = math.acos(1 - 0.5) * (i / segs); x = w / 2 - r * math.cos(a); z = spring + r * math.sin(a)
        pts.append((x, z))
    bm = bmesh.new()
    vf = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    vb = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(vf[::-1]); bm.faces.new(vb)
    n = len(pts)
    for i in range(n): bm.faces.new((vf[i], vf[(i + 1) % n], vb[(i + 1) % n], vb[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    return ob

def gable_wall(name, w, t, h, peak, loc, material='cobble'):
    """Wall with a pointed gable top, centred on x, front face at y = loc.y."""
    bm = bmesh.new(); prof = [(-w / 2, 0), (w / 2, 0), (w / 2, h), (0, peak), (-w / 2, h)]
    vf = [bm.verts.new((x, 0, z)) for x, z in prof]; vb = [bm.verts.new((x, t, z)) for x, z in prof]
    bm.faces.new(vf[::-1]); bm.faces.new(vb)
    for i in range(len(prof)): bm.faces.new((vf[i], vf[(i + 1) % len(prof)], vb[(i + 1) % len(prof)], vb[i]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    me.materials.append(mat(material))
    m = ob.modifiers.new('s', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 3; apply(ob)
    return ob

W2, T, H, PEAK = 6.0, 1.1, 7.0, 10.5      # facade half-width, thickness, eave height, gable peak
DEPTH = 11.0                               # nave length (north)
# facade with gothic door, two lancet windows and a rose window
fac = gable_wall('facade', W2 * 2, T, H, PEAK, (0, 0, 0))
boolean(fac, arch_prism('door', 2.6, 2.3, 4.0, (0, T / 2, 0)))
for x in (-3.6, 3.6): boolean(fac, arch_prism('lancet', 0.9, 4.2, 4.0, (x, T / 2, 3.0)))
ro = cyl('rose', 0.95, 4.0, (0, -1.0, 7.6), 'cobble', segs=16); ro.rotation_euler = (math.pi / 2, 0, 0); boolean(fac, ro)
weather(fac, 0.07, 0.6, 1); ruin_top(fac, PEAK, 1.6, 2.0, fx=1.6); keep(fac)
# deep doorway: a dark recess frame (jambs) and orders of the arch
for i, (w, d) in enumerate(((3.2, 0.35), (3.8, 0.2))):
    o = arch_prism('order%d' % i, w, 2.3, d, (0, -d / 2 + 0.02, 0)); o.data.materials.append(mat('cobbleDark'))
    cut = arch_prism('orderc%d' % i, w - 0.5, 2.3, d + 0.4, (0, -d / 2 + 0.02, 0)); boolean(o, cut); keep(o)
# buttresses
for x in (-W2 - 0.35, -2.1, 2.1, W2 + 0.35):
    tall = 6.0 if abs(x) > 3 else 5.2
    b = box('butt', (0.7, 1.6, tall), (x, -0.4, tall / 2), 'cobble', sub=2)
    for v in b.data.vertices:                                   # stepped / sloped top
        if v.co.z > 0 and v.co.y < 0: v.co.z -= 0.25
    weather(b, 0.05, 0.4, x); keep(b)
    keep(box('buttcap', (0.8, 0.9, 0.25), (x, 0.1, tall + 0.1), 'cobbleDark'))
# nave side walls (west one broken half-way), back wall
sw = box('wallW', (T, DEPTH, 5.6), (-W2 + T / 2, T + DEPTH / 2, 2.8), 'cobble', sub=3); weather(sw, 0.06, 0.5, 4)
for v in sw.data.vertices:
    if v.co.y > 0.5: v.co.z = min(v.co.z, 0.9 + 3.0 * max(0.0, noise.noise(Vector((v.co.y * 0.4, v.co.z * 0.3, 3.0))) + 0.2))
keep(sw)
ew = box('wallE', (T, DEPTH, 5.6), (W2 - T / 2, T + DEPTH / 2, 2.8), 'cobble', sub=3); weather(ew, 0.06, 0.5, 5); ruin_top(ew, 5.6, 1.2, 6.0); keep(ew)
bw = box('wallN', (W2 * 2, T, 5.6), (0, T + DEPTH + T / 2, 2.8), 'cobble', sub=3); weather(bw, 0.06, 0.5, 7); ruin_top(bw, 5.6, 2.2, 8.0); keep(bw)
# roof: front half survives (keeps the doorway dark), back half fell in
for s in (-1, 1):
    rf = box('roof', (W2 + 0.6, 6.0, 0.35), (s * W2 / 2, T + 3.0, 7.2), 'cobbleDark', rot=(0, s * -0.62, 0), sub=2)
    for v in rf.data.vertices:
        if v.co.y > 1.5: v.co.y -= max(0.0, noise.noise(Vector((v.co.x * 0.5, 9.0 + s, 0.0))) + 0.3) * 2.2
    weather(rf, 0.05, 0.4, 10 + s); keep(rf)
keep(box('ridge', (0.5, 6.0, 0.4), (0, T + 3.0, 8.85), 'cobbleDark'))
# dark interior floor under the roof (reads as the black doorway from outside)
keep(box('nave_floor', (W2 * 2 - 2 * T, DEPTH, 0.04), (0, T + DEPTH / 2, 0.03), 'cobbleDark'))
# moss drapes on the facade and buttress tops
for i in range(14):
    x = random.uniform(-W2, W2); z = random.uniform(0.0, 6.0)
    m = box('moss', (random.uniform(0.6, 1.6), 0.12, random.uniform(0.4, 1.4)), (x, -0.1, z), 'moss', sub=2); weather(m, 0.08, 0.3, i); keep(m)
# rubble at the broken west wall and in front
for i in range(16):
    c = Vector((random.uniform(-W2 - 2.5, -W2 + 1.5), random.uniform(3, DEPTH), 0)) if i < 10 else Vector((random.uniform(-6, 6), random.uniform(-4.5, -1.6), 0))
    if abs(c.x) < 1.8 and c.y < 0: c.x += 3.0 * (1 if c.x >= 0 else -1)
    s = random.uniform(0.3, 0.75)
    rb = box('rubble', (s * 1.4, s, s * 0.8), (c.x, c.y, s * 0.3), 'cobble', (random.random(), random.random(), random.random() * 3), sub=1)
    weather(rb, 0.06, 0.2, i); keep(rb)
# torch bracket (the flame itself is added in the game)
keep(box('bracket', (0.12, 0.5, 0.12), (2.1, -1.35, 3.2), 'iron'))

for o in ALL: bake(o)
root = bpy.data.objects.new('chapel', None); bpy.context.scene.collection.objects.link(root)
for o in ALL: o.parent = root
print('parts', len(ALL), 'faces', sum(len(o.data.polygons) for o in ALL))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_texcoords=False)
print('wrote', OUT)
