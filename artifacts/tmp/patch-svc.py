p = "src/app/provider/services/new/steps.tsx"
s = open(p, encoding="utf8").read()

s = s.replace('import { RowMenu } from "../../_components/row-menu";',
  'import { RowMenu } from "../../_components/row-menu";\nimport { Counted } from "../../venues/new/preview";')
s = s.replace("Percent, Ban, Boxes, Wrench, Calendar, MessageSquare, Plus } from \"lucide-react\";",
  "Percent, Ban, Boxes, Wrench, Calendar, MessageSquare, Plus, MoreVertical, FileCheck2 } from \"lucide-react\";")

# Agent card: suggestions are statements about the current selection, each marked done/not done.
old_agent = s[s.index("const Agent = ("):s.index("export function SvcStep1")]
s = s.replace(old_agent, '''const Agent = ({ items, title = "Based on your selection, I suggest:", goal, cta = "Ask Gala Agent" }: { items: (string | [string, boolean])[]; title?: string; goal: string; cta?: string }) =>
  <section className="ws-panel vw-agent svw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
    <div className="sb-agent-box"><span className="svw-agent-av" aria-hidden="true"><Sparkles /></span><p>{title}</p>
      <ul>{items.map(i => { const [l, ok] = typeof i === "string" ? [i, true] : i; return <li key={l} className={ok ? "" : "todo"}>{ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{l}</li>; })}</ul>
      <Link href={`/provider/agent?goal=${encodeURIComponent(goal)}`} className="ws-btn outline block sm">{cta}</Link></div></section>;

''')

