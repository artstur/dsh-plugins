/**
 * Host half of the face-to-face recorder bundle.
 *
 * The recorder is drawn entirely by the Client module (`client.js`), which
 * talks to the Harness speech remote that the voice-input bundle mounts. The
 * Host half only exists so the bundle has a plugin row whose Client artifact
 * the Harness can serve.
 */
export function apply() {}
