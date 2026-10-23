"""Run with Blender --background coin-toss.blend --python render_frames.py -- OUTPUT."""
import bpy, os, sys
output = sys.argv[sys.argv.index('--') + 1]
os.makedirs(output, exist_ok=True)
for frame in range(1, 49):
    bpy.context.scene.frame_set(frame)
    bpy.context.scene.render.filepath = os.path.join(output, f'{frame:03}.png')
    bpy.ops.render.render(write_still=True)
