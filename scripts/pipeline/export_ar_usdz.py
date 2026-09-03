import bpy
import hashlib
import json
import os
import shutil
import sys
import tempfile


project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
source_path = os.path.join(project_root, "public/media/models/organ-ar.glb")
output_path = os.path.join(project_root, "public/media/models/organ-ar.usdz")
report_path = os.path.join(project_root, "public/media/reports/organ-ar.json")

scene = bpy.context.scene
scene.render.fps = 30
scene.render.fps_base = 1
scene.frame_start = 0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source_path, import_webp_texture=True, import_pack_images=True)

scene.frame_start = 0
scene.frame_end = int(max((action.frame_range[1] for action in bpy.data.actions), default=1))
scene.world = None

# USDZ does not retain Draco compression. Give the phone-focused derivative a
# separate geometry budget so Quick Look remains a practical download while
# the Quest GLB keeps the higher-fidelity shell needed at headset distance.
mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
body = max(mesh_objects, key=lambda obj: len(obj.data.polygons), default=None)
if body is None:
    raise RuntimeError("The static organ body mesh was not found")
bpy.context.view_layer.objects.active = body
body.select_set(True)
modifier = body.modifiers.new(name="iOS AR geometry budget", type="DECIMATE")
modifier.decimate_type = "COLLAPSE"
modifier.ratio = 0.04
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.000001)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()

texture_directory = tempfile.mkdtemp(prefix="vaoxr-usdz-textures-")
for index, image in enumerate(bpy.data.images):
    if not image.has_data or image.name == "Render Result":
        continue
    image.name = f"texture-{index}.png"
    image.filepath_raw = os.path.join(texture_directory, image.name)
    image.file_format = "PNG"
    image.save()
    if image.packed_file:
        image.unpack(method="REMOVE")
    image.source = "FILE"
    image.reload()
bpy.ops.wm.usd_export(
    filepath=output_path,
    export_animation=True,
    export_materials=True,
    export_textures_mode="NEW",
    overwrite_textures=True,
    relative_paths=True,
    meters_per_unit=1.0,
    usdz_downscale_size="1024",
)
shutil.rmtree(texture_directory, ignore_errors=True)

with open(output_path, "rb") as asset:
    usdz_bytes = asset.read()
with open(report_path, "r", encoding="utf-8") as report_file:
    report = json.load(report_file)

report["iosDerivative"] = {
    "path": "/media/models/organ-ar.usdz",
    "sha256": hashlib.sha256(usdz_bytes).hexdigest(),
    "byteLength": len(usdz_bytes),
    "animation": report["derivative"]["animation"],
    "format": "USDZ",
    "geometryBudget": {
        "staticBodyRatioFromQuest": 0.04,
        "targetTriangles": 22000,
        "tool": "Blender Decimate",
    },
}
with open(report_path, "w", encoding="utf-8") as report_file:
    json.dump(report, report_file, indent=2)
    report_file.write("\n")

print(f"Animated iOS AR model: {len(usdz_bytes) / 1_000_000:.2f} MB")
