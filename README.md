# 포스트잇 메모

데스크톱에 띄워두는 포스트잇 스타일 할일 메모 앱입니다.

## 처음 한 번

```bash
cd ~/Desktop/memo
npm install
npm run build
npm run install-app
```

`Applications` 폴더에 **Memo.app** 이 설치되고 자동 실행됩니다.

## 터미널 없이 실행 (추천)

```bash
npm run launch
```

또는 Finder에서 `Applications/Memo.app` 더블클릭.

- 터미널 창 **안 뜸**
- 터미널 닫아도 **계속 실행**
- Python 백그라운드 실행이랑 같은 느낌

## 개발용 (터미널 필요)

```bash
npm start
```

## 컴퓨터 켤 때 자동 실행

- 기본값: **켜짐**
- ⚙ 설정 → **컴퓨터 켤 때 자동 실행** 체크/해제

## 기능

- **오늘 할일** — KST 기준 오늘 날짜 표시
- **할일** — 일반 할일 목록
- ⠿ 드래그로 오늘 할일 ↔ 할일 이동
- 자정(KST) 지나면 오늘 할일 → 할일로 이동 (끝에 `(7월 7일)` 표시)
- **오늘 한일 정리하기** — 완료 항목 정리 + `archive/` 저장
- ⚙ 메모 색상, 완료 기록 폴더 열기
