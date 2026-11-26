import { describe, expect, it } from "vitest";
import { FALLBACK_LANG, LANGS, chooseLang, enTime, englishOrdinal, isLang, koTime } from "../../../src/shared/lang";

describe("the languages the game can be read in", () => {
  it("are Korean, which the game was written in, and English", () => {
    // the user, on 2026-11-11: the project supports English (CLAUDE.md, Project Rules)
    expect(LANGS).toEqual(["ko", "en"]);
  });

  it.each([["a language there are no words for", "fr"], ["a code with its region", "en-US"], ["nothing", null], ["a number", 1]])(
    "does not take %s for one of them",
    (_what, value) => {
      expect(isLang(value)).toBe(false);
    },
  );
});

describe("chooseLang", () => {
  it("shows what the address asks for, whatever was chosen before and whatever the browser prefers", () => {
    expect(chooseLang("en", "ko", ["ko-KR"])).toBe("en");
  });

  it("shows what the reader last chose when the address asks for nothing", () => {
    expect(chooseLang(null, "ko", ["en-US"])).toBe("ko");
  });

  it("shows the first language the browser prefers that there are words for", () => {
    expect(chooseLang(null, null, ["fr-FR", "ko-KR", "en-US"])).toBe("ko");
    expect(chooseLang(null, null, ["en-GB", "ko"])).toBe("en");
  });

  it("reads a browser's language whatever its case and region", () => {
    expect(chooseLang(null, null, ["KO-kr"])).toBe("ko");
  });

  it("passes over an address or a stored choice that names no language here", () => {
    expect(chooseLang("fr", "", ["ko-KR"])).toBe("ko");
  });

  it("falls back to English for a reader whose browser asks for neither", () => {
    expect(FALLBACK_LANG).toBe("en");
    expect(chooseLang(null, null, ["fr-FR", "ja"])).toBe(FALLBACK_LANG);
    expect(chooseLang(null, null, [])).toBe(FALLBACK_LANG);
  });
});

describe("englishOrdinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [16, "16th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [111, "111th"],
  ])("says place %i as %s", (place, said) => {
    expect(englishOrdinal(place)).toBe(said);
  });
});

describe("koTime and enTime", () => {
  it.each([
    [5, "5초", "5 s"],
    [23, "23초", "23 s"],
    [30, "30초", "30 s"],
    [60, "1분", "1 min"],
    [90, "1분 30초", "1.5 min"],
    [100, "1분 40초", "1 min 40 s"],
    [150, "2분 30초", "2.5 min"],
    [300, "5분", "5 min"],
    [450, "7분 30초", "7.5 min"],
    [1200, "20분", "20 min"],
  ])("say %i seconds as %s and %s", (seconds, ko, en) => {
    expect(koTime(seconds)).toBe(ko);
    expect(enTime(seconds)).toBe(en);
  });
});
