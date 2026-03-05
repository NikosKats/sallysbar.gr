/**
 * Creates a rewrite Request that carries the Greek language signal via a header.
 * Needed because Astro re-runs middleware for rewrite targets, losing the /el/ path context.
 */
export function elRewrite(originalRequest: Request, path: string): Request {
  const headers = new Headers(originalRequest.headers);
  headers.set("x-astro-lang", "el");
  return new Request(new URL(path, originalRequest.url).toString(), {
    method: originalRequest.method,
    headers,
  });
}
