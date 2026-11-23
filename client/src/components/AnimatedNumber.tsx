import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../utils/motion';

interface AnimatedNumberProps {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}

// 값이 바뀌면 이전 값에서 새 값까지 숫자가 굴러가듯 바뀐다 (지출을 추가하면 "지출" 카드가 올라가는 게 보이게).
// 처음 그릴 때는 바로 최종값을 보여준다 (0부터 올라가면 화면을 열 때마다 숫자를 읽기까지 기다려야 해서
// 느리게 느껴졌다). 동작 줄이기를 켠 사용자에게는 바뀔 때도 바로 최종값을 보여준다.
export default function AnimatedNumber({ value, format, durationMs = 400 }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // 끝에서 천천히 멈추게 (ease-out)
      const current = Math.round(from + (value - from) * eased);
      setShown(current);
      fromRef.current = current;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  // 화면 읽기 프로그램은 굴러가는 중간 숫자 대신 최종값만 읽게 한다.
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
