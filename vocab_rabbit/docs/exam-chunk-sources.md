# VocaRabbit exam-chunk sources

This project treats "all useful fixed expressions" as a corpus-bounded collection,
not as a claim that English has a closed or officially complete phrase inventory.
The target scope is child-appropriate TOEFL Primary / TOEFL Junior material,
approximately CEFR A1-B2.

## Included sources

| Source | Role | Coverage and license |
| --- | --- | --- |
| PHaVE List | High-confidence phrasal verbs and their common senses | 150 high-frequency phrasal verbs. Research resource by Melodie Garnier and Norbert Schmitt. |
| PHRASE List | High-confidence frequent formulaic expressions | 505 frequent non-transparent multiword expressions. Research resource by Ron Martinez and Norbert Schmitt. |
| English Wiktionary via Kaikki | Broad candidate discovery and definitions | Weekly structured Wiktextract data. Wiktionary content is CC BY-SA 4.0 / GFDL. |
| Open English WordNet 2025 | Broad multiword lexical entries | CC BY 4.0. |
| Local Qwen models | Candidate completion, Chinese meanings, CEFR/type classification, and final review | Generated metadata is checked against deterministic validation and a separate review pass. |

## Processing rules

1. Extract every PHaVE and PHRASE List row and fail if the counts are not exactly
   150 and 505.
2. Stream the English Kaikki dump and reject inflected-form duplicates, sentences,
   phrasebook entries, labelled rare/archaic/offensive material, and entries without
   useful multiword-expression signals.
3. Extract Open English WordNet multiword lexical entries.
4. Map candidates to VocaRabbit words by normalized headword or inflected headword.
5. Ask the first model to keep all A1-B2 exam chunks and add missing common chunks.
6. Run a detailed Qwen review plus independent Gemma and Qwen voting passes.
   Retain an item when another model agrees, when at least two independent lexical
   sources support it, or when PHaVE/PHRASE List directly supports it. This removes
   free combinations such as `can swim` while retaining items such as `look after`,
   `take care of`, `be good at`, `make a decision`, and `heavy rain`.
7. Prefer complete teaching forms and merge shorter duplicates, for example
   `be good at` over `good at` and `have a good time` over `good time`.
8. Apply only after all 1,693 word IDs have a reviewed record, including explicit
   empty arrays for words with no genuine fixed chunk.

## Teaching selection

The full reviewed inventory stays in `examChunks`. `teachingChunks` is a separate
learner-facing shortlist containing at most 10 expressions per word.

Selection starts with the English Zipf frequency estimate from `wordfreq` 3.1.1,
then gives additional weight to direct PHRASE List frequency, PHaVE rank, and
agreement between independent lexical sources. This keeps common exam expressions
such as `take place`, `take care of`, `be good at`, and `look after` ahead of less
useful alternatives while preserving the complete inventory for future use.

Rebuild the shortlist with:

```sh
python3 -m venv tmp/wordfreq-venv
tmp/wordfreq-venv/bin/python -m pip install wordfreq==3.1.1
WORDFREQ_PYTHON=tmp/wordfreq-venv/bin/python \
  node scripts/select-teaching-chunks.mjs --limit 10 --apply
```

## Source links

- PHaVE and PHRASE List resources:
  https://www.norbertschmitt.co.uk/vocabulary-resources
- PHRASE List appendix:
  https://www.lextutor.ca/tests/pvst/appendix_phrase_list.pdf
- Kaikki raw data:
  https://kaikki.org/dictionary/rawdata.html
- Wiktionary licensing:
  https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- Open English WordNet downloads and license:
  https://en-word.net/downloads
