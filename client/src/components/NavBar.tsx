import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';

export default function NavBar() {
  const { user, logout } = useAuth();
  const { current } = useHousehold();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-brand">{current ? current.name : '공용가계부'}</div>
      <div className="navbar-links">
        <NavLink to="/" end>
          홈
        </NavLink>
        <NavLink to="/transactions">전체 내역</NavLink>
        <NavLink to="/insights">통계</NavLink>
        <NavLink to="/recurring">고정비</NavLink>
        <NavLink to="/budgets">예산</NavLink>
        <NavLink to="/goals">목표</NavLink>
        <NavLink to="/household">가계부 설정</NavLink>
      </div>
      <div className="navbar-user">
        <span className="navbar-avatar">{user.name.slice(0, 1)}</span>
        <span>{user.name}</span>
        <button onClick={handleLogout}>로그아웃</button>
      </div>
    </nav>
  );
}
