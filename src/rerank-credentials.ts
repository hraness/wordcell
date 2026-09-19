import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { SearchReranker } from "./rerank.js";
import { createTypeSafeReranker } from "./rerank-typesafe.js";

function unavailable(message: string): SearchReranker {
  return { id: "typesafe", rerank: async () => ({ status: "unavailable", message }) };
}

/** CLI-only credential discovery, called only after explicit --rerank typesafe. */
export async function createCliTypeSafeReranker(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  homeDirectory: string = homedir(),
): Promise<SearchReranker> {
  // An explicit value, including an invalid one, must never select another key.
  if (Object.hasOwn(environment, "TYPESAFE_API_KEY")) {
    return createTypeSafeReranker({ environment: { TYPESAFE_API_KEY: environment["TYPESAFE_API_KEY"] } });
  }
  const explicitFile = environment["TYPESAFE_API_KEY_FILE"];
  const configDirectory = environment["XDG_CONFIG_HOME"];
  if (
    (explicitFile !== undefined && !isAbsolute(explicitFile))
    || (configDirectory !== undefined && configDirectory !== "" && !isAbsolute(configDirectory))
  ) {
    return unavailable("TypeSafe credential file configuration requires absolute paths.");
  }
  const path = explicitFile ?? join(
    configDirectory || join(homeDirectory, ".config"), "wordcell", "typesafe-api-key",
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // Nonblocking open rejects FIFOs without hanging; no-follow rejects a final symlink.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = await handle.stat();
    const uid = process.getuid?.();
    if (
      !metadata.isFile() || metadata.nlink !== 1 || metadata.size < 1 || metadata.size > 514
      || (process.platform !== "win32" && ((metadata.mode & 0o077) !== 0 || metadata.uid !== uid))
    ) {
      return unavailable("TypeSafe credential file must be an owner-only regular file containing one API key.");
    }
    const bytes = Buffer.alloc(515);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const key = bytes.subarray(0, bytesRead).toString("utf8").replace(/\r?\n$/u, "");
    if (!/^[\x21-\x7e]{1,512}$/u.test(key)) {
      return unavailable("TypeSafe credential file must contain one valid API key.");
    }
    return createTypeSafeReranker({ environment: { TYPESAFE_API_KEY: key } });
  } catch {
    return unavailable("TypeSafe credentials are unavailable; set TYPESAFE_API_KEY or an owner-only TYPESAFE_API_KEY_FILE.");
  } finally {
    await handle?.close();
  }
}
