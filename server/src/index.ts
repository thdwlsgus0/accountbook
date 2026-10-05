// 로컬 개발(tsx)과 Docker/VM 배포(node dist/index.js)에서 쓰는 진입점.
// Vercel 서버리스 배포에서는 이 파일 대신 api/index.ts가 app을 직접 핸들러로 쓴다
// (서버리스에는 "계속 떠 있는 서버"라는 개념이 없어서 listen이 필요 없다).
import app from './app.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
