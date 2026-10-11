from pathlib import Path

auth = Path('src/components/auth.tsx')
s = auth.read_text(encoding='utf-8')
s = s.replace('import type { AuthScreen }', 'import { assetUrl, hasRegeneratedAsset } from "@/lib/assets";\nimport type { AuthScreen }')
s = s.replace('<aside className="auth-story">', '<aside className={`auth-story ${hasRegeneratedAsset(`auth-art-${screen}`)?"regenerated-story":""}`} style={{backgroundImage:`url(${assetUrl(`auth-art-${screen}`,"png")})`}}>')
auth.write_text(s, encoding='utf-8')

onboarding = Path('src/components/onboarding.tsx')
s = onboarding.read_text(encoding='utf-8')
s = s.replace('import { onboardingRoutes }', 'import { assetUrl, hasRegeneratedAsset } from "@/lib/assets";\nimport { onboardingRoutes }')
s = s.replace('`url(/assets/story-${step.replaceAll("/","-")}.png)`', '`url(${assetUrl(`story-${step.replaceAll("/","-")}`,"png")})`')
s = s.replace('className={`setup-story ${step.includes', 'className={`setup-story ${hasRegeneratedAsset(`story-${step.replaceAll("/","-")}`)?"regenerated-story":""} ${step.includes')
onboarding.write_text(s, encoding='utf-8')

css = Path('src/app/globals.css')
with css.open('a', encoding='utf-8') as f:
    f.write('\n/* Regenerated artwork contains photography only; native content stays visible. */\n.auth-story.regenerated-story>.logo,.auth-story.regenerated-story>.story-content,.auth-story.regenerated-story>.story-stats{opacity:1}.auth-story.regenerated-story>.story-content{position:absolute;top:148px;left:0;right:0;padding:0 78px}.setup-story.regenerated-story .setup-story-content{opacity:1}.setup-story.regenerated-story .setup-proof{opacity:1;display:flex}.setup-story.regenerated-story .setup-photo-strip{display:none}\n')
print('Regenerated auth and onboarding background integration installed.')
