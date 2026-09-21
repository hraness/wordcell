/**
 * Hosted site publication configuration. All state lives in the private
 * `wordcell-sites` R2 bucket behind the signed `wordcell-sites` worker — no
 * database, no S3 credentials. The API holds only the shared HMAC secret.
 */

export type HostedConfig = Readonly<{
  /** Base URL of the wordcell-sites worker. */
  objectsUrl: string;
  /** Shared HMAC secret signing worker requests. */
  objectsSecret: string;
  /** Public origin published URLs are formed on. */
  siteOrigin: string;
}>;

export function hostedConfig(): HostedConfig | null {
  const objectsUrl = process.env.WORDCELL_OBJECTS_URL;
  const objectsSecret = process.env.WORDCELL_OBJECTS_SECRET;
  if (objectsUrl === undefined || objectsUrl === "" ||
      objectsSecret === undefined || objectsSecret === "") {
    return null;
  }
  return {
    objectsUrl: objectsUrl.replace(/\/+$/u, ""),
    objectsSecret,
    siteOrigin: (process.env.WORDCELL_SITE_ORIGIN ?? "https://wordcell.io")
      .replace(/\/+$/u, ""),
  };
}

/** Request and quota bounds for hosted publication. */
export const HOSTED_LIMITS = Object.freeze({
  /** Files entries per publish request (notes + assets). */
  filesPerPublish: 256,
  /** Inline (base64/utf8) bytes per publish request. */
  inlineBytesPerPublish: 4 * 1024 * 1024,
  /** Single uploaded asset byte cap. */
  uploadBytes: 32 * 1024 * 1024,
  /** Uploaded assets referenced per publish. */
  uploadsPerPublish: 32,
  /** UTF-8 bytes per Markdown note handed to scanVault. */
  noteBytes: 256 * 1024,
  /** Total Markdown bytes handed to scanVault. */
  totalNoteBytes: 32 * 1024 * 1024,
  /** Publishes per token namespace per day. */
  publishesPerDay: 60,
  /** Emitted artifact bytes per token namespace per day. */
  emittedBytesPerDay: 512 * 1024 * 1024,
  /** Live sites per token namespace. */
  sitesPerNamespace: 50,
  /** Token mints per client IP per day. */
  tokenMintsPerDay: 8,
  /** Publishes per client IP per day (across tokens). */
  publishesPerIpPerDay: 120,
  /** Uploads minted per token namespace per day. */
  uploadsPerDay: 40,
  /** Presigned upload URL lifetime. */
  uploadUrlSeconds: 900,
  /** Signed worker URL lifetime for internal ops. */
  signSeconds: 300,
});
