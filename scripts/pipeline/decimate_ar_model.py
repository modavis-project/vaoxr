import bpy
import os
import shutil
import sys
import tempfile


if "--" not in sys.argv:
    raise RuntimeError("Expected input and output paths after --")
input_path, output_path = sys.argv[sys.argv.index("--") + 1 : sys.argv.index("--") + 3]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps = 30
bpy.context.scene.render.fps_base = 1
bpy.ops.import_scene.gltf(filepath=input_path, import_webp_texture=True, import_pack_images=True)

texture_directory = tempfile.mkdtemp(prefix="vaoxr-ar-textures-")
for index, image in enumerate(bpy.data.images):
    if not image.has_data:
        continue
    longest_edge = max(image.size)
    if longest_edge > 2048:
        scale = 2048 / longest_edge
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    image.name = f"texture-{index}.jpg"
    image.filepath_raw = os.path.join(texture_directory, image.name)
    image.file_format = "JPEG"
    image.save()
    if image.packed_file:
        image.unpack(method="REMOVE")
    image.source = "FILE"
    image.reload()

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
body = max(mesh_objects, key=lambda obj: len(obj.data.polygons), default=None)
if body is None:
    raise RuntimeError("The static organ body mesh was not found")

bpy.context.view_layer.objects.active = body
body.select_set(True)
modifier = body.modifiers.new(name="Mobile AR geometry budget", type="DECIMATE")
modifier.decimate_type = "COLLAPSE"
# Keep enough of the photogrammetry shell to preserve UV islands and carved
# detail. A second simplification pass used to reduce this to roughly 38k
# triangles, which visibly distorted the texture on Quest.
modifier.ratio = 0.4
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_animations=True,
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_materials="EXPORT",
    export_yup=True,
)
shutil.rmtree(texture_directory, ignore_errors=True)
print(f"Decimated static organ body ({body.name}): {len(body.data.polygons):,} triangles")
