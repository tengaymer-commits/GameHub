"""Glyphwake environment kit, modelled procedurally with Blender's Python API.

Run:  python build_kit.py OUT.glb      (needs the `bpy` module, Blender 4.x/5.x)

Every asset is a top-level object (children allowed) named after the asset.
Material names are looked up by the game (js/world.js KIT_MAT) to pick a glyph set
and colour, so keep them short: stone, stoneDark, moss, wood, woodDark, bark, thatch,
iron, cloth, lantern, leaf.
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, noise

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/kit.glb'
random.seed(7)

# ---------------------------------------------------------------- helpers
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        MATS[name] = m
    return MATS[name]

def obj_from_bm(bm, name, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat(material))
    return ob

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def displace(ob, strength=0.06, scale=0.6, seed=0):
    """Weathering: per-vertex noise along the normal (needs some subdivision first)."""
    me = ob.data
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in me.vertices:
        n = noise.noise((v.co + off) / scale) + 0.5 * noise.noise((v.co + off) * 2.3 / scale)
        v.co += v.normal * n * strength

def subdiv(ob, levels=1, simple=False):
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    if simple: m.subdivision_type = 'SIMPLE'
    apply_mods(ob)

def decimate(ob, ratio):
    if ratio >= 1: return
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio; apply_mods(ob)

def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('bool', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'
    apply_mods(ob)
    bpy.data.objects.remove(cutter, do_unlink=True)

def cube(name, size, loc=(0, 0, 0), material='stone', segs=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = obj_from_bm(bm, name, material)
    ob.location = loc
    if segs > 1:
        bpy.context.view_layer.objects.active = ob
        subdiv(ob, segs - 1, simple=True)
    return ob

def cyl(name, r, h, loc=(0, 0, 0), material='stone', segs=12, r2=None, rings=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    for v in bm.verts: v.co += Vector((0, 0, h / 2))
    ob = obj_from_bm(bm, name, material)
    ob.location = loc
    return ob

def join(objs, name):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob

def asset(name, parts, x):
    """Group parts under an empty named after the asset, spread along X for previews."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    root.location = (x, 0, 0)
    return root

def smooth(ob, angle=40):
    for p in ob.data.polygons: p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        pass

