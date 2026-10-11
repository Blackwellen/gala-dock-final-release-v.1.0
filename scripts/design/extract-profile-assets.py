"""Extract venue/service profile photos from image-gen-1 (venue) and image-gen-2 (service) designs (1448x1086 native).
Baked UI (badges, arrows, counters, play button, pills) is inpainted. Usage: python scripts/design/extract-profile-assets.py"""
import cv2, numpy as np, os

D = 'Designs/customer & Organizer workspace/'
OUT = 'public/assets/gd/profile'
os.makedirs(OUT, exist_ok=True)

def load(name):
    return cv2.imdecode(np.fromfile(D + name, np.uint8), cv2.IMREAD_COLOR)

def save(im, box, name, masks=()):
    x0, y0, x1, y1 = box
    c = im[y0:y1, x0:x1].copy()
    if masks:
        m = np.zeros(c.shape[:2], np.uint8)
        for a, b, cc, d in masks:
            m[max(0, b - y0):max(0, d - y0), max(0, a - x0):max(0, cc - x0)] = 255
        c = cv2.inpaint(c, m, 6, cv2.INPAINT_TELEA)
    cv2.imencode('.webp', c, [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(f'{OUT}/{name}.webp')

V = load('image-gen-1(20261009-171511).png')
save(V, (229, 103, 721, 336), 'venue-main', [(234, 112, 340, 140), (234, 214, 272, 250), (678, 214, 716, 250), (626, 300, 708, 328)])
save(V, (727, 103, 910, 211), 'venue-g1')
save(V, (916, 103, 1088, 211), 'venue-g2', [(1010, 108, 1086, 142)])
save(V, (727, 216, 910, 336), 'venue-g3')
save(V, (916, 216, 1088, 336), 'venue-g4', [(950, 298, 1084, 330)])
save(V, (229, 689, 491, 780), 'space-grand-hall')
save(V, (513, 689, 775, 780), 'space-riverside-terrace')
save(V, (796, 689, 1073, 780), 'space-garden-pavilion')

S = load('image-gen-2(20261009-171514).png')
save(S, (228, 109, 750, 321), 'service-main', [(462, 186, 512, 238), (604, 280, 744, 314)])
save(S, (759, 109, 939, 230), 'service-g1')
save(S, (947, 109, 1080, 193), 'service-g2')
save(S, (759, 236, 939, 321), 'service-g3')
save(S, (947, 200, 1080, 321), 'service-g4')
save(S, (229, 338, 343, 452), 'service-logo')
save(S, (472, 578, 796, 795), 'service-signature')
save(S, (240, 853, 510, 923), 'pkg-festival-essentials', [(244, 858, 328, 878)])
save(S, (525, 853, 794, 923), 'pkg-signature-dining', [(530, 858, 594, 878)])
save(S, (809, 853, 1078, 923), 'pkg-bespoke-experience', [(814, 858, 884, 878)])
print('ok')
