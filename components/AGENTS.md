# components/

여러 화면이 공유하는 컴포넌트만 둔다. 한 화면 전용 컴포넌트는 그 라우트의 `_components/`에
둔다(`app/(admin)/hr/_components/`, `app/my/_components/`).

전부 `'use client'`이고 **직접 DB를 읽지 않는다.** 데이터는 부모가 Server Action으로 받아
props로 내린다. (`NavBar`만 예외적으로 이름 재조회 액션을 호출하며, 브라우저 세션당 1회로 제한한다.)

## 공용 UI

| 파일 | 역할 |
|---|---|
| `NavBar.tsx` | 상단 내비. 역할별 링크 표시, 로그인 모달. 모든 페이지에 뜨므로 재조회를 최소화한다 |
| `ConfirmDialog.tsx` | 확인 대화상자. **파괴적 동작은 반드시 이걸 거친다.** 엔터가 '확인'으로 동작하도록 통일돼 있다 |
| `LoadingScreen.tsx` | 인증 확인·라우트 전환 공용 로딩 화면 |
| `Skeleton.tsx` | 레이아웃을 유지하는 스켈레톤. "불러오는 중..." 텍스트 대신 쓴다 |
| `EmptyState.tsx` | 빈 목록 안내. 회색 한 줄이 아니라 "다음에 뭘 하면 되는지"를 보여준다 |
| `ErrorScreen.tsx` | 에러 바운더리 공용 화면. 오프라인 구분, digest 표시, 서버 경유 오류 수집 |
| `CopyText.tsx` | 클릭하면 복사되는 텍스트 |
| `TimeOfDayField.tsx` | 시각 입력. 하루를 `00:00~24:00` 한 축으로 고른다 — 오전/오후로 나누지 않고 `24:00`(하루의 끝)과 야간 근무를 모두 표현한다 |

## 문서·서명 (react-pdf)

| 파일 | 역할 |
|---|---|
| `ContractDocument.tsx` | 표준근로계약서 PDF. **근무시간 계산은 `lib/workhours`를 그대로 쓴다** — 여기서 따로 계산하면 계약서와 급여 금액이 어긋난다 |
| `PopupReportDocument.tsx` | 팝업 정산 리포트 PDF |
| `PDFPreviewPanel.tsx` | PDF 미리보기. 브라우저 내장 뷰어(iframe)는 데스크탑에서만 신뢰할 수 있어 화면 폭·포인터 정밀도로 분기한다 |
| `SignaturePad.tsx` · `WorkerSignModal.tsx` | 근무자 전자서명 |

## POS·디스플레이

`MenuStockModal.tsx` · `PosNoteWidget.tsx` · `SalesBanner.tsx` · `FloatingEmojis.tsx`

`display/` — 고객용 미러링 화면 전용(`BottomBanner` · `CheckoutOverlay` · `EmojiPhysics` ·
`MenuBoard` · `ScreenMode` · `ViewMode`). 결제 기능이 없고 WebSocket으로 상태만 받는다.

## 규칙

- 새 컴포넌트가 한 화면에서만 쓰인다면 여기 두지 말고 그 라우트의 `_components/`에 둔다.
- 금액·시간 계산을 컴포넌트 안에서 다시 구현하지 말 것. `lib/workhours`·`lib/utils`를 쓴다.
- 파괴적 동작(삭제·초기화)은 `ConfirmDialog`를 거치고, 되돌릴 수 있으면 되돌리기 토스트를 띄운다.
- `window.alert` / `confirm` / `prompt`를 쓰지 않는다 — `ConfirmDialog`와 `showMsg()`를 쓴다.