# ---------------------------------------------------------------- assets
def gothic_arch():
    wall = cube('arch_wall', (3.2, 0.7, 4.6), (0, 0, 2.3), 'stone')
    subdiv(wall, 3, simple=True)
    # pointed-arch opening: two overlapping cylinders + a box below
    a = cyl('c1', 1.25, 1.6, (0.45, 0.8, 2.6), segs=32); a.rotation_euler = (math.pi / 2, 0, 0)
    b = cyl('c2', 1.25, 1.6, (-0.45, 0.8, 2.6), segs=32); b.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    for c in (a, b):
        bpy.context.view_layer.objects.active = c; c.select_set(True)
        bpy.ops.object.transform_apply(rotation=True)
    inter = a.modifiers.new('i', 'BOOLEAN'); inter.operation = 'INTERSECT'; inter.object = b; inter.solver = 'EXACT'
    apply_mods(a); bpy.data.objects.remove(b, do_unlink=True)
    door = cube('door', (1.6, 1.6, 2.6), (0, 0, 1.3))
    boolean(wall, a); boolean(wall, door)
    # broken, jagged top
    top = cube('top', (4.0, 1.4, 2.0), (0, 0, 5.2))
    bm = bmesh.new(); bm.from_mesh(top.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    for v in bm.verts:
        if v.co.z + 5.2 < 4.6: v.co.z = 4.2 + 0.9 * noise.noise(Vector((v.co.x * 1.3, 0, 0))) - 0.6 * max(0, v.co.x) - 5.2
    bm.to_mesh(top.data); bm.free()
    boolean(wall, top)
    displace(wall, 0.05, 0.5, 1)
    # stone courses and a moss band at the base
    cap = cube('cap', (3.4, 0.85, 0.25), (0, 0, 0.12), 'stoneDark')
    moss = cube('moss', (3.3, 0.78, 0.22), (0, 0, 0.32), 'moss'); displace(moss, 0.05, 0.3, 2)
    rubble = []
    for i in range(7):
        r = cube('rb%d' % i, (0.3 + random.random() * 0.35, 0.3 + random.random() * 0.3, 0.2 + random.random() * 0.2),
                 (random.uniform(-2.2, 2.2), random.uniform(-1.2, 1.4), 0.12), 'stone', segs=2)
        r.rotation_euler = (0, 0, random.random() * 3); displace(r, 0.05, 0.3, i + 3); rubble.append(r)
    return [wall, cap, moss] + rubble

def broken_pillar(seed, h):
    random.seed(seed)
    p = cyl('pillar', 0.42, h, (0, 0, 0.3), 'stone', segs=16)
    subdiv(p, 2, simple=True)
    # fluting
    for v in p.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        if 0.35 < v.co.z < h + 0.25 and (v.co.x ** 2 + v.co.y ** 2) > 0.1:
            k = 1 - 0.06 * max(0, math.cos(a * 8))
            v.co.x *= k; v.co.y *= k
    cut = cube('cut', (1.6, 1.6, 1.2), (0, 0, h + 0.3 + 0.5)); cut.rotation_euler = (random.uniform(0.3, 0.6), random.uniform(-0.3, 0.3), 0)
    bpy.context.view_layer.update(); boolean(p, cut)
    displace(p, 0.04, 0.35, seed)
    base = cube('base', (1.1, 1.1, 0.3), (0, 0, 0.15), 'stoneDark', segs=2); displace(base, 0.03, 0.4, seed + 1)
    chunk = cube('chunk', (0.5, 0.45, 0.35), (0.9, 0.3, 0.17), 'stone', segs=2); chunk.rotation_euler = (0.2, 0.1, 0.7); displace(chunk, 0.05, 0.3, seed + 2)
    return [p, base, chunk]

def gravestone(kind, seed):
    random.seed(seed)
    parts = []
    if kind == 'round':
        s = cube('slab', (0.62, 0.16, 0.9), (0, 0, 0.45), 'stone', segs=3)
        top = cyl('top', 0.31, 0.16, (0, 0.08, 0.9), segs=24); top.rotation_euler = (math.pi / 2, 0, 0)
        bpy.context.view_layer.update(); s = join([s, top], 'g');
    elif kind == 'cross':
        a = cube('v', (0.16, 0.14, 1.15), (0, 0, 0.57), 'stone', segs=2)
        b = cube('h', (0.6, 0.14, 0.15), (0, 0, 0.82), 'stone', segs=2)
        s = join([a, b], 'g')
    elif kind == 'obelisk':
        s = cyl('o', 0.2, 1.3, (0, 0, 0.2), segs=4, r2=0.12); s.rotation_euler = (0, 0, math.pi / 4)
        tip = cyl('t', 0.12, 0.22, (0, 0, 1.5), segs=4, r2=0.0); tip.rotation_euler = (0, 0, math.pi / 4)
        base = cube('b', (0.5, 0.5, 0.2), (0, 0, 0.1), 'stoneDark')
        s = join([s, tip, base], 'g')
    else:  # leaning slab, broken corner
        s = cube('slab', (0.7, 0.18, 1.0), (0, 0, 0.5), 'stone', segs=3)
        cut = cube('c', (0.6, 0.6, 0.6), (0.42, 0, 1.05)); cut.rotation_euler = (0, 0.7, 0); bpy.context.view_layer.update(); boolean(s, cut)
    subdiv(s, 1, simple=True); displace(s, 0.025, 0.25, seed)
    s.rotation_euler = (random.uniform(-0.12, 0.12), random.uniform(-0.15, 0.15), random.uniform(-0.3, 0.3))
    mound = cyl('mound', 0.55, 0.12, (0, -0.55, 0), 'moss', segs=12); mound.scale = (0.9, 1.6, 1); displace(mound, 0.04, 0.3, seed + 5)
    parts += [s, mound]
    return parts

def crypt():
    body = cube('body', (2.6, 3.0, 2.2), (0, 0, 1.1), 'stone', segs=3)
    bm = bmesh.new()
    pts = [(-1.55, -1.7, 2.2), (1.55, -1.7, 2.2), (0, -1.7, 3.3), (-1.55, 1.7, 2.2), (1.55, 1.7, 2.2), (0, 1.7, 3.3)]
    vs = [bm.verts.new(p) for p in pts]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)): bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    roofA = obj_from_bm(bm, 'roof', 'stoneDark'); subdiv(roofA, 2, simple=True)
    roofB = cube('ridge', (0.2, 3.5, 0.18), (0, 0, 3.32), 'stoneDark')
    gable = cube('plinth', (2.9, 3.3, 0.25), (0, 0, 2.18), 'stone')
    door = cube('door', (1.0, 0.4, 1.6), (0, -1.45, 0.8)); bpy.context.view_layer.update(); boolean(body, door)
    dark = cube('dark', (1.0, 0.1, 1.6), (0, -1.25, 0.8), 'void')
    bars = [cyl('bar%d' % i, 0.03, 1.6, (-0.4 + i * 0.16, -1.42, 0), 'iron', segs=6) for i in range(6)]
    rail = cube('rail', (1.0, 0.05, 0.06), (0, -1.42, 1.0), 'iron')
    steps = [cube('st%d' % i, (1.6 - i * 0.2, 0.4, 0.15), (0, -1.75 + i * 0.12, 0.07 + i * 0.13), 'stoneDark', segs=2) for i in range(2)]
    cross = join([cube('cv', (0.12, 0.12, 0.6), (0, -1.7, 3.55), 'stone'), cube('ch', (0.4, 0.12, 0.12), (0, -1.7, 3.62), 'stone')], 'cross')
    for o in (body, roofA, roofB): displace(o, 0.03, 0.4, 9)
    return [body, roofA, roofB, gable, dark, rail, cross] + bars + steps

