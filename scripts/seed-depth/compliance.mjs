// Q26 (+ W11): realistic compliance readiness for the demo festival / concert / nightlife / charity events instead of walls of
// blockers — licensing profile, granted licences (venue premises licence, DPS, late-night refreshment, PRS/PPL, SIA door team,
// event insurance), event-safety + crowd plans written by the operations lead and approved by the owner (two people), the
// accessibility summary, and a weather watch with an approved contingency plan. All through the Q26 commands as demo identities.
import { block } from "./lib.mjs";

const OWNER = "alex.events@example.com";
const AUTHOR = "ops.lead.demo@example.com";   // Priya Nair, Alex Events manager (identities.mjs)

const TARGETS = [
  // slug, outdoor, attendance, lat, lng, place, dps holder, insurer
  ["neon-nights", true, 2000, 51.5055, -0.0754, "Riverside Arena, London SE1", "Marcus Bell (Riverside Arena DPS)", "Hiscox Events"],
  ["sunset-sessions", true, 1500, 51.5426, -0.0026, "Queen Elizabeth Olympic Park, London E20", "Dana Kim", "Hiscox Events"],
  ["elite-sounds-night", false, 800, 51.5149, -0.1340, "The Echo Rooms, London W1", "Leon Hart", "Markel UK"],
  ["comedy-central-live", false, 600, 51.5072, -0.1235, "The Playhouse, London WC2", "Ava Reid", "Markel UK"],
  ["warehouse-sessions-bassline", false, 1200, 53.4746, -2.2233, "Depot Mayfield, Manchester M1", "Jordan Pike", "Hiscox Events"],
  ["soho-late-lounge-fridays", false, 280, 51.5136, -0.1365, "The Velvet Room, Soho W1", "Sofia Marin", "Markel UK"],
  ["hope-starts-here-charity-ball", false, 360, 51.5010, -0.1919, "The Grand Hall, Kensington W8", "Grand Hall Events Ltd", "Hiscox Events"],
];

const sections = (place, outdoor) => [
  { heading: "Site and capacity", body: `Licensed site at ${place}. Ingress through two screened entry lanes; occupancy counted at the gate and capped at the licensed capacity.` },
  { heading: "Evacuation", body: "Four marked fire exits kept clear; stewards on each exit; PA and radio cascade; assembly point on the public highway side." },
  { heading: "Medical and welfare", body: "St John Ambulance first-aid post by the main bar; welfare and quiet space; free drinking water points." },
  { heading: "Weather", body: outdoor ? "Met Office watch from T-72h; wind above 40 mph pauses stage use, above 50 mph triggers evacuation; heat plan with shade and water." : "Indoor venue: weather affects arrival and queuing only; covered queue lane and cloakroom." },
  { heading: "Security and drugs policy", body: "SIA door supervisors at 1:100; search on entry; zero-tolerance drugs policy with amnesty bins; Challenge 25." },
];

