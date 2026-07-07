# Memos

데스크톱에 띄워두는 포스트잇 스타일 할일 메모 · 알람 앱입니다.  
**macOS · Windows** 지원 | 터미널 없이 바로 실행

---

## 🆕 v1.1.0 업데이트

- **메모 여러 개** — 왼쪽 탭으로 메모 전환, `+`로 새 메모 추가
- **메모별 완료 기록** — `archive/{메모ID}/` 폴더에 날짜별 저장
- **메모 삭제** — 설정 또는 탭 우클릭으로 삭제 (마지막 1개는 유지)
- **알람 보드** — `+` → 알람 선택, 1회성 / 주기적 알람 등록
- **전체 화면 알람** — 시간되면 모니터 가운데 큰 팝업 (내용 대형 표시)
- **알람 자동 닫힘** — ✓ / × 또는 5분 후 자동 종료

---

## ⬇️ 다운로드

### 👉 [**최신 버전 (Releases)**](https://github.com/sangmok1/memo-app/releases/latest)

| OS | 파일 | 설치 |
|----|------|------|
| **Mac** (Intel + Apple Silicon) | **`Memos.zip`** | 압축 해제 → `Memos.app`을 Applications로 이동 |
| **Windows** | **`Memos Setup *.exe`** | exe 실행 → 설치 |

> Mac에서 실행 안 되면 아래 「Mac 실행이 안 될 때」 참고

### ⚠️ Mac에서 실행이 안 될 때 (손상됨 / 서명 오류)

파일이 **손상된 게 아닙니다.** Apple Developer 유료 서명($99/년)이 없는 앱이라 macOS가 차단하는 것입니다.

아래 메시지가 뜨는 경우도 **같은 이유**입니다:
> 「해당 코드가 서명된 원본 코드와 일치하지 않습니다」  
> 「앱이 손상되었거나 변경되었을 수 있습니다」

**✅ 해결 — Applications에 넣은 뒤 터미널에서 한 줄:**

```bash
xattr -cr /Applications/Memos.app && open /Applications/Memos.app
```

**✅ 또는** Releases의 **`Memos-Mac-Open.command`** 더블클릭  
(Memos.app을 Applications에 넣어둔 상태)

**✅ 또는** `Memos.app` **우클릭 → 열기** → 「열기」 (최초 1회)

**✅ 또는** 시스템 설정 → **개인정보 보호 및 보안** → 「확인 없이 열기」

> 💡 Apple Developer 계정으로 공식 서명·공증(notarization)을 하면 이 과정 없이 바로 열립니다. 현재는 개인 배포라 위 우회가 필요합니다.

Node.js 없이 **다운로드만으로** 사용할 수 있습니다.

---

## 목차