def dead_tree(seed, height):
    """Recursive branch skeleton -> skin modifier -> gnarled bark mesh."""
    random.seed(seed)
    bm = bmesh.new()
    radii = {}
    def grow(start_v, direction, length, radius, depth):
        pts = [start_v]
        d = direction.normalized()
        segs = max(2, int(length / 0.45))
        cur = start_v
        for i in range(segs):
            d = (d + Vector((random.uniform(-0.35, 0.35), random.uniform(-0.35, 0.35), random.uniform(-0.1, 0.25)))).normalized()
            nv = bm.verts.new(cur.co + d * (length / segs))
            bm.edges.new((cur, nv))
            r = radius * (1 - (i + 1) / segs * 0.6)
            radii[nv] = r
            cur = nv
            if depth < 3 and i >= 1 and random.random() < 0.55:
                side = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0.2, 0.9)))
                grow(cur, side, length * random.uniform(0.35, 0.6), r * 0.6, depth + 1)
        if depth < 3:
            for k in range(random.randint(1, 2)):
                side = (d + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.1, 0.6)))).normalized()
                grow(cur, side, length * 0.5, radius * 0.4, depth + 1)
    root = bm.verts.new((0, 0, 0)); radii[root] = 0.38 * height / 5
    # roots
    for k in range(4):
        a = k * math.pi / 2 + random.random()
        rv = bm.verts.new((math.cos(a) * 0.9, math.sin(a) * 0.9, -0.1)); bm.edges.new((root, rv)); radii[rv] = 0.07
    grow(root, Vector((0, 0, 1)), height, 0.36 * height / 5, 0)
    me = bpy.data.meshes.new('tree'); bm.to_mesh(me)
    ob = bpy.data.objects.new('tree', me); bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN')
    skin_layer = me.skin_vertices[0].data
    for i, v in enumerate(me.vertices):
        r = 0.04
        for bv, rr in radii.items():
            if (bv.co - v.co).length < 1e-5: r = rr; break
        skin_layer[i].radius = (r, r)
    skin_layer[0].use_root = True
    apply_mods(ob)
    displace(ob, 0.04, 0.25, seed)
    me.materials.append(mat('bark'))
    decimate(ob, min(1.0, 1100.0 / max(1, len(ob.data.polygons))))
    smooth(ob)
    return [ob]

