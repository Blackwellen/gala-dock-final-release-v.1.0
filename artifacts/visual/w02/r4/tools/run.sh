#!/usr/bin/env bash
# Usage: run.sh <tag> name [name...]  -> captures 1536x1024 (boxes) into cap/<tag>, region diff into rd/<tag>
B="/c/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/b4-w02"
G="/c/Users/PC/Documents/Blackwellen/Built/Gala Dock"
tag=$1; shift
python -I -c "import json,sys; a=json.load(open(sys.argv[1])); n=sys.argv[3:]; json.dump([r for r in a if r['name'] in n], open(sys.argv[2],'w'))" "$B/desk.json" "$B/tmp/routes-$tag.json" "$@"
cd "$G"
mkdir -p "$B/cap/$tag" "$B/rd/$tag"
node --env-file=.env.local "$B/cap.mjs" customer "$B/cap/$tag" "$B/tmp/routes-$tag.json" 1536x1024 --boxes 2>&1 | grep -v "^$" | tail -n 30
for n in "$@"; do
  f=$(grep "^$n|" "$B/refs.txt" | cut -d'|' -f2)
  [ -z "$f" ] && continue
  python -I "$B/region.py" "$G/$f" "$B/cap/$tag/$n-1536x1024.png" "$B/rd/$tag/$n" --oboxes "$B/cap/$tag/$n-1536x1024.boxes.json" | cut -c1-400
done
