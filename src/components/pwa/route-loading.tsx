/** Server-rendered, lightweight loading state. Shared layout and navigation stay interactive. */
export default function PwaRouteLoading() {
 return <section className="pwa-route-state pwa-route-loading" aria-busy="true" aria-label="Loading page"><p role="status">Loading your page…</p><div className="pwa-loading-line" aria-hidden="true"/><div className="pwa-loading-grid" aria-hidden="true">{[0,1,2].map(i=><div key={i}/>)}</div></section>;
}
