import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import GoalCard from '../components/GoalCard';
import { SavingsGoal } from '../types';

interface GoalForm {
  name: string;
  targetAmount: string;
  targetDate: string;
}

const EMPTY_FORM: GoalForm = { name: '', targetAmount: '', targetDate: '' };

export default function GoalsPage() {
  const { currentId } = useHousehold();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [form, setForm] = useState<GoalForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentId) return;
    const res = await api.get<{ goals: SavingsGoal[] }>(`/households/${currentId}/goals`);
    setGoals(res.data.goals);
  }, [currentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/households/${currentId}/goals`, {
        ...form,
        targetAmount: Number(form.targetAmount),
        targetDate: form.targetDate || null,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(getErrorMessage(err, '목표 생성에 실패했습니다.'));
    }
  }

  async function handleDelete(id: number) {
    if (!currentId || !confirm('이 목표를 삭제할까요?')) return;
    await api.delete(`/households/${currentId}/goals/${id}`);
    load();
  }

  if (!currentId) return null;

  return (
    <div className="page">
      <h2>공동 목표</h2>

      <form className="card" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="목표 이름 (예: 제주도 여행)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="number"
          placeholder="목표 금액"
          value={form.targetAmount}
          onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
          required
        />
        <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
        {error && <p className="error">{error}</p>}
        <button type="submit">목표 만들기</button>
      </form>

      <div className="goal-grid">
        {goals.map((g) => (
          <div key={g.id} className="goal-card-wrap">
            <GoalCard goal={g} householdId={currentId} onChange={load} />
            <button type="button" className="goal-delete" onClick={() => handleDelete(g.id)}>
              목표 삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
