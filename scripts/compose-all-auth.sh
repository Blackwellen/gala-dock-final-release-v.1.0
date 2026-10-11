# Composes story art for every auth screen from its design (tight text masks).
set -e
declare -A REF=([login]="image-gen-1(10)" [register]="image-gen-2(10)" [verify-email]="image-gen-3(10)" [forgot-password]="image-gen-4(10)" [reset-password]="image-gen-5(10)" [mfa]="image-gen-6(10)" [invite]="image-gen-7(9)" [access]="image-gen-8(7)")
declare -A ART=([login]=login [register]=register [verify-email]=verify-email [forgot-password]=forgot-password [reset-password]=reset-password [mfa]=mfa [invite]=invite [access]=secure-access)
for s in "${!REF[@]}"; do
  EXTRA_BOXES='[{"x":70,"y":40,"w":240,"h":62},{"x":70,"y":922,"w":500,"h":64}]' MSYS_NO_PATHCONV=1 node scripts/compose-story.mjs "/preview/$s" "Designs/auth & onboarding/${REF[$s]}.png" .auth-story \
    ".auth-story>.logo,.story-content .eyebrow,.story-content h1,.story-description,.story-features .icon-tile,.story-features b,.story-features p,.story-stats b,.story-stats span" \
    "public/assets/regenerated/auth-art-${ART[$s]}.png" "public/assets/story/auth-${ART[$s]}.png" 1448 1086
done
