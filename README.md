# Memos

> **바탕화면에 붙여두는 포스트잇 스타일 할일 메모** — macOS · Windows

**👉 [소개 페이지](https://sangmok1.github.io/memo-app/) · [최신 다운로드 (Releases)](https://github.com/sangmok1/memo-app/releases/latest)**

---

## v1.3.0

- **커스텀 섹션** — + 섹션 추가, 이름 수정, 핀 고정, 삭제
- **창 항상 위** — 타이틀바 핀 버튼
- **Google 캘린더 양방향** — import `회의 14:00 [캘린더]` · export `[제목] 내용 (14:00)`
- **Google 로그인 동기화** — 기기 간 메모 sync
- **알람 보드** — 1회성 / 주기적 알람, 전체 화면 팝업

---

## ⬇️ 다운로드

| OS | 파일 | 설치 |
|----|------|------|
| **Mac** (Intel + Apple Silicon) | **`Memos.zip`** | 압축 해제 → `Memos.app`을 Applications로 이동 |
| **Windows** | **`Memos Setup *.exe`** | exe 실행 → 설치 |

### Mac 실행이 안 될 때 (-47 / 손상됨)

1. zip을 **완전히** 압축 해제 (미리보기에서 바로 실행하지 마세요)
2. `Memos.app` → **Applications**로 이동
3. 터미널: `xattr -cr /Applications/Memos.app && open /Applications/Memos.app`

> v1.3.0+ Releases 빌드는 **Apple 공증(Notarized)** 이 포함됩니다.

---

## 소개 페이지 (GitHub Pages)

저장소 **Settings → Pages → Build from branch `main` / `/docs`** 로 켜면 아래 주소에서 소개 페이지가 열립니다.

**https://sangmok1.github.io/memo-app/**

미리보기 HTML은 **실제 앱 CSS**(`styles.css`)를 그대로 사용합니다.

---

## 목차

1. [다운로드](#️-다운로드)
2. [개발자용 설치](#개발자용-설치-직접-빌드)
3. [매일 사용하기](#매일-사용하기)
4. [화면 사용법](#화면-사용법)
5. [기능 상세](#기능-상세)
6. [데이터 저장 위치](#데이터-저장-위치)
7. [FAQ / 문제 해결](#자주-묻는-것--문제-해결)

---

## 개발자용 설치 (직접 빌드)

```bash
git clone https://github.com/sangmok1/memo-app.git memo
cd memo
npm install
npm run build
npm run install-app
```

| 명령 | 설명 |
|------|------|
| `npm start` | 개발용 실행 |
| `npm run build:release:signed` | Mac 공증 + Windows 릴리스 빌드 |
| `npm run capture:screenshots` | 소개 페이지 미리보기 PNG 캡처 |

---

## 화면 사용법

```
┌──┬──────────────────────┐
│■ │ 📌 ⚙  −  ×         │  ← 핀 · 설정 · 최소화 · 닫기
│🔔│  오늘 할일  7월 28일 │
│+ │  ⠿ ☐ 할일...        │
│  │  + 추가 · 캘린더 추가│
│  │ ─────────────────── │
│  │  할일          📌   │
│  │  개인 메모    📌 ×  │
│  │  + 섹션 추가         │
└──┴──────────────────────┘
```

---

## 기능 상세

### 오늘 할일 / 섹션
- **오늘 할일**: KST 기준 오늘 집중 목록 (위치 고정)
- **섹션**: 할일 외 추가 섹션, 핀·드래그·삭제
- **자정 rollover**: 미완료 → 할일 섹션으로 이동, `(날짜)` 붙음

### Google 동기화 · 캘린더
- Google 로그인 → GCS bundle sync
- 캘린더 import / export (쓰기 권한 최초 1회 재동의)

### 알람
- 1회성 · 주기적 알람, 전체 화면 팝업, 5분 후 자동 닫힘

---

## 데이터 저장

| 데이터 | 위치 |
|--------|------|
| 할일 · 섹션 | localStorage (자동 저장) |
| 완료 기록 | `~/Library/Application Support/memo-postit/archive/` |
| 동기화 | Google Cloud (로그인 시) |

---

## 자주 묻는 것

**Q. GitHub에서 받았는데 Mac -47 오류**
→ zip 완전 해제 후 Applications로 이동. Downloads에 남은 **구버전** Memos.app 삭제.

**Q. 다른 창 뒤로 숨기기**
→ 기본은 뒤로 감. 타이틀바 **핀** 켜면 항상 위.

---

## 저장소

https://github.com/sangmok1/memo-app
