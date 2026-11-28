"""Glyphwake knight armour, modelled with Blender's Python API and fitted to the Monarch rig.

Run:  python build_armor.py OUT.glb

Every piece is modelled in the rig's model space (metres, feet at the origin) in its rest pose,
using the bone positions measured from the game (BONES below, in three.js coordinates).
Objects are named  arm__<Bone>__<piece>; the game attaches each to that bone, so it follows the
animation. Material names: plate, plateDark, mail, leather, cloth, trim, void.
"""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix, noise

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/armor.glb'

# bone heads in the rig's rest pose (three.js: x right, y up, z forward), measured in-game
B = {"Hips": [0.016, 0.909, 0.059], "Abdomen": [0.009, 1.019, 0.046], "Torso": [0.005, 1.189, 0.039], "Chest": [0.005, 1.414, 0.069],
     "Neck": [0.004, 1.553, 0.085], "Head": [0.004, 1.633, 0.093],
     "UpperArm.L": [0.165, 1.481, 0.095], "LowerArm.L": [0.238, 1.316, 0.034], "Wrist.L": [0.273, 1.071, 0.043],
     "UpperArm.R": [-0.155, 1.48, 0.094], "LowerArm.R": [-0.24, 1.314, 0.051], "Wrist.R": [-0.236, 1.089, 0.152],
     "UpperLeg.L": [0.121, 0.982, -0.013], "LowerLeg.L": [0.215, 0.538, 0.007], "Foot.L": [0.127, 0.024, -0.12],
     "UpperLeg.R": [-0.104, 0.982, 0.103], "LowerLeg.R": [-0.078, 0.56, 0.271], "Foot.R": [-0.072, 0.024, 0.258]}

def T(p):  # three.js -> Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))
FWD = Vector((0, -1, 0))  # three.js +z (the knight's front) in Blender

bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = {}
def mat(n):
    if n not in MATS:
        m = bpy.data.materials.new(n); MATS[n] = m
    return MATS[n]

def new_obj(bm, name, material):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat(material))
    for p in me.polygons: p.use_smooth = True
    return ob

