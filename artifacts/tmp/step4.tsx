const fmtDate = (iso?: string) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";
export const COMPLIANCE_DOCS = ["Premises licence", "Public liability insurance", "Fire safety certificate", "Food hygiene rating"];

export function StepOperations({ venue, back, next, photosHref, readiness, photos, spaces, standing }: {
  venue: Listing; back: string; next: string; photosHref: string; readiness: [string, boolean][]; photos: string[]; spaces: number; standing: number;
}) {
  const d = venue.details as D, o = d.operations ?? {}, f = d.fnb ?? {}, s = d.suppliers ?? {}, a = d.access ?? {};
  const comp = d.compliance ?? [], others = comp.filter(c => !COMPLIANCE_DOCS.includes(c.name));
  const sel = (name: string, val: string | boolean | undefined, opts: string[]) => <select name={name} className="ws-select" defaultValue={String(val ?? opts[0])}>{opts.map(x => <option key={x}>{x}</option>)}</select>;
  const ready = readiness.every(([, ok]) => ok);
  const checks: [string, boolean, ReactNode?][] = [...readiness.map(([l, ok]): [string, boolean, ReactNode?] =>
    l.startsWith("Payout") && !ok ? [l, ok, <Link key="c" href="/provider/money" className="ws-btn outline vw-connect">Connect</Link>]
      : l.startsWith("Photos") ? [l, ok, <em key="n" className={`vw-photos ${ok ? "ok" : ""}`}>{photos.length}/3{ok && <CircleCheck aria-hidden="true" />}</em>] : [l, ok]), ["Ready to publish", ready]];
  const ad = d.address ?? {}, district = (ad.postcode ?? "").split(" ")[0];
  const chips = [{ icon: <Building2 aria-hidden="true" />, label: "Venue" }, { icon: <MapPin aria-hidden="true" />, label: [ad.city ?? venue.city, district].filter(Boolean).join(", ") || "Location not set" },
    ...(standing ? [{ icon: <UsersRound aria-hidden="true" />, label: `${standing.toLocaleString("en-GB")} standing` }] : []), { icon: <LayoutGrid aria-hidden="true" />, label: `${spaces} space${spaces === 1 ? "" : "s"}` }];
  return <ActionForm action={saveOperations.bind(null, venue.id, next)} className="vw vw-s4">
    <section className="ws-panel vw-ops"><div className="vw-sec-h"><span className="vw-ic"><Truck aria-hidden="true" /></span><div><h2>Access &amp; setup</h2><p>Define how suppliers and guests access, load in and set up at your venue.</p></div></div>
      <div className="vw-ops-grid"><div className="vw-ops-fields">
        <label>Access type{sel("access_type", o.access_type, ["Street access + loading bay", "Street access only", "Loading dock", "Restricted access"])}</label>
        <div className="vw-grid2"><label>Load in time (from){sel("load_in", o.load_in, ["2 hours before", "1 hour before", "3 hours before", "Morning of event"])}</label>
          <label>Load out time (by){sel("load_out", o.load_out, ["2 hours after", "1 hour after", "Next morning"])}</label></div>
        <label>Access notes<Counted name="access_notes" rows={4} max={500} defaultValue={String(o.access_notes ?? "")} /></label></div>
        <div className="vw-toggles"><Toggle name="f_parking" label="On-site parking" on={o.parking as boolean} /><Toggle name="f_loading" label="Loading bay" on={o.loading_bay as boolean} /><Toggle name="f_lift" label="Lift access" on={o.lift as boolean} />
          <Toggle name="f_stairs" label="Stair access" on={o.stairs as boolean} /><Toggle name="f_247" label="24/7 access" on={o.always_open as boolean} /></div></div></section>
    <section className="ws-panel vw-fnb"><div className="vw-sec-h"><span className="vw-ic"><UtensilsCrossed aria-hidden="true" /></span><div><h2>Food &amp; beverage / bar</h2><p>Set your catering, bar and beverage options.</p></div></div>
      <div className="vw-grid2"><label>In-house catering{sel("catering", f.catering, ["Available", "Not available", "Preferred partner"])}</label><label>Bar facilities{sel("bar", f.bar, ["Full bar (licensed)", "Beer & wine", "No bar"])}</label>
        <label>External catering permitted{sel("external_catering", f.external_catering, ["Allowed with approval", "Allowed", "Not permitted"])}</label><label>Corkage policy{sel("corkage", f.corkage, ["Not permitted", "Permitted (fee)", "Permitted (free)"])}</label></div>
      <div className="vw-grid2 vw-tg"><Toggle name="cash_bar" label="Cash bar" on={f.cash_bar as boolean} /><Toggle name="drink_packages" label="Pre-paid drink packages" on={f.drink_packages as boolean} /></div>
      <label>F&amp;B notes<Counted name="fnb_notes" rows={2} max={500} defaultValue={String(f.notes ?? "")} /></label></section>
    <aside className="vw-side">
      <VenuePreview photos={photos} name={venue.name} chips={chips} editHref={photosHref} publicHref={venue.published && venue.slug ? `/venues/${venue.slug}` : null} />
      <section className="ws-panel vw-ready"><div className="vw-ready-h"><h2><Sparkles aria-hidden="true" />Gala Agent readiness check</h2><RunCheck /></div>
        <ul>{checks.map(([l, ok, extra]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span>{extra}</li>)}</ul>
        {ready ? <p className="vw-ready-ok"><CircleCheck aria-hidden="true" /><span><b>Ready to publish</b><small>Your venue meets all marketplace requirements and is ready to be published.</small></span></p>
          : <p className="vw-ready-no"><CircleAlert aria-hidden="true" /><span><b>Not ready yet</b><small>Finish the items above — publishing re-runs these checks.</small></span></p>}
        {venue.published ? <Link href={`/provider/venues/${venue.id}`} className="ws-btn primary vw-publish">Live on marketplace<ArrowRight aria-hidden="true" /></Link>
          : <ActionButton variant="primary" className="vw-publish" action={publishListing} args={[venue.id]}>Publish venue<ArrowRight aria-hidden="true" /></ActionButton>}
        <button type="submit" name="_draft" value="1" className="ws-btn outline vw-draft"><Save aria-hidden="true" />Save as draft</button></section>
    </aside>
    <section className="ws-panel vw-docs"><div className="vw-sec-h"><span className="vw-ic"><FileText aria-hidden="true" /></span><div><h2>Licences &amp; compliance</h2><p>Add required licences, safety certificates and compliance details.</p></div></div>
      <ul>{COMPLIANCE_DOCS.map((n, i) => { const x = comp.find(c => c.name === n), st = x?.file ? "up" : x?.reference || x?.expires ? "added" : "";
        return <li key={n}><details><summary><span className={`vw-doc-ic ${st}`}><FileCheck2 aria-hidden="true" /></span><b>{n}</b>
          <span className={`vw-doc ${st}`}>{x?.file ? "Uploaded" : st ? "Added" : "Missing"}</span>
          <span className="vw-doc-exp">{x?.expires ? `Expires ${fmtDate(x.expires)}` : x?.reference || "Not recorded"}</span>
          <span className="vw-doc-more" aria-label={`Edit ${n}`}><MoreVertical aria-hidden="true" /></span></summary>
          <div className="vw-doc-edit"><input name={`doc_ref_${i}`} placeholder={n === "Food hygiene rating" ? "Rating, e.g. 5 (Very Good)" : "Reference"} defaultValue={x?.reference ?? ""} aria-label={`${n} reference`} maxLength={60} />
            <input name={`doc_exp_${i}`} type="date" defaultValue={x?.expires ?? ""} aria-label={`${n} expiry`} /></div></details></li>; })}
        <li><details className="vw-other"><summary><span className="vw-doc-ic"><FileText aria-hidden="true" /></span><b>Other certificates</b><span className="vw-doc added">{others.length} document{others.length === 1 ? "" : "s"}</span>
          <span className="ws-btn outline vw-manage">Manage documents</span></summary>
          <div className="vw-doc-others">{[...others, { name: "", reference: "", expires: "" }].map((x, k) => <div key={k}>
            <input name={`other_name_${k}`} placeholder="Certificate name" defaultValue={x.name} maxLength={60} aria-label={`Other certificate ${k + 1} name`} />
            <input name={`other_ref_${k}`} placeholder="Reference" defaultValue={x.reference ?? ""} maxLength={60} aria-label={`Other certificate ${k + 1} reference`} />
            <input name={`other_exp_${k}`} type="date" defaultValue={x.expires ?? ""} aria-label={`Other certificate ${k + 1} expiry`} /></div>)}
            <small>Clear a name to remove that certificate, then save.</small></div></details></li></ul></section>
    <section className="ws-panel vw-sup"><div className="vw-sec-h"><span className="vw-ic"><Users2 aria-hidden="true" /></span><div><h2>Supplier rules</h2><p>Set rules for external suppliers, equipment and services.</p></div></div>
      <div className="vw-grid2"><label>Preferred supplier list{sel("preferred", s.preferred, ["Recommended only", "Mandatory", "None"])}</label><label>External suppliers{sel("external", s.external, ["Allowed with approval", "Allowed", "Not permitted"])}</label>
        <label>Equipment hire{sel("equipment", s.equipment, ["Allowed", "Approved suppliers only", "Not permitted"])}</label><label>Noise restrictions{sel("noise", s.noise, ["Standard (11pm cut-off)", "Strict (10pm cut-off)", "None"])}</label></div>
      <label>Supplier notes<Counted name="supplier_notes" rows={2} max={500} defaultValue={s.notes ?? ""} /></label></section>
    <section className="ws-panel vw-acc"><div className="vw-sec-h"><span className="vw-ic"><Accessibility aria-hidden="true" /></span><div><h2>Accessibility &amp; inclusion</h2><p>Provide accessibility information for guests and staff.</p></div></div>
      <div className="vw-acc-grid"><div className="vw-grid2 vw-tg"><Toggle name="a_stepfree" label="Step-free access" on={a.step_free as boolean} /><Toggle name="a_loop" label="Hearing loop" on={a.hearing_loop as boolean} />
        <Toggle name="a_toilets" label="Accessible toilets" on={a.toilets as boolean} /><Toggle name="a_parking" label="Accessible parking" on={a.parking as boolean} /><Toggle name="a_lift" label="Lift access" on={a.lift as boolean} /><Toggle name="a_assist" label="Assistance available" on={a.assistance as boolean} /></div>
        <label>Accessibility notes<Counted name="a_notes" rows={4} max={500} defaultValue={String(a.notes ?? "")} /></label></div></section>
    <section className="ws-panel vw-notes"><div className="vw-sec-h"><span className="vw-ic"><ClipboardList aria-hidden="true" /></span><div><h2>Operational notes</h2><p>Add any additional operational information.</p></div></div>
      <Counted name="ops_notes" rows={3} max={500} defaultValue={String(o.notes ?? "")} placeholder="Setup time, turnaround requirements, waste management, security requirements and any other operational details." label="Operational notes" /></section>
    <Foot back={back} next="Next: Media & Details" step={4} />
  </ActionForm>;
}