def rock(seed, s, flat=0.6):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    ob = obj_from_bm(bm, 'rock', 'stone')
    for v in ob.data.vertices:
        v.co.z *= flat
        if v.co.z < -0.15: v.co.z = -0.15 + (v.co.z + 0.15) * 0.15
    displace(ob, 0.28, 0.7, seed); displace(ob, 0.08, 0.25, seed + 4)
    ob.scale = (s, s * random.uniform(0.7, 1.0), s)
    # moss cap on the top faces
    moss_faces = [p.index for p in ob.data.polygons if p.normal.z > 0.75]
    if moss_faces:
        ob.data.materials.append(mat('moss'))
        for i in moss_faces:
            if random.random() < 0.7: ob.data.polygons[i].material_index = 1
    smooth(ob, 35)
    return [ob]

def hut():
    walls = cube('walls', (3.0, 2.6, 1.9), (0, 0, 0.95), 'wood', segs=2)
    door = cube('door', (0.8, 0.5, 1.4), (0, -1.3, 0.7)); boolean(walls, door)
    dark = cube('dark', (0.8, 0.05, 1.4), (0, -1.12, 0.7), 'void')
    beams = [cube('bm%d' % i, (0.16, 0.16, 2.0), (x, y, 1.0), 'woodDark') for i, (x, y) in enumerate([(-1.5, -1.3), (1.5, -1.3), (-1.5, 1.3), (1.5, 1.3)])]
    beams.append(cube('lintel', (3.1, 0.16, 0.16), (0, -1.32, 1.9), 'woodDark'))
    roof = cyl('roof', 2.4, 1.7, (0, 0, 1.85), 'thatch', segs=4, r2=0.12); roof.rotation_euler = (0, 0, math.pi / 4); roof.scale = (1.0, 0.9, 1)
    subdiv(roof, 2, simple=True); displace(roof, 0.07, 0.35, 21)
    window = cube('win', (0.5, 0.05, 0.4), (1.0, -1.32, 1.2), 'lantern')
    chimney = cube('ch', (0.35, 0.35, 0.9), (0.8, 0.6, 2.9), 'stoneDark', segs=2)
    return [walls, dark, roof, window, chimney] + beams

def well():
    ring = cyl('ring', 0.95, 0.8, (0, 0, 0), 'stone', segs=20)
    inner = cyl('in', 0.72, 1.0, (0, 0, 0.0), segs=20); boolean(ring, inner)
    subdiv(ring, 1, simple=True); displace(ring, 0.04, 0.3, 31)
    water = cyl('water', 0.72, 0.02, (0, 0, 0.45), 'void', segs=20)
    posts = [cube('p%d' % i, (0.12, 0.12, 1.9), (x, 0, 0.95), 'woodDark') for i, x in enumerate((-0.85, 0.85))]
    beam = cube('beam', (1.9, 0.12, 0.12), (0, 0, 1.75), 'woodDark')
    roofA = cube('ra', (0.9, 1.5, 0.08), (0.42, 0, 2.15), 'thatch'); roofA.rotation_euler = (0, 0.7, 0)
    roofB = cube('rb', (0.9, 1.5, 0.08), (-0.42, 0, 2.15), 'thatch'); roofB.rotation_euler = (0, -0.7, 0)
    bucket = cyl('bucket', 0.14, 0.22, (0, 0, 1.2), 'wood', segs=10)
    rope = cyl('rope', 0.012, 0.35, (0, 0, 1.42), 'cloth', segs=4)
    return [ring, water, beam, roofA, roofB, bucket, rope] + posts

