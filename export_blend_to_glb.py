import bpy
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
input_path = os.path.join(base_dir, 'фвфь.blend')
output_path = os.path.join(base_dir, 'public', 'models', 'drone.glb')

os.makedirs(os.path.dirname(output_path), exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=input_path)

# Ensure all objects are considered for export
for obj in bpy.data.objects:
    obj.select_set(False)

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=True
)

print(f'Exported GLB: {output_path}')
