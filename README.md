# Module Ground — 모듈러 배치 스튜디오

VWorld 주소 검색과 필지 경계, 모듈 규격, 건축 조건을 바탕으로 배치 후보를 탐색하는 웹사이트입니다.

## 실행

Node.js 22 이상에서 실행합니다.

```sh
cd modular-studio
npm ci
npm start
```

http://localhost:8791 에서 열 수 있습니다.

- [사이트 소스와 상세 실행 안내](modular-studio/README.md)
- [VS Code 작업 파일](modular-studio/Module%20Ground.code-workspace)
- [참고 레포지토리 분석](분석보고서.md)

API 키는 로컬 `.env`에 저장하며 Git 추적에서 제외합니다. 현재 VWorld 주소 검색은 확인됐지만 필지·지적도 인증은 등록 URL 및 서비스 사용 설정 확인이 필요합니다. 모듈 배치는 구조·피난·인허가 검토 전의 개략 후보입니다.
