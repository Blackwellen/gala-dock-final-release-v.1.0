"""Extract Plan-an-Event wizard tile photos from the CU-W01 designs (1536 reference). Checkbox overlays are inpainted.
Usage: python scripts/design/extract-plan-tiles.py"""
import cv2, numpy as np, os

D = 'Designs/customer & Organizer workspace/'
OUT = 'public/assets/gd/plan'
os.makedirs(OUT, exist_ok=True)
def load(name):
    im = cv2.imdecode(np.fromfile(D + name, np.uint8), cv2.IMREAD_COLOR)
    return im if im.shape[1] == 1536 else cv2.resize(im, (1536, 1024), interpolation=cv2.INTER_AREA)

def save(im, box, name, check=None):
    x0, y0, x1, y1 = box
    c = im[y0:y1, x0:x1].copy()
    if check:  # (x0, y0, x1, y1) in page coords — checkbox to inpaint
        m = np.zeros(c.shape[:2], np.uint8); a, b, cc, d = check
        m[max(0, b - y0):d - y0, max(0, a - x0):cc - x0] = 255
        c = cv2.inpaint(c, m, 5, cv2.INPAINT_TELEA)
    cv2.imencode('.webp', c, [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(f'{OUT}/{name}.webp')

A = load('GalaDock Event Planning Wizard.png')
for n, b in {'wedding': (330, 312, 494, 388), 'birthday': (515, 310, 689, 388), 'corporate': (706, 310, 880, 388), 'party': (898, 310, 1071, 388),
             'festival': (325, 442, 472, 518), 'nightclub': (488, 442, 623, 518), 'private_dinner': (639, 442, 774, 518), 'childrens_party': (790, 442, 925, 518)}.items():
    save(A, b, f'type-{n}', (466, 314, 494, 340) if n == 'wedding' else None)
save(A, (1114, 166, 1496, 329), 'side-wedding')

C = load('Gala Dock Event Planning Dashboard.png')
xs = [(317, 435), (449, 566), (580, 697), (711, 829), (843, 960), (974, 1091)]
for (x0, x1), n in zip(xs, ['venue', 'food', 'drinks', 'entertainment', 'media', 'styling']):
    save(C, (x0, 432, x1, 501), f'cat-{n}', (x1 - 28, 432, x1, 458))
for (x0, x1), n in zip(xs, ['transport', 'accommodation', 'security', 'staff', 'invitations', 'activities']):
    save(C, (x0, 594, x1, 661), f'cat-{n}', (x1 - 28, 594, x1, 620))
for (x0, x1), n in zip([(322, 431), (453, 562), (583, 693), (713, 823), (846, 956)], ['classic', 'modern', 'fun', 'luxury', 'rustic']):
    save(C, (x0, 762, x1, 818), f'style-{n}')

B = load('GalaDock Event Planning Dashboard.png')
save(B, (1146, 157, 1496, 318), 'side-insights')
print('ok')
