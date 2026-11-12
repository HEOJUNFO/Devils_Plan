/**
 * Letters the game sends to whoever makes it: a player's word about the game
 * (`src/shared/feedback.ts`), and nothing else.
 *
 * They are carried by Resend (resend.com), asked over HTTPS. Who they go to
 * and the key they are sent with are secrets of the deployed Worker, set
 * there and written nowhere in the repository:
 *
 *   npx wrangler secret put RESEND_API_KEY   (a key of the Resend account)
 *   npx wrangler secret put FEEDBACK_TO      (the address the letters go to)
 *
 * `FEEDBACK_FROM` may name the sender; without it the letters come from
 * Resend's own address for trying it out, which carries them only to the
 * address the Resend account itself is kept under. Where the key or the
 * address is not set the game takes no feedback, and its page offers none.
 */
import type { Letter } from "../shared/feedback";

/** What of the Worker's environment the letters need: none of it is in `wrangler.jsonc`, so none of it is in `Env`. */
export interface MailEnv {
  RESEND_API_KEY?: string;
  FEEDBACK_TO?: string;
  FEEDBACK_FROM?: string;
}

/** Where a letter is handed to Resend. */
const SEND_URL = "https://api.resend.com/emails";
/** The sender Resend offers an account that has no domain of its own. */
const TRIAL_SENDER = "Brain Survival <onboarding@resend.dev>";

/** Whether a letter can be sent from here: the key and the address are both set. */
export function mailReady(env: MailEnv): boolean {
  return (env.RESEND_API_KEY ?? "") !== "" && (env.FEEDBACK_TO ?? "") !== "";
}

/**
 * Sends `letter` on, and says whether Resend took it. Nothing is thrown: a
 * letter that could not be sent is said so to its writer, and the log gets
 * why, without the letter and without the address.
 */
export async function sendLetter(env: MailEnv, letter: Letter, ask: typeof fetch = fetch): Promise<boolean> {
  if (!mailReady(env)) return false;
  try {
    const response = await ask(SEND_URL, {
      method: "POST",
      headers: { "authorization": `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.FEEDBACK_FROM || TRIAL_SENDER, to: [env.FEEDBACK_TO], subject: letter.subject, text: letter.text }),
    });
    await response.body?.cancel();
    if (!response.ok) console.warn(`a letter was not taken: Resend answered ${response.status}`);
    return response.ok;
  } catch (error) {
    console.warn("a letter could not be sent:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
