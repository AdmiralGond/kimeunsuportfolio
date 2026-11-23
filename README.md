# 포트폴리오 사이트

실행 진입점은 `index.html`입니다. GitHub Pages와 로컬 빌드본은 같은 파일을 서로 다른 데이터 로딩 방식으로 실행합니다. 외부 CDN 또는 JavaScript 프레임워크는 사용하지 않습니다.

## 콘텐츠와 규칙 수정

- 문자열: `source/strings/string_{page}_{order}.csv` (`pages.csv`의 0부터 시작하는 `order`에 1을 더한 페이지 순번)
- 화면 좌표·이미지 연결·표·도구 점수 및 툴팁: `source/rules/*.csv`
- 화면 표현: `source/style.css`, 상호작용: `source/app.js`
- 이미지·SVG·OTF: `resource/`

CSV가 콘텐츠·규칙의 원본입니다. `index.html`은 실행 진입점이며 `source/build.py`로 빌드하면 로컬 실행을 위한 데이터 사본이 HTML의 `portfolio-data`에 생성됩니다.

- **GitHub Pages (`https://admiralgond.github.io/kimeunsuportfolio/`)**: 브라우저가 같은 사이트의 `source/strings/*.csv`, `source/rules/*.csv` 파일을 **상대 경로**로 읽습니다. `portfolio-data` 내장 데이터는 사용하지 않습니다. CSV 변경을 GitHub Pages에 배포하면 HTML 재빌드 없이 이후 사이트 로딩에 반영됩니다.
- **로컬 실행**: `python source/build.py build`를 실행해 CSV 데이터가 내장된 `index.html`을 갱신합니다. ZIP에 포함된 빌드본 `index.html`을 열면 내장 데이터를 사용하므로 폴더 선택·CSV의 `fetch()` 요청 없이 실행됩니다.
- **검증**: `python source/build.py check`는 CSV와 빌드된 HTML이 일치하는지 확인하고, `python source/build.py build --dry-run`은 변경 필요 여부를 확인합니다.

```bash
python source/build.py check
python source/build.py build --dry-run
python source/build.py build
```

## 문자열 CSV 관리

표시할 텍스트는 페이지별 `string_{page}_{order}.csv` 9개에서 관리합니다. 별도의 `common.csv`를 사용하지 않습니다.

- 열 형식은 `id,text`입니다. CSV의 문자 인코딩은 **UTF-8 BOM**이며 Excel에서 열었을 때 한글과 일본어가 깨지지 않도록 합니다.
- 페이지 제목은 `_title`, 키워드 제목은 `_keyword` ID를 사용합니다.
- 키워드 버튼은 `_keyword` ID의 `<br>`을 줄바꿈으로 표시합니다. 보고서 제목은 기본적으로 같은 키워드 문자열을 사용하되, 별도 제목이 필요한 경우 대응하는 `_report_title` ID로 독립 관리합니다. 이미지 연결은 기존 `_keyword` 문자열을 기준으로 유지합니다.
- D1 `9002_keyword`는 버튼에서 두 줄로 표시하고, `9002_report_title`은 보고서 제목행에서 줄바꿈 없이 한 줄로 표시합니다.
- 하나의 키워드에는 본문 ID를 최대 하나만 사용합니다. 본문에는 설명·인용·링크·사진 설명 등 표 이외의 내용을 순서대로 포함하며 줄바꿈은 `<br>`로 표시합니다.
- 표가 있는 키워드에는 `_table` 부모 ID를 두고 값으로 표 CSV 파일명을 지정합니다. `_table`은 화면에 표시할 문장이 아닙니다.
- D1 `AI 워크 플로우`의 본문은 `90101`에서 관리합니다. B2 `인간 튜토리얼`의 본문은 `40301`에서 관리합니다.
- 프로필의 이름·학교·학과·학점·연락처는 개별 정보 필드 ID로 유지합니다.
- 모든 화면 표시 문구는 문자열 ID로 참조합니다. HTML·JavaScript에서 직접 관리하지 않습니다.
- ID를 재사용하거나 배열 위치에 의존해 값을 읽지 않습니다. 원본 문구는 별도의 요청 없이 수정하지 않습니다.

## 표 CSV 관리

사용 중인 표 다섯 개는 `source/rules` 폴더의 `table_{page}_{keyword_id}.csv`로 각각 관리합니다.

| 키워드 부모 ID | 파일명 |
| --- | --- |
| `4001_table` | `table_play_4001_keyword.csv` |
| `4002_table` | `table_play_4002_keyword.csv` |
| `4004_table` | `table_play_4004_keyword.csv` |
| `7002_table` | `table_tamagotchi_7002_keyword.csv` |
| `8001_table` | `table_documents_8001_keyword.csv` |

각 표 CSV는 `table_id,rows_json,col_widths_px,insert_after_paragraph` 형식으로 정확히 한 행을 관리합니다. C2 `문서 작성 이력` 표는 제목행 1개와 데이터행 6개로 구성하며 빈 행을 포함하지 않고, `<br>` 및 `<br><br>`은 원문 그대로 렌더링합니다. `rows_json`에 표의 셀 텍스트·링크·행·열을 그대로 기록하고, 표 셀마다 별도의 문자열 ID를 만들지 않습니다. 표는 해당 키워드의 본문보다 먼저 표시합니다.

이전에 존재하던 통합 `tables.csv`와 렌더링에 쓰이지 않던 프로필 표 기록은 사용하지 않습니다.

## 실행 데이터와 검증

- 온라인 `https:` 접속은 CSV 19개를 직접 요청하여 화면 데이터를 구성합니다. `index.html`에 내장된 데이터 사본을 참조하지 않습니다.
- 로컬 `file:` 실행은 `source/build.py build`로 갱신한 `portfolio-data`를 사용합니다. 압축 해제한 ZIP에는 이미 빌드된 `index.html`이 포함됩니다.
- CSV 파서는 UTF-8 BOM, 따옴표 안의 쉼표·줄바꿈, 표 셀의 JSON을 처리합니다.
- `source/build.py check`는 데이터 일치, 문자열 ID, 표·이미지·영상 연결을 검증합니다.
- v0.10.12와 v0.10.13을 보존하며 이 변경본은 v0.11.0으로 관리합니다.

## 외부 영상 동작

- B1 `프로젝트 테스트 영상`은 `source/rules/keyword_videos.csv`의 좌우 YouTube ID 두 개를 영상 플레이어로 직접 표시하며 자동재생은 사용하지 않습니다. 기존 두 검은색 이미지 자리의 높이 181.39px을 유지하고 영상은 16:9 비율로 표시합니다.
- `우현으로` 버튼의 고정 YouTube 주소는 `source/app.js`에서 직접 지정하며, 기존처럼 새 탭에서 엽니다.
- 프로젝트 본문의 클릭 가능한 외부 링크는 해당 페이지의 문자열 CSV에서 관리합니다.
