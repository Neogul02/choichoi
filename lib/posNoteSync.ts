// 공유 메모장 동시편집의 순수 로직 — Yjs 문서와 textarea 사이의 변환만 다룬다(네트워크·React 없음).
import * as Y from 'yjs';

// 메모 본문은 Y.Text 하나이고, 글자마다 { author } 속성으로 누가 썼는지를 기록해 작성자별 색으로 보여준다.

export const POS_NOTE_TEXT_KEY = 'content';

// textarea의 변경 전/후 문자열에서 바뀐 구간 하나를 뽑는다(공통 접두·접미 제거).
// 서로게이트 쌍(이모지 등)을 반으로 자르면 깨진 문자가 Y.Text에 들어가므로 경계를 쌍 밖으로 민다.
export function diffText(prev: string, next: string): { index: number; remove: number; insert: string } {
  let start = 0;
  const minLen = Math.min(prev.length, next.length);
  while (start < minLen && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(prev.charCodeAt(start - 1))) start--;

  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (prevEnd > start && nextEnd > start && prev.charCodeAt(prevEnd - 1) === next.charCodeAt(nextEnd - 1)) {
    prevEnd--;
    nextEnd--;
  }
  if (prevEnd < prev.length && isLowSurrogate(prev.charCodeAt(prevEnd))) {
    prevEnd++;
    nextEnd++;
  }
  return { index: start, remove: prevEnd - start, insert: next.slice(start, nextEnd) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export type TextDelta = Array<{ retain?: number; insert?: unknown; delete?: number }>;

// 원격 변경(Y.Text 이벤트의 delta)이 적용된 뒤 기존 위치가 어디로 옮겨지는지 계산한다.
// 커서 보존과, 한글 조합 중 미뤄둔 원격 변경을 넘어 로컬 변경 위치를 옮기는 데 같이 쓴다.
// 정확히 같은 위치에 원격 삽입이 들어오면 커서는 그 앞에 둔다(남의 글 뒤로 밀려나지 않게).
export function transformIndex(index: number, delta: TextDelta): number {
  let pos = 0; // delta 적용 전 문서 기준 위치
  let result = index;
  for (const op of delta) {
    if (op.retain !== undefined) {
      pos += op.retain;
    } else if (op.insert !== undefined) {
      const len = typeof op.insert === 'string' ? op.insert.length : 1;
      if (pos < index) result += len;
    } else if (op.delete !== undefined) {
      if (pos < index) result -= Math.min(op.delete, index - pos);
      pos += op.delete;
    }
    if (pos > index) break;
  }
  return Math.max(0, result);
}

// 이름 → 색. 해시로 고정 배정해 누가 어느 기기에서 열든 같은 사람은 같은 색이다.
// 흰 배경 13px 글자에서 읽히도록 채도를 낮춘 진한 색만 쓴다.
export const AUTHOR_COLORS = [
  '#c2410c', // 주황
  '#1d4ed8', // 파랑
  '#047857', // 초록
  '#7e22ce', // 보라
  '#be123c', // 장미
  '#0e7490', // 청록
  '#a16207', // 황토
  '#4338ca', // 남색
] as const;

export function authorColor(author: string | null | undefined): string | null {
  if (!author) return null;
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) | 0;
  return AUTHOR_COLORS[Math.abs(h) % AUTHOR_COLORS.length];
}

// 서버 액션 인자와 DB(text 컬럼)로 Yjs 바이너리를 오가기 위한 base64. 브라우저·Node 공용.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface AuthorRun {
  text: string;
  author: string | null;
}

export function deltaToRuns(delta: Array<{ insert?: unknown; attributes?: { author?: unknown } }>): AuthorRun[] {
  const runs: AuthorRun[] = [];
  for (const op of delta) {
    if (typeof op.insert !== 'string' || op.insert.length === 0) continue;
    const author = typeof op.attributes?.author === 'string' ? op.attributes.author : null;
    const last = runs[runs.length - 1];
    if (last && last.author === author) last.text += op.insert;
    else runs.push({ text: op.insert, author });
  }
  return runs;
}

// 색칠된 글자는 textarea 뒤에 겹쳐 그린 레이어가 보여주므로(textarea 글자는 투명), 레이어는 항상
// textarea 값과 글자 단위로 같아야 한다. 한글 조합 중이거나 저장 반영 직전처럼 문서(runs)가 화면 값보다
// 늦은 순간에는 차이 구간을 내 글로 끼워 넣어 맞춘다 — 안 그러면 치는 글자가 잠깐 안 보인다.
export function overlayRuns(runs: AuthorRun[], value: string, localAuthor: string | null): AuthorRun[] {
  const base = runs.map((r) => r.text).join('');
  if (base === value) return runs;
  const d = diffText(base, value);
  const cutStart = d.index;
  const cutEnd = d.index + d.remove;

  const out: AuthorRun[] = [];
  const push = (text: string, author: string | null) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.author === author) last.text += text;
    else out.push({ text, author });
  };

  let pos = 0;
  let inserted = false;
  for (const run of runs) {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    if (runEnd <= cutStart) { push(run.text, run.author); continue; }
    if (!inserted) {
      push(run.text.slice(0, Math.max(0, cutStart - runStart)), run.author);
      push(d.insert, localAuthor);
      inserted = true;
    }
    if (runEnd > cutEnd) push(run.text.slice(Math.max(0, cutEnd - runStart)), run.author);
  }
  if (!inserted) push(d.insert, localAuthor);
  return out;
}

// 저장된 문서를 연다. ydoc과 content는 항상 함께 쓰므로 둘이 다르면 동시편집 이전 코드(새로고침 안 한
// 구버전 화면)가 content만 덮어쓴 것이다. 그 수정을 문서 편집으로 편입하지 않으면 다음 저장 때 사라진다.
// 서버에서 CAS 아래 한 번만 하므로 여러 기기가 같은 수정을 중복 삽입하지 않는다.
// ydoc이 없으면(동시편집 이전 데이터) content로 문서를 만든다 — 클라이언트마다 각자 만들면 서로 다른 삽입으로
// 취급돼 합쳐질 때 같은 글이 두 번 들어가므로 반드시 서버에서 한 번만.
export function loadNoteDoc(row: { content: string; ydoc: string | null; updated_by: string | null }): { doc: Y.Doc; changed: boolean } {
  const doc = new Y.Doc();
  if (row.ydoc) Y.applyUpdate(doc, base64ToBytes(row.ydoc));
  const ytext = doc.getText(POS_NOTE_TEXT_KEY);
  const d = diffText(ytext.toString(), row.content);
  if (d.remove === 0 && !d.insert) return { doc, changed: !row.ydoc };
  doc.transact(() => {
    if (d.remove > 0) ytext.delete(d.index, d.remove);
    if (d.insert) ytext.insert(d.index, d.insert, { author: row.ydoc ? row.updated_by : null });
  });
  return { doc, changed: true };
}
