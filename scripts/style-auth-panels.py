from pathlib import Path
p=Path('src/app/globals.css')
with p.open('a',encoding='utf-8') as f:
    f.write('''
.invitation-summary{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:15px 24px;background:linear-gradient(120deg,#f3f0ff,#f4f2ff);border-radius:9px;padding:17px}
.invitation-summary>div{min-width:0;display:flex;flex-direction:column;gap:7px}
.invitation-summary>div:nth-child(even){border-left:1px solid #dedbf6;padding-left:26px}
.invitation-summary small{font-size:13px;color:#5c5a99}
.invitation-summary>div>small{color:#111334;font-size:14px}
.invitation-summary .invitation-workspace{flex-direction:row;gap:20px;align-items:center}
.invitation-workspace>span:last-child{display:flex;flex-direction:column;gap:5px}
.invitation-workspace b{font-size:17px;letter-spacing:-.4px}
.invitation-mark{width:65px;height:65px;flex-shrink:0;border-radius:8px;background:#080745;display:flex;align-items:center;justify-content:center;color:#9971ff;box-shadow:inset 0 0 20px #3c22ff50}
.invitation-mark>svg{width:42px;height:42px;filter:drop-shadow(0 0 4px #693eff);stroke-width:1.5}
.invitation-summary .badge{gap:7px;align-self:flex-start;font-size:14px;padding:7px 13px;border-radius:20px;text-transform:capitalize}
.invitation-owner,.invitation-expiry{display:flex;align-items:center;gap:12px;min-width:0}
.invitation-owner>.photo{width:37px;height:37px;border-radius:50%}
.invitation-owner>span,.invitation-expiry>span{display:flex;flex-direction:column;gap:3px;font-size:14px}
.invitation-owner b{font-weight:500}.invitation-owner small{font-size:12px;white-space:nowrap}
.invitation-expiry>svg{color:#423ac7}
.invitation-perks-title{font-size:15px;letter-spacing:-.2px;margin:17px 0 5px}
.invitation-perks{border:1px solid #d9ddf5;border-radius:7px;padding:13px 18px;display:grid;gap:10px}
.invitation-perks>div{display:flex;align-items:center;gap:23px;color:#4137ca}
.invitation-perks>div>span{display:flex;flex-direction:column;gap:3px}
.invitation-perks b{font-size:13px;font-weight:500;color:#111334}
.invitation-perks small{font-size:13px;color:#67659a}
.invitation-security{margin:14px 0 13px!important;padding:12px 18px!important}
.invitation-security b{font-size:13px!important;font-weight:500!important}
.invitation-security small{font-size:11px!important;line-height:1.5!important}
.invitation-expired{display:flex;gap:22px;align-items:center;margin-top:14px;background:#fff0f3;border-radius:8px;padding:16px 20px;color:#e80024}
.invitation-expired>span{display:flex;flex-direction:column;gap:5px}
.invitation-expired b{font-size:14px;font-weight:500}
.invitation-expired small{font-size:12px;color:#5a415b}
@media(min-width:1251px){
.auth-invite .auth-right{padding-top:105px}
.auth-invite .auth-card{padding:20px 23px 17px 31px}
.auth-invite .auth-card>.logo{width:202px;height:52px;margin-left:-8px;margin-bottom:13px}
.auth-invite .auth-card>h2{font-size:38px;letter-spacing:-1.1px}
.auth-invite .auth-description{font-size:17px;line-height:25px;margin-bottom:19px}
.auth-invite .auth-card .button.full-width{min-height:43px;height:43px;margin-top:0;font-size:14px}
.auth-invite .social-buttons{margin-top:8px;gap:12px}
.auth-invite .auth-card .social-buttons .button{height:43px;min-height:43px}
.auth-secure-access .segmented{margin:20px 0 22px;padding:0;min-height:52px}
.auth-secure-access .segmented button{font-size:14px}
.auth-secure-access .auth-note.danger{padding:24px 22px;min-height:153px;gap:23px;background:#faf8ff;border:1px solid #e8e2ff;align-items:flex-start;margin-bottom:20px}
.auth-secure-access .auth-note.danger>.icon-tile{width:68px;height:68px;border-radius:15px;color:#ff174f}
.auth-secure-access .auth-note.danger>.icon-tile>svg{width:35px;height:35px}
.auth-secure-access .auth-note.danger b{font-size:18px;color:#13143a}
.auth-secure-access .auth-note.danger small{font-size:16px;line-height:20px;margin-top:6px}
.auth-secure-access .auth-security{min-height:105px;padding:16px 20px;margin-top:18px}
.auth-secure-access .auth-security>span>small{font-size:13px;line-height:18px}
.auth-secure-access .auth-security> a{display:none}
.auth-secure-access .auth-help{border-top:1px solid #d9def0;padding-top:17px;margin-top:18px}
}
@media(max-width:700px){.invitation-summary{grid-template-columns:minmax(0,1fr);gap:15px}.invitation-summary>div:nth-child(even){border:0;padding-left:0}.invitation-owner small{white-space:normal}.invitation-perks>div{gap:14px}.invitation-security>a{display:none}}
''')
print('Styled invitation and access panels from their individual auth references.')
