#!/usr/bin/env python3
"""Build the bundled word books from cleaned open word-list sources.

The source files are not part of the static app. Put the four sentence JSON
files from https://github.com/KyleBing/dict into ./tools/source/ (or pass
--source-dir). Run:
    python3 tools/build_books.py
"""
import argparse
import json
import os
import re
from pathlib import Path

from build_wenyan import build_book as build_wenyan_book
from build_wenyan import js_payload as wenyan_js_payload

POS_MAP = {
    'n': 'n.', 'noun': 'n.', 'v': 'v.', 'vi': 'v.', 'vt': 'v.', 'verb': 'v.',
    'a': 'adj.', 'adj': 'adj.', 'adjective': 'adj.', 'ad': 'adv.', 'adv': 'adv.',
    'adverb': 'adv.', 'prep': 'prep.', 'pron': 'pron.', 'conj': 'conj.',
    'num': 'num.', 'art': 'art.', 'aux': 'aux.', 'int': 'int.', 'interj': 'int.',
    'abbr': 'abbr.', 'phr': 'phr.'
}

RANGES = [
    ('A', 'B', 'A – B', 'The Opening', 'notebook', '#315A4A', '#E5EADF'),
    ('C', 'D', 'C – D', 'Common Ground', 'heart', '#B45F42', '#F4DFD4'),
    ('E', 'G', 'E – G', 'Everyday Words', 'cpu', '#3F6B7F', '#DDE9ED'),
    ('H', 'L', 'H – L', 'Human Stories', 'leaf', '#6C7A41', '#E8E8D3'),
    ('M', 'O', 'M – O', 'In the Middle', 'globe', '#92703C', '#F2E4CE'),
    ('P', 'R', 'P – R', 'Power & Progress', 'quote', '#8B5B65', '#EFDFE1'),
    ('S', 'T', 'S – T', 'Stories & Science', 'sparkles', '#4F6E8A', '#DEE9F0'),
    ('U', 'Z', 'U – Z', 'The Last Mile', 'book-open', '#7B6A44', '#EEE7D5'),
]

BAD_SENTENCE_MARKERS = [
    ' fucking ', ' fuck ', ' sex ', ' porn', ' rape', ' suicide',
    ' murder ', ' killed himself', ' killed herself'
]

WORD_FIXES = {
    'behavious': 'behavior',
    'relinguish': 'relinquish',
}

CORE_MEANING_OVERRIDES = {
    'abandon': ['放弃', '遗弃', '放任', '狂热'],
    'minute': ['分，分钟', '片刻，一会儿', '将…记录下来', '微小的，详细的'],
    'cd': ['光盘，激光唱片（Compact Disc）', '呼叫设备（Call Device）'],
    'cabbage': ['卷心菜，甘蓝菜', '洋白菜', '（俚）脑袋'],
    'it': ['它', '这，那', '这件事'],
    'means': ['方法，手段', '财富，资源'],
    'surplus': ['过剩，剩余', '顺差'],
}

IPA_FALLBACKS = {
    'ad': '/ˌeɪˈdiː/', 'behavior': '/bɪˈheɪvjə/', 'cd': '/ˌsiːˈdiː/',
    'dr': '/ˈdɒktə/', 'dvd': '/ˌdiːviːˈdiː/', 'gy': '/ˌdʒiːˈwaɪ/',
    'handtruck': '/ˈhændtrʌk/', 'hibernation': '/ˌhaɪbəˈneɪʃn/',
    'jeans': '/dʒiːnz/', 'noisily': '/ˈnɔɪzɪli/', 'ok': '/ˌəʊˈkeɪ/',
    'organiser': '/ˈɔːɡənaɪzə/', 'pm': '/ˌpiːˈem/', 'repairs': '/rɪˈpeəz/',
    'sideway': '/ˈsaɪdweɪ/', 'uk': '/ˌjuːˈkeɪ/', 'un': '/ˌjuːˈen/',
    'walkman': '/ˈwɔːkmæn/', 'website': '/ˈwebsaɪt/', 'westerner': '/ˈwestənə/',
    'windbreaker': '/ˈwɪndbreɪkə/', 'advent': '/ˈædvent/', 'atlas': '/ˈætləs/',
    'aupair': '/ˌəʊˈpeə/', 'cemetery': '/ˈsemətri/', 'chiche': '/ʃiːʃ/',
    'code': '/kəʊd/', 'groa': '/ɡrəʊ/', 'pliable': '/ˈplaɪəbl/',
    'propulsion': '/prəˈpʌlʃn/', 'relinquish': '/rɪˈlɪŋkwɪʃ/',
    'stuntman': '/ˈstʌntmæn/', 'tranquility': '/træŋˈkwɪləti/',
    'tumour': '/ˈtjuːmə/', 'viable': '/ˈvaɪəbl/', 'hur': '/hɜː/',
}

