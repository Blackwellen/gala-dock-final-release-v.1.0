from pathlib import Path
p = Path('src/components/public.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('import { assetUrl }', 'import { assetUrl, hasRegeneratedAsset }')
s = s.replace('className={`public-hero hero-${kind}`}', 'className={`public-hero hero-${kind} ${hasRegeneratedAsset(`${kind}-hero`)?"regenerated-hero":""}`}')
p.write_text(s, encoding='utf-8')
p = Path('src/app/globals.css')
with p.open('a', encoding='utf-8') as f:
    f.write('\n.hero-event.regenerated-hero{background-image:linear-gradient(0deg,#000e,transparent 90%),var(--asset-event-hero)!important;background-size:cover;background-position:center}\n')
