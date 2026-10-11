from pathlib import Path
p=Path('src/components/public.tsx');s=p.read_text(encoding='utf8');s=s.replace('VideoPhoto name="dash-0" title="Aftermovie 2025"','VideoPhoto name="neon-aftermovie" title="Aftermovie 2025"');p.write_text(s,encoding='utf8')
from PIL import Image
im=Image.open(next(Path('Designs/Public Pages').glob('*Neon Nights*')))
im.crop((31,437,507,563)).save('public/assets/neon-aftermovie.webp',lossless=True)
