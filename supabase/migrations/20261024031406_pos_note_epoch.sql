-- 공유 메모장 문서(pos_note.ydoc) 세대. Yjs는 지운 글자 구조와 접속했던 기기마다의 상태를 계속 쌓아서, 메모가
-- 비어 있는데도 ydoc이 112KB(기기 128대분)까지 커졌고 메모장을 열 때마다 이 전체를 주고받았다.
-- 서버가 커진 문서를 "지금 보이는 글만 담은 새 문서"로 압축할 때 epoch를 올린다(lib/posNoteSync.ts compactNoteDoc).
-- 새 문서는 옛 문서와 이어지지 않으므로, 옛 세대 문서를 든 기기의 저장·방송은 합치지 않고 그 기기가 새 문서로 갈아탄다
-- — 합치면 압축으로 버린 이력이 되살아난다. 기본값 0이라 이 컬럼을 모르는 기존 코드에는 영향이 없다.
alter table public.pos_note add column epoch integer not null default 0;
