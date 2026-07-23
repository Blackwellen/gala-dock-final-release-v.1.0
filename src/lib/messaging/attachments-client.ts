"use client";

/** Client-side helpers for the message-attachment upload/download flow.
 * Upload: presign → PUT the file directly to R2 → return the object key for
 * sendMessage(). Download: presign-download → open the signed URL. Both
 * calls are workspace + conversation-participant authorized server-side. */

export interface PresignedUpload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
}

export async function uploadMessageAttachment(
  workspaceId: string,
  conversationId: string,
  file: File,
): Promise<PresignedUpload> {
  const presignRes = await fetch("/api/r2/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      recordId: conversationId,
      kind: "message-attachment",
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });

  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not prepare upload");
  }
  const { uploadUrl, objectKey } = await presignRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    r2Key: objectKey,
  };
}

export async function getAttachmentDownloadUrl(workspaceId: string, objectKey: string): Promise<string> {
  const res = await fetch("/api/r2/presign-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, objectKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not get download link");
  }
  const { downloadUrl } = await res.json();
  return downloadUrl as string;
}
