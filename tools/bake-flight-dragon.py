"""Judge Dean LLC — bake the Blender dragon and its active wingbeat for the web game.

Run from the repository root:
    blender -b --factory-startup art/dragon/flight-dragon.blend --python tools/bake-flight-dragon.py
"""
import base64
import json
import struct
from pathlib import Path

import bpy
from mathutils import Matrix

SCALE = 1024
GAME_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_quaternion()


def game_vector(vector):
    return (vector.x, vector.z, -vector.y)


def encoded(values, kind):
    return base64.b64encode(struct.pack(f"<{len(values)}{kind}", *values)).decode("ascii")


def bounded(value, low, high):
    return min(high, max(low, value))


def game_weights(vertex, mesh_object, bone_ids):
    weighted = []
    for influence in vertex.groups:
        name = mesh_object.vertex_groups[influence.group].name
        if name in bone_ids and influence.weight > 0:
            weighted.append((bone_ids[name], influence.weight))
    weighted.sort(key=lambda entry: -entry[1])
    keep = weighted[:4]
    total = sum(weight for _, weight in keep)
    if not total:
        raise ValueError(f"Dragon vertex {vertex.index} has no bone weights")
    joints = [joint for joint, _ in keep]
    weights = [round(weight * 255 / total) for _, weight in keep]
    weights[0] += 255 - sum(weights)
    return joints + [0] * (4 - len(joints)), weights + [0] * (4 - len(weights))


def wingbeat_samples(scene, rig, bones):
    action = rig.animation_data.action
    if action.name != "Wingbeat":
        raise ValueError("Set the armature's Wingbeat action active before exporting")
    start, end = (round(frame) for frame in action.frame_range)
    restore = scene.frame_current
    rotations = []
    previous = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        deformations = {}
        for bone in bones:
            # A game bone has identity bind rotation. Remove the native bind
            # axes from its posed rotation before removing its parent's motion.
            posed = rig.pose.bones[bone.name].matrix.to_quaternion()
            deform = posed @ bone.matrix_local.to_quaternion().inverted()
            local = deformations[bone.parent.name].inverted() @ deform if bone.parent else deform
            quat = GAME_TO_BLENDER.inverted() @ local @ GAME_TO_BLENDER
            quat.normalize()
            if bone.name in previous and quat.dot(previous[bone.name]) < 0:
                quat.negate()
            previous[bone.name] = quat.copy()
            deformations[bone.name] = deform
            rotations.extend(round(bounded(v, -1, 1) * 32767) for v in (quat.x, quat.y, quat.z, quat.w))
    scene.frame_set(restore)
    return {"frames": end - start + 1, "rotations": encoded(rotations, "h")}


def bake():
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    skin = next(obj for obj in scene.objects if obj.type == "MESH" and obj.find_armature() == rig)
    mesh = skin.data
    layer = mesh.color_attributes["DragonPigment"]
    if layer.domain != "POINT":
        raise ValueError("DragonPigment must have a point-domain color for each vertex")
    bones = list(rig.data.bones)
    bone_ids = {bone.name: i for i, bone in enumerate(bones)}
    skeleton = [{"name": bone.name, "parent": bone_ids[bone.parent.name] if bone.parent else -1,
                 "head": [round(v, 6) for v in game_vector(bone.head_local)]} for bone in bones]
    mesh.calc_loop_triangles()
    positions, colors, normals, joints, weights, indices = [], [], [], [], [], []
    # Keep source vertex indices stable, including sockets and wingtips. Split
    # vertices only at authored hard edges, preserving Blender's corner normals.
    corner_normal = mesh.corner_normals
    first_normal = [None] * len(mesh.vertices)
    for loop in mesh.loops:
        if first_normal[loop.vertex_index] is None:
            first_normal[loop.vertex_index] = corner_normal[loop.index].vector.copy()
    def write_vertex(i, normal):
        v = mesh.vertices[i]
        positions.extend(round(n * SCALE) for n in game_vector(v.co))
        colors.extend(round(255 * bounded(n, 0, 1)) for n in layer.data[i].color_srgb[:3])
        normals.extend(normal)
        joint, weight = game_weights(v, skin, bone_ids)
        joints.extend(joint)
        weights.extend(weight)
    def normal_key(normal):
        return tuple(round(bounded(v, -1, 1) * 127) for v in game_vector(normal))
    lookup = {}
    for v in mesh.vertices:
        n = normal_key(first_normal[v.index] if first_normal[v.index] is not None else v.normal)
        write_vertex(v.index, n)
        lookup[v.index, n] = v.index
    for tri in mesh.loop_triangles:
        for corner in tri.loops:
            source = mesh.loops[corner].vertex_index
            n = normal_key(corner_normal[corner].vector)
            key = source, n
            if key not in lookup:
                lookup[key] = len(positions) // 3
                write_vertex(source, n)
            indices.append(lookup[key])
    cheeks = list(skin["game_cheeks"])
    data = {
        "version": 1, "bones": skeleton, "positions": encoded(positions, "h"), "normals": encoded(normals, "b"),
        "colors": encoded(colors, "B"), "joints": encoded(joints, "B"), "weights": encoded(weights, "B"),
        "indices": encoded(indices, "H"), "clips": {"Wingbeat": wingbeat_samples(scene, rig, bones)},
        "anchors": {"wingTips": ["WingTip.R", "WingTip.L"], "wingTipVertices": list(skin["game_wing_tip_vertices"]),
                    "cheeks": [cheeks[:3], cheeks[3:]]},
    }
    destination = Path(__file__).resolve().parents[1] / "src" / "gen" / "flight_dragon.js"
    content = "/* Judge Dean LLC — baked from art/dragon/flight-dragon.blend. */\n"
    content += "window.__PF_DRAGON_DATA=" + json.dumps(data, separators=(",", ":")) + ";\n"
    destination.write_text(content)
    print(f"Baked {len(positions)//3} vertices, {len(indices)//3} triangles and {len(bones)} joints to {destination}")


bake()
