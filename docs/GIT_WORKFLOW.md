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

## DB 마이그레이션 — main 푸시 전 필수 점검

운영 DB(choichoi-seoul)는 브랜치가 하나뿐이라 dev에서 적용한 마이그레이션도 곧바로 운영에 기록된다.
main의 `supabase/migrations/`에 그 파일이 없으면 Supabase가 main 푸시마다
`Remote migration versions not found in local migrations directory.`로 실패한다.

main에 푸시하기 전에:

1. 원격 적용 목록(Supabase 대시보드 → Database → Migrations, 또는 MCP `list_migrations`)과
   main의 `supabase/migrations/` 파일 버전을 비교한다.
2. **원격에만 있는 버전** → 그 파일을 만든 브랜치(보통 dev)에서 main으로 가져온다.
   `git checkout origin/dev -- supabase/migrations/<버전>_<이름>.sql` (이미 적용된 SQL이라 다시 실행되지 않는다)
3. **로컬에만 있는 버전** → 아직 운영에 없는 변경이다. 코드가 그 컬럼·함수 없이도 동작하는지 확인하고 푸시한다.
4. 원격에 마이그레이션을 적용했으면 같은 버전의 파일을 **같은 날 main까지** 올린다 — dev에만 두면 위 오류가 난다.