POS_FALLBACKS = {
    'handtruck': 'n.', 'ambassador': 'n.', 'be': 'v.', 'concern': 'v. / n.',
    'deplore': 'v.', 'dwindle': 'v.', 'exceedingly': 'adv.', 'gauge': 'n. / v.',
    'guy': 'n.', 'inference': 'n.', 'minimum': 'n. / adj.', 'obscure': 'adj. / v.',
    'steadfast': 'adj.', 'verdict': 'n.', 'misled': 'v.',
}


def clean_text(value):
    value = (value or '').replace('\u00a0', ' ').replace('  ', ' ')
    return re.sub(r'\s+', ' ', value).strip()


def clean_meaning(value):
    value = clean_text(value)
    value = re.sub(r'\[[^\]]+\]', '', value)
    value = re.sub(r'（[^）]{1,8}）', '', value)
    value = re.sub(r'\s*\[[^\]]*$', '', value)
    value = re.sub(r'\s*（[^）]*$', '', value)
    value = re.sub(r'[\])）](?=\s*$)', '', value)
    for opening, closing in (('(', ')'), ('（', '）'), ('[', ']')):
        if value.count(opening) > value.count(closing):
            value = value[:value.rfind(opening)].rstrip()
    value = re.sub(r'^[\s,，;；:：.。\-]+', '', value)
    value = re.sub(r'[\s,，;；:：]+$', '', value)
    return value.strip()


def valid_translation(value):
    value = clean_meaning(value)
    if not value or len(value) > 80:
        return False
    if len(value) <= 1 and not re.search(r'[\u4e00-\u9fff]', value):
        return False
    if any(marker in value for marker in ['人名', '姓氏']) and len(value) > 20:
        return False
    return True


def pos_label(value):
    value = (value or '').strip().lower().replace(' ', '')
    labels = []
    for part in re.split(r'[&/,;]', value):
        label = POS_MAP.get(part.strip('.'))
        if label and label not in labels:
            labels.append(label)
    return ' / '.join(labels[:2])


def choose_meanings(translations):
    meanings = []
    labels = []
    for item in translations:
        raw = item.get('translation', '')
        if not valid_translation(raw):
            continue
        pieces = [clean_meaning(p) for p in re.split(r'[；;]', raw)]
        pieces = [p for p in pieces if p and valid_translation(p)]
        label = pos_label(item.get('type', ''))
        for piece in pieces[:2]:
            if piece not in meanings:
                meanings.append(piece)
                labels.append(label)
        if len(meanings) >= 4:
            break
    if not meanings:
        for item in translations:
            raw = clean_meaning(item.get('translation', ''))
            if raw:
                meanings.append(raw[:30])
                labels.append(pos_label(item.get('type', '')))
                break
    seen = []
    for label in labels:
        if label and label not in seen:
            seen.append(label)
    return meanings[:4], ' / '.join(seen[:2])


