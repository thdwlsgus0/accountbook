# 공용가계부

커플이 함께 쓰는 공용 가계부.

- 프론트엔드: React (Vite) + TypeScript
- 백엔드: Node.js (Express) + TypeScript
- DB: MySQL

## 주요 기능

- 네이버 OAuth 로그인 (별도 회원가입/비밀번호 없음, 로그인 후 세션은 JWT 기반)
- 가계부 생성 및 초대 코드로 파트너 초대 (최대 2인)
- 거래(수입/지출) 빠른 기록, 수정, 삭제
- 카테고리별 예산 설정 및 초과 알림
- 고정비/반복 지출 자동 기록 (매월 지정일에 자동으로 거래 내역 생성)
- 공동 목표 저축 (목표 금액 대비 진행률, 적립 기록)
- 월별 요약 대시보드 (수입/지출/잔액, 카테고리별 지출, 예산 현황)

## 폴더 구조

```
accountbook/
├── client/                 # React + TypeScript 프론트엔드 (Vite)
│   └── src/
│       ├── api/            # axios 인스턴스 (토큰 자동 첨부, 401 처리, 에러 메시지 추출)
│       ├── context/        # 인증 상태, 현재 가계부 상태
│       ├── components/     # 공통 UI 컴포넌트
│       ├── pages/          # 화면 단위 페이지
│       └── types.ts        # 서버 응답과 맞춘 공용 타입 정의
├── server/                 # Express + TypeScript 백엔드
│   └── src/
│       ├── config/         # DB 커넥션 풀
│       ├── db/schema.sql   # MySQL 스키마
│       ├── middlewares/    # 인증, 가계부 소속 확인
│       ├── routes/         # REST API 라우트
│       ├── utils/          # JWT, 고정비 자동 생성 로직
│       └── types/express.d.ts  # req.userId 등 Express Request 타입 확장
└── docs/
    └── WORKFLOW.md         # 기능을 왜 이렇게 설계했는지 되짚어볼 때 참고할 학습 가이드
```

## 시작하기

### 1. MySQL 데이터베이스 준비

```sql
CREATE DATABASE accountbook CHARACTER SET utf8mb4;
```

스키마를 적용합니다.

```bash
mysql -u root -p accountbook < server/src/db/schema.sql
```

### 2. 네이버 로그인 애플리케이션 등록

[네이버 개발자센터](https://developers.naver.com/apps)에서 애플리케이션을 등록합니다.

- **사용 API:** 네이버 로그인 (제공 정보: 이름, 이메일 — 이메일은 선택이어도 동작합니다)
- **서비스 URL:** `http://localhost:5173`
- **Callback URL:** `http://localhost:5173/api/auth/naver/callback`

등록 후 발급되는 Client ID / Client Secret을 다음 단계의 `server/.env`에 넣습니다.
Callback URL은 `.env`의 `NAVER_CALLBACK_URL`과 **글자 하나까지 같아야** 합니다.

### 3. 서버 실행

```bash
cd server
cp .env.example .env   # DB 접속 정보, JWT_SECRET, NAVER_CLIENT_ID/SECRET을 채워 넣기
npm install
npm run dev
```

`http://localhost:4000/api/health` 접속 시 `{"status":"ok","db":"connected"}` 가 나오면 성공입니다.

### 4. 클라이언트 실행

```bash
cd client
npm install
npm run dev
```

안내된 주소(기본 `http://localhost:5173`)로 접속해서 네이버로 로그인 → 가계부 생성(또는 파트너의 초대 코드로 참여) 순서로 시작하면 됩니다.

## 알아두면 좋은 설계 결정

- **금액은 정수(원 단위)로 저장합니다.** 실수(FLOAT) 오차를 피하기 위함입니다.
- **가계부는 최대 2인까지만 참여할 수 있습니다.** 커플 전용 가계부라는 전제 때문입니다. 가족 등 인원을 늘리고 싶다면 `server/src/routes/households.ts`의 인원 제한(`count >= 2`) 부분을 조정하면 됩니다.
- **고정비 자동 기록은 크론(cron) 없이 동작합니다.** 거래 내역/요약을 조회할 때마다 "아직 이번 달 치가 생성되지 않은 규칙"을 그 자리에서 생성합니다 (`server/src/utils/recurring.ts`). 별도 배치 서버 없이도 실용적으로 동작하지만, 완전히 실시간은 아니라는 점을 참고하세요.
- **예산 초과 알림은 푸시 알림이 아니라 화면 내 배지/경고 문구**로 구현되어 있습니다. 이메일/푸시 인프라 없이도 바로 쓸 수 있는 실용적인 선택입니다.
- **네이버 OAuth는 서버가 전 과정을 처리합니다.** `/api/auth/naver`가 네이버로 보내고, `/api/auth/naver/callback`이 code를 토큰으로 교환해 프로필을 조회한 뒤 우리 JWT를 발급합니다. CSRF 방지용 `state`는 httpOnly 쿠키로 검증하고, JWT는 서버 로그·Referer에 남지 않도록 URL fragment(`#token=...`)로 프론트에 전달합니다. 콜백 URL이 Vite 프록시(5173)를 거치는 이유는 state 쿠키와 프론트가 같은 출처여야 하기 때문입니다.
- **사용자는 네이버 고유 ID(`users.naver_id`)로 식별합니다.** 이메일은 제공에 동의하지 않으면 없을 수 있어서 nullable입니다.
- **서버는 `tsx`로 TypeScript를 직접 실행합니다** (`npm run dev`). 별도 컴파일 단계 없이 `.ts` 파일을 바로 실행하는 방식이라, `ts-node` 대신 최근 많이 쓰이는 조합입니다. 배포용 빌드는 `npm run build`(tsc로 `dist/`에 컴파일) 후 `npm start`로 실행합니다.
- **`req.userId`, `req.householdId` 같은 값은 `server/src/types/express.d.ts`에서 Express의 `Request` 타입에 전역으로 추가**해뒀습니다. `requireAuth`/`requireHouseholdMember` 미들웨어를 거친 라우트에서는 캐스팅 없이 바로 씁니다.

더 깊이 있는 기능(다중 가계부 전환, 통계 그래프, 이메일 알림 등)을 학습 삼아 직접 확장하고 싶다면 [docs/WORKFLOW.md](docs/WORKFLOW.md) 의 질문들을 참고하세요.

## 배포

Docker Compose로 VPS(도메인 없이 IP로 접속)에 배포하는 방법은 [DEPLOY.md](DEPLOY.md) 를 참고하세요.
