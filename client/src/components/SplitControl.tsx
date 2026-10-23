import { SplitType } from '../types';

interface SplitControlProps {
  splitType: SplitType;
  payerSharePercent: number;
  onChange: (next: { splitType: SplitType; payerSharePercent: number }) => void;
}

const PRESETS = [50, 60, 70];

function presetLabel(percent: number): string {
  if (percent === 50) return '1:1';
  return `${percent / 10}:${(100 - percent) / 10}`;
}

// 지출을 "공동 지출(둘이 나눠 부담)" / "내 지출(개인, 정산 대상 제외)"로 고르고,
// 공동 지출이면 "내가 부담하는 비율"을 고르는 컨트롤. QuickAddForm, 전체 내역 수정,
// 고정비 등록에서 공통으로 쓴다.
export default function SplitControl({ splitType, payerSharePercent, onChange }: SplitControlProps) {
  return (
    <div className="split-control">
      <div className="type-toggle">
        <button
          type="button"
          className={splitType === 'shared' ? 'active shared' : ''}
          onClick={() => onChange({ splitType: 'shared', payerSharePercent: payerSharePercent || 50 })}
        >
          공동 지출
        </button>
        <button
          type="button"
          className={splitType === 'personal' ? 'active personal' : ''}
          onClick={() => onChange({ splitType: 'personal', payerSharePercent: 100 })}
        >
          내 지출
        </button>
      </div>

      {splitType === 'shared' && (
        <div className="split-ratio">
          <span className="muted small">내 비율</span>
          <input
            type="number"
            min={1}
            max={99}
            value={payerSharePercent}
            onChange={(e) => onChange({ splitType: 'shared', payerSharePercent: Number(e.target.value) })}
          />
          <span className="muted small">% · 상대 {100 - payerSharePercent}%</span>
          <div className="split-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={payerSharePercent === p ? 'active' : ''}
                onClick={() => onChange({ splitType: 'shared', payerSharePercent: p })}
              >
                {presetLabel(p)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
