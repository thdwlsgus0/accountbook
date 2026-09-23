// requireAuth/requireHouseholdMember 미들웨어가 세팅해주는 값들을 Express의
// Request 타입에 추가한다. 이 미들웨어들을 거친 라우트 핸들러에서는
// req.userId 등을 별도 캐스팅 없이 바로 쓸 수 있다.
import 'express';

declare global {
  namespace Express {
    interface Request {
      userId: number;
      householdId: number;
      householdRole: 'owner' | 'member';
    }
  }
}

export {};
