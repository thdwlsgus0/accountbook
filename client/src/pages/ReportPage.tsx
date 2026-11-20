import { ReactNode, TouchEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useHousehold } from '../context/HouseholdContext';
import LoadingScreen from '../components/LoadingScreen';
import { YearlyReport } from '../types';
import { formatCompactCurrency, formatCurrency } from '../utils/format';
import { paymentMethodLabel } from '../utils/payment';

type Tone = 'primary' | 'expense' | 'income' | 'soft' | 'plain';

interface Slide {
  key: string;
  tone: Tone;
  body: ReactNode;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// 올해처럼 아직 안 끝난 해는 오늘까지 지난 날 수, 지난 해는 그해 전체 날 수.
function daysCovered(year: number, today: Date): number {
  const start = new Date(year, 0, 1);
  const end = year === today.getFullYear() ? today : new Date(year, 11, 31);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

// "우리의 2026" — 한 해를 스토리처럼 한 장씩 넘겨보는 연말 결산.
// 탭(화면 왼쪽/오른쪽), 스와이프, 키보드 ←/→로 넘긴다. 데이터가 없는 장(예: 데이트 지출이 없는 해)은 건너뛴다.
export default function ReportPage() {
  const { currentId, current } = useHousehold();
  const [params, setParams] = useSearchParams();
  const today = new Date();
  const year = Number(params.get('year')) || today.getFullYear();
  const [report, setReport] = useState<YearlyReport | null>(null);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    if (!currentId) return;
    setReport(null);
    setIndex(0);
    api
      .get<YearlyReport>(`/households/${currentId}/summary/yearly`, { params: { year } })
      .then((res) => setReport(res.data));
  }, [currentId, year]);

  const slides = report ? buildSlides(report, current?.name ?? '우리 가계부', today) : [];
  const last = slides.length - 1;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), last)), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!report) return <LoadingScreen />;

  const slide = slides[index];

  function onTouchEnd(e: TouchEvent) {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    setTouchX(null);
  }

  return (
    <div className="page report-page">
      <div className="report-toolbar">
        <Link to="/insights" className="small">
          ← 통계로
        </Link>
        <div className="report-years">
          <button type="button" onClick={() => setParams({ year: String(year - 1) })} aria-label="이전 해">
            ‹
          </button>
          <span>{year}년</span>
          <button
            type="button"
            onClick={() => setParams({ year: String(year + 1) })}
            disabled={year >= today.getFullYear()}
            aria-label="다음 해"
          >
            ›
          </button>
        </div>
      </div>

      <div
        className={`report-stage tone-${slide.tone}`}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        <div className="report-progress" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.key} className={i <= index ? 'on' : ''} />
          ))}
        </div>
        {/* 화면 왼쪽/오른쪽을 탭하면 이전/다음 장 (인스타그램 스토리처럼) */}
        <button type="button" className="report-tap prev" onClick={() => go(-1)} aria-label="이전 장" />
        <button type="button" className="report-tap next" onClick={() => go(1)} aria-label="다음 장" />
        <div className="report-slide" key={`${year}-${slide.key}`} aria-live="polite">
          {slide.body}
        </div>
        <p className="report-count">
          {index + 1} / {slides.length}
        </p>
      </div>

      {index === last && (
        <div className="report-end-actions">
          <button type="button" onClick={() => setIndex(0)}>
            처음부터 다시 보기
          </button>
          <button type="button" onClick={() => setParams({ year: String(year - 1) })}>
            {year - 1}년 결산 보기
          </button>
        </div>
      )}
    </div>
  );
}

