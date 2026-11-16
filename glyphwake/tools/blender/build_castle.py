"""Glyphwake ruined castle (cobblestone, moss, a walkable upper floor), modelled with Blender's Python API.

Run:  python build_castle.py OUT.glb

Local layout (metres, Blender: X east, Y north (game -Z), Z up). The game places the castle with its
centre at CASTLE in js/world.js and uses the same numbers for colliders and walkable floors
(see CASTLE_LAYOUT there). Keep them in sync.

  courtyard walls: square, half-size 11, 1.2 thick, 5 m high, crenellated; breach on the west wall
  gate:            south wall, 3 m wide
  towers:          round, r 2.6, at the four corners (NE tower collapsed)
  keep:            x -6..6, y 2..10 (north half), walls 1 m thick, 7 m high
                   ground-floor door on its south face (x -1..1)
                   upper floor slab at z 3.4 with a collapsed hole (x 1.5..4, y 4..6.5)
  stair:           along the keep's east outer face, x 6.2..7.8, from y 0 (z 0) to y 8 (z 3.4),
                   entering the upper floor through a gap in the east parapet at y 7.2..9
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, noise

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/castle.glb'
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

# ---------------------------------------------------------------- curtain walls
H, T, R = 5.0, 1.2, 11.0
def wall(name, x0, y0, x1, y1, gaps=(), breach=None, seed=0):
    L = math.hypot(x1 - x0, y1 - y0); ang = math.atan2(y1 - y0, x1 - x0)
    w = box(name, (L, T, H), ((x0 + x1) / 2, (y0 + y1) / 2, H / 2), 'cobble', (0, 0, ang), sub=3)
    for (a, b, hgt) in gaps:   # openings along the wall, in metres from its start
        c = box('cut', (b - a, T * 3, hgt), (x0 + math.cos(ang) * (a + b) / 2, y0 + math.sin(ang) * (a + b) / 2, hgt / 2 - 0.01), rot=(0, 0, ang))
        bake(c); boolean(w, c)
    bake(w)
    if breach:   # a collapsed section: a jagged V cut from the top
        a, b = breach; cx, cy = x0 + math.cos(ang) * (a + b) / 2, y0 + math.sin(ang) * (a + b) / 2
        for v in w.data.vertices:
            along = (v.co.x - x0) * math.cos(ang) + (v.co.y - y0) * math.sin(ang)
            if a - 1.5 < along < b + 1.5:
                k = 1 - min(1, abs(along - (a + b) / 2) / ((b - a) / 2 + 1.5))
                v.co.z = min(v.co.z, H - k * (H - 0.6) + noise.noise(Vector((along, seed, 0))) * 0.5)
    else:
        ruin_top(w, H, 0.9, seed)
    weather(w, 0.06, 0.6, seed)
    keep(w)
    # merlons on top of the intact stretches
    n = int(L / 1.6)
    for i in range(n):
        t = (i + 0.5) / n; px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        along = t * L
        if breach and breach[0] - 2 < along < breach[1] + 2: continue
        if any(a - 0.5 < along < b + 0.5 for (a, b, h) in gaps): continue
        if random.random() < 0.25: continue      # some merlons have fallen
        m = box('merlon', (0.8, T, 0.8), (px, py, H + 0.35), 'cobble', (0, 0, ang)); weather(m, 0.04, 0.3, i); keep(m)
    # moss band along the base and draped from the top
    mb = box('mossb', (L, T + 0.15, 0.55), ((x0 + x1) / 2, (y0 + y1) / 2, 0.25), 'moss', (0, 0, ang), sub=2); weather(mb, 0.12, 0.4, seed + 2); keep(mb)
    for k in range(int(L / 3)):
        t = random.random(); px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        drape = box('drape', (random.uniform(0.8, 2.0), T + 0.1, random.uniform(0.8, 2.2)), (px, py, H - 0.6 - random.random()), 'moss', (0, 0, ang), sub=1)
        weather(drape, 0.15, 0.3, k + seed); keep(drape)

wall('wall_s', -R, -R, R, -R, gaps=[(9.5, 12.5, 3.6)], seed=1)          # gate in the middle of the south wall
wall('wall_w', -R, R, -R, -R, breach=(6, 11), seed=2)                    # collapsed breach
wall('wall_n', R, R, -R, R, seed=3)
wall('wall_e', R, -R, R, R, seed=4)
# gate arch lintel
keep(box('lintel', (3.8, T + 0.2, 0.6), (0, -R, 3.9), 'cobbleDark'))

# ---------------------------------------------------------------- towers
for (tx, ty, broken) in [(-R, -R, False), (R, -R, False), (-R, R, False), (R, R, True)]:
    h = 3.0 if broken else 7.5
    tw = cyl('tower', 2.6, h, (tx, ty, 0), 'cobble', segs=24)
    m = tw.modifiers.new('s', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 2; apply(tw); bake(tw)
    ruin_top(tw, h, 2.5 if broken else 0.8, tx + ty, 2.0)
    weather(tw, 0.07, 0.5, int(tx))
    keep(tw)
    if not broken:
        for i in range(10):
            if random.random() < 0.3: continue
            a = i / 10 * 2 * math.pi
            keep(box('tm', (0.7, 0.6, 0.8), (tx + math.cos(a) * 2.35, ty + math.sin(a) * 2.35, h + 0.35), 'cobble', (0, 0, a)))
        keep(cyl('roofring', 2.75, 0.3, (tx, ty, h - 0.2), 'cobbleDark', segs=24))
    tm = cyl('towermoss', 2.75, 0.6, (tx, ty, 0), 'moss', segs=24); weather(tm, 0.15, 0.4, 7); keep(tm)

# ---------------------------------------------------------------- keep (two storeys)
KH = 7.0
kp = box('keep', (12, 8, KH), (0, 6, KH / 2), 'cobble', sub=3)
inner = box('keep_in', (10, 6, KH + 1), (0, 6, KH / 2 + 0.5)); boolean(kp, inner)
door = box('door', (2.0, 2.0, 2.6), (0, 2, 1.3)); boolean(kp, door)
stairgap = box('sgap', (2.0, 1.8, 2.4), (6, 8.1, 3.4 + 1.2)); boolean(kp, stairgap)
for (wx, wy) in [(-3.5, 2), (3.5, 2), (-6, 6), (0, 10)]:
    win = box('win', (0.7, 2.0, 1.2) if wy in (2, 10) else (2.0, 0.7, 1.2), (wx, wy, 5.0)); boolean(kp, win)
bake(kp)
ruin_top(kp, KH, 1.6, 9)
for v in kp.data.vertices:   # the north-east corner has collapsed down to the upper floor
    if v.co.x > 3.0 and v.co.y > 7.5: v.co.z = min(v.co.z, 3.6 + noise.noise(Vector((v.co.x, v.co.y, 1))) * 0.6)
weather(kp, 0.06, 0.6, 9)
keep(kp)
keep(box('keepmoss', (12.2, 8.2, 0.6), (0, 6, 0.28), 'moss', sub=2))
# upper floor: timber planks on stone corbels, with a collapsed hole
fl = box('floor', (10, 6, 0.3), (0, 6, 3.4 - 0.15), 'wood', sub=2)
hole = box('hole', (2.5, 2.5, 1.0), (2.75, 5.25, 3.25)); boolean(fl, hole)
for v in fl.data.vertices:  # sag and splinter around the hole
    d = math.hypot(v.co.x - 2.75, v.co.y - 5.25)
    if d < 2.2: v.co.z -= (2.2 - d) * 0.12
keep(fl)
for i in range(6): keep(box('beam', (0.25, 6.0, 0.3), (-4 + i * 1.7, 6, 3.4 - 0.45), 'woodDark'))
# broken planks hanging into the hole
for i in range(3):
    keep(box('plank', (0.25, 1.4, 0.08), (2.0 + i * 0.7, 4.6, 2.9), 'wood', rot=(0.7 + i * 0.2, 0, 0.2)))
# parapet stones on the upper floor edge facing the courtyard
keep(box('ledge', (10.6, 0.5, 0.2), (0, 2.1, 3.45), 'cobbleDark'))

# ---------------------------------------------------------------- stair up the keep's east face
steps = 14
for i in range(steps):
    z = 3.4 * (i + 1) / steps; y = 0.2 + 7.8 * i / steps
    keep(box('step%d' % i, (1.6, 7.8 / steps + 0.05, z), (7.0, y, z / 2), 'cobbleDark'))
keep(box('stairwall', (0.4, 8.2, 1.0), (7.9, 4.1, 3.9), 'cobble'))

# ---------------------------------------------------------------- rubble, a well, a collapsed cart
for i in range(45):
    if i < 22: c = Vector((-R + random.uniform(-1.5, 3.5), random.uniform(-3, 8), 0))      # below the breach
    elif i < 32: c = Vector((R + random.uniform(-2, 2), R + random.uniform(-2, 2), 0))   # collapsed tower
    else: c = Vector((random.uniform(1.5, 4.0), random.uniform(4.0, 6.5), 0))           # under the floor hole
    s = random.uniform(0.25, 0.75)
    rb = box('rubble', (s * 1.4, s, s * 0.8), (c.x, c.y, s * 0.3), 'cobble', (random.random(), random.random(), random.random() * 3), sub=1)
    weather(rb, 0.06, 0.2, i); keep(rb)
well = cyl('well', 1.0, 0.9, (-5, -5, 0), 'cobble', segs=16); keep(well)
keep(cyl('wellwater', 0.75, 0.02, (-5, -5, 0.6), 'void', segs=16))
keep(box('cart', (1.8, 1.0, 0.15), (5, -6, 0.35), 'woodDark', rot=(0.3, 0.2, 0.6)))

# ---------------------------------------------------------------- export as one asset
for o in ALL: bake(o)
root = bpy.data.objects.new('castle', None); bpy.context.scene.collection.objects.link(root)
for o in ALL: o.parent = root
print('parts', len(ALL), 'faces', sum(len(o.data.polygons) for o in ALL))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_texcoords=False)
print('wrote', OUT)
