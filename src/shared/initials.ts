/**
 * The letter that stands for a player where there is room for one letter
 * and no more: on a tile of grass they laid in 잔디 깔기, whose colour is
 * one of sixteen and not told apart by everyone.
 *
 * It is the first letter of their name. Where two players of a game have
 * the same first letter (friends of one family name; the bots, "봇 1" and
 * "봇 2") that letter says nothing, and each of them is given a later letter
 * of their own name instead: the first that is nobody's first letter and
 * that no one before them was given. A name with no such letter keeps its
 * first.
 */

/** The letter standing for a player, and where in their name it is (counted in letters, from 0). */
export interface Initial {
  readonly letter: string;
  readonly at: number;
}

/** Letters that differ only by case are one letter to a reader in a hurry. */
const fold = (letter: string): string => letter.toLowerCase();

/**
 * The letter that stands for each of `nicks`, the names of the players of
 * one game in an order that does not change during it. A name with no letter
 * has the empty letter.
 */
export function initialsOf(nicks: readonly string[]): Initial[] {
  const letters = nicks.map((nick) => Array.from(nick));
  const firstAt = letters.map((each) => each.findIndex((letter) => letter.trim() !== ""));
  const firsts = letters.map((each, index) => (firstAt[index]! < 0 ? "" : fold(each[firstAt[index]!]!)));
  const shared = (first: string): boolean => first !== "" && firsts.filter((each) => each === first).length > 1;
  const taken = new Set(firsts.filter((first) => first !== ""));
  return letters.map((each, index) => {
    const at = firstAt[index]!;
    if (at < 0) return { letter: "", at: 0 };
    if (shared(firsts[index]!)) {
      for (let later = at + 1; later < each.length; later++) {
        const letter = each[later]!;
        if (letter.trim() === "" || taken.has(fold(letter))) continue;
        taken.add(fold(letter));
        return { letter, at: later };
      }
    }
    return { letter: each[at]!, at };
  });
}
