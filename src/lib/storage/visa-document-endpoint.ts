export function visaDocumentResumableEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.split(".")[0];
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
  }
  return `${url.origin}/storage/v1/upload/resumable/sign`;
}
