-- 공유 메모장을 동시편집(Yjs CRDT)으로 바꾼다. content 통째 덮어쓰기는 두 사람이 동시에 쓰면
-- 나중에 저장한 쪽이 앞사람 글을 지웠고, 입력 중엔 남의 수정이 화면에 반영되지 않았다.
-- ydoc은 Yjs 문서 상태(base64)로 글자별 작성자까지 담는다. content는 사람이 읽을 수 있는 사본으로 계속 갱신한다.
-- nullable: 기존 행은 다음 조회 때 서버가 content로부터 ydoc을 한 번만 만든다(클라이언트마다 따로 만들면 글이 중복된다).
alter table public.pos_note add column ydoc text;
