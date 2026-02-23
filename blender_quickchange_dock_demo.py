try:
    import bpy
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Этот скрипт нужно запускать только через Blender (модуль bpy доступен внутри Blender).\n"
        "Пример: blender --python c:/Users/sqizman/drone-lamp-automation/scripts/blender_quickchange_dock_demo.py"
    ) from exc
import math
from mathutils import Vector


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)


def make_material(name, color, roughness=0.45, metallic=0.1):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
    return mat


def add_cube(name, size, location, material=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    if material:
        obj.data.materials.append(material)
    return obj


def add_cylinder(name, radius, depth, location, rotation=(0, 0, 0), material=None, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def add_cone(name, r1, r2, depth, location, rotation=(0, 0, 0), material=None, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def setup_scene():
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 120

    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except Exception:
        scene.render.engine = 'CYCLES'

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.filepath = "//quickchange_dock_preview.png"

    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True

    node_tree = world.node_tree
    nodes = node_tree.nodes
    links = node_tree.links

    bg = next((node for node in nodes if node.type == 'BACKGROUND'), None)
    if bg is None:
        bg = nodes.new(type='ShaderNodeBackground')

    out = next((node for node in nodes if node.type == 'OUTPUT_WORLD'), None)
    if out is None:
        out = nodes.new(type='ShaderNodeOutputWorld')

    is_linked = any(link.from_node == bg and link.to_node == out for link in links)
    if not is_linked:
        links.new(bg.outputs['Background'], out.inputs['Surface'])

    bg.inputs[0].default_value = (0.02, 0.03, 0.06, 1)
    bg.inputs[1].default_value = 0.7


def build_drone_with_mount(mats):
    drone_root = bpy.data.objects.new('DroneRoot', None)
    bpy.context.collection.objects.link(drone_root)

    body = add_cube('DroneBody', (0.42, 0.30, 0.07), (0, 0, 2.35), mats['drone'])
    body.parent = drone_root

    # Руки дрона
    arm1 = add_cube('ArmX', (0.80, 0.03, 0.02), (0, 0, 2.35), mats['drone'])
    arm1.parent = drone_root
    arm2 = add_cube('ArmY', (0.03, 0.80, 0.02), (0, 0, 2.35), mats['drone'])
    arm2.parent = drone_root

    motor_positions = [
        (0.68, 0.68, 2.36),
        (0.68, -0.68, 2.36),
        (-0.68, 0.68, 2.36),
        (-0.68, -0.68, 2.36),
    ]

    for i, pos in enumerate(motor_positions, start=1):
        motor = add_cylinder(f'Motor_{i}', 0.06, 0.05, pos, material=mats['dark'])
        motor.parent = drone_root
        prop = add_cube(f'Prop_{i}', (0.28, 0.015, 0.005), (pos[0], pos[1], pos[2] + 0.03), mats['dark'])
        prop.parent = drone_root

    # Узел крепления под дроном
    mount_plate = add_cube('MountPlate', (0.28, 0.20, 0.02), (0, 0, 2.12), mats['metal'])
    mount_plate.parent = drone_root

    # Направляющие воронки (на дроне)
    guides = [
        (0.16, 0.12, 2.04),
        (0.16, -0.12, 2.04),
        (-0.16, 0.12, 2.04),
        (-0.16, -0.12, 2.04),
    ]
    for i, g in enumerate(guides, start=1):
        cone = add_cone(f'DroneGuide_{i}', 0.04, 0.02, 0.09, g, material=mats['metal'])
        cone.parent = drone_root

    # Защелки по бокам
    latch_l = add_cube('Latch_Left', (0.02, 0.05, 0.03), (0, 0.24, 2.10), mats['latch'])
    latch_r = add_cube('Latch_Right', (0.02, 0.05, 0.03), (0, -0.24, 2.10), mats['latch'])
    latch_l.parent = drone_root
    latch_r.parent = drone_root

    return drone_root


def build_box_and_dock(mats):
    # Док-площадка
    dock = add_cube('DockBase', (0.70, 0.50, 0.03), (0, 0, 0.03), mats['dock'])

    # Коробка (сменный модуль)
    box = add_cube('QuickChangeBox', (0.26, 0.18, 0.12), (0, 0, 0.18), mats['box'])

    # Верхняя крышка коробки
    lid = add_cube('BoxLid', (0.24, 0.16, 0.015), (0, 0, 0.30), mats['box_top'])
    lid.parent = box

    # Штифты самонаведения на коробке
    pins = [
        (0.16, 0.12, 0.33),
        (0.16, -0.12, 0.33),
        (-0.16, 0.12, 0.33),
        (-0.16, -0.12, 0.33),
    ]
    for i, p in enumerate(pins, start=1):
        pin = add_cylinder(f'BoxPin_{i}', 0.014, 0.05, p, material=mats['metal'])
        pin.parent = box

    # Пазы защелок
    slot_l = add_cube('LatchSlot_Left', (0.025, 0.04, 0.02), (0, 0.20, 0.21), mats['dark'])
    slot_r = add_cube('LatchSlot_Right', (0.025, 0.04, 0.02), (0, -0.20, 0.21), mats['dark'])
    slot_l.parent = box
    slot_r.parent = box

    # Стойка-столб для контекста
    pole = add_cylinder('LampPole', 0.045, 1.7, (1.35, 0, 0.85), material=mats['pole'])
    head = add_cube('LampHead', (0.22, 0.10, 0.05), (1.50, 0, 1.62), mats['dock'])

    return dock, box


def setup_camera_lights():
    bpy.ops.object.camera_add(location=(3.1, -2.8, 2.0), rotation=(math.radians(72), 0, math.radians(48)))
    cam = bpy.context.active_object
    cam.name = 'MainCamera'
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='AREA', location=(1.4, -2.2, 3.0))
    key = bpy.context.active_object
    key.data.energy = 1300
    key.data.size = 2.0

    bpy.ops.object.light_add(type='AREA', location=(-2.2, 1.5, 2.0))
    fill = bpy.context.active_object
    fill.data.energy = 550
    fill.data.size = 1.6


def add_simple_animation(drone_root, box):
    # Старт: дрон выше, коробка в доке
    drone_root.location = Vector((0.0, 0.0, 2.0))
    drone_root.keyframe_insert(data_path='location', frame=1)

    # Подлет к коробке
    drone_root.location = Vector((0.0, 0.0, 0.6))
    drone_root.keyframe_insert(data_path='location', frame=40)

    # Захват
    drone_root.location = Vector((0.0, 0.0, 0.46))
    drone_root.keyframe_insert(data_path='location', frame=58)

    # Подъем с коробкой
    drone_root.location = Vector((0.0, 0.0, 1.9))
    drone_root.keyframe_insert(data_path='location', frame=100)

    # Для демонстрации визуально привязываем коробку к дрону после 58 кадра
    box.keyframe_insert(data_path='location', frame=57)
    box.location = Vector((0.0, 0.0, 0.18))
    box.parent = drone_root
    box.matrix_parent_inverse = drone_root.matrix_world.inverted()
    box.keyframe_insert(data_path='location', frame=58)


if __name__ == '__main__':
    clear_scene()
    setup_scene()

    materials = {
        'drone': make_material('DroneMat', (0.12, 0.13, 0.15), roughness=0.32, metallic=0.35),
        'dark': make_material('DarkMat', (0.05, 0.06, 0.08), roughness=0.45, metallic=0.2),
        'metal': make_material('MetalMat', (0.58, 0.62, 0.68), roughness=0.25, metallic=0.75),
        'latch': make_material('LatchMat', (0.15, 0.65, 0.28), roughness=0.4, metallic=0.3),
        'box': make_material('BoxMat', (0.78, 0.81, 0.85), roughness=0.35, metallic=0.1),
        'box_top': make_material('BoxTopMat', (0.22, 0.64, 0.31), roughness=0.35, metallic=0.15),
        'dock': make_material('DockMat', (0.23, 0.28, 0.33), roughness=0.55, metallic=0.25),
        'pole': make_material('PoleMat', (0.75, 0.78, 0.82), roughness=0.5, metallic=0.2),
    }

    drone = build_drone_with_mount(materials)
    _, box = build_box_and_dock(materials)
    setup_camera_lights()
    add_simple_animation(drone, box)

    # Авто-рендер одного кадра-превью
    bpy.context.scene.frame_set(68)
    bpy.ops.render.render(write_still=True)

    print('Готово: сцена собрана. Превью сохранено в quickchange_dock_preview.png рядом с .blend')
