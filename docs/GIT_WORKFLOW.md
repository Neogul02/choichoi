# Git 브랜치 운영 가이드

## 브랜치 구조

| 브랜치 | 용도 | Vercel 배포 |
|--------|------|------------|
| `main` | 배포용 소스코드만 | ✅ 자동 배포 |
| `dev`  | 개발 + AI 도구 포함 | ❌ |

---

## 일반 개발 플로우 (dev에서 작업)

```bash
git checkout dev

# 코드 작업 후
git add .
git commit -m "feat: 기능 설명"
git push origin dev
```

---

## 배포 플로우 (dev → main)

### 방법 A: 로컬 직접 머지 (소규모 작업)

```bash
git checkout main
git merge dev
git push origin main
git checkout dev          # 작업 브랜치로 복귀
```

### 방법 B: GitHub PR (권장)

```bash
# dev push 후 GitHub에서 Pull Request 생성
# dev → main 머지
```

---

## 주의사항

- **항상 dev에서 작업** — main에서 직접 커밋 금지
- `.claude/`, `.omc/`, `AGENTS.md`, `CLAUDE.md` 등 AI 도구 파일은 dev 전용
- `.gitignore`에 등록되어 있어 main에 머지해도 자동 제외됨
