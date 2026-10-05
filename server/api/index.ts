// Vercel 서버리스 함수 진입점. Express 앱은 (req, res) => void 형태의 함수이기도 해서
// 그대로 default export하면 Vercel이 들어오는 요청마다 이 함수를 호출해준다.
// server/vercel.json의 rewrites가 모든 경로를 이 함수로 보낸다.
//
// 이 파일은 일부러 tsconfig.json의 include("src") 밖에 둔다. Docker/VM 빌드(tsc, rootDir: src)는
// src 바깥 파일을 emit하지 못해 충돌하는데, Vercel은 esbuild로 트랜스파일만 하고 타입체크는
// 하지 않아서 여기 두는 게 안전하다. (즉 이 파일은 로컬 `npm run typecheck`의 체크 대상이 아니다 —
// 내용이 import/export 한 줄뿐이라 위험은 작다)
import app from '../src/app.js';

export default app;
