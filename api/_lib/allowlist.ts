/**
 * The push services a browser subscription can legitimately point to.
 *
 * The server will later POST to whatever address it is given, so it must only
 * ever be given one of these: otherwise the subscribe endpoint is a way to
 * make this server send requests to an arbitrary host. Hostnames checked
 * against the maintained list at github.com/pushpad/known-push-services.
 */
const EXACT: ReadonlySet<string> = new Set([
  'fcm.googleapis.com', // Chrome, Edge on Android, and other Chromium browsers
  'jmt17.google.com', // Chrome (newer endpoint)
  'updates.push.services.mozilla.com', // Firefox
]);

/** Services that hand out per-region subdomains. Matched as ".suffix", never as a bare suffix. */
const SUFFIXES: readonly string[] = [
  '.push.apple.com', // Safari on macOS and iOS (web.push.apple.com)
  '.notify.windows.com', // Edge on Windows (WNS)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // Credentials or a port in the address are never part of a real push endpoint.
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return EXACT.has(host) || SUFFIXES.some((suffix) => host.endsWith(suffix));
}
