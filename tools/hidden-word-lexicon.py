"""Builds the list of words of 히든 워드 and their vectors: src/shared/games/hidden-word/lexicon-ko.json.

Design: design/games/hidden-word.md. Run once, outside the game, whenever the
words or their glosses change; the game itself asks nothing of anyone while
it is played (`src/shared/games/hidden-word/lexicon.ts` reads the file).

What goes in (tools/hidden-word/):
  glosses-ko.tsv   a word, a tab, its meanings and what it is associated
                   with, in Korean ("우비<TAB>비 올 때 입는 옷. 비, 우산, 장화, …").
                   A line "word<TAB>#DROP reason" leaves the word out.
  envelope-ko.txt  the words an envelope may be filled from, one a line.

What is done:
  1. Each line is embedded as "word: gloss" with KURE-v1 (nlpai-lab/KURE-v1,
     MIT), a Korean sentence-embedding model. The bare word is not embedded:
     on a single word the model goes by spelling (우비 came out nearest 나비),
     and it has one vector for a word of two meanings. The gloss names every
     meaning and the things a speaker thinks of with the word, which is what
     the show said its scores went by.
  2. The vectors are centred, and each is then drawn towards the words it is
     associated with: to a word's own vector is added PULL times the mean of
     the vectors of the words its gloss lists and of the nearest few of the
     words whose glosses list it (those that are in the list). 대기 moves towards 공기 and towards
     순서 at once; 사랑 moves away from 사랑방.
  3. They are cut to DIMS numbers by principal components and kept as one
     signed byte a number.
  4. For each word the cosines to all the others are sorted. The cosines at
     fixed places (ANCHORS) are kept with it, and the game reads a score off
     them: so the nearest RANK_95 words of any word score 95 or more.
  5. The NEAR nearest words of each are kept too, so that the game seldom has
     to look through the whole list.

Needs (not the project's dependencies; a virtual environment of their own):
  pip install sentence-transformers numpy

  python tools/hidden-word-lexicon.py            # writes the file
  python tools/hidden-word-lexicon.py --report   # also prints how the show's pairs come out
  python tools/hidden-word-lexicon.py --cache /tmp/hw.npy   # keeps the embeddings between runs
"""
import argparse
import base64
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "hidden-word")
OUT = os.path.join(HERE, "..", "src", "shared", "games", "hidden-word", "lexicon-ko.json")

MODEL = "nlpai-lab/KURE-v1"
VERSION = 1
DIMS = 128
NEAR = 8
PULL = 1.0
# Of the words whose glosses list a word, it is drawn towards this many at most.
PULL_CAP = 8
# (place among a word's neighbours, score): place 1 is the nearest word, a
# fraction is of the whole list. Between two the score runs straight by cosine.
ANCHORS = [
    (1.0, 0.0),
    (0.9, 4.0),
    (0.75, 10.0),
    (0.5, 20.0),
    (0.2, 40.0),
    (0.07, 60.0),
    (0.025, 75.0),
    (0.008, 85.0),
    (70, 91.0),
    (30, 95.0),
    (12, 97.0),
    (4, 98.5),
    (1, 99.5),
]

# The show's pairs (design/games/hidden-word.md): reference, clue, what the show said. For --report only.
SHOW = [
    ("나무", "삼투압", "48.5"), ("나무", "경도", "54"), ("나무", "꾸중", "2.5"), ("나무", "도토리", "78.5"), ("나무", "버섯", "82"),
    ("나무", "소나무", ">=95"), ("나무", "뿌리", "96.5"), ("질문", "궁금증", "84.5"), ("질문", "꾸중", "32"), ("질문", "오답", "63"),
    ("질문", "호기심", "<95"), ("질문", "물음표", "<95"), ("질문", "질의", ">=95"), ("복수", "원한", ">=95"), ("도장", "태권도", "97"),
    ("도장", "유도", ">=95?"), ("목욕탕", "목욕", "99.5"), ("목욕탕", "샤워", ">=95"), ("목욕탕", "때", "<95"), ("목욕탕", "청결", "<95"),
    ("대기", "열", "95"), ("대기", "층", "91"), ("대기", "순서", ">=95"), ("대기", "조급함", "<95"), ("대기", "자", "<95"),
    ("손님", "주인", ">=95"), ("손님", "고객", "99.8"), ("손님", "식당", "<95"), ("손님", "선물", "<95"), ("손님", "가게", "<95"), ("손님", "인사", "<95"),
    ("사고", "자동차", "91.5"), ("사고", "차량", ">=95"), ("사고", "지능", "92"), ("사고", "뇌", ">=95"), ("회사", "일", ">=95"), ("회사", "사", "<95"),
    ("서점", "수필", "80"), ("서점", "문학", "<95"), ("서점", "독서", "<95"), ("서점", "책", ">=95"), ("영화관", "데이트", "<95"), ("영화관", "표", ">=95?"),
    ("이별", "지구", "8.5"), ("이별", "여행", "<95"), ("이별", "눈물", "<95"), ("이별", "죽음", "<95"), ("이별", "슬픔", ">=95"),
    ("머리", "미용실", ">=95"), ("대화", "말", "<95"), ("대화", "이야기", "99"), ("우비", "소설", "5"), ("우비", "우산", "96"),
    ("나침반", "북", ">=95"), ("수도", "도시", ">=95"), ("수도", "건설", "91.5"), ("수도", "경영", "<95"), ("행복", "불행", "96.5"), ("자동차", "바퀴", "96"),
]
LOOK = ["나무", "대기", "우비", "서점", "복수", "사고", "수도", "머리", "이별", "손님", "도장", "전복", "회사", "나침반", "사랑", "학교", "바다", "돈"]


