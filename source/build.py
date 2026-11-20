import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES = ROOT / 'source' / 'rules'
STRINGS = ROOT / 'source' / 'strings'
DATA_BLOCK = re.compile(r'(<script id="portfolio-data" type="application/json">)(.*?)(</script>)', re.S)
PROFILE_BLOCK = re.compile(r'(<div id="profile-photos">)(.*?)(</div>)', re.S)
PHOTO_SOURCE = re.compile(r'(<img src=")([^"]+)(" alt="">)')


def records(path):
    with path.open('r', encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


def strings(path):
    with path.open('r', encoding='utf-8-sig', newline='') as source:
        rows = list(csv.reader(source))
    if not rows or rows[0] != ['id', 'text']:
        raise ValueError(f'{path}: 문자열 CSV의 첫 행은 id,text여야 합니다.')
    return rows[1:]


def manifest():
    pages = sorted(records(RULES / 'pages.csv'), key=lambda page: int(page['order']))
    visual = {row['rule']: row['value'] for row in records(RULES / 'visual.csv')}
    names = [page['page'] for page in pages]
    if [int(page['order']) for page in pages] != list(range(len(pages))):
        raise ValueError('pages.csv의 order는 0부터 연속된 페이지 순서여야 합니다.')
    string_files = [f'string_{name}_{index}.csv' for index, name in enumerate(names, 1)]
    source_files = {path.name for path in STRINGS.glob('string_*.csv')}
    if source_files != set(string_files):
        raise ValueError(f'문자열 CSV 파일명이 페이지 순서와 다릅니다. 누락: {sorted(set(string_files) - source_files)}, 불일치: {sorted(source_files - set(string_files))}')
    page_strings = {name: strings(STRINGS / name) for name in string_files}
    media = [
        {
            'page': row['page'],
            'keyword': row['keyword'],
            'paths': [path for path in (row['left_image'], row['right_image']) if path],
        }
        for row in records(RULES / 'keyword_media.csv')
        if row['page'] != 'profile'
    ]
    tables = {}
    for row in records(RULES / 'tables.csv'):
        widths = [float(value) for value in row['col_widths_px'].split('|') if value]
        tables[row['table_id']] = {
            'page': row['page'],
            'keyword': row['keyword'],
            'rows': json.loads(row['rows_json']),
            'widths': widths,
            'insertAfter': int(row['insert_after_paragraph']) if row['insert_after_paragraph'] else None,
        }
    tools = []
    for row in records(RULES / 'profile_tools.csv'):
        tools.append({
            'tool': row['tool'],
            'panel': int(row['panel']),
            'order': int(row['order']),
            'score': int(row['score']),
            'maximum': int(row['maximum']),
            'icon': row['icon'],
            'tooltip_id': row['tooltip_id'],
            'url': row['url'],
        })
    tooltips = dict(page_strings[string_files[names.index('profile')]])
    for tool in tools:
        if tool['tooltip_id'] not in tooltips:
            raise ValueError(f"{tool['tool']}: 설명 문자열 ID {tool['tooltip_id']}가 없습니다.")
    return {
        'pages': names,
        'pageCodes': [page['page_number'] for page in pages],
        'camera': [
            {'x': float(page['ship_source_center_x']), 'y': float(page['ship_source_center_y'])}
            for page in pages
        ],
        'cameraScale': float(visual['ship_scale']),
        'stringFiles': string_files,
        'strings': page_strings,
        'media': media,
        'tables': tables,
        'videos': records(RULES / 'videos.csv'),
        'transitionMs': int(visual['camera_transition_ms']),
        'profileTools': tools,
    }



def update_profile_photos(source):
    blocks = list(PROFILE_BLOCK.finditer(source))
    if len(blocks) != 1:
        raise ValueError('index.html: profile-photos 영역이 정확히 하나 있어야 합니다.')
    rows = records(RULES / 'keyword_media.csv')
    paths = [path for row in rows if row['page'] == 'profile' for path in (row['left_image'], row['right_image']) if path]
    markup = blocks[0].group(2)
    slot_count = len(PHOTO_SOURCE.findall(markup))
    if len(paths) != slot_count:
        raise ValueError(f'프로필 이미지 슬롯({slot_count}개)과 CSV 경로({len(paths)}개)의 수가 다릅니다.')
    iterator = iter(paths)
    updated = PHOTO_SOURCE.sub(lambda match: match.group(1) + next(iterator) + match.group(3), markup)
    return source[:blocks[0].start(2)] + updated + source[blocks[0].end(2):]


def run(command, dry_run):
    index = ROOT / 'index.html'
    source = index.read_text(encoding='utf-8')
    blocks = list(DATA_BLOCK.finditer(source))
    if len(blocks) != 1:
        raise ValueError('index.html: portfolio-data 스크립트 블록이 정확히 하나 있어야 합니다.')
    generated = json.dumps(manifest(), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    new_source = source[:blocks[0].start(2)] + generated + source[blocks[0].end(2):]
    new_source = update_profile_photos(new_source)
    differs = source != new_source
    if command == 'check':
        if differs:
            raise ValueError('CSV와 index.html 데이터가 다릅니다. python source/build.py build를 실행하세요.')
        return {'status': 'synchronized', 'changed': False, 'path': str(index)}
    if differs and not dry_run:
        index.write_text(new_source, encoding='utf-8')
    return {
        'status': 'dry_run' if dry_run else ('updated' if differs else 'unchanged'),
        'changed': differs and not dry_run,
        'requires_update': differs,
        'path': str(index),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CSV를 기준으로 index.html의 정적 실행 데이터를 갱신합니다.')
    parser.add_argument('command', choices=['build', 'check'], help='build: 생성; check: 현재 데이터와 CSV 비교')
    parser.add_argument('--dry-run', action='store_true', help='파일을 변경하지 않고 필요한 변경만 출력')
    args = parser.parse_args()
    try:
        result = run(args.command, args.dry_run)
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({'status': 'error', 'message': str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