1. [다운로드](#️-다운로드)
2. [개발자용 설치 (직접 빌드)](#개발자용-설치-직접-빌드)
3. [매일 사용하기](#매일-사용하기)
4. [화면 사용법](#화면-사용법)
5. [기능 상세](#기능-상세)
6. [데이터 저장 위치](#데이터-저장-위치)
7. [자주 묻는 것 / 문제 해결](#자주-묻는-것--문제-해결)

---

## 개발자용 설치 (직접 빌드)

Node.js와 Git이 있는 경우:

### 필요한 것

- **macOS** 또는 **Windows**
- **Node.js** 18 이상 ([nodejs.org](https://nodejs.org))
- **Git**

터미널에서 확인:

```bash
node -v    # v18 이상
npm -v
git --version
```

---

## 처음 설치하기 (개발자)

### 1. 저장소 받기

```bash
cd ~/Desktop
git clone https://github.com/sangmok1/memo-app.git memo
cd memo
```

이미 폴더가 있다면:

```bash
cd ~/Desktop/memo
git pull
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 앱 빌드 + Applications에 설치

```bash
npm run build
npm run install-app
```

- `npm run build` → `dist/mac-arm64/Memos.app` 생성
- `npm run install-app` → `/Applications/Memos.app` 으로 복사 후 자동 실행

**이후부터는 터미널 없이 Memos.app만 켜면 됩니다.**

---

## 매일 사용하기 (추천)

### 실행 방법 (택 1)

| 방법 | 명령 / 동작 |
|------|-------------|
| **가장 쉬움** | Finder → **응용 프로그램** → **Memos** 더블클릭 |
| 터미널에서 | `npm run launch` |
| Spotlight | `Cmd + Space` → `Memos` 입력 → Enter |

### 터미널 닫아도 되나?

| 실행 방식 | 터미널 닫아도 됨? |
|-----------|-------------------|
| **Memos.app** (Applications) | ✅ **됨** — 터미널과 무관하게 실행 |
| `npm run launch` | ✅ **됨** — 내부적으로 Memos.app 실행 |
| `npm start` | ❌ **안 됨** — 터미널 닫으면 같이 종료 |

> ⚠️ `npm start`는 **개발용**입니다. 평소에는 **Memos.app**으로 쓰세요.

### 컴퓨터 켤 때 자동 실행

- 기본값: **켜짐**
- 앱 ⚙ **설정** → **「컴퓨터 켤 때 자동 실행」** 체크/해제

macOS **시스템 설정 → 일반 → 로그인 항목**에서도 Memos 등록 여부를 확인할 수 있습니다.

### 종료 / 최소화

- **−** : 최소화 (Dock에 남음)
- **×** : 앱 종료

---

## 화면 사용법

```
┌──┬──────────────────────┐
│■ │  ⚙  −  ×            │  ← 드래그해서 창 이동
│🔔│  오늘 할일  7월 7일   │
│+ │  ⠿ ☐ 할일 입력...    │
│  │  + 추가               │
│  │ ──────────────────── │
│  │  할일                 │
│  │  ⠿ ☐ 할일 입력...    │
│  │  + 추가               │
│  │  오늘 한일 정리하기    │  ← 메모만 (하단 고정)
└──┴──────────────────────┘
  ↑ 메모(■) / 알람(🔔) 탭, + 새로 만들기
```

### 할일 입력

- **+ 추가** : 새 줄 추가
- **Enter** : 다음 줄 추가
- **Backspace** (빈 줄에서) : 해당 줄 삭제
- **×** (마우스 올리면 표시) : 항목 삭제
- **☐ 체크** : 완료 표시

### 드래그앤드롭

- 왼쪽 **⠿** 핸들을 잡고 드래그
- **오늘 할일 ↔ 할일** 양방향 이동 가능
- 같은 목록 안에서 **순서 변경**도 가능

### 창 크기

- 모서리/가장자리를 잡고 **크기 조절** 가능
- 할일이 많아지면 **위쪽 목록만 스크롤**, 하단 「오늘 한일 정리하기」 버튼은 고정

### ⚙ 설정

| 항목 | 설명 |
|------|------|
| **메모/알람 색상** | 슬라이더로 색상 변경 |
| **컴퓨터 켤 때 자동 실행** | 로그인 시 Memos 자동 시작 |
| **완료 기록 폴더 열기** | 현재 메모의 archive 폴더 열기 (메모만) |
| **이 메모/알람 삭제** | 현재 탭 삭제 (마지막 1개는 불가) |

---

## 기능 상세

### 메모 여러 개

- 왼쪽 **+** → **메모** 또는 **알람** 선택
- 색상 **네모 탭** = 메모, **종 탭** = 알람
- 탭 클릭으로 전환, **우클릭**으로 삭제

### 알람

| 구역 | 설명 |
|------|------|
| **1회성 알람** | 특정 날짜 + 시간, 한 번만 울림 |
| **주기적 알람** | 요일 + 시간, 반복 울림 |

- **+ 알람 추가** → 제목, 내용, 시간(KST), 날짜/요일, 반복 여부 입력
- 알람 시간이 되면 **전체 화면 중앙**에 내용이 크게 표시
- **✓** / **×** 로 끄거나 **5분 후 자동 닫힘**

---

### 오늘 할일 / 할일

| 구역 | 설명 |
|------|------|
| **오늘 할일** | 오늘(KST) 집중할 일. 상단에 오늘 날짜 표시 |
| **할일** | 일반 백로그. 날짜와 무관하게 유지 |

### 자정이 지나면 (KST)

앱을 **다음날 처음 켤 때** 자동 처리:

1. **완료된 오늘 할일** → `archive/` 폴더에 날짜별 저장
2. **오늘 할일 전체** → **할일**로 이동, 끝에 `(7월 7일)` 날짜 붙음
3. **오늘 할일** → 비워지고 새 날짜로 시작

예시:

```
회의 준비          →  회의 준비 (7월 7일)
```

### 오늘 한일 정리하기

- 체크된(완료) 항목을 **날짜·구역별로 정리**해서 보여줌
- **복사** 버튼으로 클립보드에 복사
- 오늘 할일 중 완료 항목은 **archive/** 에도 함께 저장

정리 예시:

```
📋 2026년 7월 7일 (화) 완료한 일

[오늘 할일]
1. 회의 준비
2. 이메일 답장

총 2건 완료
```

### 완료 기록 (archive)

개발 모드(`npm start`) 실행 시:

```
~/Desktop/memo/archive/
  20260707-k3m9/          ← 메모 ID
    2026-07-07.json
    2026-07-07.md
```

Memos.app(설치 버전) 실행 시:

```
~/Library/Application Support/memo-postit/archive/
  20260707-k3m9/
    2026-07-07.json
    2026-07-07.md
```

- **`.json`** — 프로그램/주간 리뷰용 구조화 데이터
- **`.md`** — 사람이 읽기 쉬운 마크다운

⚙ **완료 기록 폴더 열기**로 Finder에서 바로 열 수 있습니다.

---

## 데이터 저장 위치

| 데이터 | 저장 위치 |
|--------|-----------|
| 할일 목록 (진행 중) | 앱 내부 localStorage (자동 저장) |
| 완료 기록 | `archive/` (위 경로 참고) |
| 메모 색상·설정 | 앱 설정 파일 |

별도 저장 버튼 없이 **입력 즉시 자동 저장**됩니다.

---

## 개발용 실행

코드를 수정하거나 디버깅할 때만 사용:

```bash
cd ~/Desktop/memo
npm start
```

- 터미널 창이 보이고, **터미널을 닫으면 앱도 종료**
- 코드 변경 후 **앱 재시작** 필요 (새로고침 없음)

---

## 코드 수정 후 다시 빌드

기능을 수정했거나 `git pull`로 업데이트 받았다면:

```bash
cd ~/Desktop/memo
git pull
npm install          # package.json 변경 시
npm run build
npm run install-app
```

기존 Memos.app을 덮어쓰고 다시 실행합니다. **할일 데이터는 유지**됩니다.

---

## 자주 묻는 것 / 문제 해결

### Q. Mac에서 「손상되어 열 수 없습니다」 / 「손상됨」

파일 문제가 **아닙니다.** 다운로드한 앱의 보안 검사(quarantine) 때문입니다.

```bash
xattr -cr /Applications/Memos.app
open /Applications/Memos.app
```

또는 **우클릭 → 열기**로 최초 1회 실행하세요.

### Q. 메모가 안 켜져요

```bash
cd ~/Desktop/memo
npm run install-app
```

### Q. 터미널 닫았더니 꺼졌어요

`npm start`로 켠 경우입니다. **Applications → Memos**로 다시 실행하세요.

### Q. 다른 창 뒤로 숨기고 싶어요

다른 앱 클릭하면 Memos는 뒤로 갑니다 (항상 위 고정 아님).  
다시 Memos 창을 클릭하면 앞으로 옵니다.

### Q. 완료 기록이 어디 있어요?

⚙ → **완료 기록 폴더 열기**  
또는 Finder에서 `~/Library/Application Support/memo-postit/archive/` (Memos.app 사용 시)

### Q. npm 명령어 모음

| 명령 | 설명 |
|------|------|
| `npm install` | 의존성 설치 |
| `npm start` | 개발용 실행 (터미널 필요) |
| `npm run build` | Memos.app 빌드 |
| `npm run install-app` | Applications에 설치 |
| `npm run launch` | 터미널 없이 Memos 실행 |

---

## 다른 사람에게 공유하기

**Releases 페이지 링크만 공유하면 됩니다:**

**https://github.com/sangmok1/memo-app/releases/latest**

Mac / Windows 설치 파일을 바로 다운로드할 수 있습니다.

### 새 버전 올리는 방법 (개발자)

```bash
git tag v1.1.0
git push origin v1.1.0
```

태그 push 시 GitHub Actions가 Mac·Windows 빌드를 자동 생성합니다.

<details>
<summary>수동 공유 방법 (zip 직접 전달)</summary>

Mac에서 직접 zip 만들기:

```bash
cd ~/Desktop/memo
npm run build
cd dist/mac-arm64
zip -r Memos.app.zip Memos.app
```

</details>

---

## 기술 스택

- Electron
- HTML / CSS / JavaScript
- localStorage (할일 데이터)
- JSON + Markdown (완료 기록)

---

## 저장소

https://github.com/sangmok1/memo-app
