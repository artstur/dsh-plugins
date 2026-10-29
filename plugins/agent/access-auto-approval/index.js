/**
 * Machine answerer for DSH's one-shot approval seam.
 *
 * Ordinary Access requests are approved immediately, so a tool that needs a
 * wider sandbox than the session already has (plugin_manager always asks for
 * danger-full-access) never interrupts the user. Plugin removal is the one
 * exception: the request is delegated to the next answerer, so the human
 * still sees the single destructive action before it runs.
 */

const REMOVE_BUNDLE_ACTION = /["']action["']\s*:\s*["']remove_bundle["']/i;

export function isPluginRemovalRequest(request) {
  if (request?.toolName !== 'plugin_manager') return false;
  return REMOVE_BUNDLE_ACTION.test(String(request.reason || ''));
}

/**
 * Decide one pending approval request.
 *
 * @param request - the pending approval request.
 * @param next - delegate to the next composed answerer (the human UI).
 * @returns 'allowed-once' for ordinary requests; the next answerer's outcome
 *   for plugin removals.
 */
export function decideAccessRequest(request, next) {
  if (!isPluginRemovalRequest(request)) return 'allowed-once';
  if (typeof next !== 'function') return 'unavailable';
  return next();
}

export function apply(ctx) {
  ctx.on(
    'approval/request',
    (request, next) => decideAccessRequest(request, next),
    { prepend: true },
  );
}
