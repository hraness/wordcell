import { hostedConfig } from "../../../../lib/hosted/config";
import {
  apiError,
  apiOk,
  apiUnavailable,
} from "../../../../lib/hosted/errors";
import { authenticate } from "../../../../lib/hosted/auth";
import { ObjectStore } from "../../../../lib/hosted/store";
import { liveSite, OPERATION_CONTRACT } from "../../../../lib/hosted/records";
import { readSite } from "../../../../lib/hosted/operations";

export const dynamic = "force-dynamic";

/** List the caller's published sites (record summaries, not content). */
export async function GET(request: Request): Promise<Response> {
  const config = hostedConfig();
  if (config === null) return apiUnavailable();
  const store = new ObjectStore(config);
  const token = await authenticate(store, request);
  if (token === undefined) {
    return apiError({
      code: "UNAUTHORIZED",
      message: "a Bearer wc_pub_ token is required; mint one with POST /api/v1/tokens",
      retryable: false,
    }, 401);
  }
  const { keys, truncated } = await store.list(`sites/${token.key8}/`, 256);
  const sites: Record<string, unknown>[] = [];
  for (const key of keys) {
    const slug = key.slice(`sites/${token.key8}/`.length, -".json".length);
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(slug) || key !== `sites/${token.key8}/${slug}.json`) continue;
    const record = liveSite((await readSite(store, token, slug)).head);
    if (record === null) continue;
    sites.push({
      slug: record.slug,
      url: `${config.siteOrigin}/p/${token.key8}/${record.slug}/`,
      digest: record.digest,
      revision: record.revision,
      notes: record.notes,
      bytes: record.bytes,
      updatedAt: record.updatedAt,
    });
  }
  sites.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return apiOk({ contract: OPERATION_CONTRACT, sites, truncated });
}
