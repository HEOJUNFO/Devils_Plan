/**
 * The game's own list of Korean words and what scores them
 * (`lexicon-ko.txt`, made by tools/hidden-word-lexicon.py).
 *
 * The file is JSON, kept and imported as text. As a `.json` module its
 * 2.75 MB went through the bundler's transform in every runtime a test file
 * starts, which took the tests of a push from 20 s to 39 s and its deploy
 * past the three minutes the project allows; as a text module the file is
 * handed to the Worker as it is, and read here once.
 *
 * Only the Worker takes this module in (through `host.ts`): a browser that
 * had the list could find a hidden word from one clue.
 */
import text from "./lexicon-ko.txt";
import { makeLexicon, type Lexicon, type LexiconData } from "./lexicon";

/** The list as its file has it. */
export const LEXICON_KO_DATA: LexiconData = JSON.parse(text) as LexiconData;

/** The list, ready to score with. */
export const LEXICON_KO: Lexicon = makeLexicon(LEXICON_KO_DATA);
