interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  // 버튼처럼 배경이 이미 진한 색(primary)인 곳에 올릴 때는 흰색 계열로 바꿔야 보인다.
  variant?: 'default' | 'on-primary';
}

// CSS만으로 돌아가는 원형 로딩 스피너. 이미지/아이콘 폰트 없이 테두리 트릭으로 만든다.
export default function Spinner({ size = 'md', variant = 'default' }: SpinnerProps) {
  const className = ['spinner', size, variant === 'on-primary' ? 'on-primary' : ''].filter(Boolean).join(' ');
  return <span className={className} role="status" aria-label="로딩 중" />;
}
