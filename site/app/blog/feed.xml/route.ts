import { ATOM_FEED_CONTENT_TYPE } from "@hraness/web-discovery";

import { blogHtml } from "../blog.generated";
import { blogAtomFeed } from "../discovery";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(blogAtomFeed(blogHtml), {
    headers: { "content-type": ATOM_FEED_CONTENT_TYPE },
  });
}
