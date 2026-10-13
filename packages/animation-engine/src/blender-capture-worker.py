"""Shared data-only native asset capture. No source blend is saved or rebuilt."""

import hashlib
import json
import math
import shutil
import struct
import sys
from pathlib import Path


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def pin(path, root):
    return {
        "path": str(path.relative_to(root)),
        "bytes": path.stat().st_size,
        "sha256": digest_file(path),
    }


def write_json(path, value):
    path.write_text(json.dumps(value, allow_nan=False, indent=2) + "\n")


def matrix_values(matrix):
    return [float(value) for row in matrix for value in row]


def describe_geometry(collection, graph):
    parts = []
    for obj in sorted(collection.all_objects, key=lambda item: item.name):
        if obj.type not in {"MESH", "CURVE", "SURFACE"}:
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        try:
            if mesh is None:
                continue
            mesh.calc_loop_triangles()
            world = [tuple(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
            positions = hashlib.sha256()
            triangles = hashlib.sha256()
            for vertex in mesh.vertices:
                if not all(math.isfinite(value) for value in vertex.co):
                    raise ValueError("Nonfinite evaluated geometry: " + obj.name)
                positions.update(struct.pack("<ddd", *vertex.co))
            for triangle in mesh.loop_triangles:
                triangles.update(struct.pack("<III", *triangle.vertices))
            parts.append(
                {
                    "name": obj.name,
                    "visible": not obj.hide_render,
                    "editorial": bool(obj.get("display_geometry"))
                    or obj.name.startswith("inspection.section.")
                    or any(".section" in col.name for col in obj.users_collection),
                    "vertices": len(mesh.vertices),
                    "triangles": len(mesh.loop_triangles),
                    "positionsSha256": "sha256:" + positions.hexdigest(),
                    "triangleIndicesSha256": "sha256:" + triangles.hexdigest(),
                    "worldMatrix": matrix_values(evaluated.matrix_world),
                    "worldBounds": None
                    if not world
                    else {
                        "min": [min(point[axis] for point in world) for axis in range(3)],
                        "max": [max(point[axis] for point in world) for axis in range(3)],
                    },
                }
            )
        finally:
            evaluated.to_mesh_clear()
    return parts


def execute(job, job_path):
    import bpy

    source = Path(job["assetPath"])
    expected = job["assetSha256"]
    if digest_file(source) != expected:
        raise ValueError("Native source asset differs from its requested hash")
    output = Path(job["outputDirectory"])
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(job_path, output / "frozen-job.json")
    shutil.copyfile(Path(__file__), output / "frozen-worker.py")
    frames_directory = output / "frames"
    frames_directory.mkdir()
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False)
    scene = bpy.context.scene
    collection = bpy.data.collections.get(job["collection"])
    camera = bpy.data.objects.get(job["camera"])
    if collection is None or camera is None or camera.type != "CAMERA":
        raise ValueError("Capture requires the named source collection and camera")
    if job.get("requireEmbeddedResources"):
        if bpy.data.libraries:
            raise ValueError("Native episode source requires embedded libraries/resources")
        for image in bpy.data.images:
            if image.source not in {"GENERATED", "VIEWER"} and image.filepath:
                if not image.packed_file and not image.packed_files:
                    raise ValueError("Unpacked native image resource: " + image.name)
        for font in bpy.data.fonts:
            if font.filepath not in {"", "<builtin>"} and not font.packed_file:
                raise ValueError("Unpacked native font resource: " + font.name)
    cameras = {}
    for name in {job["camera"], *(frame.get("camera", job["camera"]) for frame in job["frames"])}:
        view = bpy.data.objects.get(name)
        if view is None or view.type != "CAMERA":
            raise ValueError("Named native shot camera is absent: " + name)
        cameras[name] = view
    objects = {obj.name: obj for obj in collection.all_objects}
    controller = None
    contract = job.get("controller")
    if contract:
        controller = bpy.data.objects.get(contract["object"])
        if controller is None:
            raise ValueError("Named native controller is absent")
        for key in contract["properties"]:
            if key not in controller or not isinstance(controller[key], int | float):
                raise ValueError("Declared native numeric property is absent: " + key)
        controller.animation_data_clear()
    for frame in job["frames"]:
        if any(name not in objects for name in frame["hiddenParts"]):
            raise ValueError("Hidden part must belong to the native asset collection")
    visibility = {name: obj.hide_render for name, obj in objects.items()}
    visibility_drivers = [
        (driver, driver.mute)
        for obj in objects.values()
        if obj.animation_data
        for driver in obj.animation_data.drivers
        if driver.data_path == "hide_render"
    ]
    scene.camera = camera
    scene.render.resolution_x = job["width"]
    scene.render.resolution_y = job["height"]
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = job["samples"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    records = []
    for index, requested in enumerate(job["frames"]):
        for driver, muted in visibility_drivers:
            driver.mute = muted
        for name, obj in objects.items():
            obj.hide_render = visibility[name]
        camera = cameras[requested.get("camera", job["camera"])]
        scene.camera = camera
        scene.frame_set(math.floor(requested["sourceFrame"]), subframe=requested["sourceFrame"] % 1)
        if controller:
            for key, value in requested["controls"].items():
                controller[key] = float(value)
            controller.update_tag()
        bpy.context.view_layer.update()
        for name in requested["hiddenParts"]:
            obj = objects[name]
            if obj.animation_data:
                for driver in obj.animation_data.drivers:
                    if driver.data_path == "hide_render":
                        driver.mute = True
            obj.hide_render = True
        image = frames_directory / ("frame-" + str(index).zfill(6) + ".png")
        scene.render.filepath = str(image)
        bpy.ops.render.render(write_still=True)
        graph = bpy.context.evaluated_depsgraph_get()
        parts = describe_geometry(collection, graph)
        observation = frames_directory / ("frame-" + str(index).zfill(6) + ".json")
        write_json(
            observation,
            {
                "schemaVersion": "blender-native-observed-frame-1",
                "outputFrame": index,
                "sourceFrame": requested["sourceFrame"],
                "sourceAssetSha256": expected,
                "coordinateSystem": "right-handed-z-up",
                "units": "source-library-units; no manufacturing conversion",
                "camera": {
                    "name": camera.name,
                    "worldMatrix": matrix_values(camera.matrix_world),
                    "type": camera.data.type,
                    "orthoScale": camera.data.ortho_scale,
                    "clipStart": camera.data.clip_start,
                    "clipEnd": camera.data.clip_end,
                    "lensMillimeters": camera.data.lens,
                },
                "requestedControls": requested["controls"],
                "actualControls": {key: float(controller[key]) for key in contract["properties"]}
                if controller
                else {},
                "parts": parts,
                "scope": (
                    "Actual native evaluated surface hashes/matrices/bounds after rendering. "
                    "No inferred contact, visibility, force, continuous or factual approval."
                ),
            },
        )
        records.append(
            {
                "frame": index,
                "sourceFrame": requested["sourceFrame"],
                "image": pin(image, output),
                "observation": pin(observation, output),
            }
        )
        print("CAPTURE_FRAME " + str(index), flush=True)
    if digest_file(source) != expected:
        raise ValueError("Native asset changed during capture")
    manifest = output / "capture.json"
    write_json(
        manifest,
        {
            "summary": {
                "schemaVersion": "blender-native-capture-result-1",
                "status": "captured",
                "id": job["id"],
                "sourceAssetSha256": expected,
                "frameCount": len(records),
                "blenderRenders": len(records),
                "manifestPath": str(manifest),
                "scope": (
                    "Native Blender source/controls and materials retained; "
                    "cached image/observation producer. "
                    "No automatic Blender rig/shader transfer or episode qualification."
                ),
            },
            "backend": {
                "name": "Blender",
                "version": bpy.app.version_string,
                "buildHash": bpy.app.build_hash.decode(),
                "engine": scene.render.engine,
                "samples": scene.eevee.taa_render_samples,
            },
            "color": {
                "viewTransform": scene.view_settings.view_transform,
                "look": scene.view_settings.look,
                "encoding": "display-referred PNG RGBA8; straight alpha",
            },
            "width": job["width"],
            "height": job["height"],
            "fps": job["fps"],
            "assetBytesUnchanged": True,
            "frozenJob": pin(output / "frozen-job.json", output),
            "frozenWorker": pin(output / "frozen-worker.py", output),
            "frames": records,
        },
    )


def main():
    job_path = Path(sys.argv[sys.argv.index("--") + 1])
    if job_path.stat().st_size > 1024 * 1024:
        raise ValueError("Capture job exceeds its preallocation byte budget")
    job = json.loads(job_path.read_text())
    execute(job, job_path)


if __name__ == "__main__":
    main()
