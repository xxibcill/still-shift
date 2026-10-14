"""Native projection/visibility regression; requires Blender, writes private fixtures.

Run with --background --python-exit-code 1 --python this-file. Synthetic geometry
supplies no mechanism/pilot acceptance. Actual worker captures seven small frames.
"""

import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

worker_path = Path(__file__).resolve().parents[2] / (
    "packages/animation-engine/src/blender-capture-worker.py"
)
spec = importlib.util.spec_from_file_location("capture_worker", worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
root = Path(tempfile.mkdtemp(prefix="blender-shot-regression-"))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = bpy.data.collections.new("asset.fixture")
scene.collection.children.link(collection)
controller = bpy.data.objects.new("controls", None)
collection.objects.link(controller)
controller["input"] = 0.0
controller["hide_cutaway"] = 1.0
for name, location in [("shell", (-0.5, 0, 0)), ("cutaway", (0.5, 0, 0))]:
    bpy.ops.mesh.primitive_cube_add(size=0.6, location=location)
    obj = bpy.context.object
    obj.name = name
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    curve = obj.driver_add("hide_render")
    curve.keyframe_points.clear()
    curve.driver.type = "SCRIPTED"
    curve.driver.expression = "u > .5"
    variable = curve.driver.variables.new()
    variable.name = "u"
    variable.type = "SINGLE_PROP"
    variable.targets[0].id = controller
    variable.targets[0].data_path = '["input"]' if name == "shell" else '["hide_cutaway"]'
cameras = {}
for name, kind in [("camera.main", "ORTHO"), ("camera.perspective", "PERSP")]:
    data = bpy.data.cameras.new(name)
    data.type = kind
    data.ortho_scale = 4
    data.lens = 50
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = Vector((0, -6, 3))
    obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()
    cameras[name] = obj
alias = bpy.data.objects.new("camera.shared", cameras["camera.main"].data)
scene.collection.objects.link(alias)
bpy.context.view_layer.update()
alias.matrix_world = cameras["camera.main"].matrix_world
scene.camera = cameras["camera.main"]
scene.world = bpy.data.worlds.new("world")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
controller.update_tag(refresh={"OBJECT", "TIME"})
bpy.context.view_layer.update()
asset = root / "synthetic.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(asset))
source_hash = "sha256:" + hashlib.sha256(asset.read_bytes()).hexdigest()


def frame(camera, value=0.0, framing=None, hidden=None, shown=None):
    value = {
        "sourceFrame": 0,
        "camera": camera,
        "controls": {"input": value},
        "hiddenParts": hidden or [],
        "shownParts": shown or [],
    }
    if framing:
        value["framing"] = framing
    return value


frames = [
    frame("camera.main"),
    frame(
        "camera.main",
        0.2,
        {"orthoScale": 7.3, "shiftX": 0.25, "shiftY": -0.15},
        ["shell"],
        ["cutaway"],
    ),
    frame("camera.shared"),
    frame("camera.main", 0.75, {"orthoScale": 3}, ["cutaway"], ["shell"]),
    frame("camera.perspective"),
    frame(
        "camera.perspective",
        0.2,
        {"lensMillimeters": 35, "shiftX": -0.1, "shiftY": 0.1},
        ["shell"],
        ["cutaway"],
    ),
    frame("camera.perspective"),
]
job = {
    "schemaVersion": "blender-native-capture-job-1",
    "id": "shot-regression",
    "assetPath": str(asset),
    "assetSha256": source_hash,
    "collection": "asset.fixture",
    "camera": "camera.main",
    "outputDirectory": str(root / "capture"),
    "width": 64,
    "height": 96,
    "fps": 30,
    "samples": 1,
    "controller": {"object": "controls", "properties": {"input": {"min": 0, "max": 1}}},
    "frames": frames,
}
job_path = root / "job.json"
job_path.write_text(json.dumps(job) + "\n")
worker.execute(job, job_path)
records = []
for index, request in enumerate(frames):
    observation = json.loads((root / "capture/frames" / f"frame-{index:06d}.json").read_text())
    actual = observation["camera"]
    expected = {"orthoScale": 4, "lensMillimeters": 50, "shiftX": 0, "shiftY": 0}
    expected.update(request.get("framing", {}))
    for key, value in expected.items():
        assert abs(actual[key] - value) < 1e-6, (index, key, actual[key], value)
    visible = {part["name"]: part["visible"] for part in observation["parts"]}
    if index in [1, 5]:
        assert visible == {"cutaway": True, "shell": False}
    elif index == 3:
        assert visible == {"cutaway": False, "shell": True}
    else:
        assert visible == {"cutaway": False, "shell": True}
    records.append({"frame": index, "camera": actual, "visible": visible})
assert worker.digest_file(asset) == source_hash
bpy.ops.wm.open_mainfile(filepath=str(asset), load_ui=False)
for name in ["camera.main", "camera.perspective"]:
    data = bpy.data.objects[name].data
    assert data.ortho_scale == 4 and data.lens == 50 and data.shift_x == data.shift_y == 0
for name, framing in [
    ("camera.main", {"lensMillimeters": 30}),
    ("camera.perspective", {"orthoScale": 3}),
]:
    try:
        worker.apply_camera_framing(bpy.data.objects[name], framing)
    except ValueError as error:
        assert "zoom mode" in str(error)
    else:
        raise AssertionError("Wrong native projection was admitted")
camera = bpy.data.objects["camera.main"]
camera.data.keyframe_insert(data_path="ortho_scale", frame=0)
try:
    worker.apply_camera_framing(camera, {"orthoScale": 3})
except ValueError as error:
    assert "unanimated" in str(error)
else:
    raise AssertionError("Animated projection was overridden")
receipt = {
    "status": "passed",
    "sourceBytesUnchanged": True,
    "frames": records,
    "nativeRenders": len(frames),
    "scope": "Synthetic actual worker projection/visibility regression only",
}
(root / "regression.json").write_text(json.dumps(receipt, indent=2) + "\n")
print("BLENDER_SHOT_REGRESSION_PASS", root / "regression.json", flush=True)
