#!/usr/bin/env python3
import json
import sys

from wordfreq import zipf_frequency


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: score-phrase-frequency.py INPUT.json OUTPUT.json')
    with open(sys.argv[1], 'r', encoding='utf-8') as source:
        phrases = json.load(source)
    scores = {
        phrase: round(zipf_frequency(phrase, 'en'), 3)
        for phrase in phrases
    }
    with open(sys.argv[2], 'w', encoding='utf-8') as target:
        json.dump(scores, target, ensure_ascii=True, indent=2, sort_keys=True)
        target.write('\n')


if __name__ == '__main__':
    main()
