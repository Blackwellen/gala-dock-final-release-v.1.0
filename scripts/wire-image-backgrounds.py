from pathlib import Path
import re

css = Path('src/app/globals.css')
s = css.read_text(encoding='utf-8')
s = re.sub(r"url\('/assets/([a-z0-9-]+)\.(png|webp)'\)", lambda m: f"var(--asset-{m[1]},url('/assets/{m[1]}.{m[2]}'))", s)
css.write_text(s, encoding='utf-8')

layout = Path('src/app/layout.tsx')
s = layout.read_text(encoding='utf-8')
s = s.replace('import type { Metadata }', 'import type { CSSProperties } from "react";\nimport regeneratedAssets from "@/lib/regenerated-assets.json";\nimport type { Metadata }')
s = s.replace('<body>', '<body style={Object.fromEntries(Object.entries(regeneratedAssets).map(([name,url])=>[`--asset-${name}`,`url(${url})`])) as CSSProperties}>')
layout.write_text(s, encoding='utf-8')

public = Path('src/components/public.tsx')
s = public.read_text(encoding='utf-8')
s = s.replace('import Link from "next/link";', 'import Link from "next/link";\nimport { assetUrl } from "@/lib/assets";')
s = s.replace('url(/assets/${kind}-hero.webp)', 'url(${assetUrl(`${kind}-hero`)})')
s = s.replace('url(/assets/${i===0?"dash-0":"interest-1"}.webp)', 'url(${assetUrl(i===0?"dash-0":"interest-1")})')
public.write_text(s, encoding='utf-8')
print('All stylesheet photo backgrounds and public hero backgrounds support regenerated assets.')
