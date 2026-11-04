"""Construit calin.glb : tête de poney Tripo -> squelette propre, bouche, paupières, animations.
Usage : blender -b --factory-startup --python build.py -- <entree.glb> <sortie.glb> <sortie.blend>
"""
import bpy, bmesh, sys, math
import numpy as np
from mathutils import Vector, Matrix, kdtree
from mathutils.bvhtree import BVHTree

SRC, OUT_GLB, OUT_BLEND = sys.argv[-3:]
FPS = 30

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ import + nettoyage
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.data.objects if o.name.startswith("tripo")][0]
mw = src.matrix_world.copy()
src.parent = None
for mod in list(src.modifiers):
    src.modifiers.remove(mod)
src.data.transform(mw)
src.matrix_world = Matrix.Identity(4)
src.vertex_groups.clear()
for o in list(bpy.data.objects):
    if o is not src:
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.armatures):
    bpy.data.armatures.remove(a)
src.name = src.data.name = "Calin"
sc = bpy.context.scene
sc.render.fps = FPS

me = src.data
me.update()
N = len(me.vertices)
co = np.array([v.co[:] for v in me.vertices])
no = np.array([v.normal[:] for v in me.vertices])
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]

# texture de base (avant réduction) pour échantillonner des couleurs
img_bc = [i for i in bpy.data.images if "basecolor" in i.name][0]
W, H = img_bc.size
px = np.array(img_bc.pixels[:]).reshape(H, W, 4)
uv = np.zeros((N, 2))
uvl = me.uv_layers.active.data
for l in me.loops:
    uv[l.vertex_index] = uvl[l.index].uv
col = px[(uv[:, 1] % 1 * (H - 1)).astype(int), (uv[:, 0] % 1 * (W - 1)).astype(int), :3]
lum = col.mean(1)

