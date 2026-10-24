import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { diffText, transformIndex, authorColor, assignAuthorColors, bytesToBase64, base64ToBytes, overlayRuns, deltaToRuns, loadNoteDoc, compactNoteDoc, rebaseOntoServer, POS_NOTE_TEXT_KEY } from './posNoteSync';

function apply(prev: string, next: string): string {
  const d = diffText(prev, next);
  return prev.slice(0, d.index) + d.insert + prev.slice(d.index + d.remove);
}

describe('diffText', () => {
  it.each([
    ['', 'abc'],
    ['abc', ''],
    ['abc', 'abXc'],
    ['aaaa', 'aaa'],
    ['hello world', 'hello brave world'],
    ['예약 3시', '예약 4시'],
    ['a😀b', 'a😁b'],
  ])('%s → %s 를 복원한다', (prev, next) => {
    expect(apply(prev, next)).toBe(next);
  });

  it('서로게이트 쌍을 반으로 자르지 않는다', () => {
    const d = diffText('a😀b', 'a😁b');
    expect(d.index).toBe(1);
    expect(d.remove).toBe(2);
    expect(d.insert).toBe('😁');
  });
});

describe('transformIndex', () => {
  it('앞쪽 삽입만큼 뒤로 민다', () => {
    expect(transformIndex(5, [{ retain: 2 }, { insert: 'xyz' }])).toBe(8);
  });
  it('뒤쪽 변경은 영향이 없다', () => {
    expect(transformIndex(2, [{ retain: 4 }, { insert: 'xyz' }, { delete: 3 }])).toBe(2);
  });
  it('같은 위치 삽입은 커서 앞에 둔다', () => {
    expect(transformIndex(3, [{ retain: 3 }, { insert: 'x' }])).toBe(3);
  });
  it('커서를 포함한 삭제는 삭제 시작점으로 당긴다', () => {
    expect(transformIndex(5, [{ retain: 3 }, { delete: 4 }])).toBe(3);
    expect(transformIndex(9, [{ retain: 3 }, { delete: 4 }])).toBe(5);
  });
});

describe('Yjs 동시편집 수렴', () => {
  it('두 사람이 동시에 다른 위치를 고쳐도 둘 다 남는다', () => {
    const base = new Y.Doc();
    base.getText(POS_NOTE_TEXT_KEY).insert(0, '예약 3시\n공지');
    const seed = Y.encodeStateAsUpdate(base);

    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, seed);
    Y.applyUpdate(b, seed);
    a.getText(POS_NOTE_TEXT_KEY).insert(5, '(4명)', { author: '민수' });
    b.getText(POS_NOTE_TEXT_KEY).insert(9, ': 휴무', { author: '지영' });

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getText(POS_NOTE_TEXT_KEY).toString()).toBe('예약 3시(4명)\n공지: 휴무');
    expect(b.getText(POS_NOTE_TEXT_KEY).toString()).toBe(a.getText(POS_NOTE_TEXT_KEY).toString());

    const authors = a.getText(POS_NOTE_TEXT_KEY).toDelta().map((op: { attributes?: { author?: string } }) => op.attributes?.author ?? null);
    expect(authors).toEqual([null, '민수', null, '지영']);
  });

  it('base64 왕복 후에도 같은 문서다', () => {
    const doc = new Y.Doc();
    doc.getText(POS_NOTE_TEXT_KEY).insert(0, '안녕 😀', { author: 'x' });
    const restored = new Y.Doc();
    Y.applyUpdate(restored, base64ToBytes(bytesToBase64(Y.encodeStateAsUpdate(doc))));
    expect(restored.getText(POS_NOTE_TEXT_KEY).toString()).toBe('안녕 😀');
  });
});