def normalize_ipa(us, uk):
    value = clean_text(uk or us or '')
    if not value:
        return ''
    value = value.strip('/[]')
    value = value.replace("'", 'ˈ').replace('’', 'ˈ').replace(',', 'ˌ')
    value = value.replace(':', 'ː')
    value = value.replace('ɡ', 'g')
    value = re.sub(r'\s+', ' ', value).strip()
    return f'/{value}/'


def fallback_example(word, collocations, meanings):
    phrase = next((item for item in collocations if word.lower() in item.lower()), '')
    if phrase:
        english_hint = re.sub(r'[\u4e00-\u9fff].*$', '', phrase).strip(' ;；,，')
        if english_hint:
            return (
                f'In class, we practiced the expression “{english_hint}”.',
                f'课堂上，我们练习了“{english_hint}”这个表达。',
            )
    core = meanings[0] if meanings else '这个词'
    return (
        f'Our teacher asked us to use “{word}” in a sentence.',
        f'老师请我们用“{word}”（{core}）造一个句子。',
    )


def has_target_word(sentence, word):
    return bool(sentence) and word.lower() in sentence.lower()


def word_stem(word):
    word = word.lower()
    return word[:-1] if len(word) > 4 and word[-1] in 'ey' else word


def score_sentence(sentence, translation, word):
    if not sentence or not translation:
        return -999
    sentence = clean_text(sentence)
    translation = clean_text(translation)
    if len(sentence) < 8 or len(translation) < 2 or len(sentence) > 180:
        return -999
    lower = sentence.lower()
    score = 4 if word_stem(word) in lower else 0
    score += 2 if 20 <= len(sentence) <= 120 else 0
    score += 1 if '…' not in sentence and '...' not in sentence else 0
    if any(marker in f' {lower} ' for marker in BAD_SENTENCE_MARKERS):
        score -= 8
    return score


def choose_sentence(sentences, word):
    best = None
    best_score = -999
    for item in sentences or []:
        sentence = clean_text(item.get('sentence', ''))
        translation = clean_text(item.get('translation', ''))
        score = score_sentence(sentence, translation, word)
        if score > best_score:
            best_score = score
            best = (sentence, translation)
    return best if best_score >= 0 else None


def choose_phrases(phrases, word):
    chosen = []
    seen = set()
    for item in phrases or []:
        phrase = clean_text(item.get('phrase', ''))
        translation = clean_text(item.get('translation', ''))
        if not phrase or not translation or len(phrase) > 42 or len(translation) > 50:
            continue
        if not 2 <= len(phrase.split()) <= 5:
            continue
        if word.lower() not in phrase.lower():
            continue
        if any(marker in f' {phrase.lower()} ' for marker in [' sex ', ' porn ']):
            continue
        pair = f'{phrase} {translation}'
        if pair in seen:
            continue
        seen.add(pair)
        chosen.append(pair)
        if len(chosen) >= 2:
            break
    return chosen


def normalize_id(word):
    return re.sub(r'[^a-z0-9]+', '-', word.lower()).strip('-')


