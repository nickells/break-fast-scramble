#!/bin/sh
# Rebuilds assets/drummer.webp (one 232x180 cell per unique drawing, 16 per row) from the source animation.
# The drawing ids, their labels and the frame sequence are embedded in js/drummer.js; rerun drawings.js only if the
# crop changes, and relabel by eye if the ids move.  usage: tools/drummer/build.sh path/to/video.webm
set -e
V="$1"; T=$(mktemp -d); D=$(dirname "$0")
CROP="crop=366:284:24:526"   # the drummer, his kit and both cymbals; leaves out the caption and the sampler figure
ffmpeg -hide_banner -loglevel error -y -i "$V" -vf "select='gte(n\,226)',$CROP,format=gray" -fps_mode vfr -f rawvideo "$T/frames.gray"
node "$D/drawings.js" "$T/frames.gray" > "$T/drawings.json"
EXPR=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).uniq.map(f=>"eq(n\\,"+f+")").join("+"))' "$T/drawings.json")
ffmpeg -hide_banner -loglevel error -y -i "$V" -vf "select='$EXPR',$CROP,scale=232:180:flags=lanczos,format=gray,tile=16x8:color=white" \
  -frames:v 1 -fps_mode vfr -c:v libwebp -quality 80 -compression_level 6 assets/drummer.webp
cp "$T/drawings.json" "$D/drawings.json"; rm -rf "$T"
echo "assets/drummer.webp rebuilt; ids in $D/drawings.json"