def lantern_post():
    post = cube('post', (0.14, 0.14, 2.4), (0, 0, 1.2), 'woodDark', segs=2)
    arm = cube('arm', (0.7, 0.1, 0.1), (0.3, 0, 2.3), 'woodDark')
    cage = cyl('cage', 0.14, 0.32, (0.58, 0, 1.85), 'iron', segs=6, r2=0.1)
    glow = cyl('glow', 0.09, 0.22, (0.58, 0, 1.9), 'lantern', segs=6)
    capm = cyl('cap', 0.17, 0.12, (0.58, 0, 2.17), 'iron', segs=6, r2=0.02)
    return [post, arm, cage, glow, capm]

def cart():
    bed = cube('bed', (1.8, 1.1, 0.12), (0, 0, 0.62), 'wood', segs=2)
    sides = [cube('s%d' % i, (1.8, 0.08, 0.35), (0, y, 0.85), 'wood') for i, y in enumerate((-0.55, 0.55))]
    back = cube('bk', (0.08, 1.1, 0.35), (-0.9, 0, 0.85), 'wood')
    wheels = []
    for y in (-0.62, 0.62):
        w = cyl('wheel', 0.48, 0.08, (0.2, y, 0.48), 'woodDark', segs=14); w.rotation_euler = (math.pi / 2, 0, 0)
        wheels.append(w)
    shafts = [cube('sh%d' % i, (1.6, 0.07, 0.07), (1.6, y, 0.6), 'woodDark') for i, y in enumerate((-0.35, 0.35))]
    sack = cyl('sack', 0.3, 0.45, (-0.3, 0.1, 0.68), 'cloth', segs=10, r2=0.18); displace(sack, 0.04, 0.2, 41)
    return [bed, back, sack] + sides + wheels + shafts

def barrel():
    b = cyl('barrel', 0.36, 0.95, (0, 0, 0), 'wood', segs=14)
    subdiv(b, 2, simple=True)
    for v in b.data.vertices:
        k = 1 + 0.16 * math.sin(max(0.0, min(1.0, v.co.z / 0.95)) * math.pi)
        v.co.x *= k; v.co.y *= k
    hoops = [cyl('h%d' % i, 0.4, 0.06, (0, 0, z), 'iron', segs=14) for i, z in enumerate((0.15, 0.74))]
    for hh in hoops: hh.scale = (1.06, 1.06, 1)
    return [b] + hoops

def crate():
    c = cube('crate', (0.8, 0.8, 0.8), (0, 0, 0.4), 'wood', segs=2)
    planks = [cube('pl%d' % i, (0.84, 0.06, 0.1), (0, -0.41, z), 'woodDark') for i, z in enumerate((0.12, 0.68))]
    diag = cube('dg', (1.0, 0.06, 0.1), (0, -0.41, 0.4), 'woodDark'); diag.rotation_euler = (0, 0.78, 0)
    return [c, diag] + planks

def stone_cross_shrine():
    base = cube('base', (1.4, 1.4, 0.4), (0, 0, 0.2), 'stoneDark', segs=2)
    step = cube('step', (1.0, 1.0, 0.3), (0, 0, 0.55), 'stone', segs=2)
    shaft = cube('shaft', (0.24, 0.24, 2.0), (0, 0, 1.7), 'stone', segs=2)
    arm = cube('arm', (1.0, 0.24, 0.24), (0, 0, 2.25), 'stone', segs=2)
    ring = cyl('ring', 0.38, 0.12, (0, 0.06, 2.25), 'stone', segs=20); ring.rotation_euler = (math.pi / 2, 0, 0)
    inner = cyl('ri', 0.28, 0.4, (0, 0.25, 2.25), segs=20); inner.rotation_euler = (math.pi / 2, 0, 0); bpy.context.view_layer.update(); boolean(ring, inner)
    for o in (base, step, shaft, arm): displace(o, 0.03, 0.3, 51)
    candle = cyl('candle', 0.05, 0.18, (0.3, -0.35, 0.7), 'lantern', segs=6)
    return [base, step, shaft, arm, ring, candle]

