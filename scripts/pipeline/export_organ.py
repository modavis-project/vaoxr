import bpy
import json
import mathutils
import sys
from pathlib import Path


def args_after_separator():
    if "--" not in sys.argv:
        raise RuntimeError("Expected source FBX, source texture, output GLB and report paths")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 4:
        raise RuntimeError("Expected exactly four pipeline arguments")
    return [Path(value) for value in values]


source_fbx, source_texture, output_glb, report_path = args_after_separator()
output_glb.parent.mkdir(parents=True, exist_ok=True)
report_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
# Blender 5.1's bundled FBX importer still assigns the removed Cycles
# `cast_shadow` light setting. Restore a transient compatibility property so
# archival FBX files containing lights can be imported and the lights removed.
compat_light = bpy.data.lights.new("FBX importer compatibility", type="POINT")
cycles_light_type = type(compat_light.cycles)
if not hasattr(cycles_light_type, "cast_shadow"):
    cycles_light_type.cast_shadow = bpy.props.BoolProperty(default=True)
bpy.data.lights.remove(compat_light)
bpy.ops.import_scene.fbx(filepath=str(source_fbx), use_anim=False)

for obj in list(bpy.context.scene.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)

texture = bpy.data.images.load(str(source_texture), check_existing=True)
texture.colorspace_settings.name = "sRGB"

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
decimated_meshes = []
for obj in mesh_objects:
    if obj.name.startswith(("M1.", "REG.")) or len(obj.data.polygons) < 100000:
        continue
    before = len(obj.data.polygons)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="PositivXR web decimation", type="DECIMATE")
    modifier.ratio = 0.65
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    decimated_meshes.append({"name": obj.name, "beforeFaces": before, "afterFaces": len(obj.data.polygons)})

for obj in mesh_objects:
    for material_slot in obj.material_slots:
        material = material_slot.material
        if material is None:
            continue
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            principled = nodes.new("ShaderNodeBsdfPrincipled")
        image_node = next((node for node in nodes if node.type == "TEX_IMAGE"), None)
        if image_node is None:
            image_node = nodes.new("ShaderNodeTexImage")
        image_node.image = texture
        base_color = principled.inputs.get("Base Color")
        if base_color and not base_color.is_linked:
            links.new(image_node.outputs["Color"], base_color)
        roughness = principled.inputs.get("Roughness")
        if roughness:
            roughness.default_value = 0.62

bpy.context.view_layer.update()
points = []
for obj in mesh_objects:
    for corner in obj.bound_box:
        points.append(obj.matrix_world @ mathutils.Vector(corner))

minimum = [min(point[index] for point in points) for index in range(3)]
maximum = [max(point[index] for point in points) for index in range(3)]

bpy.ops.export_scene.gltf(
    filepath=str(output_glb),
    export_format="GLB",
    export_apply=False,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)

node_names = sorted(obj.name for obj in bpy.context.scene.objects)
report = {
    "source": str(source_fbx),
    "textureSource": str(source_texture),
    "meshCount": len(mesh_objects),
    "nodeCount": len(node_names),
    "animatedNodeNamesPreserved": [
        name for name in node_names if name.startswith("M1.") or name.startswith("REG.")
    ],
    "webDecimation": decimated_meshes,
    "bounds": {"min": minimum, "max": maximum},
    "rawBytes": output_glb.stat().st_size,
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
