import { apiOk, apiUnavailable } from "../../../../lib/hosted/errors";
import { hostedConfig } from "../../../../lib/hosted/config";
import { ObjectStore } from "../../../../lib/hosted/store";
import { HOSTED_PACKAGE_VERSION } from "../../../../lib/hosted/reader.generated";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = hostedConfig();
  if (config === null) return apiUnavailable();
  // A HEAD on a probe key exercises the signed path end to end; a 404 from the
  // worker still proves storage is reachable and auth holds.
  const store = new ObjectStore(config);
  let storage = false;
  try {
    storage = !(await store.head("m/__health_probe__")) || true;
  } catch {
    storage = false;
  }
  return apiOk({
    service: "wordcell-hosted",
    version: HOSTED_PACKAGE_VERSION,
    storage,
    artifact: "hraness.wordcell.site.v1",
  });
}
