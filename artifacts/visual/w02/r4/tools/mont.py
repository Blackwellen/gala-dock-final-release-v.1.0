# mont.py out.png W "design|ours" ... : design crop of PWA screen vs our 390 full-page capture, first 1830 design px, side by side
import cv2,numpy as np,sys
out=sys.argv[1]; W=int(sys.argv[2]); cols=[]
for pair in sys.argv[3:]:
    d,o=pair.split("|")
    D=cv2.imdecode(np.fromfile(d,np.uint8),1)
    D=D[105:1935,42:752] if D.shape[1]==794 else (D[110:1760,45:805] if D.shape[1] in (850,851) else D)
    D=cv2.resize(D,(710,round(D.shape[0]*710/D.shape[1])))[:1830]
    O=cv2.imdecode(np.fromfile(o,np.uint8),1); O=cv2.resize(O,(710,round(O.shape[0]*710/O.shape[1])))[:1830]
    c=np.full((1830,1430,3),255,np.uint8); c[:D.shape[0],:710]=D; c[:O.shape[0],720:]=O; cols.append(c)
m=np.concatenate(cols,axis=1); m=cv2.resize(m,(W,round(m.shape[0]*W/m.shape[1]))); cv2.imwrite(out,m)