def read_sources():
    words, glosses, dropped = [], {}, []
    for line in open(os.path.join(SOURCE, "glosses-ko.tsv"), encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        word, _, gloss = line.partition("\t")
        word, gloss = word.strip(), gloss.strip()
        if gloss.startswith("#DROP") or not gloss:
            dropped.append(word)
            continue
        if not re.fullmatch(r"[가-힣]{1,10}", word):
            sys.exit(f"not a word of Hangul: {word!r}")
        if word in glosses:
            sys.exit(f"twice in the list: {word}")
        glosses[word] = gloss
        words.append(word)
    words.sort()
    envelope = [w.strip() for w in open(os.path.join(SOURCE, "envelope-ko.txt"), encoding="utf-8") if w.strip()]
    missing = [w for w in envelope if w not in glosses]
    if missing:
        print("envelope words not in the list, left out:", " ".join(missing))
    envelope = sorted(set(w for w in envelope if w in glosses))
    return words, glosses, envelope, dropped


def embed(words, glosses, cache):
    texts = [f"{w}: {glosses[w]}" for w in words]
    key = json.dumps([MODEL, texts], ensure_ascii=False)
    if cache and os.path.exists(cache) and os.path.exists(cache + ".key") and open(cache + ".key", encoding="utf-8").read() == key:
        return np.load(cache)
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL)
    raw = model.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=True).astype(np.float32)
    if cache:
        np.save(cache, raw)
        open(cache + ".key", "w", encoding="utf-8").write(key)
    return raw


def associated(words, glosses):
    """For each word, the places of the words its gloss lists, and of the words whose glosses list it."""
    at = {w: i for i, w in enumerate(words)}
    listed = [[] for _ in words]
    listing = [[] for _ in words]
    for w in words:
        _, _, tail = glosses[w].partition(". ")
        for other in (x.strip() for x in tail.split(",")):
            if other in at and other != w and at[other] not in listed[at[w]]:
                listed[at[w]].append(at[other])
                listing[at[other]].append(at[w])
    return listed, listing


def pull(raw, listed, listing):
    """Each centred vector with PULL times the mean of its associated words' added, at length one.

    A word's associated words are those its own gloss lists and, of those
    whose glosses list it, the PULL_CAP nearest it: 바다 is listed by every
    fish of the list, and is not to become the mean of them.
    """
    base = raw - raw.mean(axis=0)
    base /= np.linalg.norm(base, axis=1, keepdims=True)
    out = base.copy()
    for i in range(len(base)):
        others = [j for j in listing[i] if j not in listed[i]]
        if len(others) > PULL_CAP:
            near = base[others] @ base[i]
            others = [others[k] for k in np.argsort(-near, kind="stable")[:PULL_CAP]]
        places_ = listed[i] + others
        if places_:
            out[i] = base[i] + PULL * base[places_].mean(axis=0)
    return out / np.linalg.norm(out, axis=1, keepdims=True)


def reduce(raw, dims):
    centred = raw - raw.mean(axis=0)
    # principal components by the covariance of the columns (1024 by 1024)
    values, vectors = np.linalg.eigh(np.cov(centred, rowvar=False))
    top = vectors[:, np.argsort(-values)[:dims]]
    cut = centred @ top
    # one signed byte a number: each vector scaled so that its largest is 127
    scaled = cut / np.abs(cut).max(axis=1, keepdims=True) * 127.0
    return np.rint(scaled).astype(np.int8)