def build_external(path, book_id, curated_map):
    raw = json.loads(Path(path).read_text())
    merged = {}
    order = []
    for entry in raw:
        word = clean_text(entry.get('word', '')).lower()
        word = WORD_FIXES.get(word, word)
        if not word or not re.search(r'[a-z]', word):
            continue
        if len(word) == 1:  # Skip letter-only entries such as "a" / "i".
            continue
        word_id = normalize_id(word)
        if not word_id:
            continue
        if word_id not in merged:
            merged[word_id] = {'word': word, 'entries': []}
            order.append(word_id)
        merged[word_id]['entries'].append(entry)

    words = []
    for word_id in order:
        item = merged[word_id]
        translations, sentences, phrases = [], [], []
        us = uk = ''
        for entry in item['entries']:
            translations.extend(entry.get('translations') or [])
            sentences.extend(entry.get('sentences') or [])
            phrases.extend(entry.get('phrases') or [])
            us = us or entry.get('us', '')
            uk = uk or entry.get('uk', '')
        meanings, pos = choose_meanings(translations)
        if not meanings:
            continue
        sentence = choose_sentence(sentences, item['word'])
        word = {
            'id': word_id,
            'word': item['word'],
            'ipa': normalize_ipa(us, uk),
            'pos': pos,
            'meanings': meanings,
            'unit': 1,
            'example': sentence[0] if sentence else '',
            'translation': sentence[1] if sentence else '',
            'collocations': choose_phrases(phrases, item['word']),
        }
        rich = curated_map.get(word_id)
        if rich:
            for key in ['ipa', 'pos', 'meanings', 'example', 'translation', 'collocations', 'family', 'tip', 'level']:
                if rich.get(key):
                    word[key] = rich[key]
        if word['word'] in CORE_MEANING_OVERRIDES:
            word['meanings'] = CORE_MEANING_OVERRIDES[word['word']]
        word['coreMeanings'] = word['meanings'][:2]
        word['extendedMeanings'] = word['meanings'][2:]
        if not word.get('ipa'):
            word['ipa'] = IPA_FALLBACKS.get(word['word'], '')
        if not word.get('pos'):
            word['pos'] = POS_FALLBACKS.get(word['word'], '')
        if not word.get('example') or not has_target_word(word.get('example', ''), word['word']):
            example, translation = fallback_example(word['word'], word.get('collocations') or [], word['meanings'])
            word['example'] = example
            word['translation'] = translation
            word['contentFlags'] = ['fallback-example']
        if not word.get('translation'):
            _, translation = fallback_example(word['word'], word.get('collocations') or [], word['meanings'])
            word['translation'] = translation
            word['contentFlags'] = sorted(set((word.get('contentFlags') or []) + ['fallback-translation']))
        words.append(word)

    words.sort(key=lambda word: word['word'].lower())
    for word in words:
        first = word['word'][:1].lower()
        for index, (start, end, *_rest) in enumerate(RANGES, start=1):
            if start.lower() <= first <= end.lower():
                word['unit'] = index
                break

    units = []
    for index, (start, end, title, en, icon, accent, tint) in enumerate(RANGES, start=1):
        group = [word for word in words if word['unit'] == index]
        units.append({
            'id': index,
            'title': f'{start} – {end}',
            'en': en,
            'caption': ' · '.join(word['word'] for word in group[:3]),
            'description': f'以 {start}、{end} 开头的常见词，共 {len(group)} 个。',
            'icon': icon,
            'accent': accent,
            'tint': tint,
            'count': len(group),
        })
    return {
        'id': book_id,
        'version': 1,
        'words': words,
        'units': units,
        'stats': {
            'rawEntries': len(raw),
            'uniqueWords': len(words),
            'withExample': sum(1 for word in words if word['example']),
            'withTranslation': sum(1 for word in words if word['translation']),
            'withIpa': sum(1 for word in words if word['ipa']),
            'withExtendedMeanings': sum(1 for word in words if word.get('extendedMeanings')),
            'fallbackExamples': sum(1 for word in words if 'fallback-example' in (word.get('contentFlags') or [])),
        },
    }


def load_english_curated(path):
    """Load the English enrichment source without publishing it as a book."""
    data = json.loads(Path(path).read_text())
    words = []
    for word in data['words']:
        item = dict(word)
        item['word'] = WORD_FIXES.get(str(item['word']).lower(), item['word'])
        item['id'] = normalize_id(item['word'])
        item['ipa'] = normalize_ipa('', item.get('ipa', ''))
        item['coreMeanings'] = item.get('coreMeanings') or item.get('meanings', [])[:2]
        item['extendedMeanings'] = item.get('extendedMeanings') or item.get('meanings', [])[2:]
        words.append(item)
    units = [
        {
            'id': unit['id'], 'title': unit['title'], 'en': unit['en'],
            'caption': unit['caption'], 'description': unit['description'],
            'icon': unit['icon'], 'accent': unit['accent'], 'tint': unit['tint'],
            'count': sum(1 for word in words if word['unit'] == unit['id']),
        }
        for unit in data['units']
    ]
    return {
        'id': 'curated',
        'version': 1,
        'words': words,
        'units': units,
        'stats': {'rawEntries': len(words), 'uniqueWords': len(words), 'withExample': sum(1 for word in words if word.get('example'))},
    }


