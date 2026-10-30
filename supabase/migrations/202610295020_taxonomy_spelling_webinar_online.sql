-- Master-data mirror (lane D, 2026-10-30): the wizard completeness sweep added ["webinar", "Webinar (online)"] to plan.more_occasions in
-- src/lib/master-data/catalog.ts, so the TypeScript catalog now derives the spelling "webinar (online)" → event_type/webinar. Mirror it so
-- taxonomy_resolve() (SQL) and resolveTerm() (TS) agree. Additive and idempotent; no term, label or stored value changes.
insert into public.taxonomy_spellings(taxonomy, spelling, key) values ('event_type', 'webinar (online)', 'webinar')
  on conflict (taxonomy, spelling) do nothing;