describe('authorColor', () => {
  it('같은 이름은 항상 같은 색, 이름이 없으면 기본색', () => {
    expect(authorColor('민수')).toBe(authorColor('민수'));
    expect(authorColor(null)).toBeNull();
    expect(authorColor('')).toBeNull();
  });

  it('해시가 같은 칸에 걸리는 이름끼리도 서로 다른 색을 받는다', () => {
    // 황형진·이지솔은 해시 칸이 같아 예전엔 둘 다 주황이었다
    const colors = assignAuthorColors(['황형진', '최진형', '이지솔']);
    expect(new Set(colors.values()).size).toBe(3);
    expect(authorColor('이지솔', colors)).toBe(colors.get('이지솔'));
  });

  it('입력 순서와 무관하게 같은 목록이면 같은 배정 — 기기마다 색이 달라지지 않는다', () => {
    const a = assignAuthorColors(['이지솔', '황형진', '최진형']);
    const b = assignAuthorColors(['최진형', '황형진', '이지솔', '황형진']);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});

describe('overlayRuns', () => {
  const runs = [
    { text: '예약 ', author: null },
    { text: '3시', author: '민수' },
    { text: ' 공지', author: '지영' },
  ];
  const join = (r: { text: string }[]) => r.map((x) => x.text).join('');

  it('값이 같으면 그대로', () => {
    expect(overlayRuns(runs, '예약 3시 공지', '나')).toBe(runs);
  });
  it('구간 중간 삽입은 내 색으로 끼워 넣는다', () => {
    const out = overlayRuns(runs, '예약 3시반 공지', '나');
    expect(join(out)).toBe('예약 3시반 공지');
    expect(out).toContainEqual({ text: '반', author: '나' });
    expect(out.find((r) => r.author === '민수')?.text).toBe('3시');
  });
  it('여러 구간에 걸친 삭제·치환', () => {
    const out = overlayRuns(runs, '예약 X지', '나');
    expect(join(out)).toBe('예약 X지');
  });
  it('끝에 덧붙이기와 빈 문서', () => {
    expect(join(overlayRuns(runs, '예약 3시 공지!', '나'))).toBe('예약 3시 공지!');
    expect(overlayRuns([], 'ㅎ', '나')).toEqual([{ text: 'ㅎ', author: '나' }]);
  });
});

describe('deltaToRuns', () => {
  it('같은 작성자 연속 구간을 합치고 속성 없는 글은 null', () => {
    expect(deltaToRuns([{ insert: 'a' }, { insert: 'b', attributes: { author: 'x' } }, { insert: 'c', attributes: { author: 'x' } }]))
      .toEqual([{ text: 'a', author: null }, { text: 'bc', author: 'x' }]);
  });
});

describe('loadNoteDoc', () => {
  const text = (d: Y.Doc) => d.getText(POS_NOTE_TEXT_KEY).toString();

  it('ydoc이 없으면 content로 만들고 저장이 필요하다고 알린다', () => {
    const { doc, changed } = loadNoteDoc({ content: '기존 메모', ydoc: null, updated_by: null });
    expect(text(doc)).toBe('기존 메모');
    expect(changed).toBe(true);
  });

  it('content와 ydoc이 같으면 그대로', () => {
    const src = new Y.Doc();
    src.getText(POS_NOTE_TEXT_KEY).insert(0, '같음', { author: 'a' });
    const { changed } = loadNoteDoc({ content: '같음', ydoc: bytesToBase64(Y.encodeStateAsUpdate(src)), updated_by: 'a' });
    expect(changed).toBe(false);
  });

  it('구버전 화면이 content만 고친 것을 문서 편집으로 편입하고, 동시 편집과도 합쳐진다', () => {
    const src = new Y.Doc();
    src.getText(POS_NOTE_TEXT_KEY).insert(0, '예약 3시', { author: '민수' });
    const ydoc = bytesToBase64(Y.encodeStateAsUpdate(src));

    // 새 화면(src 기반)에서 동시에 뒤에 덧붙인 편집
    const client = new Y.Doc();
    Y.applyUpdate(client, base64ToBytes(ydoc));
    client.getText(POS_NOTE_TEXT_KEY).insert(5, ' 확정', { author: '지영' });

    const { doc, changed } = loadNoteDoc({ content: '예약 4시', ydoc, updated_by: '구버전' });
    expect(changed).toBe(true);
    expect(text(doc)).toBe('예약 4시');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(client));
    expect(text(doc)).toBe('예약 4시 확정');
  });
});

describe('compactNoteDoc', () => {
  it('보이는 글자·작성자는 그대로, 지운 이력은 버린다', () => {
    // 실제 부풀기는 기기(Yjs client)마다 쌓인다 — 기기 100대가 각자 쓰고 지운 상황
    const doc = new Y.Doc();
    const t = doc.getText(POS_NOTE_TEXT_KEY);
    for (let i = 0; i < 100; i++) {
      const device = new Y.Doc();
      Y.applyUpdate(device, Y.encodeStateAsUpdate(doc));
      const dt = device.getText(POS_NOTE_TEXT_KEY);
      for (let j = 0; j < 5; j++) { dt.insert(dt.length, `기기${i} 메모 ${j} `, { author: `직원${i % 7}` }); dt.delete(0, 3); }
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(device));
    }
    t.delete(0, t.length);
    t.insert(0, '남는 글', { author: '가' });
    t.insert(3, ' 추가', { author: '나' });
    const fresh = compactNoteDoc(doc);
    expect(fresh.getText(POS_NOTE_TEXT_KEY).toDelta()).toEqual(t.toDelta());
    expect(Y.encodeStateAsUpdate(fresh).length).toBeLessThan(Y.encodeStateAsUpdate(doc).length / 10);
  });

  it('빈 문서는 빈 문서로', () => {
    const doc = new Y.Doc();
    doc.getText(POS_NOTE_TEXT_KEY).insert(0, 'x');
    doc.getText(POS_NOTE_TEXT_KEY).delete(0, 1);
    expect(compactNoteDoc(doc).getText(POS_NOTE_TEXT_KEY).toString()).toBe('');
  });
});

describe('rebaseOntoServer', () => {
  it('서버 문서 위에 저장 안 된 내 수정만 내 이름으로 얹는다', () => {
    const server = new Y.Doc();
    server.getText(POS_NOTE_TEXT_KEY).insert(0, '공지: 10시 오픈', { author: '가' });
    expect(rebaseOntoServer(server, '공지: 10시 오픈 (재고 확인)', '나')).toBe(true);
    expect(server.getText(POS_NOTE_TEXT_KEY).toDelta()).toEqual([
      { insert: '공지: 10시 오픈', attributes: { author: '가' } },
      { insert: ' (재고 확인)', attributes: { author: '나' } },
    ]);
  });

  it('차이가 없으면 아무것도 하지 않는다', () => {
    const server = new Y.Doc();
    server.getText(POS_NOTE_TEXT_KEY).insert(0, 'abc', { author: '가' });
    expect(rebaseOntoServer(server, 'abc', '나')).toBe(false);
  });
});