# ------------------------------------------------------------------ repérage des yeux
eyes = {}
for s, suf in ((1, "G"), (-1, "D")):  # le poney regarde -Y : sa gauche est +X
    m = (np.sign(X) == s) & (abs(X) > 0.06) & (abs(X) < 0.23) & (Z > 0.49) & (Z < 0.64) & (Y < -0.12)
    e = m & ((lum < 0.2) | (lum > 0.7))
    c = Vector(co[e].mean(0))
    n = Vector(no[e].mean(0)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    right = n.cross(up).normalized()
    rel = co[e] - np.array(c[:])
    u = rel @ np.array(right[:]); v = rel @ np.array(up[:])
    u0, u1 = np.percentile(u, [4, 96]); v0, v1 = np.percentile(v, [3, 97])
    c = c + right * ((u0 + u1) / 2) + up * ((v0 + v1) / 2)
    eyes[suf] = dict(c=c, n=n, up=up, right=right, a=(u1 - u0) / 2, b=(v1 - v0) / 2)
    print("OEIL", suf, [round(x, 3) for x in c], "a", round((u1 - u0) / 2, 3), "b", round((v1 - v0) / 2, 3), "n", [round(x, 2) for x in n])

# couleur du pelage juste au-dessus de l'oeil (pour les paupières)
kd = kdtree.KDTree(N)
for i, p in enumerate(co):
    kd.insert(p, i)
kd.balance()
samples = []
for e in eyes.values():
    for k in range(-3, 4):
        p = e["c"] + e["up"] * (e["b"] * 1.45) + e["right"] * (e["a"] * 0.25 * k)
        _, idx, _ = kd.find(p)
        samples.append(col[idx])
coat_srgb = np.median(np.array(samples), 0)
coat_lin = [((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in coat_srgb]
print("PELAGE", coat_srgb.round(3))

# ------------------------------------------------------------------ squelette
arm_data = bpy.data.armatures.new("Calin_Rig")
arm = bpy.data.objects.new("Calin_Rig", arm_data)
sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones

def bone(name, h, t, parent=None, roll_z=Vector((0, -1, 0))):
    b = eb.new(name)
    b.head, b.tail = Vector(h), Vector(t)
    b.align_roll(roll_z)
    if parent:
        b.parent = eb[parent]
    return b

bone("racine", (0, 0.10, 0.0), (0, 0.10, 0.10))
bone("cou", (0, 0.12, 0.10), (0, 0.03, 0.53), "racine")
bone("tete", (0, 0.03, 0.53), (0, -0.05, 0.80), "cou")
EARS = {"G": ((0.235, -0.155, 0.75), (0.212, -0.179, 0.979)),
        "D": ((-0.235, -0.155, 0.75), (-0.212, -0.179, 0.979))}
for suf, (h, t) in EARS.items():
    bone("oreille." + suf, h, t, "tete")
LIDS = {}
for suf, e in eyes.items():
    top = e["c"] + e["up"] * (e["b"] * 1.4) + e["n"] * 0.006
    bot = e["c"] - e["up"] * (e["b"] * 1.4) + e["n"] * 0.006
    bone("paupiere." + suf, top, bot, "tete", roll_z=e["n"])
    LIDS[suf] = (top, bot)
bpy.ops.object.mode_set(mode="OBJECT")

# ------------------------------------------------------------------ poids (par position : le maillage Tripo est en îlots)
# frontière tête / encolure : droite de la gorge (y -0.15, z 0.30) à la nuque (y 0.20, z 0.75)
p0 = np.array([-0.15, 0.30]); d = np.array([0.35, 0.45]); d /= np.linalg.norm(d)
nrm = np.array([-d[1], d[0]])
sd = (np.stack([Y, Z], 1) - p0) @ nrm
w_head = ss(-0.04, 0.06, sd)
w_low = 1 - ss(0.02, 0.22, Z)
w_root = (1 - w_head) * w_low
w_neck = (1 - w_head) * (1 - w_low)

w_ear = {}
for suf, (h, t) in EARS.items():
    h = np.array(h); t = np.array(t); ax = t - h; L = np.linalg.norm(ax); ax /= L
    rel = co - h
    tt = rel @ ax / L
    radial = rel - np.outer(rel @ ax, ax)
    rx = radial[:, 0]; ry = radial[:, 1]; rz = radial[:, 2]
    rad = 0.08 * (1 - tt) + 0.05 * tt
    q = np.sqrt((rx / rad) ** 2 + ((ry) / (rad * 0.85)) ** 2 + (rz / rad) ** 2)
    w = ss(-0.02, 0.12, tt) * (1 - ss(0.85, 1.05, q)) * (tt < 1.4)
    w_ear[suf] = w
w_ear_tot = w_ear["G"] + w_ear["D"]
w_head = w_head * (1 - w_ear_tot)

groups = {"racine": w_root, "cou": w_neck, "tete": w_head, "oreille.G": w_ear["G"], "oreille.D": w_ear["D"]}
tot = sum(groups.values())
for name, w in groups.items():
    vg = src.vertex_groups.new(name=name)
    w = w / np.maximum(tot, 1e-6)
    for i in np.nonzero(w > 1e-4)[0]:
        vg.add([int(i)], float(w[i]), "REPLACE")
print("POIDS oreilles G/D", int((w_ear["G"] > 0.5).sum()), int((w_ear["D"] > 0.5).sum()), "tete", int((w_head > 0.5).sum()))

# ------------------------------------------------------------------ forme de bouche « bouche »
src.shape_key_add(name="Basis")
sk = src.shape_key_add(name="bouche")
zline = 0.312 + 0.6 * np.maximum(0, Y + 0.46) + 0.02 * (X / 0.1) ** 2
w_m = (1 - ss(zline - 0.012, zline + 0.003, Z)) * (1 - ss(-0.33, -0.20, Y)) * (1 - ss(0.13, 0.19, abs(X)))
HINGE = np.array([-0.18, 0.37]); ANG = math.radians(12)
for i in np.nonzero(w_m > 1e-4)[0]:
    a = ANG * w_m[i]
    dy, dz = Y[i] - HINGE[0], Z[i] - HINGE[1]
    ny = dy * math.cos(a) - dz * math.sin(a)
    nz = dy * math.sin(a) + dz * math.cos(a)
    sk.data[int(i)].co = (X[i], HINGE[0] + ny, HINGE[1] + nz)
print("BOUCHE sommets", int((w_m > 0.5).sum()))

# ------------------------------------------------------------------ paupières (maillage à part, couleur du pelage)
bvh = BVHTree.FromObject(src, bpy.context.evaluated_depsgraph_get())
lid_me = bpy.data.meshes.new("Paupieres")
bm = bmesh.new()
lid_vg = {}
RINGS, SEGS = 7, 28
for suf, e in eyes.items():
    a, b = e["a"] * 1.22, e["b"] * 1.4
    verts = []
    rows = []
    for r in range(RINGS + 1):
        rr = r / RINGS
        row = []
        for k in range(SEGS if r else 1):
            th = 2 * math.pi * k / SEGS
            p = e["c"] + e["right"] * (a * rr * math.cos(th)) + e["up"] * (b * rr * math.sin(th))
            hit = bvh.ray_cast(p + e["n"] * 0.06, -e["n"], 0.15)
            q = (hit[0] + hit[1].normalized() * 0.006) if hit[0] else p + e["n"] * 0.004
            v = bm.verts.new(q)
            row.append(v); verts.append(v)
        rows.append(row)
    for k in range(SEGS):
        bm.faces.new((rows[0][0], rows[1][k], rows[1][(k + 1) % SEGS]))
    for r in range(1, RINGS):
        for k in range(SEGS):
            k2 = (k + 1) % SEGS
            f = bm.faces.new((rows[r][k], rows[r + 1][k], rows[r + 1][k2], rows[r][k2]))
            th = 2 * math.pi * (k + 0.5) / SEGS
            if r == RINGS - 1 and math.sin(th) < -0.25:
                f.material_index = 1  # trait de cils en bas de la paupière
    lid_vg[suf] = verts
bm.verts.index_update()
idx = {suf: [v.index for v in vs] for suf, vs in lid_vg.items()}
bmesh.ops.reverse_faces(bm, faces=bm.faces)  # sens anti-horaire dans (droite, haut) donne -n
bm.normal_update()
for f in bm.faces:
    f.smooth = True
bm.to_mesh(lid_me); bm.free()
lid = bpy.data.objects.new("Paupieres", lid_me)
sc.collection.objects.link(lid)
for suf, ids in idx.items():
    vg = lid.vertex_groups.new(name="paupiere." + suf)
    vg.add(ids, 1.0, "REPLACE")
# normales vers l'extérieur
for p in lid_me.polygons:
    pass
mat = bpy.data.materials.new("Paupiere")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (*coat_lin, 1)
bsdf.inputs["Roughness"].default_value = 0.85
mat.diffuse_color = (*coat_lin, 1)
lid_me.materials.append(mat)
cils = bpy.data.materials.new("Cils")
cils.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.03, 0.012, 0.006, 1)
cils.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.7
cils.diffuse_color = (0.03, 0.012, 0.006, 1)
lid_me.materials.append(cils)

for o in (src, lid):
    o.parent = arm
    mod = o.modifiers.new("Armature", "ARMATURE")
    mod.object = arm

# ------------------------------------------------------------------ textures plus légères
for im in bpy.data.images:
    if im.size[0] == 0:
        continue
    target = 2048 if "basecolor" in im.name else 1024
    if im.size[0] > target:
        im.scale(target, target)

# ------------------------------------------------------------------ animations
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

OPEN = 0.03
def lid_scale(c):
    return OPEN + (1 - OPEN) * c

CHANNELS = []  # (bone, prop, index, rest)
for pb in arm.pose.bones:
    for i in range(3):
        CHANNELS.append((pb.name, "rotation_euler", i, 0.0))
for suf in ("G", "D"):
    CHANNELS.append(("paupiere." + suf, "scale", 1, lid_scale(0)))

def blink(t, dur=0.22, amount=1.0):
    return [(t - dur / 2, 0), (t - dur / 6, amount), (t + dur / 6, amount), (t + dur / 2, 0)]

def make_action(name, length, tracks):
    """tracks: {(bone, prop, index): [(t, value), ...]}; angles en degrés, paupières 0..1 (fermeture)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    for bname, prop, i, rest in CHANNELS:
        pb = arm.pose.bones[bname]
        keys = tracks.get((bname, prop, i))
        if keys is None:
            keys = [(0, None), (length, None)]
        for t, val in keys:
            if prop == "scale":
                v = rest if val is None else lid_scale(val)
                pb.scale[i] = v
                pb.keyframe_insert("scale", index=i, frame=round(t * FPS) + 1)
            else:
                v = rest if val is None else math.radians(val)
                pb.rotation_euler[i] = v
                pb.keyframe_insert("rotation_euler", index=i, frame=round(t * FPS) + 1)
    act.frame_range = (1, round(length * FPS) + 1)
    act.use_frame_range = True
    return act

R = "rotation_euler"
def T(b, i, *kv, prop=R):
    return {(b, prop, i): list(kv)}
def lids(*kv, side=("G", "D")):
    d = {}
    for s in side:
        d[("paupiere." + s, "scale", 1)] = [(0, 0)] + list(kv) + []
    return d
def merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out
def closed(keys, length):
    keys = sorted(keys)
    if keys[0][0] > 0: keys = [(0, 0)] + keys
    if keys[-1][0] < length: keys = keys + [(length, 0)]
    return keys
def L(length, side=("G", "D"), *kv):
    k = closed(list(kv), length)
    return {("paupiere." + s, "scale", 1): k for s in side}

# Conventions vérifiées au rendu : tete X+ = baisse le nez, Y = tourne, Z = penche.
ACTIONS = {
    "repos": (4.0, merge(
        T("cou", 0, (0, 0), (2.0, 1.4), (4.0, 0)),
        T("tete", 0, (0, 0), (2.0, -1.2), (4.0, 0)),
        T("tete", 1, (0, 0), (1.0, 2.5), (3.0, -2.5), (4.0, 0)),
        T("tete", 2, (0, 0), (1.5, 1.2), (3.5, -0.8), (4.0, 0)),
        T("oreille.D", 0, (0, 0), (2.55, 0), (2.7, -16), (2.95, -3), (3.2, 0), (4.0, 0)),
        T("oreille.G", 1, (0, 0), (0.6, 0), (0.85, 10), (1.6, 8), (1.9, 0), (4.0, 0)),
        L(4.0, ("G", "D"), *blink(1.25)),
    )),
    "ecoute": (3.0, merge(
        T("tete", 0, (0, 4), (1.5, 6), (3.0, 4)),
        T("tete", 2, (0, 8), (1.5, 10), (3.0, 8)),
        T("tete", 1, (0, 0), (1.5, -2), (3.0, 0)),
        T("cou", 0, (0, 2), (1.5, 2.5), (3.0, 2)),
        T("oreille.G", 0, (0, 14), (1.5, 18), (3.0, 14)),
        T("oreille.D", 0, (0, 14), (1.2, 12), (3.0, 14)),
        T("oreille.G", 1, (0, -6), (3.0, -6)),
        T("oreille.D", 1, (0, 6), (3.0, 6)),
        L(3.0, ("G", "D"), *blink(2.1)),
    )),
    "reflexion": (4.0, merge(
        T("tete", 0, (0, -9), (2.0, -11), (4.0, -9)),
        T("tete", 1, (0, 9), (2.0, 7), (4.0, 9)),
        T("tete", 2, (0, -4), (2.0, -6), (4.0, -4)),
        T("oreille.D", 1, (0, 0), (0.8, 30), (1.6, 30), (2.4, 0), (4.0, 0)),
        T("oreille.G", 0, (0, -6), (2.0, -2), (4.0, -6)),
        L(4.0, ("G", "D"), (0, 0.2), *blink(3.0, 0.35), (4.0, 0.2)),
    )),
    "parle": (2.0, merge(
        T("tete", 0, (0, 0), (0.25, 3), (0.5, 0.5), (0.8, 3.5), (1.1, 0), (1.45, 2.5), (1.75, 0.5), (2.0, 0)),
        T("tete", 1, (0, 0), (0.7, 3), (1.4, -2), (2.0, 0)),
        T("tete", 2, (0, 0), (1.0, 2), (2.0, 0)),
        T("cou", 0, (0, 0), (1.0, 1), (2.0, 0)),
        T("oreille.G", 0, (0, 4), (0.5, 10), (1.0, 2), (1.5, 9), (2.0, 4)),
        T("oreille.D", 0, (0, 8), (0.5, 2), (1.0, 9), (1.5, 3), (2.0, 8)),
        L(2.0, ("G", "D"), *blink(1.2)),
    )),
    "joie": (1.5, merge(
        T("tete", 0, (0, 0), (0.25, -9), (0.55, 3), (0.85, -5), (1.15, 1), (1.5, 0)),
        T("tete", 2, (0, 0), (0.4, 6), (0.9, -4), (1.5, 0)),
        T("oreille.G", 0, (0, 0), (0.25, 20), (1.1, 18), (1.5, 0)),
        T("oreille.D", 0, (0, 0), (0.25, 20), (1.1, 18), (1.5, 0)),
        L(1.5, ("G", "D"), (0.2, 0.55), (1.0, 0.55), (1.35, 0)),
    )),
    "clin": (1.0, merge(
        T("tete", 2, (0, 0), (0.3, 7), (0.7, 6), (1.0, 0)),
        T("oreille.G", 0, (0, 0), (0.3, 10), (0.8, 8), (1.0, 0)),
        L(1.0, ("G",), (0.12, 0), (0.25, 1), (0.5, 1), (0.68, 0)),
        L(1.0, ("D",), (0.25, 0.25), (0.5, 0.25), (0.68, 0)),
    )),
    "rire": (1.6, merge(
        T("tete", 0, (0, 0), (0.15, -7), (0.35, 2), (0.55, -7), (0.75, 2), (0.95, -6), (1.15, 1), (1.6, 0)),
        T("tete", 1, (0, 0), (0.3, 4), (0.7, -4), (1.1, 3), (1.6, 0)),
        T("oreille.G", 0, (0, 0), (0.2, -10), (1.2, -8), (1.6, 0)),
        T("oreille.D", 0, (0, 0), (0.2, -10), (1.2, -8), (1.6, 0)),
        L(1.6, ("G", "D"), (0.15, 0.9), (1.2, 0.9), (1.45, 0)),
    )),
    "desole": (2.2, merge(
        T("tete", 0, (0, 0), (0.5, 11), (1.6, 12), (2.2, 0)),
        T("tete", 2, (0, 0), (0.5, -6), (1.6, -7), (2.2, 0)),
        T("cou", 0, (0, 0), (0.5, 3), (1.6, 3), (2.2, 0)),
        T("oreille.G", 0, (0, 0), (0.5, -18), (1.6, -20), (2.2, 0)),
        T("oreille.D", 0, (0, 0), (0.5, -18), (1.6, -20), (2.2, 0)),
        T("oreille.G", 2, (0, 0), (0.5, -22), (1.6, -24), (2.2, 0)),
        T("oreille.D", 2, (0, 0), (0.5, 22), (1.6, 24), (2.2, 0)),
        L(2.2, ("G", "D"), (0.5, 0.4), (1.6, 0.4), (2.0, 0)),
    )),
    "etonne": (1.2, merge(
        T("tete", 0, (0, 0), (0.15, -7), (0.85, -6), (1.2, 0)),
        T("cou", 0, (0, 0), (0.15, -2), (0.85, -2), (1.2, 0)),
        T("oreille.G", 0, (0, 0), (0.15, 16), (0.9, 15), (1.2, 0)),
        T("oreille.D", 0, (0, 0), (0.15, 16), (0.9, 15), (1.2, 0)),
        L(1.2, ("G", "D"), *blink(0.95, 0.2)),
    )),
}
for name, (length, tracks) in ACTIONS.items():
    make_action(name, length, tracks)
# Pose par défaut des nœuds glTF = yeux ouverts (three.js y revient pendant les fondus).
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
for suf in ("G", "D"):
    arm.pose.bones["paupiere." + suf].scale[1] = lid_scale(0)

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format="GLB", use_selection=False,
    export_apply=False, export_animations=True, export_animation_mode="ACTIONS",
    export_force_sampling=True, export_morph=True, export_morph_normal=False, export_skins=True,
    export_draco_mesh_compression_enable=False, export_image_format="JPEG",
    export_jpeg_quality=85, export_cameras=False, export_lights=False, export_yup=True, export_rest_position_armature=False,
)
print("EXPORT OK")