def fence():
    posts = [cube('p%d' % i, (0.12, 0.12, 1.2 + random.uniform(-0.1, 0.1)), (x, 0, 0.6), 'woodDark') for i, x in enumerate((-1.2, 0, 1.2))]
    rails = [cube('r%d' % i, (2.6, 0.07, 0.1), (0, 0.07, z), 'wood') for i, z in enumerate((0.45, 0.9))]
    rails[1].rotation_euler = (0, 0.06, 0)
    return posts + rails

# ---------------------------------------------------------------- realistic trees
def clump(name, center, radius, stretch, material, seed, droop=0.0):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    ob = obj_from_bm(bm, name, material)
    for v in ob.data.vertices:
        v.co.x *= stretch[0]; v.co.y *= stretch[1]; v.co.z *= stretch[2]
        v.co.z -= droop * (v.co.x ** 2 + v.co.y ** 2)
    displace(ob, 0.35, 0.45, seed); displace(ob, 0.12, 0.15, seed + 1)
    ob.scale = (radius, radius, radius); ob.location = center
    return ob

def pine(seed, height):
    random.seed(seed)
    trunk = cyl('trunk', 0.07 * height / 6 + 0.12, height * 0.92, (0, 0, -0.1), 'bark', segs=10, r2=0.03)
    subdiv(trunk, 1, simple=True); displace(trunk, 0.02, 0.2, seed)
    parts = [trunk]
    tiers = int(height * 2.2)
    for k in range(tiers):
        t = k / tiers
        z = height * (0.22 + 0.76 * t)
        R = (1.0 - t) ** 0.9 * height * 0.24 + 0.15
        n = max(3, int(7 * (1 - t)) + 2)
        for i in range(n):
            a = i / n * 2 * math.pi + random.uniform(-0.4, 0.4) + k * 0.7
            d = Vector((math.cos(a), math.sin(a), 0))
            L = R * random.uniform(0.75, 1.1)
            c = Vector((0, 0, z)) + d * L * 0.55 + Vector((0, 0, -L * 0.18))
            cl = clump('br', c, 1.0, (L * 0.55, L * 0.22, 0.13 + 0.05 * (1 - t)), 'needle', seed * 31 + k * 7 + i, droop=0.25)
            cl.rotation_euler = (0, 0.25, a); parts.append(cl)
    tip = cyl('tip', 0.12, height * 0.14, (0, 0, height * 0.97), 'needle', segs=6, r2=0.0); parts.append(tip)
    nd = join(parts[1:], 'needles'); decimate(nd, min(1.0, 950.0 / max(1, len(nd.data.polygons))))
    return [nd, trunk]

