'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchAllMemos, createNewMemo, editMemo, removeMemo } from '../actions';

const MEMO_COLORS = [
  { name: '흰색', value: '#ffffff' },
  { name: '노랑', value: '#fff9c4' },
  { name: '초록', value: '#e8f5e9' },
  { name: '파랑', value: '#e3f2fd' },
  { name: '분홍', value: '#fce4ec' },
  { name: '보라', value: '#f3e5f5' },
];

export default function MemoPage() {
  const [memos, setMemos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', content: '', color: '#fff9c4' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadMemos();
  }, []);

  const loadMemos = async () => {
    setIsLoading(true);
    const result = await fetchAllMemos();
    if (result.success) setMemos(result.data);
    setIsLoading(false);
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handleSave = async () => {
    if (!formData.content.trim()) {
      showMessage('내용을 입력해주세요');
      return;
    }

    if (editingId) {
      const result = await editMemo(editingId, formData.title, formData.content, formData.color);
      if (result.success) {
        setMemos((prev) => prev.map((m) => (m.id === editingId ? result.data : m)));
        showMessage('메모가 수정되었습니다');
      } else {
        showMessage(`오류: ${result.error}`);
        return;
      }
    } else {
      const result = await createNewMemo(formData.title, formData.content, formData.color);
      if (result.success) {
        setMemos((prev) => [result.data, ...prev]);
        showMessage('메모가 추가되었습니다');
      } else {
        showMessage(`오류: ${result.error}`);
        return;
      }
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ title: '', content: '', color: '#fff9c4' });
    setShowForm(false);
  };

  const handleEditStart = (memo) => {
    setEditingId(memo.id);
    setFormData({
      title: memo.title || '',
      content: memo.content,
      color: memo.color || '#fff9c4',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    const result = await removeMemo(id);
    if (result.success) {
      setMemos((prev) => prev.filter((m) => m.id !== id));
      showMessage('메모가 삭제되었습니다');
    } else {
      showMessage(`오류: ${result.error}`);
    }
  };

  return (
    <>
      <header className="header-nav">
        <h1>ChoiChoi</h1>
        <nav>
          <ul className="nav-links">
            <li><Link href="/">POS</Link></li>
            <li><Link href="/stats">통계</Link></li>
            <li><Link href="/schedule">일정</Link></li>
            <li><Link href="/memo" className="active">메모</Link></li>
            <li><Link href="/settings">설정</Link></li>
          </ul>
        </nav>
      </header>

      <main className="pos-wrap">
        <div className="memo-wrap">
          <div className="memo-page-header">
            <h2>메모</h2>
            {!showForm && (
              <button
                className="memo-new-btn"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                + 새 메모
              </button>
            )}
          </div>

          {message && (
            <div className={`message ${message.includes('오류') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          {showForm && (
            <div className="memo-form">
              <h3 style={{ margin: '0 0 12px' }}>{editingId ? '메모 수정' : '새 메모 작성'}</h3>
              <input
                type="text"
                placeholder="제목 (선택)"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
              <textarea
                placeholder="내용을 입력하세요..."
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                rows={5}
              />
              <div className="memo-color-row">
                <span>배경색</span>
                {MEMO_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`memo-color-btn${formData.color === c.value ? ' selected' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setFormData((p) => ({ ...p, color: c.value }))}
                    aria-label={c.name}
                    type="button"
                  />
                ))}
              </div>
              <div className="memo-form-preview" style={{ backgroundColor: formData.color }}>
                {formData.title && <strong>{formData.title}</strong>}
                <p>{formData.content || '미리보기...'}</p>
              </div>
              <div className="memo-form-buttons">
                <button className="add-btn" onClick={handleSave}>
                  {editingId ? '수정 완료' : '메모 추가'}
                </button>
                <button className="cancel-btn" onClick={resetForm}>취소</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p>불러오는 중...</p>
          ) : memos.length === 0 ? (
            <p className="empty-order">메모가 없습니다. 새 메모를 추가하세요.</p>
          ) : (
            <div className="memo-grid">
              {memos.map((memo) => (
                <div
                  key={memo.id}
                  className="memo-card"
                  style={{ backgroundColor: memo.color || '#fff9c4' }}
                >
                  {memo.title && <h3 className="memo-title">{memo.title}</h3>}
                  <p className="memo-content">{memo.content}</p>
                  <div className="memo-footer">
                    <span className="memo-date">
                      {new Date(memo.updated_at).toLocaleDateString('ko-KR')}
                    </span>
                    <div className="memo-actions">
                      <button className="edit-btn" onClick={() => handleEditStart(memo)}>
                        수정
                      </button>
                      <button className="delete-btn" onClick={() => handleDelete(memo.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
