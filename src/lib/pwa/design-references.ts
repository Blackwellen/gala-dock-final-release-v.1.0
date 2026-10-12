import inventory from '../../../docs/pwa/design-inventory.json';

/** Visually reviewed PWA references, shared with the existing development overlay tools. */
export const pwaDesignMap=inventory.map(r=>({
  file:r.file.replace(/^Designs\//,''),label:`PWA ${r.pageId} · ${r.file.split('/').at(-1)?.replace(/\.png$/,'')}`,
  route:r.route,primary:r.primary,
}));
export function pwaDesignFor(pathname:string,search:URLSearchParams){
  return pwaDesignMap.find(r=>{
    if(!r.primary)return false;
    const [route,query]=r.route.split('?');
    const pattern='^'+route.split('/').map(s=>s.startsWith('[')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$';
    return new RegExp(pattern).test(pathname)&&[...new URLSearchParams(query).entries()].every(([k,v])=>search.get(k)===v);
  })??null;
}
