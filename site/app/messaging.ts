import snapshot from "../../portfolio-messaging.generated.json";

if (snapshot.contract !== "hraness.product-messaging/v1" || snapshot.productId !== "kb") {
  throw new Error("The website requires the canonical kb messaging snapshot.");
}

export const productMessaging = snapshot.messaging;
export const productName = productMessaging.names.name;
export const productCanonicalUrl = snapshot.canonicalUrl;

/** Keep the site's selected siblings while deriving their copy and destinations. */
export function relatedProduct(id: string) {
  const project = snapshot.projects.find((candidate) => candidate.id === id);
  if (project === undefined) throw new Error(`Unknown portfolio product ${id}.`);
  return { href: project.canonicalUrl, name: project.name, role: project.messaging.short };
}

export function registeredRelationship(a: string, b: string): string | null {
  return snapshot.relations.find((relation) =>
    (relation.source === a && relation.target === b) ||
    (relation.source === b && relation.target === a))?.detail ?? null;
}
