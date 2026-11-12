/**
 * The header in which Cloudflare tells a Worker the network address a
 * request came from. A request made inside the Worker, or by a test, has
 * none; the limits kept by address then do not apply.
 *
 * An address is not a person: a household, a school or a phone network can
 * be many players behind one. The limits kept by it are set well above what
 * such a group does, and are there for a script, not for a crowd.
 */
export const ADDRESS_HEADER = "cf-connecting-ip";