function buildSlides(r: YearlyReport, householdName: string, today: Date): Slide[] {
  const slides: Slide[] = [];
  const isOngoing = r.year === today.getFullYear();
  const basis = isOngoing ? `${today.getMonth() + 1}월 ${today.getDate()}일까지 기준` : `${r.year}년 1월 ~ 12월`;

  slides.push({
    key: 'cover',
    tone: 'primary',
    body: (
      <>
        <p className="report-eyebrow">{householdName}</p>
        <h2 className="report-hero">
          우리의
          <br />
          {r.year}
        </h2>
        <p className="report-lead">
          {r.recordCount > 0
            ? `${r.activeDays}일 동안 ${r.recordCount.toLocaleString('ko-KR')}번 기록했어요.`
            : '아직 기록이 없어요.'}
        </p>
        <p className="report-note">{basis}</p>
      </>
    ),
  });

  if (r.recordCount === 0) return slides;

  const expenseDiff = r.expense - r.previousExpense;
  slides.push({
    key: 'spend',
    tone: 'expense',
    body: (
      <>
        <p className="report-eyebrow">올해 쓴 돈</p>
        <p className="report-big">{formatCurrency(r.expense)}</p>
        {r.previousExpense > 0 && (
          <p className="report-lead">
            작년보다 <strong>{formatCurrency(Math.abs(expenseDiff))}</strong> {expenseDiff >= 0 ? '더 썼어요' : '덜 썼어요'}
            {!isOngoing ? '' : ' (지금까지)'}
          </p>
        )}
        <ul className="report-facts">
          <li>
            <span>하루 평균</span>
            <b>{formatCurrency(Math.round(r.expense / daysCovered(r.year, today)))}</b>
          </li>
          <li>
            <span>들어온 돈</span>
            <b>{formatCurrency(r.income)}</b>
          </li>
          <li>
            <span>남은 돈</span>
            <b>{formatCurrency(r.income - r.expense)}</b>
          </li>
        </ul>
      </>
    ),
  });

  const months = r.monthly.filter((m) => !isOngoing || m.month <= today.getMonth() + 1);
  const peak = months.reduce((a, b) => (b.expense > a.expense ? b : a), months[0]);
  // "가장 아낀 달"은 진행 중인 이번 달을 빼고, 지출이 있었던 달 중에서 고른다.
  const finished = months.filter((m) => m.expense > 0 && !(isOngoing && m.month === today.getMonth() + 1));
  const low = finished.length > 1 ? finished.reduce((a, b) => (b.expense < a.expense ? b : a)) : null;
  const max = Math.max(...r.monthly.map((m) => m.expense), 1);
  slides.push({
    key: 'monthly',
    tone: 'plain',
    body: (
      <>
        <p className="report-eyebrow">달마다 이렇게 썼어요</p>
        <div className="report-bars" role="img" aria-label={`가장 많이 쓴 달은 ${peak.month}월`}>
          {r.monthly.map((m) => (
            <div key={m.month} className={`report-bar${m.month === peak.month ? ' peak' : ''}`}>
              <span className="report-bar-value">{m.month === peak.month ? formatCompactCurrency(m.expense) : ''}</span>
              <div className="report-bar-fill" style={{ height: `${(m.expense / max) * 100}%` }} />
              <span className="report-bar-label">{m.month}</span>
            </div>
          ))}
        </div>
        <p className="report-lead">
          가장 많이 쓴 달은 <strong>{peak.month}월</strong>, {formatCurrency(peak.expense)}
        </p>
        {low && (
          <p className="report-note">
            가장 아낀 달은 {low.month}월 · {formatCurrency(low.expense)}
          </p>
        )}
      </>
    ),
  });

  if (r.topCategories.length > 0) {
    slides.push({
      key: 'categories',
      tone: 'soft',
      body: (
        <>
          <p className="report-eyebrow">돈이 제일 많이 간 곳</p>
          <h3 className="report-title">{r.topCategories[0].name}</h3>
          <ul className="report-ranks">
            {r.topCategories.map((c, i) => (
              <li key={c.name}>
                <span className="report-rank">{i + 1}</span>
                <span className="report-rank-name">
                  <span className="category-dot" style={{ backgroundColor: c.color, color: c.color }} />
                  {c.name}
                </span>
                <span className="report-rank-value">
                  {formatCompactCurrency(c.total)} · {percent(c.total, r.expense)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (r.topMerchants.length > 0) {
    const [first, ...rest] = r.topMerchants;
    slides.push({
      key: 'merchants',
      tone: 'income',
      body: (
        <>
          <p className="report-eyebrow">제일 자주 간 곳</p>
          <h3 className="report-title">{first.memo}</h3>
          <p className="report-lead">
            <strong>{first.count}번</strong> · {formatCurrency(first.total)}
          </p>
          {rest.length > 0 && (
            <ul className="report-ranks">
              {rest.map((m, i) => (
                <li key={m.memo}>
                  <span className="report-rank">{i + 2}</span>
                  <span className="report-rank-name">{m.memo}</span>
                  <span className="report-rank-value">{m.count}번</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  }

  if (r.biggest.length > 0) {
    slides.push({
      key: 'biggest',
      tone: 'plain',
      body: (
        <>
          <p className="report-eyebrow">올해의 큰 결심</p>
          <ul className="report-ranks big">
            {r.biggest.map((b, i) => (
              <li key={i}>
                <span className="report-rank">{i + 1}</span>
                <span className="report-rank-name">
                  {b.memo || b.categoryName || '지출'}
                  <small>{formatMonthDay(b.occurredOn)}</small>
                </span>
                <span className="report-rank-value">{formatCurrency(b.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (r.dates.total > 0) {
    slides.push({
      key: 'dates',
      tone: 'expense',
      body: (
        <>
          <p className="report-eyebrow">💕 데이트</p>
          <p className="report-big">{r.dates.days}번</p>
          <p className="report-lead">
            데이트에 <strong>{formatCurrency(r.dates.total)}</strong> 썼어요.
          </p>
          <p className="report-note">한 번에 평균 {formatCurrency(Math.round(r.dates.total / r.dates.days))}</p>
        </>
      ),
    });
  }

  if (r.members.length >= 2 && r.expense > 0) {
    slides.push({
      key: 'members',
      tone: 'soft',
      body: (
        <>
          <p className="report-eyebrow">누가 얼마나 냈을까</p>
          <ul className="report-members">
            {r.members.map((m) => (
              <li key={m.userId}>
                <div className="report-member-head">
                  <span className="navbar-avatar">{m.name.slice(0, 1)}</span>
                  <b>{m.name}</b>
                  <span>
                    {formatCurrency(m.paid)} · {m.count}건
                  </span>
                </div>
                <div className="report-share">
                  <div style={{ width: `${percent(m.paid, r.expense)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (r.busiestDay || r.paymentMethods.length > 0) {
    const payTotal = r.paymentMethods.reduce((s, p) => s + p.total, 0);
    slides.push({
      key: 'habits',
      tone: 'plain',
      body: (
        <>
          {r.busiestDay && (
            <>
              <p className="report-eyebrow">가장 많이 쓴 하루</p>
              <h3 className="report-title">{formatMonthDay(r.busiestDay.date)}</h3>
              <p className="report-lead">
                {r.busiestDay.count}건 · <strong>{formatCurrency(r.busiestDay.total)}</strong>
              </p>
            </>
          )}
          {r.paymentMethods.length > 0 && (
            <ul className="report-facts">
              {r.paymentMethods.map((p) => (
                <li key={p.method ?? 'none'}>
                  <span>{paymentMethodLabel(p.method)}</span>
                  <b>{percent(p.total, payTotal)}%</b>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  }

  slides.push({
    key: 'end',
    tone: 'primary',
    body: (
      <>
        <p className="report-eyebrow">그리고</p>
        {r.savings.total > 0 ? (
          <>
            <p className="report-big">{formatCurrency(r.savings.total)}</p>
            <p className="report-lead">공동 목표에 {r.savings.count}번 나눠서 모았어요.</p>
          </>
        ) : (
          <p className="report-lead">함께 기록한 한 해였어요.</p>
        )}
        <h2 className="report-hero small">
          {r.year + 1}년에도
          <br />
          같이 잘 모아봐요
        </h2>
      </>
    ),
  });

  return slides;
}
