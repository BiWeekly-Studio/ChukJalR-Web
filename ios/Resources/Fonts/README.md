# IBM Plex Sans KR

웹(`index.html` 이 Google Fonts 에서 받는 것)과 같은 가족이다. iOS 에는 이 폰트가
없으므로 번들한다 — 안 하면 한글이 Apple SD Gothic Neo 로 떨어져 두 앱의 인상이 갈린다.

원본은 https://github.com/google/fonts/tree/main/ofl/ibmplexsanskr 의 TTF 이고,
한자·가나를 뺀 서브셋이다 (한글 음절 전체 U+AC00–D7A3, 호환 자모, 라틴, 문장부호).
서브셋 명령은 `design/subset-fonts.sh` 에 있다.

라이선스: SIL Open Font License 1.1 — `OFL.txt` 참조.