export async function run() {
  const lines = TARGETS.map(([slug, outdoor, att, lat, lng, place, dps, insurer]) => {
    const prof = { country: "GB", region: "England", alcohol: true, live_music: true, recorded_music: true, late_night: true, hot_food: true, children_performing: false, outdoor, expected_attendance: att,
      notes: "Demo licensing profile (Q38 depth seed)." };
    const sec = JSON.stringify(sections(place, outdoor)).replace(/'/g, "''");
    const lic = [
      ["premises_licence", "venue", "Local licensing authority", `PL-${slug.slice(0, 6).toUpperCase()}-0412`, null],
      ["alcohol_authorisation", "organizer", "Personal licence (DPS)", `DPS ${dps}`, 365],
      ["late_night_refreshment", "venue", "Local licensing authority", `LNR-${slug.slice(0, 4).toUpperCase()}-77`, 365],
      ["prs_ppl", "organizer", "PPL PRS Ltd — TheMusicLicence", `TML-${slug.slice(0, 5).toUpperCase()}-2026`, 365],
      ["sia_door_supervision", "supplier", "Security Industry Authority", "SIA ACS contractor — Sentinel Event Security Ltd", 365],
      ["event_insurance", "organizer", insurer, `EVT-${slug.slice(0, 4).toUpperCase()}-5M`, 365],
    ];
    return `
  v := pg_temp._ev('${slug}');
  if v is null then perform pg_temp._n('missing_event'); else
    perform pg_temp._as('${OWNER}');
    if not exists (select 1 from public.event_compliance_profiles where event_id = v) then
      perform public.compliance_profile_save(v, '${JSON.stringify(prof).replace(/'/g, "''")}'::jsonb); perform pg_temp._n('profiles');
    end if;
    ${lic.map(([type, holder, authority, ref, days]) => `
    if not exists (select 1 from public.event_licences where event_id = v and licence_type = '${type}') then
      r := public.licence_save(v, jsonb_build_object('licence_type', '${type}', 'holder', '${holder}', 'authority', '${authority.replace(/'/g, "''")}', 'reference', '${ref.replace(/'/g, "''")}',
        'conditions', 'Demo licence (Q38). Conditions as per the operating schedule.'), null);
      v2 := coalesce((r->>'id')::uuid, (select id from public.event_licences where event_id = v and licence_type = '${type}' order by created_at desc limit 1));
      perform public.licence_transition(v2, 'granted', 'Checked against the issued document.', jsonb_build_object('reference', '${ref.replace(/'/g, "''")}',
        'valid_from', (now() - interval '30 days')::date, 'valid_to', ${days ? `(now() + interval '${days} days')::date` : "null"}));
      perform pg_temp._n('licences_granted');
    end if;`).join("")}
    foreach t in array array['event_safety','crowd'] loop
      if not exists (select 1 from public.safety_plans where event_id = v and kind = t and status = 'approved') then
        perform pg_temp._as('${AUTHOR}');
        r := public.safety_plan_save(v, t, jsonb_build_object('title', initcap(replace(t, '_', ' ')) || ' plan — ' || (select name from public.events where id = v),
          'sections', '${sec}'::jsonb, 'stewards', greatest(4, ${att} / 100), 'first_aiders', greatest(2, ${att} / 500), 'medical_provider', 'St John Ambulance', 'review_due', (now() + interval '20 days')::date));
        v2 := (select id from public.safety_plans where event_id = v and kind = t and status = 'draft' order by version desc limit 1);
        perform public.safety_plan_submit(v2);
        perform pg_temp._as('${OWNER}');
        perform public.safety_plan_decide(v2, 'approved', 'Reviewed with the venue and the SAG advisor.');
        perform pg_temp._n('safety_plans_approved');
      end if;
    end loop;
    perform pg_temp._as('${OWNER}');
    if not exists (select 1 from public.event_accessibility where event_id = v) then
      perform public.accessibility_save(v, jsonb_build_object('step_free', true, 'accessible_toilets', greatest(2, ${att} / 250), 'changing_places', ${outdoor}, 'hearing_loop', ${!outdoor}, 'bsl_interpretation', ${slug === "neon-nights"},
        'captioning', false, 'quiet_space', true, 'assistance_dogs', true, 'accessible_seating', greatest(8, ${att} / 100), 'companion_seats', greatest(8, ${att} / 100),
        'route_note', 'Step-free route from the main entrance to the viewing platform and accessible toilets.',
        'public_summary', 'Step-free access throughout, accessible viewing platform with free companion tickets, accessible toilets, quiet space and assistance dogs welcome.'));
      perform public.accessibility_approve_summary(v);
      perform pg_temp._n('accessibility');
    end if;
    if not exists (select 1 from public.weather_watches where event_id = v) then
      perform public.weather_watch_save(v, jsonb_build_object('latitude', ${lat}, 'longitude', ${lng}, 'location_label', '${place.replace(/'/g, "''")}',
        'window_from', (select starts_at - interval '6 hours' from public.events where id = v), 'window_to', (select coalesce(ends_at, starts_at + interval '8 hours') from public.events where id = v),
        'status', 'active', 'thresholds', jsonb_build_object('wind_mph', 40, 'gust_mph', 50, 'rain_mm_h', 8, 'heat_c', 30, 'lightning', true)));
      perform pg_temp._n('weather_watches');
    end if;
    if not exists (select 1 from public.contingency_plans where event_id = v and status = 'approved') then
      r := public.contingency_plan_save(v, jsonb_build_object('trigger_kind', 'wind', 'threshold_text', 'Sustained wind above 40 mph or gusts above 50 mph',
        'action', ${outdoor ? "'shelter'" : "'delay'"}, 'action_detail', ${outdoor ? "'Pause stage use, lower banners and screens; evacuate the field if gusts exceed 50 mph.'" : "'Hold doors and open the covered queue lane; delay doors by up to 45 minutes.'"},
        'decision_owner', 'Event Safety Officer', 'decision_deadline_hours', 3, 'comms_note', 'Ticket holders get an app and email update; socials within 15 minutes.'), null);
      v2 := (select id from public.contingency_plans where event_id = v and status <> 'approved' order by created_at desc limit 1);
      perform public.contingency_plan_approve(v2);
      perform pg_temp._n('contingency_approved');
    end if;
  end if;`;
  }).join("\n");
  return block(lines);
}
