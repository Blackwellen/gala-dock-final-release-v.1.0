from pathlib import Path
p = Path('src/app/globals.css')
with p.open('a', encoding='utf-8') as f:
    f.write('''
@media(max-width:700px){
.home-planning,.customer-content,.operations-layout{grid-template-columns:minmax(0,1fr)}
.home-planning>div,.customer-content>div,.customer-content>aside,.operations-layout>div,.operations-layout>aside,.operations-lower>section,.customer-lower>section{min-width:0}
.planning-mockup{width:100%;min-width:0;max-width:100%;transform:none;overflow:hidden;background-size:contain;background-position:center}
.planning-mockup>*{display:none}
.customer-content .four-columns,.operations-top .three-columns,.pipeline{max-width:100%;overflow-x:auto}
}
@media(min-width:1251px){.auth-register .auth-card{padding-bottom:3px}.auth-reset-password .auth-card{padding-bottom:9px}}
''')
print('Fixed intrinsic grid sizing and mobile illustration containment.')
