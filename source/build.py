import argparse
import base64
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
TITLE_BLOCK = re.compile(r'(<title>)(.*?)(</title>)', re.S)
DESCRIPTION_BLOCK = re.compile(r'(<meta name="description" content=")([^"]*)(">)')


def records(path):
    with path.open('r', encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


def strings(path):
    with path.open('r', encoding='utf-8-sig', newline='') as source:
        rows = list(csv.reader(source))
    if not rows or rows[0] != ['id', 'text']:
        raise ValueError(f'{path}: 문자열 CSV의 첫 행은 id,text여야 합니다.')
    ids = [row[0] for row in rows[1:] if len(row) == 2]
    if len(ids) != len(rows) - 1 or len(ids) != len(set(ids)) or any(not row[0] for row in rows[1:]):
        raise ValueError(f'{path}: 빈 ID, 중복 ID 또는 잘못된 CSV 열이 있습니다.')
    return rows[1:]


def manifest():
    pages = sorted(records(RULES / 'pages.csv'), key=lambda page: int(page['order']))
    if [int(page['order']) for page in pages] != list(range(len(pages))):
        raise ValueError('pages.csv의 order는 0부터 연속된 페이지 순서여야 합니다.')
    names = [page['page'] for page in pages]
    string_files = [f'string_{name}_{index}.csv' for index, name in enumerate(names, 1)]
    page_files = {path.name for path in STRINGS.glob('string_*.csv')}
    if page_files != set(string_files):
        raise ValueError(f'페이지 문자열 파일명이 잘못되었습니다. 누락: {sorted(set(string_files) - page_files)}, 불일치: {sorted(page_files - set(string_files))}')
    page_strings = {name: strings(STRINGS / name) for name in string_files}
    indexed = {page['page']: dict(page_strings[file]) for page, file in zip(pages, string_files)}
    keyword_ids = {page: {key for key in values if key.endswith('_keyword')} for page, values in indexed.items()}
    visual = {row['rule']: row['value'] for row in records(RULES / 'visual.csv')}

    def keyword(page, keyword_id):
        if page not in keyword_ids or keyword_id not in keyword_ids[page]:
            raise ValueError(f'{page}: 키워드 문자열 ID {keyword_id!r}를 찾을 수 없습니다.')
        return indexed[page][keyword_id]

    # CSV defines slot order; different keywords may share the same image path.
    media = []
    video_keys = set()
    media_keys = set()
    profile_images = []
    all_image_paths = set()
    page_codes = {page['page']: page['page_number'] for page in pages}
    ordered_keywords = {
        page['page']: [id for id, _ in page_strings[file] if id.endswith('_keyword')]
        for page, file in zip(pages, string_files)
    }
    for row in records(RULES / 'keyword_media.csv'):
        name, key = row['page'], row['keyword_id']
        paths = [path for path in (row['left_image'], row['right_image']) if path]
        if name == 'profile':
            if key or len(paths) != 1:
                raise ValueError('프로필 이미지 연결 형식 오류')
            profile_images.extend(paths)
        else:
            if name not in ordered_keywords or key not in ordered_keywords[name]:
                raise ValueError(f'이미지에 연결할 키워드 ID 오류: {name}/{key}')
            if (name, key) in media_keys:
                raise ValueError(f'이미지 키워드 중복 오류: {name}/{key}')
            media_keys.add((name, key))
            # Preserve left/right slot positions, including empty fields.
            media.append({'page': name, 'keyword_id': key,
                          'paths': [row['left_image'], row['right_image']]})
        for path in paths:
            asset = Path(path)
            if (not path.startswith('resource/images/') or asset.is_absolute() or '..' in asset.parts
                    or asset.suffix.lower() not in {'.png', '.gif'}):
                raise ValueError(f'잘못된 이미지 경로: {path}')
            if not (ROOT / path).is_file():
                raise ValueError(f'이미지 파일 없음: {path}')
            all_image_paths.add(path)
    expected_profiles = [f'resource/images/profile/Image_A1_{number:02d}.png' for number in range(1, 4)]
    if profile_images != expected_profiles:
        raise ValueError(f'A1 프로필 이미지 순서 오류: {profile_images}')
    stored_images = {path.relative_to(ROOT).as_posix()
                     for path in (ROOT / 'resource/images').rglob('*')
                     if path.is_file() and path.suffix.lower() in {'.png', '.gif'}}
    if all_image_paths != stored_images:
        raise ValueError(f'미사용 이미지 파일: {sorted(all_image_paths ^ stored_images)}')

    videos = []
    for row in records(RULES / 'keyword_videos.csv'):
        name, key = row['page'], row['keyword_id']
        pair = (name, key)
        ids = [row['left_video_id'], row['right_video_id']]
        if name == 'profile' or name not in ordered_keywords or key not in ordered_keywords[name]:
            raise ValueError(f'영상에 연결할 키워드 ID 오류: {name}/{key}')
        if pair in video_keys or pair in media_keys:
            raise ValueError(f'영상과 이미지의 중복 연결: {name}/{key}')
        if any(not re.fullmatch(r'[a-zA-Z0-9_-]{11}', video_id) for video_id in ids):
            raise ValueError(f'YouTube 영상 ID가 잘못되었습니다: {name}/{key}')
        video_keys.add(pair)
        videos.append({'page': name, 'keyword_id': key, 'ids': ids})
    expected_keys = {(name, key) for name, ids in ordered_keywords.items() for key in ids}
    if media_keys | video_keys != expected_keys:
        raise ValueError(f'미연결 키워드 ID: {sorted(expected_keys - (media_keys | video_keys))}')

    tables = {}
    referenced_table_paths = set()
    for page, file in zip(pages, string_files):
        page_id = page['page']
        keyword_id = None
        body_count = 0
        report_title_seen = False
        for string_id, text in page_strings[file]:
            if string_id.endswith('_report_title'):
                expected_id = keyword_id.replace('_keyword', '_report_title') if keyword_id else None
                if string_id != expected_id or report_title_seen or body_count or not text.strip():
                    raise ValueError(f'{page_id}: 보고서 제목 키의 위치·소속·내용이 잘못되었습니다: {string_id}')
                report_title_seen = True
                continue
            if string_id.endswith('_title'):
                continue
            if string_id.endswith('_keyword'):
                keyword_id = string_id
                body_count = 0
                report_title_seen = False
                continue
            if not keyword_id:
                continue
            if string_id.endswith('_table'):
                expected_id = keyword_id.replace('_keyword', '_table')
                if string_id != expected_id:
                    raise ValueError(f'{page_id}: 표 부모 ID가 다릅니다: {string_id}')
                if not re.fullmatch(r'table_[a-z]+_[0-9]+_keyword\.csv', text):
                    raise ValueError(f'{string_id}: 표 파일명이 잘못되었습니다: {text}')
                expected_filename = f'table_{page_id}_{keyword_id}.csv'
                if text != expected_filename:
                    raise ValueError(f'{string_id}: 표 파일명은 {expected_filename}이어야 합니다.')
                path = RULES / text
                if not path.is_file() or text in referenced_table_paths:
                    raise ValueError(f'{string_id}: 표가 없거나 중복 참조되었습니다: {text}')
                referenced_table_paths.add(text)
                table_rows = records(path)
                if len(table_rows) != 1:
                    raise ValueError(f'{text}: 표 데이터는 정확히 한 행이어야 합니다.')
                row = table_rows[0]
                cells = json.loads(row['rows_json'])
                if not cells or any(len(r) != len(cells[0]) for r in cells):
                    raise ValueError(f'{text}: 표 행·열 구성이 잘못되었습니다.')
                tables[text] = {
                    'id': row['table_id'], 'page': page_id,
                    'rows': cells,
                    'widths': [float(n) for n in row['col_widths_px'].split('|') if n],
                    'insertAfter': int(row['insert_after_paragraph']) if row['insert_after_paragraph'] else None,
                }
                continue
            body_count += 1
            if body_count > 1:
                raise ValueError(f'{page_id}/{keyword_id}: 하나의 키워드에 본문 ID가 여러 개입니다.')
    stored_tables = {p.name for p in RULES.glob('table_*.csv')}
    if stored_tables != referenced_table_paths:
        raise ValueError(f'미사용 또는 누락된 표 CSV: {sorted(stored_tables ^ referenced_table_paths)}')

    tools = []
    for row in records(RULES / 'profile_tools.csv'):
        if row['tooltip_id'] not in indexed['profile']:
            raise ValueError(f"{row['tool']}: 설명 문자열 ID {row['tooltip_id']}가 없습니다.")
        if not (ROOT / row['icon']).is_file():
            raise ValueError(f"{row['tool']}: 아이콘 파일을 찾을 수 없습니다.")
        tools.append({
            'tool': row['tool'], 'panel': int(row['panel']),
            'order': int(row['order']), 'score': int(row['score']),
            'maximum': int(row['maximum']), 'icon': row['icon'],
            'tooltip_id': row['tooltip_id'], 'url': row['url'],
        })
    # Offline-built HTML snapshots images; GitHub Pages ignores the embedded map.
    embedded_paths = sorted(all_image_paths | {tool['icon'] for tool in tools})
    embedded_images = {}
    for path in embedded_paths:
        suffix = Path(path).suffix.lower()
        mime = {'png': 'image/png', 'gif': 'image/gif', 'svg': 'image/svg+xml'}.get(suffix.lstrip('.'))
        if not mime:
            raise ValueError(f'지원되지 않는 로컬 빌드 이미지: {path}')
        encoded = base64.b64encode((ROOT / path).read_bytes()).decode('ascii')
        embedded_images[path] = f'data:{mime};base64,{encoded}'
    return {
        'embeddedImages': embedded_images,
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
        'videos': videos,
        'profileImages': profile_images,
        'tables': tables,
        'transitionMs': int(visual['camera_transition_ms']),
        'profileTools': tools,
    }


def update_profile_photos(source):
    blocks = list(PROFILE_BLOCK.finditer(source))
    if len(blocks) != 1:
        raise ValueError('index.html: profile-photos 영역이 정확히 하나 있어야 합니다.')
    paths = [row['left_image'] for row in records(RULES / 'keyword_media.csv') if row['page'] == 'profile']
    for path in paths:
        if not (ROOT / path).is_file():
            raise ValueError(f'프로필 이미지 파일을 찾을 수 없습니다: {path}')
    markup = blocks[0].group(2)
    if len(PHOTO_SOURCE.findall(markup)) != len(paths):
        raise ValueError('프로필 이미지 슬롯 수와 CSV 이미지 수가 다릅니다.')
    iterator = iter(paths)
    updated = PHOTO_SOURCE.sub(lambda match: match.group(1) + next(iterator) + match.group(3), markup)
    return source[:blocks[0].start(2)] + updated + source[blocks[0].end(2):]


def replace_once(source, pattern, value, label):
    matches = list(pattern.finditer(source))
    if len(matches) != 1:
        raise ValueError(f'index.html: {label} 영역은 정확히 하나 있어야 합니다.')
    match = matches[0]
    return source[:match.start(2)] + value + source[match.end(2):]


def run(command, dry_run):
    index = ROOT / 'index.html'
    source = index.read_text(encoding='utf-8')
    data = manifest()
    generated = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    # The deployed HTML has no embedded data. A local build inserts the block on demand.
    if DATA_BLOCK.search(source):
        new_source = replace_once(source, DATA_BLOCK, generated, 'portfolio-data')
    elif command == 'check':
        new_source = source
    else:
        marker = '<script src="source/app.js"></script>'
        if source.count(marker) != 1:
            raise ValueError('index.html: 실행 스크립트 위치 오류')
        new_source = source.replace(marker, '<script id="portfolio-data" type="application/json">' + generated + '</script>\n' + marker, 1)
    profile = dict(data['strings']['string_profile_1.csv'])
    new_source = replace_once(new_source, TITLE_BLOCK, profile['1050'], 'title')
    new_source = replace_once(new_source, DESCRIPTION_BLOCK, profile['1001'], 'description')
    new_source = update_profile_photos(new_source)
    differs = source != new_source
    if command == 'check':
        if differs:
            raise ValueError('CSV와 index.html 실행 데이터가 다릅니다. python source/build.py build를 실행하세요.')
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
        print(json.dumps(run(args.command, args.dry_run), ensure_ascii=False))
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(json.dumps({'status': 'error', 'message': str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