old1 = s[s.index("export function SvcStep1"):s.index("export function SvcStep2")]
new1 = '''const fmtDay = (iso?: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";
const DELIVERY: Record<string, string> = { onsite: "On-site", remote: "Remote/Online", hybrid: "Hybrid" };

export function SvcStep1({ s, svc, next }: { s: Listing | null; svc: Svc; next: string }) {
  const cov = svc.coverage ?? {}, base = cov.base ?? s?.city ?? "London", photos = s ? [s.image, ...(s.gallery ?? [])].filter(Boolean) : [];
  const creds = ["Public liability insurance", "PAT testing (equipment)", "DBS check (if required)", "Other certifications"];
  const types = svc.event_types ?? [];
  const pl = (svc.credentials ?? []).some(c => c.name.startsWith("Public liability") && (c.reference || c.expires));
  const covText = (cov.mode ?? "local") === "local" ? `${cov.radius_miles ?? 50} miles from ${base}` : cov.mode === "areas" ? (cov.areas || "Specific areas — none listed yet") : cov.mode === "national" ? "National" : "International";
  const suggestions: [string, boolean][] = [[`Category: ${s?.category?.replace(" > ", " & ") || "choose the most specific one"}`, !!s?.category],
    [types.length ? `Event types: ${types.slice(0, 4).join(", ")}${types.length > 4 ? ` +${types.length - 4}` : ""}` : "Pick 3–6 event types you’re best at", types.length >= 3 && types.length <= 6],
    [`Delivery mode: ${DELIVERY[svc.delivery ?? "onsite"]}`, true], [`Coverage: ${covText}`, (cov.mode ?? "local") !== "areas" || !!cov.areas],
    ["Include equipment options and add-on packages", (svc.addons ?? []).length > 0], [pl ? "Public liability insurance added" : "Add public liability insurance", pl]];
  return <div className="vw svw-s1">
    <ActionForm action={saveServiceBasics.bind(null, s?.id ?? null, next)} className="vw-contents">
      <section className="ws-panel svw-basic"><h2>Basic information</h2><p>Tell us what service you provide and how it can be used.</p>
        <div className="vw-grid2"><label>Service name <i>*</i><input name="name" defaultValue={s?.name ?? ""} required minLength={2} maxLength={100} /></label>
          <label>Category <i>*</i><select name="category" className="ws-select" defaultValue={s?.category && CATEGORIES.includes(s.category) ? s.category : CATEGORIES[0]}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <label className="svw-desc">Short description <i>*</i><Counted name="description" rows={4} max={500} defaultValue={s?.description ?? ""} label="Short description" /></label></section>
      <section className="ws-panel svw-delivery"><h2>Delivery mode</h2><p>How is your service delivered?</p>
        <div className="svw-modes">{([["onsite", House, "On-site", "I travel to the event"], ["remote", Monitor, "Remote/Online", "Delivered virtually"], ["hybrid", Users, "Hybrid", "Both on-site and online"]] as const).map(([k, I, l, sub]) =>
          <label key={k}><input type="radio" name="delivery" value={k} defaultChecked={(svc.delivery ?? "onsite") === k} /><I aria-hidden="true" /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
        <div className="svw-cov"><div><h2 className="svw-h2b">Coverage &amp; travel area</h2><p>Where do you operate?</p>
          <div className="svw-covmodes">{([["local", "Local area", "Set a service radius from your base location"], ["areas", "Specific areas", "Choose cities, regions or postcodes"], ["national", "National", "Available across the country"], ["international", "International", "Available worldwide"]] as const).map(([k, l, sub]) =>
            <label key={k}><input type="radio" name="coverage" value={k} defaultChecked={(cov.mode ?? "local") === k} /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
          <label className="svw-areas">Specific areas<input name="areas" defaultValue={cov.areas ?? ""} placeholder="e.g. Surrey, Kent, SE1, Oxford" maxLength={300} /></label></div>
          <div className="svw-covmap"><div className="svw-radius"><label>Radius (miles)<input name="radius" type="number" min={1} max={500} defaultValue={cov.radius_miles ?? 50} /></label>
            <label>Base<select name="base" className="ws-select" defaultValue={base}>{Object.keys(UK_PLACES).map(p => <option key={p}>{p}</option>)}</select></label></div>
            <CoverageMap base={base} radiusMiles={cov.radius_miles ?? 50} width={206} height={204} /></div></div></section>
      <section className="ws-panel svw-types"><h2>Event types</h2><p>Select the types of events this service is suitable for.</p>
        <div className="svw-checks">{EVENT_TYPES.map(t => <label key={t}><input type="checkbox" name="event_types" value={t} defaultChecked={types.includes(t)} />{t}</label>)}</div></section>
      <section className="ws-panel vw-docs svw-creds"><h2>Credentials &amp; trust</h2><p>Add relevant qualifications, insurance and certifications.</p>
        <ul>{creds.map((c, i) => { const x = (svc.credentials ?? []).find(y => y.name === c), st = x?.reference || x?.expires ? "added" : "";
          return <li key={c}><details><summary><span className={`vw-doc-ic ${st || (i === 2 ? "" : "")}`}>{i === 3 ? <FileText aria-hidden="true" /> : i === 2 ? <ShieldCheck aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}</span><b>{c}</b>
            <span className={`vw-doc ${st}`}>{st ? "Added" : i === 2 ? "Not required" : "Missing"}</span>
            <span className="vw-doc-exp">{x?.expires ? `Expires ${fmtDay(x.expires)}` : x?.reference || ""}</span>
            <span className="vw-doc-more" aria-label={`Edit ${c}`}><MoreVertical aria-hidden="true" /></span></summary>
            <div className="vw-doc-edit"><input name={`cred_ref_${i}`} defaultValue={x?.reference ?? ""} placeholder={i === 0 ? "Cover amount or policy number" : "Reference"} aria-label={`${c} reference`} maxLength={60} />
              <input name={`cred_exp_${i}`} type="date" defaultValue={x?.expires ?? ""} aria-label={`${c} expiry`} /></div></details></li>; })}</ul></section>
      <Foot next="Next: Pricing & Packages" step={1} />
    </ActionForm>
    <aside className="vw-side svw-side1">
      <Agent goal={`Help me set up ${s?.name ?? "my new service"}`} items={suggestions} cta="Review with Gala Agent" />
      <section className="ws-panel vw-tips svw-tips"><h3><Lightbulb aria-hidden="true" />Tips</h3><ul>{["Choose the most specific category for better visibility.", "Add clear photos and a short video.", "Include any required certifications for your category.", "Set an accurate coverage area to receive relevant opportunities."].map(t => <li key={t}>{t}</li>)}</ul></section>
    </aside>
    <div className="svw-media">{s ? <PhotoManager venueId={s.id} initial={photos} strip /> : <section className="ws-panel vw-strip"><h2>Service images &amp; video</h2><p>Save the basics first, then add photos that show your work.</p></section>}</div>
  </div>;
}

'''
s = s.replace(old1, new1)
open(p, "w", encoding="utf8").write(s)
print("ok")
