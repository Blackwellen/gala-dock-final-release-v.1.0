// Personalisation for messages. People pick details from a menu and see plain-English tags like [Their name]; on send the tags
// are replaced with the real values. Curly-brace merge fields from other tools ({{name}}, {{ .Subscriber.Name }}, {{first_name}}…)
// are understood too, so pasted templates work.
export type TokenKey = "them" | "first" | "me" | "business";
export type TokenValues = Partial<Record<TokenKey, string>>;
export const TOKENS: { key: TokenKey; tag: string; hint: string }[] = [
  { key: "them", tag: "[Their name]", hint: "Who you’re writing to" },
  { key: "first", tag: "[Their first name]", hint: "First word of their name" },
  { key: "me", tag: "[My name]", hint: "Your name" },
  { key: "business", tag: "[My business]", hint: "Your workspace’s name" },
];
const ALIASES: Record<string, TokenKey> = {
  name: "them", theirname: "them", fullname: "them", recipient: "them", recipientname: "them", contact: "them", contactname: "them", subscriber: "them", subscribername: "them",
  customer: "them", customername: "them", client: "them", clientname: "them", to: "them", toname: "them", username: "them", user: "them",
  firstname: "first", theirfirstname: "first", subscriberfirstname: "first", recipientfirstname: "first", contactfirstname: "first", customerfirstname: "first", fname: "first",
  myname: "me", sender: "me", sendername: "me", from: "me", fromname: "me", me: "me", signature: "me",
  business: "business", mybusiness: "business", company: "business", companyname: "business", workspace: "business", workspacename: "business", organisation: "business", organization: "business", brand: "business",
};
const keyOf = (raw: string): TokenKey | undefined => ALIASES[raw.toLowerCase().replace(/^\s*\.?/, "").replace(/[\s._-]/g, "")];
const firstWord = (s = "") => s.trim().split(/[\s,]+/)[0] ?? "";

/** Fills every recognised tag. Unknown {{fields}} are left visible so the writer notices them. */
export function personalise(text: string, v: TokenValues) {
  const val = (k: TokenKey) => (k === "first" ? firstWord(v.first ?? v.them) : v[k]) || (k === "me" || k === "business" ? v.me || v.business || "" : "there");
  return text
    .replace(/\{\{\s*([^{}]{1,60}?)\s*\}\}/g, (m, inner: string) => { const k = keyOf(inner); return k ? val(k) : m; })
    .replace(/\[(Their name|Their first name|My name|My business)\]/g, (_, t: string) => val(TOKENS.find(x => x.tag === `[${t}]`)!.key));
}
/** Recognised curly fields that would be filled (for a live preview line). */
export const hasTokens = (text: string) => /\{\{[^{}]+\}\}|\[(Their name|Their first name|My name|My business)\]/.test(text);
