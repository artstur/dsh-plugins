/**
 * Host half of the device-side resource bundle.
 *
 * The interface itself lives in the browser: the providers own their data
 * (browser storage or a same-origin API), so the Host half only exists so the
 * bundle has a plugin row whose Client artifact the Harness can serve.
 */
export function apply() {}