def places(count):
    """ANCHORS as 0-based places from the nearest, the farthest first."""
    out = []
    for place, percent in ANCHORS:
        rank = place if isinstance(place, int) else max(1, round(place * (count - 1)))
        out.append((min(count - 1, rank) - 1, percent))
    return out


def neighbours(bytes_, at_places, near):
    """For each word: the cosines at the anchor places (rising) and its nearest words."""
    count = len(bytes_)
    unit = bytes_.astype(np.float32)
    unit /= np.linalg.norm(unit, axis=1, keepdims=True)
    anchors = np.zeros((count, len(at_places)), dtype=np.float32)
    nearest = np.zeros((count, near), dtype=np.int64)
    for start in range(0, count, 1024):
        cos = unit[start : start + 1024] @ unit.T
        for row in range(cos.shape[0]):
            cos[row, start + row] = -2.0  # the word itself is no neighbour of its own
        order = np.argsort(-cos, axis=1, kind="stable")  # (two as near: the list's own order parts them)
        for n, (place, _) in enumerate(at_places):
            anchors[start : start + 1024, n] = np.take_along_axis(cos, order[:, place : place + 1], axis=1)[:, 0]
        nearest[start : start + 1024] = order[:, :near]
    return unit, anchors, nearest


def percent_of(anchors, percents, cos):
    if cos <= anchors[0]:
        return percents[0]
    for i in range(1, len(percents)):
        if cos > anchors[i]:
            continue
        span = anchors[i] - anchors[i - 1]
        along = 1.0 if span <= 0 else (cos - anchors[i - 1]) / span
        return percents[i - 1] + along * (percents[i] - percents[i - 1])
    return percents[-1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--cache")
    parser.add_argument("--dims", type=int, default=DIMS)
    parser.add_argument("--dry", action="store_true", help="write nothing")
    args = parser.parse_args()

    words, glosses, envelope, dropped = read_sources()
    print(f"{len(words)} words, {len(envelope)} for envelopes, {len(dropped)} left out")
    if len(words) > 65535:
        sys.exit("more words than two bytes can number")
    raw = pull(embed(words, glosses, args.cache), *associated(words, glosses))
    bytes_ = reduce(raw, args.dims)
    at_places = places(len(words))
    unit, anchors, nearest = neighbours(bytes_, at_places, NEAR)
    percents = [percent for _, percent in at_places]

    # as the file keeps them: a cosine in two bytes
    kept = np.clip(np.rint((anchors + 1.0) * 32767.5), 0, 65535).astype("<u2")
    packed = []
    for row in range(len(words)):
        packed.append(base64.b64encode(bytes_[row].tobytes() + kept[row].tobytes() + nearest[row].astype("<u2").tobytes()).decode("ascii"))

    if args.report:
        at = {w: i for i, w in enumerate(words)}
        back = kept.astype(np.float64) / 32767.5 - 1.0

        def score(a, b):
            cos = float(unit[at[a]] @ unit[at[b]])
            return round(percent_of(back[at[a]], percents, cos) * 2) / 2, int((unit[at[a]] @ unit.T > cos).sum())  # (the word itself counts as one above)

        full = raw - raw.mean(axis=0)
        full /= np.linalg.norm(full, axis=1, keepdims=True)
        sample = np.random.default_rng(1).choice(len(words), 300, replace=False)
        agree = []
        for i in sample:
            a = set(np.argsort(-(full[i] @ full.T))[1:25].tolist())
            agree.append(len(a & set(np.argsort(-(unit[i] @ unit.T))[1:25].tolist())) / 24)
        print(f"nearest 24 kept after cutting to {args.dims} bytes: {np.mean(agree):.2f}")
        print(f"{'reference':6} {'clue':6} {'show':8} score  place")
        for a, b, show in SHOW:
            if a in at and b in at:
                s, place = score(a, b)
                print(f"{a:6} {b:6} {show:8} {s:5}  {place}")
            else:
                print(f"{a:6} {b:6} {show:8} (not in the list: {a if a not in at else b})")
        for ref in LOOK:
            if ref in at:
                print(ref, "→", " ".join(f"{words[i]}{score(ref, words[i])[0]:g}" for i in np.argsort(-(unit[at[ref]] @ unit.T))[1:31]))

    if args.dry:
        return
    data = {"version": VERSION, "dims": args.dims, "percents": percents, "near": NEAR, "words": words, "packed": packed, "envelope": envelope}
    with open(OUT, "w", encoding="utf-8") as out:
        json.dump(data, out, ensure_ascii=False, separators=(",", ":"))
        out.write("\n")
    print(f"wrote {os.path.relpath(OUT)}: {os.path.getsize(OUT) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
