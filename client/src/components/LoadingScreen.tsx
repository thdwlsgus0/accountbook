import Spinner from './Spinner';

// 페이지/보호 라우트가 데이터를 불러오는 동안 공통으로 쓰는 전체 화면 로딩 표시.
export default function LoadingScreen({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="center-message">
      <Spinner size="lg" />
      <span>{text}</span>
    </div>
  );
}
