/**
 * Host loader entry for the Exploration Atlas.
 *
 * The feature lives in the browser: the panel reads the exploration map that
 * ships with the bundle plus the explorations the user records in this browser,
 * and it registers that map with the device-side resource interface. There is
 * nothing for the Host half to own, so the row only needs to exist.
 */

/** The Host half owns no state; the Client half provides the panel and Provider. */
export function apply() {}
