from pathlib import Path

p = Path('src/components/onboarding.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('className={`onboarding-page ${step===', 'className={`onboarding-page setup-${step.replaceAll("/","-")} ${step===')
s = s.replace('"The Gala Agent can suggest the best settings for your location and event type, and recommend a starting setup for your workspace."', 'step==="organizer/events"?"The Gala Agent can recommend settings based on your event types, including ticketing, risk management and useful tools for your dashboard.":"The Gala Agent can suggest the best settings for your location and event type, and recommend a starting setup for your workspace."')
p.write_text(s, encoding='utf-8')

p = Path('src/app/globals.css')
with p.open('a', encoding='utf-8') as f:
    f.write('''
@media(min-width:1251px){
.onboarding-page:not(.setup-organizer-business):not(.experience-page) .setup-progress-row{margin-left:2px;margin-top:0;margin-bottom:23px}
.onboarding-page:not(.setup-organizer-business):not(.experience-page) .setup-form>h2{margin-left:2px;font-size:40px}
.onboarding-page:not(.setup-organizer-business):not(.experience-page) .setup-subtitle{margin-left:2px;font-size:15.5px;line-height:24px;margin-bottom:18px}
.setup-organizer-events .setup-group{margin:24px 7px 12px}
.setup-organizer-events .setup-option-grid{margin:4px 7px 0;column-gap:28px}
.setup-organizer-events .setup-option-grid>div{padding-top:12px}
.setup-organizer-events .setup-option-grid .choice>span{min-height:49px;padding:9px 6px;white-space:nowrap}
.setup-organizer-events .setup-option-grid .choice>span>svg{display:none}
.setup-organizer-events .setup-option-grid .choice-group{margin-bottom:12px}
.setup-organizer-events .setup-assistant>.setup-panel:first-child{border-bottom:0;border-radius:10px 10px 0 0;margin-bottom:0;padding-bottom:24px}
.setup-organizer-events .setup-assistant>.setup-panel:nth-child(2){border-top:0;border-radius:0 0 10px 10px;padding-top:16px}
.onboarding-page:not(.setup-organizer-business) .setup-panel .two-columns{row-gap:12px}
.onboarding-page:not(.setup-organizer-business) .setup-panel>.field,.onboarding-page:not(.setup-organizer-business) .setup-panel>.field+.field{margin-top:16px}
.onboarding-page:not(.setup-organizer-business) .setup-panel hr{margin:17px 0 14px}
.setup-organizer-brand .setup-panel,.setup-organizer-team .setup-panel,.setup-provider-listing .setup-panel,.setup-provider-rules .setup-panel,.setup-provider-publish .setup-panel{padding-top:14px;padding-bottom:14px}
.setup-organizer-brand .upload-box{min-height:90px}
.setup-organizer-team .notification-grid{margin:10px 0 8px;gap:8px}
.setup-provider-publish .credential>.upload-box{min-height:80px}
}
''')
print('Applied setup page specific density and alignment corrections.')
