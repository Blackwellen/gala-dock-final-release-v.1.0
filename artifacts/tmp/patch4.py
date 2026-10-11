p = "src/app/provider/venues/new/steps.tsx"
s = open(p, encoding="utf8").read()
s = s[:s.index("export function StepOperations")] + open("artifacts/tmp/step4.tsx", encoding="utf8").read()
s = s.replace('import { PhotoManager } from "../_components/photo-manager";',
  'import { PhotoManager } from "../_components/photo-manager";\nimport { publishListing } from "../../listings/actions";\nimport { VenuePreview, RunCheck, Counted } from "./preview";')
s = s.replace('import { ActionForm } from "@/components/workspace/actions";', 'import type { ReactNode } from "react";\nimport { ActionForm, ActionButton } from "@/components/workspace/actions";')
s = s.replace("Accessibility, ClipboardList, Wand2,", "Accessibility, ClipboardList, Wand2, MoreVertical, Building2, UsersRound, LayoutGrid, FileCheck2,")
open(p, "w", encoding="utf8").write(s)

p = "src/app/provider/venues/new/page.tsx"
s = open(p, encoding="utf8").read()
s = s.replace('["Licences and compliance recorded", ((d.compliance as unknown[]) ?? []).length >= 2],',
  '["Required licences and compliance documents", ((d.compliance as unknown[]) ?? []).length >= 2],')
s = s.replace("<StepOperations venue={venue} back={url(3)} next={url(5)} readiness={readiness} />",
  "<StepOperations venue={venue} back={url(3)} next={url(5)} photosHref={url(5)} readiness={readiness} photos={[venue.image, ...(venue.gallery ?? [])].filter(Boolean)}\n      spaces={spaces.length} standing={spaces.reduce((n, x) => n + (x.capacity_standing ?? 0), 0)} />")
open(p, "w", encoding="utf8").write(s)

p = "src/app/provider/venues/new/actions.ts"
s = open(p, encoding="utf8").read()
old = "  const compliance = DOCS.map((name, i) => ({ name, reference: t(fd, `doc_ref_${i}`, 60), expires: t(fd, `doc_exp_${i}`, 10), file: old.find(o => o.name === name)?.file ?? null })).filter(d => d.reference || d.expires || d.file);"
assert old in s
s = s.replace(old, old + """
  // "Other certificates" (Manage documents): free-named entries; a cleared name removes the row.
  for (let k = 0; k < 20 && fd.has(`other_name_${k}`); k++) {
    const name = t(fd, `other_name_${k}`, 60);
    if (name && !DOCS.includes(name)) compliance.push({ name, reference: t(fd, `other_ref_${k}`, 60), expires: t(fd, `other_exp_${k}`, 10), file: old.find(o => o.name === name)?.file ?? null });
  }""")
s = s.replace("""  if (!r.ok) return r;
  return { ok: true, message: "Operations saved", ...(next ? { redirect: next } : {}) };""", """  if (!r.ok) return r;
  if (fd.get("_draft")) return { ok: true, message: "Draft saved" };
  return { ok: true, message: "Operations saved", ...(next ? { redirect: next } : {}) };""")
open(p, "w", encoding="utf8").write(s)
print("ok")