def apply(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def bevel(ob, w=0.006, segs=2):
    m = ob.modifiers.new('bv', 'BEVEL'); m.width = w; m.segments = segs; m.limit_method = 'ANGLE'; apply(ob)

def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('b', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'; apply(ob)
    bpy.data.objects.remove(cutter, do_unlink=True)

def lathe(profile, segs, name, material, center, sx=1.0, sy=1.0, arc=None):
    """profile: [(radius, height)], revolved around +Z, squashed by sx (left-right) and sy (front-back)."""
    bm = bmesh.new()
    a0, a1 = (0, 2 * math.pi) if arc is None else arc
    closed = arc is None
    n = segs if closed else segs + 1
    rings = []
    for (r, h) in profile:
        ring = []
        for i in range(n):
            a = a0 + (a1 - a0) * i / segs
            ring.append(bm.verts.new((center.x + math.cos(a) * r * sx, center.y + math.sin(a) * r * sy, center.z + h)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(segs):
            i2 = (i + 1) % n if closed else i + 1
            bm.faces.new((rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]))
    if profile[-1][0] < 1e-4 and closed:
        pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_obj(bm, name, material)

def solidify(ob, t=0.006):
    m = ob.modifiers.new('s', 'SOLIDIFY'); m.thickness = t; m.offset = 0; apply(ob)

def box(name, size, loc, material, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = new_obj(bm, name, material); ob.location = loc; ob.rotation_euler = rot
    return ob

def cyl(name, r, h, loc, material, segs=12, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=h)
    ob = new_obj(bm, name, material); ob.location = loc; ob.rotation_euler = rot
    return ob

def sphere(name, r, loc, material, seg=8):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r)
    ob = new_obj(bm, name, material); ob.location = loc
    return ob

def bake(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def join(objs, name):
    for o in objs: bake(o)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name
    return ob

def tube(name, p0, p1, r0, r1, material, segs=14, flare=0.0, ridge=0.0, sy=0.85, rings=6):
    """Tapered plate tube from p0 to p1 (Blender coords), slightly flattened front-back,
    with an optional flared lower edge and a raised centre ridge on the front."""
    d = (p1 - p0); L = d.length
    prof = []
    for k in range(rings + 1):
        t = k / rings
        r = r0 + (r1 - r0) * t
        if k == rings: r += flare
        prof.append((r, t * L))
    ob = lathe(prof, max(segs, 24), name, material, Vector((0, 0, 0)), 1.0, sy)
    if ridge > 0:
        for v in ob.data.vertices:
            a = math.atan2(v.co.y, v.co.x)
            v.co += Vector((math.cos(a), math.sin(a), 0)) * ridge * max(0.0, math.cos(a + math.pi / 2)) ** 8
    solidify(ob, 0.008); refine(ob); weather(ob, 0.0015, 0.04, int(L * 100))
    # align +Z to the segment, keep the front (−Y) facing the knight's front
    z = d.normalized(); x = FWD.cross(z); x = x.normalized() if x.length > 1e-4 else Vector((1, 0, 0)); y = z.cross(x)
    R = Matrix((x, y, z)).transposed().to_4x4()
    ob.matrix_world = Matrix.Translation(p0) @ R
    bake(ob)
    return ob

PIECES = []  # (bone, object)

def refine(ob, levels=1):
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels; apply(ob)

def weather(ob, amt=0.0025, scale=0.035, seed=0):
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in ob.data.vertices:
        n = noise.noise((v.co + off) / scale) * 0.7 + noise.noise((v.co + off) * 3.0 / scale) * 0.3
        v.co += v.normal * n * amt

def flute(ob, center, count, amp, z0=-9, z1=9, phase=0.0):
    for v in ob.data.vertices:
        rel = v.co - center
        if not (z0 < rel.z < z1): continue
        a = math.atan2(rel.y, rel.x) + phase
        k = 1 + amp * max(0.0, math.cos(a * count)) ** 6
        v.co.x = center.x + rel.x * k; v.co.y = center.y + rel.y * k

def roll(name, center, r, z, sx, sy, minor, material='plate', segs=40):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=segs, radius=1.0)
    ob = new_obj(bm, name, material)
    for v in ob.data.vertices: v.co = Vector((center.x + v.co.x * r * sx, center.y + v.co.y * r * sy, center.z + z))
    m = ob.modifiers.new('sk', 'SKIN'); apply_skin = True
    for sv in ob.data.skin_vertices[0].data: sv.radius = (minor, minor)
    apply(ob)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def cup(name, c, r, depth, material, wing_dir, segs=24):
    """Shaped elbow/knee cup: a shallow domed plate with a fan-shaped side wing."""
    d = lathe([(0.0, depth), (r * 0.55, depth * 0.85), (r * 0.9, depth * 0.35), (r, 0.0), (r * 1.05, -depth * 0.25)], segs, name, material, Vector((0, 0, 0)), 1.0, 1.0)
    solidify(d, 0.007)
    # fan wing: a thin curved plate on one side
    bm = bmesh.new(); pts = []
    for i in range(7):
        a = -0.9 + 1.8 * i / 6
        pts.append((math.cos(a) * r * 1.9, math.sin(a) * r * 1.9))
    vs = [bm.verts.new((0, 0, 0))] + [bm.verts.new((x, y, -abs(y) * 0.25)) for x, y in pts]
    for i in range(1, 7): bm.faces.new((vs[0], vs[i], vs[i + 1]))
    w = new_obj(bm, name + 'w', material); solidify(w, 0.006)
    w.rotation_euler = (0, math.pi / 2, 0); bake(w)
    flute(w, Vector((0, 0, 0)), 3, 0.0)
    ob = join([d, w], name)
    return ob

def add(bone, ob, piece):
    ob.name = 'arm__%s__%s' % (bone.replace('.', '_'), piece)
    PIECES.append(ob)

# ---------------------------------------------------------------- helm
hc = T(B['Head']) + Vector((0, -0.01, 0.085))
helm = lathe([(0.0, 0.23), (0.06, 0.225), (0.105, 0.2), (0.135, 0.15), (0.145, 0.07), (0.148, -0.02), (0.146, -0.11), (0.14, -0.15)],
             48, 'helm', 'plate', hc, 1.0, 1.08)
flute(helm, hc, 8, 0.035, z0=0.08, z1=0.24)
solidify(helm, 0.012)
slit = box('slit', (0.24, 0.12, 0.022), hc + Vector((0, -0.14, 0.03)), 'plate'); boolean(helm, slit)
for i in range(6):
    hole = cyl('hole', 0.0075, 0.1, hc + Vector((0.035 + (i % 3) * 0.024, -0.14, -0.035 - (i // 3) * 0.028)), 'plate', segs=6, rot=(math.pi / 2, 0, 0)); boolean(helm, hole)
refine(helm); weather(helm, 0.0018, 0.04, 1)
add('Head', helm, 'helm')
ridge = box('ridge', (0.016, 0.3, 0.02), hc + Vector((0, 0.0, 0.215)), 'plate', rot=(0, 0, 0))
ridge2 = box('ridge2', (0.018, 0.02, 0.27), hc + Vector((0, -0.154, 0.0)), 'trim')
brow = box('brow', (0.25, 0.02, 0.018), hc + Vector((0, -0.153, 0.062)), 'trim')
rim = roll('rim', hc, 0.15, -0.15, 1.0, 1.08, 0.008, 'trim', 48)
dark = box('visor_dark', (0.23, 0.01, 0.02), hc + Vector((0, -0.135, 0.03)), 'void')
rivets = [sphere('rv', 0.008, hc + Vector((math.cos(a) * 0.15, math.sin(a) * 0.162, -0.13)), 'trim', 6) for a in [i * math.pi / 6 for i in range(12)]]
add('Head', join([ridge, ridge2, brow, rim] + rivets, 'trim'), 'helmtrim')
add('Head', dark, 'visor')

# ---------------------------------------------------------------- torso
cc = T([0.005, 1.0, 0.06])
breast = lathe([(0.15, 0.0), (0.165, 0.06), (0.175, 0.16), (0.195, 0.3), (0.2, 0.4), (0.185, 0.48), (0.14, 0.54), (0.085, 0.57)],
               48, 'breast', 'plate', cc, 1.0, 0.72)
for v in breast.data.vertices:   # centre ridge on the chest, slight barrel on the front
    rel = v.co - cc; a = math.atan2(rel.y, rel.x)
    front = max(0.0, -math.sin(a))
    v.co.y -= 0.022 * front ** 6 * (1 if 0.12 < rel.z < 0.5 else 0.3)
solidify(breast, 0.012); refine(breast); weather(breast, 0.002, 0.04, 3)
brim = roll('brim', cc, 0.088, 0.57, 1.0, 0.9, 0.007)
breast = join([breast, brim], 'breast')
add('Chest', breast, 'breastplate')
gorget = lathe([(0.095, 0.0), (0.085, 0.05), (0.075, 0.09)], 20, 'gorget', 'plate', T(B['Neck']) + Vector((0, 0.0, -0.05)), 1.0, 0.95); solidify(gorget, 0.01)
add('Neck', gorget, 'gorget')
belt = lathe([(0.178, 0.0), (0.178, 0.045)], 28, 'belt', 'leather', cc + Vector((0, 0, -0.01)), 1.0, 0.75); solidify(belt, 0.012)
buckle = box('buckle', (0.05, 0.015, 0.05), cc + Vector((0, -0.14, 0.012)), 'trim')
add('Hips', join([belt, buckle], 'belt'), 'belt')
# faulds: three overlapping lames below the breastplate
hc2 = T(B['Hips'])
lames = []
for k in range(3):
    lm = lathe([(0.18 + k * 0.012, 0.0), (0.195 + k * 0.012, -0.07)], 26, 'fauld%d' % k, 'plate', hc2 + Vector((0, 0, 0.06 - k * 0.055)), 1.0, 0.78)
    solidify(lm, 0.008); lames.append(lm)
add('Hips', join(lames, 'faulds'), 'faulds')
tab = box('tabard', (0.2, 0.012, 0.42), hc2 + Vector((0, -0.17, -0.19)), 'cloth', rot=(-0.06, 0, 0))
tabb = box('tabard_b', (0.22, 0.012, 0.44), hc2 + Vector((0, 0.16, -0.2)), 'cloth', rot=(0.06, 0, 0))
crossv = box('cv', (0.035, 0.014, 0.24), hc2 + Vector((0, -0.178, -0.16)), 'trim', rot=(-0.06, 0, 0))
crossh = box('ch', (0.13, 0.014, 0.035), hc2 + Vector((0, -0.178, -0.1)), 'trim', rot=(-0.06, 0, 0))
add('Hips', join([tab, tabb], 'tabard'), 'tabard')
add('Hips', join([crossv, crossh], 'cross'), 'tabardcross')

# ---------------------------------------------------------------- arms
for s in ('L', 'R'):
    sg = 1 if s == 'L' else -1
    ua, la, wr = T(B['UpperArm.' + s]), T(B['LowerArm.' + s]), T(B['Wrist.' + s])
    # layered pauldron: three domed lames stepping down the shoulder
    paul = []
    for k in range(3):
        c = ua + Vector((sg * 0.015, 0, 0.03 - k * 0.055))
        dome = lathe([(0.0, 0.07 - k * 0.01), (0.035, 0.068 - k * 0.01), (0.07, 0.055 - k * 0.01), (0.1 - k * 0.006, 0.02), (0.112 - k * 0.006, -0.03)], 36, 'p%d' % k, 'plate', c, 1.0, 1.05)
        flute(dome, c, 6, 0.06, phase=0.3)
        solidify(dome, 0.009); refine(dome); weather(dome, 0.0018, 0.04, k + 5)
        paul.append(dome); paul.append(roll('pr%d' % k, c, 0.112 - k * 0.006, -0.03, 1.0, 1.05, 0.006))
    pt = roll('ptrim', ua + Vector((sg * 0.015, 0, 0.03)), 0.118, -0.03, 1.0, 1.05, 0.007, 'trim')
    add('UpperArm.' + s, join(paul + [pt], 'paul'), 'pauldron')
    add('UpperArm.' + s, tube('rere', ua, la, 0.052, 0.046, 'plate', ridge=0.0), 'rerebrace')
    add('LowerArm.' + s, tube('vamb', la, wr, 0.045, 0.04, 'plate', flare=0.012, ridge=0.006), 'vambrace')
    couter = cup('couter', la, 0.05, 0.035, 'plate', sg)
    couter.matrix_world = Matrix.Translation(la + Vector((0, 0.03, 0))) @ Matrix.Rotation(math.pi / 2, 4, 'X'); bake(couter)
    add('LowerArm.' + s, couter, 'couter')
    d = (wr - la).normalized()
    cuff = tube('cuff', wr - d * 0.07, wr + d * 0.01, 0.046, 0.058, 'plateDark', segs=20, flare=0.008)
    hand = []
    side = Vector((sg, 0, 0)); fwd = FWD
    hand.append(box('back', (0.075, 0.03, 0.07), wr + d * 0.05 + fwd * 0.0, 'plateDark'))
    for f in range(4):
        for k in range(3):
            hand.append(box('f%d%d' % (f, k), (0.016, 0.022, 0.024), wr + d * (0.1 + k * 0.026) + side * (-0.028 + f * 0.019), 'plateDark'))
    hand.append(box('thumb', (0.018, 0.022, 0.05), wr + d * 0.06 - side * 0.045 + fwd * 0.015, 'plateDark'))
    g = join(hand, 'hand'); bevel(g, 0.003, 1)
    add('Wrist.' + s, join([cuff, g], 'gauntlet'), 'gauntlet')

# ---------------------------------------------------------------- legs
for s in ('L', 'R'):
    sg = 1 if s == 'L' else -1
    ul, ll, ft = T(B['UpperLeg.' + s]), T(B['LowerLeg.' + s]), T(B['Foot.' + s])
    ankle = ft + Vector((0, 0, 0.09))
    add('UpperLeg.' + s, tube('cuisse', ul + (ll - ul) * 0.12, ll, 0.085, 0.062, 'plate', ridge=0.008), 'cuisse')
    tasset = tube('tasset', ul + Vector((sg * 0.02, -0.05, 0.02)), ul + (ll - ul) * 0.42 + Vector((sg * 0.02, -0.05, 0)), 0.1, 0.105, 'plate', segs=14, sy=0.6)
    add('UpperLeg.' + s, tasset, 'tasset')
    knee = cup('poleyn', ll, 0.062, 0.045, 'plate', sg)
    knee.matrix_world = Matrix.Translation(ll + Vector((0, -0.045, 0))) @ Matrix.Rotation(-math.pi / 2, 4, 'X'); bake(knee)
    add('LowerLeg.' + s, knee, 'poleyn')
    add('LowerLeg.' + s, tube('greave', ll, ankle, 0.058, 0.045, 'plate', flare=0.01, ridge=0.006), 'greave')
    # sabaton: segmented plates over the foot, pointing forward
    sab = []
    for k in range(4):
        sab.append(box('sab%d' % k, (0.085 - k * 0.008, 0.06, 0.045 - k * 0.006), ft + Vector((0, -0.02 - k * 0.05, 0.05 - k * 0.008)), 'plate', rot=(0.25, 0, 0)))
    sab.append(box('sole', (0.09, 0.24, 0.018), ft + Vector((0, -0.06, 0.009)), 'leather'))
    add('Foot.' + s, join(sab, 'sabaton'), 'sabaton')

# ---------------------------------------------------------------- cloak (hangs from the shoulders, attached to Chest)
cl = T([0.0, 1.47, -0.04])
bm = bmesh.new()
W_, H_, nx, ny = 0.5, 1.08, 20, 20
grid = []
for j in range(ny + 1):
    row = []
    t = j / ny
    for i in range(nx + 1):
        u = i / nx - 0.5
        w = (0.34 + 0.32 * t)                      # widens toward the hem
        x = u * w * 2 * 0.5 / 0.5 * 0.5
        y = 0.06 + 0.1 * t + (0.045 * math.sin(u * 14.0 + t * 1.5) + 0.015 * math.sin(u * 31.0)) * (0.3 + t) + 0.12 * (u * 2) ** 2 * (1 - t * 0.6)   # folds and wrap
        z = -H_ * t
        row.append(bm.verts.new(cl + Vector((x * 1.0, y, z))))
    grid.append(row)
for j in range(ny):
    for i in range(nx):
        bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
cloak = new_obj(bm, 'cloak', 'cloth'); solidify(cloak, 0.01); refine(cloak)
add('Chest', cloak, 'cloak')

# ---------------------------------------------------------------- export
for o in PIECES: bake(o)
faces = sum(len(o.data.polygons) for o in PIECES)
print('pieces', len(PIECES), 'faces', faces)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_texcoords=False)
print('wrote', OUT)