def build_wenyan_curated(wenyan):
    """Build the focused 120-word Classical Chinese book from the core tier."""
    words = [
        dict(word)
        for word in wenyan['words']
        if word.get('category') == 'core'
    ]
    if len(words) != 120:
        raise SystemExit(f'expected 120 Classical Chinese core words, got {len(words)}')
    units = [dict(unit) for unit in wenyan['units'] if unit['id'] <= 6]
    return {
        'id': 'curated',
        'version': 2,
        'words': words,
        'units': units,
        'stats': {
            'uniqueWords': len(words),
            'coreWords': len(words),
            'withExample': sum(1 for word in words if word.get('example')),
            'withTranslation': sum(1 for word in words if word.get('translation')),
        },
    }



def js_payload(payload, book_id=None):
    raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    raw = raw.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    if book_id is None:
        return 'window.__SHICI_BOOK_INDEX__ = ' + raw + ';\n'
    return ('window.__SHICI_BOOKS__ = window.__SHICI_BOOKS__ || {};\n' +
            'window.__SHICI_BOOKS__[' + json.dumps(book_id) + '] = ' + raw + ';\n')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', default=str(Path(__file__).parent / 'source'))
    parser.add_argument('--out-dir', default=str(Path(__file__).parent.parent / 'data' / 'books'))
    parser.add_argument('--curated', default=str(Path(__file__).parent / 'curated_source.json'))
    args = parser.parse_args()

    english_enrichment = load_english_curated(args.curated)
    curated_map = {word['word'].lower(): word for word in english_enrichment['words']}
    wenyan = build_wenyan_book()
    curated = build_wenyan_curated(wenyan)
    sources = [
        ('GaoZhong_2.json', 'gaokao'),
        ('IELTS_2.json', 'ielts'),
        ('CET4_1.json', 'cet4'),
        ('CET6_1.json', 'cet6'),
    ]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {}
    for filename, book_id in sources:
        source_path = Path(args.source_dir) / filename
        if not source_path.exists():
            raise SystemExit(f'Missing source file: {source_path}')
        data = build_external(source_path, book_id, curated_map)
        target = out_dir / f'{book_id}.json'
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        target.with_suffix('.js').write_text(js_payload(data, book_id))
        index[book_id] = [word['id'] for word in data['words']]
        print(f'{book_id}: {data["stats"]["uniqueWords"]} words -> {target} ({target.stat().st_size // 1024} KB)')

    target = out_dir / 'curated.json'
    target.write_text(json.dumps(curated, ensure_ascii=False, separators=(',', ':')))
    target.with_suffix('.js').write_text(js_payload(curated, 'curated'))
    index['curated'] = [word['id'] for word in curated['words']]
    print(f'curated: {len(curated["words"])} Classical Chinese core words -> {target} ({target.stat().st_size // 1024} KB)')
    wenyan_path = out_dir / 'wenyan.json'
    wenyan_path.write_text(json.dumps(wenyan, ensure_ascii=False, separators=(',', ':')))
    wenyan_path.with_suffix('.js').write_text(wenyan_js_payload(wenyan))
    index['wenyan'] = [word['id'] for word in wenyan['words']]
    print(
        f'wenyan: {len(wenyan["words"])} words '
        f'({wenyan["stats"]["coreWords"]} core + '
        f'{wenyan["stats"]["extensionWords"]} extension + '
        f'{wenyan["stats"]["highfreqWords"]} high-frequency) -> {wenyan_path}'
    )
    index_target = out_dir / 'index.json'
    index_target.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    index_target.with_suffix('.js').write_text(js_payload(index))
    print(f'index: {sum(len(ids) for ids in index.values())} ids -> {index_target} ({index_target.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
