/** Browser helper (Q04): public images go through the server, which validates, strips metadata and scans before publishing. */
export async function uploadPublicMedia(workspaceId: string, file: Blob, name = "image"): Promise<string> {
  const form = new FormData();
  form.set("workspace", workspaceId);
  form.set("file", file instanceof File ? file : new File([file], name, { type: file.type }));
  const r = await fetch("/api/files/public-media", { method: "POST", body: form, credentials: "same-origin" });
  const j = await r.json().catch(() => ({})) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed");
  return j.url;
}
