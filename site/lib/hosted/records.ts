/** The `sites/<key8>/<slug>.json` record — the only durable per-site state. */

export type SiteRecord = Readonly<{
  v: 1;
  slug: string;
  key8: string;
  /** Artifact digest — the s/<digest>/ object prefix. */
  digest: string;
  /** Canonical source digest from the projection manifest. */
  sourceDigest: string;
  revision: number;
  title?: string;
  notes: number;
  files: number;
  bytes: number;
  createdAt: string;
  updatedAt: string;
}>;
