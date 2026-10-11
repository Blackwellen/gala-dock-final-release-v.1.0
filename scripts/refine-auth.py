from pathlib import Path
p=Path('src/components/auth.tsx');s=p.read_text(encoding='utf8')
s=s.replace('export function AuthPage({ screen }: { screen:AuthScreen })','export function AuthPage({ screen, preview=false }: { screen:AuthScreen;preview?:boolean })')
s=s.replace('const [cooldown,setCooldown]=useState(0)','const [cooldown,setCooldown]=useState(screen==="verify-email"?25:0)')
s=s.replace('const [email,setEmail]=','const [authenticated,setAuthenticated]=useState(false);const [newPassword,setNewPassword]=useState("");\n const [email,setEmail]=')
s=s.replace('if(screen==="mfa") createClient().auth.mfa.listFactors().then(({data,error})=>{ if(error)setError(error.message);else if(data?.totp[0])setFactor(data.totp[0].id); });','if(screen==="mfa") {createClient().auth.getUser().then(({data})=>setAuthenticated(!!data.user));createClient().auth.mfa.listFactors().then(({data})=>{if(data?.totp[0])setFactor(data.totp[0].id);});}')
s=s.replace('screen!=="mfa"&&<div className="auth-top"','screen!=="mfa"&&screen!=="forgot-password"&&<div className="auth-top"')
s=s.replace('required=true, defaultValue }: {','required=true, defaultValue, onValueChange }: {').replace('defaultValue?:string })','defaultValue?:string;onValueChange?:(value:string)=>void })')
s=s.replace('defaultValue={defaultValue} autoComplete','defaultValue={defaultValue} onChange={e=>onValueChange?.(e.target.value)} autoComplete')
s=s.replace('name="password" type="password" placeholder=','name="password" type="password" onValueChange={setNewPassword} placeholder=')
old='<div className="auth-hint"><b>Your password must:</b><ul><li>Be at least 8 characters long</li><li>Include upper and lowercase letters</li><li>Include a number and a special character</li></ul></div>'
new='<div className="auth-hint"><div><b>Your password must:</b><span>{[newPassword.length>=8,/[A-Z]/.test(newPassword),/[a-z]/.test(newPassword),/\\d/.test(newPassword),/[^A-Za-z0-9]/.test(newPassword)].filter(Boolean).length} of 5 met</span></div><ul>{["Be at least 8 characters long","Include at least one uppercase letter (A–Z)","Include at least one lowercase letter (a–z)","Include at least one number (0–9)","Include at least one special character (e.g. ! @ # $ % ^ & *)"].map((rule,i)=><li key={rule} className={[newPassword.length>=8,/[A-Z]/.test(newPassword),/[a-z]/.test(newPassword),/\\d/.test(newPassword),/[^A-Za-z0-9]/.test(newPassword)][i]?"met":""}><span/> {rule}</li>)}</ul></div><div className="auth-security reset-security"><ShieldCheck/><span><b>For your security</b><small>After you reset your password, your active sessions may be signed out on other devices.</small></span></div>'
s=s.replace(old,new)
s=s.replace('{!factor&&<Button','{!factor&&authenticated&&<Button')
seg='<div className="segmented">{["Waiting","Verified","Expired"].map(value=><button type="button" key={value} className={status===value?"active":""} onClick={()=>setStatus(value)}>{value==="Waiting"?<Mail size={17}/>:value==="Verified"?<Check size={17}/>:<Clock size={17}/>} {value}</button>)}</div>'
s=s.replace(seg,'');s=s.replace('</p>{["login","register","mfa","verify-email"]','</p>{screen==="verify-email"&&'+seg+'}{screen==="reset-password"&&<div className="segmented reset-status">{["Valid","Expired","Complete"].map((label,i)=><button type="button" key={label} onClick={()=>setStatus(label)} className={(status==="Waiting"&&i===0)||status===label?"active":""}>{i===0?<KeyRound size={21}/>:i===1?<Clock size={21}/>:<Check size={21}/>} {label}</button>)}</div>}{["login","register","mfa","verify-email"]')
s=s.replace('<div className="auth-security"><ShieldCheck/>','{!["reset-password","verify-email"].includes(screen)&&<div className="auth-security"><ShieldCheck/>')
s=s.replace('</Link>}</div>\n {screen!=="register"','</Link>}</div>}\n {screen!=="register"&&screen!=="reset-password"')
s=s.replace('{screen==="forgot-password"&&<Link','{screen==="reset-password"&&<><div className="auth-divider">or</div><Link className="request-new-link" href="/auth/forgot-password">Request new link</Link></>}{screen==="forgot-password"&&<Link')
s=s.replace('>Secure, always.</b>','>Secure, always.</b>')
p.write_text(s,encoding='utf8')
