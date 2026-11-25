/**
 * A `.txt` file imported by the Worker is a module of text: the build keeps
 * it as a file beside the script, and the runtime hands it over as a string
 * (Cloudflare's "Text" module type). `lexicon-ko.ts` is its one user.
 */
declare module "*.txt" {
  const text: string;
  export default text;
}
