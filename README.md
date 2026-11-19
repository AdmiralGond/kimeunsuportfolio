# 포트폴리오 사이트

실행 진입점은 `index.html`입니다. 브라우저에서 파일을 열거나 GitHub Pages에 배포할 수 있습니다. 빌드 과정에서 외부 CDN이나 JavaScript 프레임워크를 사용하지 않습니다.

## 콘텐츠와 규칙 수정

- 문자열: `source/strings/string_{page}_1.csv`
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
