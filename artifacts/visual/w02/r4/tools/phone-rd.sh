#!/usr/bin/env bash
# Phone reference side-by-sides + region drift: PWA bezel cropped to the screen (below the status bar), ours (390 full page) scaled to it.
S="C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/b4-w02"
cd "/c/Users/PC/Documents/Blackwellen/Built/Gala Dock/Designs/PWA"
mkdir -p "$S/rd/phone"
while IFS='|' read n f name path; do
  read w h < <(python -I -c "import cv2,numpy as np,sys; im=cv2.imdecode(np.fromfile(sys.argv[1],np.uint8),0); print(im.shape[1], im.shape[0])" "$f")
  if [ "$w" = "794" ]; then crop="42,105,752,1935"; elif [ "$w" = "850" ] || [ "$w" = "851" ]; then crop="45,110,805,1760"; else crop=""; fi
  args=(); [ -n "$crop" ] && args=(--dcrop "$crop")
  echo -n "#$n $f (${w}x${h}) vs $name: "
  python -I "$S/region.py" "$f" "$S/cap/phone/$name-390x844.png" "$S/rd/phone/$n-$name" --oboxes "$S/cap/phone/$name-390x844.boxes.json" --min 80x40 "${args[@]}" | sed 's/ | worst.*//' | sed 's/^[^:]*: //'
done < "$S/phone.txt"
