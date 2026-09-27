# Vertical depth crop fixture

`focal-block.png` is a synthetic 640×360 landscape source with an orange block
to the right of center. The vertical-image browser smoke uses it with normalized
focus `[0.76, 0.5]` and checks that the 1080×1920 crop keeps the block in view.

Recreate the source with:

```sh
ffmpeg -f lavfi -i 'color=c=0x303840:s=640x360:r=1:d=1' \
  -vf 'drawbox=x=430:y=65:w=145:h=230:color=0xe8ac72:t=fill' \
  -frames:v 1 focal-block.png
```
