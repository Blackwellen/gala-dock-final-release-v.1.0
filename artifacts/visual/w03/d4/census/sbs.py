import glob,os,re,subprocess,sys,json
M={}
for line in open('docs/release-audit/galadock/DESIGN_REFERENCE_MANIFEST.md',encoding='utf8'):
    c=[x.strip() for x in line.split('|')]
    if len(c)>7 and c[2] in ('COW','ADM','SHELL'):
        M.setdefault(c[3],c[6])
FOLD={'COW':'customer & Organizer workspace','ADM':'Admin Workspace','SHELL':'platform shell'}
def find(name):
    for f in glob.glob('Designs/**/*',recursive=True):
        if os.path.splitext(os.path.basename(f))[0]==name: return f
pairs={ # capture name -> design name
'org-001':'Gala·Dock Event Command Centre','org-002':'Gala·Dock Event Portfolio Dashboard','org-003':'Neon Nights Festival Dashboard','org-003s':'Neon Nights Festival Dashboard(1)',
'org-003o':'Neon Nights Festival Operations Dashboard','org-003m':'Neon Nights Festival Finance Dashboard','org-012':'Neon Nights Festival Page Editor','org-013':'Neon Nights Festival Venue Map Builder',
'org-014':'Neon Nights Promotion Dashboard','org-015':'Neon Nights Festival Poster Builder','orgw07-1':'Save Event as Template Dashboard','orgw03-1':'Neon Nights Ticket Setup Dashboard',
'orgw01-1':'Modern Event Creation Wizard Dashboard','org-004':'Gala·Dock Event Calendar Dashboard','org-004m':'Gala·Dock April 2025 Event Calendar','org-005':'Gala Dock Sales Dashboard',
'org-007':'Gala Dock Festival Proposal Dashboard','org-008':'Gala·Dock Venue Marketplace Dashboard','orgw04-1':'Create Marketplace Request Dashboard','org-010':'Gala Dock Marketplace Quote Comparison',
'org-011':'Gala Dock Event Promotion Dashboard','orgw05-1':'Neon Nights Promotion Dashboard2','orgw02-1':'Gala Dock Proposal Dashboard','org-016':'Gala Dock Team Dashboard','org-017':'Gala·Dock Team Profile Dashboard',
'org-018':'Gala Dock Event Finance Dashboard','org-019':'Gala Dock Invoice Dashboard','orgw06-1':'Gala·Dock Invoice Creation Dashboard','org-020':'Gala Agent Event Operations Dashboard','org-021':'Gala Dock Workspace Settings Dashboard',
'ad-001':'platform admin shell','ad-002':'Gala·Dock User Management Dashboard','ad-003':'Gala Dock User Profile Dashboard','ad-004':'Gala Dock Workspace Management Dashboard','ad-005':'Gala Dock Workspace Dashboard',
'ad-006':'GalaDock Events Admin Dashboard','ad-007':'Gala Dock Marketplace Dashboard','ad-008':'Riverside Arena Marketplace Review Dashboard','ad-009':'Gala·Dock Ticketing Dashboard','ad-010':'Commerce Operations Dashboard',
'ad-012':'Gala·Dock Trust & Safety Dashboard','ad-013':'Gala Dock Support Dashboard','ad-014':'Support Case Refund Dashboard','ad-015':'Gala Dock Partners Dashboard','ad-016':'Gala·Dock Agent Integrations Dashboard','ad-017':'Gala·Dock Analytics Dashboard','ad-018':'Gala Dock Platform Settings Dashboard'}
capdir,outdir,size=sys.argv[1],sys.argv[2],sys.argv[3]
os.makedirs(outdir,exist_ok=True)
import cv2,numpy as np
done=[]
for cap,dn in pairs.items():
    c=f'{capdir}/{cap}-{size}.jpg'
    d=find(dn)
    if not d or not os.path.exists(c): continue
    A=cv2.imdecode(np.fromfile(d,np.uint8),cv2.IMREAD_COLOR); B=cv2.imdecode(np.fromfile(c,np.uint8),cv2.IMREAD_COLOR)
    h=int(os.environ.get("SBS_H","900")); A=cv2.resize(A,(round(A.shape[1]*h/A.shape[0]),h)); B=cv2.resize(B,(round(B.shape[1]*h/B.shape[0]),h))
    S=np.hstack([A,np.full((h,8,3),(60,60,220),np.uint8),B])
    cv2.imencode('.jpg',S,[cv2.IMWRITE_JPEG_QUALITY,70])[1].tofile(f'{outdir}/{cap}.jpg'); done.append(cap)
print(len(done),done)
