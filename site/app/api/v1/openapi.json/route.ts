export const dynamic = "force-dynamic";

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "wordcell hosted publication",
    version: "1",
    description:
      "Publish a bounded Markdown vault as a hraness.wordcell.site.v1 static site. " +
      "The server runs the real wordcell projection (scan → attachment validation → " +
      "render) and serves the emitted artifact from immutable digest-addressed " +
      "object storage. Capability tokens are self-serve; published sites are public.",
  },
  servers: [{ url: "https://wordcell.io" }],
  paths: {
    "/api/v1/health": {
      get: {
        operationId: "health",
        summary: "Service health",
        responses: { "200": { description: "ok" }, "503": { description: "unconfigured" } },
      },
    },
    "/api/v1/tokens": {
      post: {
        operationId: "mintToken",
        summary: "Mint a publishing token",
        description:
          "Self-serve capability token, rate-limited by client address. The token is " +
          "shown once; the server stores only its SHA-256 digest. The first 8 hex " +
          "chars of the digest are the caller's site namespace.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { label: { type: "string", maxLength: 80 } },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": { description: "token minted" },
          "429": { description: "daily mint quota reached" },
        },
      },
    },
    "/api/v1/uploads": {
      post: {
        operationId: "mintUpload",
        summary: "Mint a presigned asset upload",
        description:
          "Returns a short-lived PUT URL for one vault asset (≤32 MiB). Reference " +
          "the returned id as {\"upload\": id} in a publish files map.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["bytes"],
                properties: {
                  bytes: { type: "integer", minimum: 1, maximum: 33554432 },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": { description: "upload URL minted" },
          "401": { description: "missing or unknown token" },
          "429": { description: "daily upload quota reached" },
        },
      },
    },
    "/api/v1/sites": {
      get: {
        operationId: "listSites",
        summary: "List published sites",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "site summaries" },
          "401": { description: "missing or unknown token" },
        },
      },
    },
    "/api/v1/sites/{slug}": {
      parameters: [
        {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,62}$" },
        },
      ],
      put: {
        operationId: "publishSite",
        summary: "Publish a vault to /p/<key8>/<slug>/",
        description:
          "Accepts a bounded vault file map (utf8 strings, {base64}, or {upload} " +
          "references), runs the wordcell projection server-side, stores the " +
          "emitted artifact under an immutable digest prefix, and moves the slug " +
          "pointer after every object is durable. Identical output bytes are an " +
          "idempotent no-op.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["files"],
                properties: {
                  files: {
                    type: "object",
                    description:
                      "Vault-relative path → utf8 string | {base64} | {upload}",
                  },
                  title: { type: "string", maxLength: 200 },
                  description: { type: "string", maxLength: 1000 },
                  index: { type: "string", description: "Vault-relative index note path" },
                  noindex: { type: "boolean" },
                  indexContent: { type: "boolean" },
                  selection: {
                    type: "object",
                    description:
                      "wordcell publish selection: includes/excludes/globs/tags/" +
                      "repositoryScopes/filters/from",
                  },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": { description: "site updated" },
          "201": { description: "site created" },
          "400": { description: "invalid input" },
          "401": { description: "missing or unknown token" },
          "409": { description: "namespace site limit reached" },
          "413": { description: "request too large" },
          "422": { description: "projection failed or site exceeds hosted bounds" },
          "429": { description: "quota reached" },
        },
      },
      get: {
        operationId: "getSite",
        summary: "Read a site record",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "site record" },
          "401": { description: "missing or unknown token" },
          "404": { description: "no such site" },
        },
      },
      delete: {
        operationId: "deleteSite",
        summary: "Unpublish a site",
        description:
          "Removes the public pointer immediately, then deletes the record and " +
          "the digest-addressed artifact objects.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "deleted" },
          "401": { description: "missing or unknown token" },
          "404": { description: "no such site" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "wc_pub_" },
    },
  },
} as const;

export function GET(): Response {
  return Response.json(SPEC, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
