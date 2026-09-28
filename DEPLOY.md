# 배포 가이드 (도메인 없이, IP로 배포)

도메인 없이 서버 공인 IP로 접속하는 걸 전제로 합니다. Docker Compose로
MySQL + 백엔드(Express) + 프론트엔드(nginx)를 한 번에 띄웁니다.

나중에 도메인을 마련하면 HTTPS를 붙이는 추가 작업이 필요합니다 (맨 아래 참고).

## 0. 서버 준비

아직 서버가 없다면 **DigitalOcean Droplet** (Ubuntu 22.04, Basic, 월 $6~7, 1GB RAM)을
추천합니다. UI가 단순하고 자료가 많아 처음 배포해보기 좋습니다. AWS Lightsail이나
네이버 클라우드 플랫폼도 동일한 방식으로 진행 가능합니다 — 아래 과정은 리눅스 VPS라면
공급자와 무관하게 똑같습니다.

서버를 만들 때:
- OS: Ubuntu 22.04 LTS
- 이후 과정은 발급받은 **공인 IP 주소**와 **SSH 접속 정보(root 비밀번호 또는 SSH 키)**만 있으면 됩니다.

## 1. 서버 접속 및 기본 설정

```bash
ssh root@<서버_공인_IP>
```

방화벽(서버 안, ufw):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw enable
```

> 클라우드 공급자에 따라 콘솔에 별도의 "클라우드 방화벽" 설정이 있을 수 있습니다
> (예: DigitalOcean의 Cloud Firewall). 그 경우 거기서도 80번 포트를 열어야 합니다.

Docker 설치:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. 저장소 클론

```bash
git clone https://github.com/thdwlsgus0/accountbook.git
cd accountbook
```

## 3. 네이버 로그인 애플리케이션 설정

[네이버 개발자센터](https://developers.naver.com/apps)에서 **로컬 개발용과는 별도로
프로덕션용 애플리케이션을 하나 더 등록**하는 걸 권장합니다 (설정이 섞이지 않아 안전합니다).

- **서비스 URL:** `http://<서버_공인_IP>`
- **Callback URL:** `http://<서버_공인_IP>/api/auth/naver/callback`

발급된 Client ID / Client Secret은 다음 단계에서 씁니다.

## 4. 환경변수 설정

```bash
cp .env.production.example .env
nano .env   # 또는 vi .env
```

채워야 할 값:
- `DB_ROOT_PASSWORD`: 임의의 강력한 비밀번호
- `JWT_SECRET`: `openssl rand -hex 32` 로 생성한 값
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`: 위 3단계에서 발급받은 값
- `NAVER_CALLBACK_URL`, `CLIENT_URL`: `<서버_공인_IP>` 부분을 실제 IP로 교체
  (서버에서 `curl ifconfig.me` 로 공인 IP 확인 가능)

`COOKIE_SECURE`는 지금 단계에서는 `false` 그대로 둡니다 (아직 HTTPS가 없기 때문 — 아래 설명 참고).

## 5. 빌드 및 실행

```bash
docker compose up -d --build
```

최초 실행 시 MySQL 컨테이너가 `server/src/db/schema.sql`을 자동으로 적용합니다
(빈 볼륨일 때만 동작 — 이미 데이터가 쌓인 뒤에는 스키마 파일을 다시 넣어도 자동 적용되지 않습니다).

상태 확인:

```bash
docker compose ps
docker compose logs -f server   # 백엔드 로그
```

## 6. 확인

브라우저에서 `http://<서버_공인_IP>` 접속 → "네이버로 로그인" 클릭 → 정상적으로
로그인 후 홈으로 돌아오면 성공입니다.

API 헬스체크만 빠르게 보려면:

```bash
curl http://<서버_공인_IP>/api/health
# {"status":"ok","db":"connected"}
```

## 7. 업데이트(재배포)

```bash
cd accountbook
git pull
docker compose up -d --build
```

MySQL 데이터는 named volume(`mysql_data`)에 남아있으므로 재배포해도 지워지지 않습니다.

## 왜 IP+HTTP에서는 `COOKIE_SECURE=false`여야 하는가

네이버 로그인의 CSRF 방지용 `state` 값은 httpOnly 쿠키에 저장됩니다. 이 쿠키에
`Secure` 플래그가 붙으면 브라우저는 **HTTPS 연결에서만** 그 쿠키를 저장하고 돌려보냅니다.
지금처럼 도메인·인증서 없이 그냥 `http://<IP>`로 서비스하는 동안 `COOKIE_SECURE=true`로
두면, 네이버 로그인 후 돌아올 때마다 매번 `invalid_state` 에러가 나며 로그인이 막힙니다.
도메인을 마련하고 HTTPS를 붙인 뒤에 `true`로 바꾸면 됩니다.

## 다음 단계: 도메인 + HTTPS

도메인을 구입하면:

1. 도메인의 A 레코드를 서버 공인 IP로 연결합니다.
2. `client/nginx.conf`를 Let's Encrypt 인증서를 자동으로 발급·갱신해주는 구성(예: Caddy로 교체,
   또는 nginx + certbot)으로 바꿉니다.
3. 네이버 개발자센터의 서비스 URL / Callback URL을 `https://<도메인>` 기준으로 갱신합니다.
4. `.env`의 `NAVER_CALLBACK_URL`, `CLIENT_URL`을 `https://<도메인>`으로, `COOKIE_SECURE`를 `true`로 바꿉니다.

이 부분은 도메인을 마련하신 뒤 다시 요청해주시면 그때 구체적으로 도와드리겠습니다.
