from pathlib import Path
p = Path('src/app/globals.css')
with p.open('a', encoding='utf-8') as f:
    f.write('''
@media(min-width:1251px){
.auth-right{padding-bottom:10px}
.auth-register .auth-description{margin-bottom:12px}
.auth-register .auth-field{margin-top:15px}
.auth-register .auth-field:first-child{margin-top:13px}
.auth-register .auth-field>div{height:45px}
.auth-register .auth-story.regenerated-story>.story-content{top:139px}
.auth-register .auth-story.regenerated-story h1{line-height:.98}
.auth-register .auth-story.regenerated-story .story-description{max-width:520px;line-height:28px;margin-top:17px;margin-bottom:15px}
.auth-register .auth-story.regenerated-story .story-features>div>span{max-width:380px}
.auth-mfa .auth-card{padding-bottom:20px}
.auth-reset-password .auth-hint ul{gap:7px}
.auth-reset-password .auth-card{padding-bottom:16px}
}
''')
print('Aligned auth content and footer to the 1086px reference frame.')