def broadleaf(seed, height):
    random.seed(seed)
    bm = bmesh.new(); radii = {}; tips = []
    def grow(start, direction, length, radius, depth):
        d = direction.normalized(); cur = start
        segs = max(2, int(length / 0.5))
        for i in range(segs):
            d = (d + Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(0.0, 0.2)))).normalized()
            nv = bm.verts.new(cur.co + d * (length / segs)); bm.edges.new((cur, nv))
            radii[nv] = radius * (1 - (i + 1) / segs * 0.55); cur = nv
        if depth < 2:
            for k in range(random.randint(2, 3)):
                side = (d + Vector((random.uniform(-1.1, 1.1), random.uniform(-1.1, 1.1), random.uniform(0.2, 0.9)))).normalized()
                grow(cur, side, length * random.uniform(0.55, 0.75), radius * 0.55, depth + 1)
        else:
            tips.append(cur.co.copy())
    root = bm.verts.new((0, 0, 0)); radii[root] = 0.28 * height / 6
    for k in range(4):
        a = k * math.pi / 2 + random.random(); rv = bm.verts.new((math.cos(a) * 0.7, math.sin(a) * 0.7, -0.1)); bm.edges.new((root, rv)); radii[rv] = 0.06
    grow(root, Vector((0, 0, 1)), height * 0.45, 0.26 * height / 6, 0)
    me = bpy.data.meshes.new('trunk'); bm.to_mesh(me)
    ob = bpy.data.objects.new('trunk', me); bpy.context.scene.collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN'); sl = me.skin_vertices[0].data
    for i, v in enumerate(me.vertices):
        r = 0.04
        for bv, rr in radii.items():
            if (bv.co - v.co).length < 1e-5: r = rr; break
        sl[i].radius = (r, r)
    sl[0].use_root = True; apply_mods(ob); displace(ob, 0.03, 0.25, seed)
    me.materials.append(mat('bark')); decimate(ob, min(1.0, 700.0 / max(1, len(ob.data.polygons)))); smooth(ob)
    leaves = []
    for i, tp in enumerate(tips):
        r = random.uniform(0.9, 1.4) * height / 6
        leaves.append(clump('lf', tp + Vector((0, 0, 0.2)), 1.0, (r, r * 0.9, r * 0.7), 'foliage', seed * 17 + i))
    # inner fill so the crown reads as one canopy with holes
    for k in range(4):
        a = random.random() * 6.28
        leaves.append(clump('lf', Vector((math.cos(a) * 0.8, math.sin(a) * 0.8, height * 0.62)), 1.0, (1.3, 1.2, 0.9), 'foliage', seed * 5 + k))
    fol = join(leaves, 'foliage'); decimate(fol, min(1.0, 1100.0 / max(1, len(fol.data.polygons))))
    return [fol, ob]

# ---------------------------------------------------------------- build
reset()
x = 0
KIT = [
    ('kit_arch', gothic_arch), ('kit_pillar_a', lambda: broken_pillar(3, 2.6)), ('kit_pillar_b', lambda: broken_pillar(8, 1.3)),
    ('kit_grave_round', lambda: gravestone('round', 11)), ('kit_grave_cross', lambda: gravestone('cross', 12)),
    ('kit_grave_obelisk', lambda: gravestone('obelisk', 13)), ('kit_grave_slab', lambda: gravestone('slab', 14)),
    ('kit_crypt', crypt), ('kit_shrine', stone_cross_shrine),
    ('kit_deadtree_a', lambda: dead_tree(21, 5.0)), ('kit_deadtree_b', lambda: dead_tree(22, 3.6)), ('kit_deadtree_c', lambda: dead_tree(23, 6.2)),
    ('kit_rock_a', lambda: rock(31, 1.0)), ('kit_rock_b', lambda: rock(32, 1.6, 0.45)), ('kit_rock_c', lambda: rock(33, 0.8, 1.0)),
    ('kit_pine_a', lambda: pine(61, 7.0)), ('kit_pine_b', lambda: pine(62, 9.5)), ('kit_pine_c', lambda: pine(63, 5.0)),
    ('kit_oak_a', lambda: broadleaf(71, 6.5)), ('kit_oak_b', lambda: broadleaf(72, 8.0)),
    ('kit_hut', hut), ('kit_well', well), ('kit_lantern', lantern_post), ('kit_cart', cart),
    ('kit_barrel', barrel), ('kit_crate', crate), ('kit_fence', fence),
]
for name, fn in KIT:
    random.seed(hash(name) & 0xffff)
    parts = fn()
    bpy.context.view_layer.update()
    for p in parts:
        bpy.context.view_layer.objects.active = p
        for o in bpy.context.view_layer.objects: o.select_set(False)
        p.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    asset(name, parts, x)
    x += 8

tris = sum(len(p.data.polygons) for p in bpy.data.objects if p.type == 'MESH')
print('faces', tris)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_texcoords=False)
print('wrote', OUT)
