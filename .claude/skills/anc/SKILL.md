---
name: anc
description: AI Native Camp CLI — 리더보드, 프로필, 투표, 기능 제안. "리더보드", "내 순위", "프로필", "투표", "건의", "/anc" 키워드에 반응
---

# ANC CLI

/anc 실행 시 **2단계**로 진행하세요:

## Step 1: 내 순위 먼저 보여주기

먼저 Bash로 실행: node ~/.config/ainc/anc-hook.js me

결과를 사용자에게 보여줍니다.

## Step 2: 메뉴 표시

순위를 보여준 직후, 아래 메뉴를 이어서 표시하세요:

---

🏕️ **AI Native Camp CLI**

무엇을 할까요?

1️⃣ **진행중인 투표 보기** — 현재 투표 현황을 확인하고 참여
2️⃣ **프로필 수정하기** — 상태메시지, 직함, 회사 등 변경
3️⃣ **건의하기** — 운영팀에 기능/개선 제안

번호를 선택하세요.

---

## 사용자가 선택하면

### 1번 (투표) 선택 시
바로 실행: node ~/.config/ainc/anc-hook.js vote
결과를 보여주고, 투표하고 싶다고 하면 node ~/.config/ainc/anc-hook.js vote <id> "<choice>"로 실행

### 2번 (프로필 수정) 선택 시
AskUserQuestion으로 "어떤 항목을 어떤 값으로 바꿀까요?" 질문
답변 받으면: node ~/.config/ainc/anc-hook.js profile edit <필드> "<값>"
필드: statusMessage, title, company, linkedinUrl, bio, role

### 3번 (건의하기) 선택 시
AskUserQuestion으로 "어떤 건의를 하시겠어요?" 질문
답변 받으면: node ~/.config/ainc/anc-hook.js suggest "<내용>"

## 기타 명령어 (직접 요청 시)

- node ~/.config/ainc/anc-hook.js me — 내 순위, 티어
- node ~/.config/ainc/anc-hook.js stats — 오늘 통계
- node ~/.config/ainc/anc-hook.js profile @username — 유저 조회
- node ~/.config/ainc/anc-hook.js help — 전체 도움말
