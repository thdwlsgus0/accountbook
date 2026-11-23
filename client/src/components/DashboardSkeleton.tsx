// 대시보드를 처음 불러오는 동안 빙글빙글 도는 표시 대신, 실제 화면과 같은 자리에 회색 뼈대를 보여준다.
// 내용이 들어올 때 레이아웃이 덜컹거리지 않고, 무엇이 뜰지 미리 보인다.
export default function DashboardSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="불러오는 중">
      <div className="skeleton skeleton-line short" />
      <div className="summary-cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card skeleton-card">
            <div className="skeleton skeleton-line tiny" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
      <div className="card skeleton-card tall">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
      </div>
      <div className="card skeleton-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-line" />
        ))}
      </div>
    </div>
  );
}
