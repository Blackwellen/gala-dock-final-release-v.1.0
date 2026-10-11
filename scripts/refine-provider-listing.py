from pathlib import Path
p = Path('src/components/onboarding.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('Store, Globe,', 'Store, Layers, Globe,')
s = s.replace('<span>{images&&<IconTile', '<span>{!images&&name==="offer_kind"&&<IconTile icon={i===0?Building2:i===1?Store:Layers}/>} {images&&<IconTile')
s = s.replace('<b>{item}</b>{selected.includes(item)', '<b>{item}{!images&&name==="offer_kind"&&<small>{["Event spaces, halls, unique locations","Catering, photography, DJs, decor, staffing etc.","I’ll add a venue and service"][i]}</small>}</b>{selected.includes(item)')
s = s.replace('<Photo name="onboard-venue"/><h4>Riverside Events Venue', '<Photo name="venue-2"/><h4>Riverside Events Venue')
s = s.replace('["onboard-venue","venue-1","venue-2","experience-2"]', '["venue-2","venue-1","experience-0","venue-5"]')
s = s.replace('step==="organizer/events"?"The Gala Agent can recommend', 'step==="provider/listing"?"The Gala Agent can write your venue description, suggest the best event types, features and pricing based on similar venues.":step==="organizer/events"?"The Gala Agent can recommend')
features = '''
const featureDescriptions: Record<string,string[]> = {
 "organizer/business":["From intimate gatherings to large festivals","Find and book trusted partners","Reach more people across multiple channels","Get help from the Gala Agent"],
 "organizer/events":["From private events to large festivals","Public events, private functions or both","Run events across multiple locations","Access the marketplace from day one"],
 "organizer/brand":["Use your logo and colours across your events and communications","Connect payments and set your defaults","Connect your email and set notifications","You can update all of these settings later in your workspace"],
 "organizer/team":["Bring your team and set permissions","Choose your event owner and notifications","Get started with an event template","Start planning, promote and sell tickets"],
 "provider/business":["Get discovered by event organisers","Handle enquiries, quotes and payments","Set your locations, capacity and services","Let the Gala Agent recommend the best setup for your business"],
 "provider/listing":["Create a venue, service or both","Help organisers understand your offer","You can change these anytime","Let the Gala Agent help you write descriptions and suggest tags"],
 "provider/rules":["Instant, request or enquiry","Build trust with organisers","Avoid clashes and set clear expectations","Secure dates and reduce no-shows","You can customise per listing later"],
 "provider/publish":["Add insurance, licenses and credentials","Connect your payout method","Bring collaborators and set permissions","See how your listing will appear","Start receiving enquiries and bookings"],
 "preferences":["From local experiences to global shows","Explore unique spaces in your area","Based on your interests"]
};
'''
s = s.replace('const interests=', features+'\nconst interests=')
old='["From intimate gatherings to large festivals","Find and book trusted partners","Reach more people across multiple channels","Get help from the Gala Agent","You can customise these per listing later"][i]'
s = s.replace(old, 'featureDescriptions[step]?.[i]')
p.write_text(s, encoding='utf-8')
p = Path('src/app/globals.css')
with p.open('a',encoding='utf-8') as f:
    f.write('''
@media(min-width:1251px){
.onboarding-page:not(.experience-page) .setup-story-content{padding-top:30px}
.onboarding-page:not(.experience-page) .setup-steps{margin-bottom:18px}
.setup-provider-listing .setup-subtitle{font-size:14px;line-height:22px;margin-bottom:14px}
.setup-provider-listing .setup-form>h2{font-size:42px}
.setup-provider-listing .setup-form>.setup-panel:first-of-type{padding:12px 18px}
.setup-provider-listing .setup-form>.setup-panel:first-of-type .choice-group{margin:7px 0 0;gap:10px}
.setup-provider-listing .setup-form>.setup-panel:first-of-type .choice>span{min-height:75px;padding:10px 14px;text-align:left;justify-content:flex-start}
.setup-provider-listing .setup-form>.setup-panel:first-of-type .choice>span:before,.setup-provider-listing .setup-form>.setup-panel:first-of-type .choice>span>svg{display:none}
.setup-provider-listing .choice>span>b>small{display:block;font-size:10px;margin-top:5px;color:#6a7294;line-height:1.5;font-weight:400}
.setup-provider-listing .setup-panel h3{font-size:14px}
.setup-provider-listing .setup-panel>.two-columns{grid-template-columns:1.18fr 1fr;gap:8px 15px}
.setup-provider-listing .setup-panel .field{gap:5px}
.setup-provider-listing .setup-panel .field>span{font-size:12px}
.setup-provider-listing .setup-panel .field input,.setup-provider-listing .setup-panel .field select{height:36px;min-height:36px;padding:8px 14px}
.setup-provider-listing .setup-panel .field textarea{min-height:74px}
.setup-provider-listing .setup-panel .two-columns .two-columns>.field{position:relative;gap:0;margin-top:0}
.setup-provider-listing .setup-panel .two-columns .two-columns>.field>span{position:absolute;top:9px;left:14px;font-size:11px;font-weight:400;color:#687193}
.setup-provider-listing .setup-panel .two-columns .two-columns>.field input{height:56px;padding-top:25px}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice-group{gap:5px 6px;margin:8px 0 4px}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice{flex:none;border-radius:18px;background:#f0f3fc;border-color:transparent}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice.selected{background:#e8f1ff}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice>span{min-height:24px;padding:4px 8px;font-size:10px;white-space:nowrap}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice>span:before{display:none}
.setup-provider-listing .setup-panel:not(:first-of-type) .choice>span>svg{width:12px;height:12px}
.setup-provider-listing .photo-upload-row>*{height:101px}
.setup-provider-listing .setup-actions{margin-top:12px}
}
''')
print('Rebuilt offer choices, venue field density, photo selection and stage-specific supporting copy.')
