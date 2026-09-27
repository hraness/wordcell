import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // The artifact Worker decides whether an existing object is a directory.
  // Removing its slash would change how all relative links resolve.
  if (pathname.startsWith("/p/")) return NextResponse.next();
  if (pathname !== "/" && pathname.endsWith("/")) {
    // A NextURL clone retains its source trailingSlash flag during formatting.
    // Use the standard URL so this redirect actually removes the slash.
    const target = new URL(request.url);
    target.pathname = pathname.replace(/\/+$/u, "");
    return NextResponse.redirect(target, 308);
  }
  return NextResponse.next();
}
