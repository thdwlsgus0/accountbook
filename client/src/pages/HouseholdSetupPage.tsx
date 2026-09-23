import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';

export default function HouseholdSetupPage() {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { refresh, selectHousehold } = useHousehold();
  const navigate = useNavigate();

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post<{ id: number }>('/households', { name });
      await refresh();
      selectHousehold(res.data.id);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, '가계부 생성에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post<{ id: number }>('/households/join', { inviteCode });
      await refresh();
      selectHousehold(res.data.id);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, '가계부 참여에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <div className="tabs">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
            새 가계부 만들기
          </button>
          <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
            초대 코드로 참여
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {mode === 'create' ? (
          <form onSubmit={handleCreate}>
            <label>
              가계부 이름
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 우리 커플 가계부"
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              만들기
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <label>
              초대 코드
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="6자리 코드"
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              참여하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
