# 포트폴리오 사이트

실행 진입점은 `index.html`입니다. 브라우저에서 파일을 열거나 GitHub Pages에 배포할 수 있습니다. 빌드 과정에서 외부 CDN이나 JavaScript 프레임워크를 사용하지 않습니다.

## 콘텐츠와 규칙 수정

- 문자열: `source/strings/string_{page}_{order}.csv` (`pages.csv`의 0부터 시작하는 `order`에 1을 더한 페이지 순번)
- 화면 좌표·이미지 연결·표·도구 점수 및 툴팁: `source/rules/*.csv`
- 화면 표현: `source/style.css`, 상호작용: `source/app.js`
- 이미지·SVG·OTF: `resource/`

`index.html`의 `portfolio-data`에는 브라우저가 직접 파일을 열어도 사용할 수 있도록 CSV 내용을 함께 저장합니다. **CSV가 원본이고, 내장 데이터는 생성 결과입니다.** CSV를 수정한 뒤 아래 명령을 실행해야 화면에 반영됩니다.

```bash
python source/build.py check
python source/build.py build --dry-run
python source/build.py build
```

`check`는 현재 `index.html`과 CSV의 일치 여부를 확인합니다. `build --dry-run`은 파일 변경 없이 갱신 필요 여부를 출력합니다. `build`는 내장 데이터가 달라졌을 때만 `index.html`을 갱신합니다. 결과는 JSON으로 출력됩니다.

`source/build.py`는 표기·구조를 새로 설계하지 않고 CSV의 현재 값과 순서를 옮깁니다. 페이지 코드·좌표·이미지 파일명·문장은 기존 규칙을 유지하며 작업합니다.

## 문자열 CSV 관리

표시할 텍스트는 페이지별 `string_{page}_{order}.csv` 9개에서 관리합니다. 별도의 `common.csv`를 사용하지 않습니다.

- 열 형식은 `id,text`입니다. CSV의 문자 인코딩은 **UTF-8 BOM**이며 Excel에서 열었을 때 한글과 일본어가 깨지지 않도록 합니다.
- 페이지 제목은 `_title`, 키워드 제목은 `_keyword` ID를 사용합니다.
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

- CSV를 수정하면 `python source/build.py build`로 `index.html`에 포함된 실행 데이터를 갱신합니다.
- `python source/build.py check`로 실행 데이터가 원본 CSV와 일치하는지 검증합니다.
- 빌드 검사는 본문 ID 중복, 표 부모 ID 중복·누락, 존재하지 않는 표 파일 및 미사용 표 파일을 오류로 처리합니다.
- 외부 CSV의 `fetch()` 없이 HTML 안의 실행 데이터를 사용하므로 `index.html`을 직접 더블클릭해 실행할 수 있습니다.
- 기존 v0.10.8은 보존하고, 수정 결과물은 v0.10.9로 구분합니다.

## 외부 영상 동작

- B1 `프로젝트 테스트 영상`에 자동 첨부되던 YouTube 링크와 `source/rules/videos.csv`는 사용하지 않습니다.
- `우현으로` 버튼의 고정 YouTube 주소는 `source/app.js`에서 직접 지정하며, 기존처럼 새 탭에서 엽니다.
- 프로젝트 본문의 클릭 가능한 외부 링크는 해당 페이지의 문자열 CSV에서 관리합니다.
