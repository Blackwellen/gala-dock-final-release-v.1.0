#!/usr/bin/env bash
# rerd.sh <tag> names... : re-run region diff on existing captures
B="/c/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/b4-w02"; G="/c/Users/PC/Documents/Blackwellen/Built/Gala Dock"; tag=$1; shift
for n in "$@"; do f=$(grep "^$n|" "$B/refs.txt" | cut -d'|' -f2); [ -f "$B/cap/$tag/$n-1536x1024.png" ] || continue
python -I "$B/region.py" "$G/$f" "$B/cap/$tag/$n-1536x1024.png" "$B/rd/$tag/$n" --oboxes "$B/cap/$tag/$n-1536x1024.boxes.json" | cut -c1-$((${W:-120})); done
