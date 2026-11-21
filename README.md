# 포트폴리오 사이트

실행 진입점은 `index.html`입니다. 브라우저에서 파일을 열거나 GitHub Pages에 배포할 수 있습니다. 빌드 과정에서 외부 CDN이나 JavaScript 프레임워크를 사용하지 않습니다.

## 콘텐츠와 규칙 수정

- 문자열: `source/strings/string_{page}_{order}.csv` (`pages.csv`의 0부터 시작하는 `order`에 1을 더한 페이지 순번)
- 화면 좌표·이미지 연결·표·영상·도구 점수 및 툴팁: `source/rules/*.csv`
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

## 문자열 ID와 표 관리

`source/strings/common.csv`에는 공통 프레임, 보고서 기본 안내, 프로필 제원 항목명, 이미지 확대 버튼 등 공용 UI 문구를 저장합니다. 페이지별 CSV에는 키워드·본문·링크·캡션을 저장합니다. 동일한 본문의 여러 줄은 하나의 ID에 `<br>`로 연결합니다. 다른 이미지의 캡션이나 독립된 링크는 고유 ID를 사용합니다.

`source/rules/keyword_media.csv`와 `source/rules/videos.csv`의 `keyword_id`는 각 페이지 문자열 CSV의 `_keyword` ID를 참조합니다. `source/rules/tables.csv`는 `cell_ids_json` 배열에 표 셀 문자열 ID를 저장합니다. 표에 표시될 문구는 해당 페이지 문자열 CSV의 `_cell_` ID에서 가져옵니다. 규칙 CSV를 수정할 때 표의 실제 문구를 중복 입력하지 않습니다.

모든 CSV는 **UTF-8 BOM**으로 저장합니다. Windows Excel에서 열어도 한글이 깨지지 않도록 하기 위한 인코딩입니다. Python에서는 `utf-8-sig`로 읽고 씁니다. CSV에서 표시 문구나 문자열 ID를 수정한 뒤 `python source/build.py build`와 `python source/build.py check`를 실행합니다.
