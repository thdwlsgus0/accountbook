import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import { HouseholdDetail } from '../types';

export default function HouseholdPage() {
  const { currentId } = useHousehold();
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);

  useEffect(() => {
    if (!currentId) return;
    api.get<HouseholdDetail>(`/households/${currentId}`).then((res) => setDetail(res.data));
  }, [currentId]);

  if (!detail) return <div className="center-message">불러오는 중...</div>;

  return (
    <div className="page">
      <h2>{detail.name}</h2>
      <div className="card">
        <p className="muted small">초대 코드</p>
        <p className="invite-code">{detail.inviteCode}</p>
        <p className="muted small">파트너에게 이 코드를 공유해서 같이 사용하세요. (최대 2인)</p>
      </div>
      <div className="card">
        <h3>구성원</h3>
        <ul>
          {detail.members.map((m) => (
            <li key={m.id}>
              {m.name} ({m.role === 'owner' ? '개설자' : '구성원'})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
