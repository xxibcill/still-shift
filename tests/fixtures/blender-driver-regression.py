"""Run with Blender --background --python-exit-code 1 --python this-file.

Actual dependency-graph regression: absolute public inputs, derived drivers,
unrelated source-clock animation, NLA and shared-action isolation. No renders.
"""

import importlib.util
from pathlib import Path

import bpy

worker_path = Path(__file__).resolve().parents[2] / (
    "packages/animation-engine/src/blender-capture-worker.py"
)
spec = importlib.util.spec_from_file_location("capture_worker", worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def add_driver(block, path, expression, controller, properties, index=None):
    curve = block.driver_add(path) if index is None else block.driver_add(path, index)
    curve.keyframe_points.clear()
    curve.driver.type = "SCRIPTED"
    curve.driver.expression = expression
    for name, key in properties.items():
        variable = curve.driver.variables.new()
        variable.name = name
        variable.type = "SINGLE_PROP"
        variable.targets[0].id = controller
        variable.targets[0].data_path = '["' + key + '"]'
    return curve


def exercise(nla):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    controller = bpy.data.objects.new("controls", None)
    peer = bpy.data.objects.new("peer", None)
    moving = bpy.data.objects.new("moving", None)
    for obj in [controller, peer, moving]:
        scene.collection.objects.link(obj)
    for obj in [controller, peer]:
        obj["input"] = 0.0
        obj["clock"] = 0.0
        obj["derived"] = 0.0
    for frame, clock in [(0, 0.0), (10, 1.0)]:
        controller["input"] = 0.0
        controller["clock"] = clock
        for key in ["input", "clock"]:
            controller.keyframe_insert(data_path='["' + key + '"]', frame=frame)
    animation = controller.animation_data
    original = animation.action
    handle = animation.action_slot_handle
    for curve in worker.action_curves(original, handle):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    peer.animation_data_create()
    peer.animation_data.action = original
    peer.animation_data.action_slot_handle = handle
    if nla:
        animation.action = None
        track = animation.nla_tracks.new()
        strip = track.strips.new("source", 0, original)
        strip.action_slot_handle = handle
        strip.blend_type = "REPLACE"
    add_driver(controller, '["derived"]', "2*u+c", controller, {"u": "input", "c": "clock"})
    add_driver(moving, "location", "v", controller, {"v": "derived"}, index=0)
    worker.prepare_controller(controller, {"input": {"min": 0, "max": 1}})
    assert len(controller.animation_data.drivers) == 1
    assert peer.animation_data.action == original
    assert all(not curve.mute for curve in worker.action_curves(original, handle))
    rows = []
    for frame, value in [(0, 0.0), (5, 0.75), (10, 1.0), (5, 0.75), (0, 0.0)]:
        scene.frame_set(frame)
        controller["input"] = value
        controller.update_tag(refresh={"OBJECT", "TIME"})
        bpy.context.view_layer.update()
        actual = moving.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world[0][3]
        expected = 2 * value + frame / 10
        assert abs(actual - expected) < 1e-6, (nla, frame, value, actual, expected)
        assert abs(controller["clock"] - frame / 10) < 1e-6
        assert abs(peer["clock"] - frame / 10) < 1e-6
        assert peer["input"] == 0.0
        rows.append([frame, value, actual])
    try:
        worker.prepare_controller(controller, {"derived": {"min": 0, "max": 3}})
    except ValueError as error:
        assert "itself driven" in str(error)
    else:
        raise AssertionError("Driven public input was admitted")
    print("DRIVER_REGRESSION_PASS", "NLA" if nla else "ACTION", rows, flush=True)


exercise(False)
exercise(True)
print("BLENDER_DRIVER_REGRESSION_PASS: 10 evaluated states; zero renders", flush=True)
