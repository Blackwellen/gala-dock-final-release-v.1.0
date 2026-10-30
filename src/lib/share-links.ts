// Q16: public share-link helpers (proposal / contract links). Server-safe, no secrets.

/** Link-preview and mail-security scanners that fetch links without a person looking at them. Real browsers never match. */
const PREVIEW_BOT = /bot\b|bot\/|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|whatsapp|skypeuripreview|bitlybot|outlook|ms-office|microsoft office|safelinks|proofpoint|mimecast|barracuda|google-safety|curl|wget|python-requests|node-fetch|axios|go-http-client|okhttp|java\//i;

export const isPreviewBot = (ua: string | null | undefined) => !ua || ua.length < 20 || PREVIEW_BOT.test(ua);

export const PROPOSAL_TOKEN = /^[0-9a-f]{36}$/;
