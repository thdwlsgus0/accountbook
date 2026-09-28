import crypto from 'node:crypto';
import { Request, Response, Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { signToken } from '../utils/jwt.js';

const router = Router();

const NAVER_AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize';
const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';
const STATE_COOKIE = 'naver_oauth_state';

interface UserRow extends RowDataPacket {
  id: number;
  naver_id: string;
  email: string | null;
  name: string;
}

interface NaverTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface NaverProfileResponse {
  resultcode: string;
  message: string;
  response?: {
    id: string;
    email?: string;
    name?: string;
    nickname?: string;
  };
}

function naverConfig() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const callbackUrl = process.env.NAVER_CALLBACK_URL;
  if (!clientId || !clientSecret || !callbackUrl) return null;
  return { clientId, clientSecret, callbackUrl };
}

function clientUrl(): string {
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

function redirectToLoginWithError(res: Response, code: string) {
  res.redirect(`${clientUrl()}/login?error=${code}`);
}

// 1단계: 네이버 로그인 화면으로 보낸다.
// state는 "이 로그인 요청을 우리가 시작했다"는 걸 콜백에서 확인하기 위한 일회용 값(CSRF 방지)이다.
router.get('/naver', (req: Request, res: Response) => {
  const config = naverConfig();
  if (!config) {
    return res
      .status(500)
      .json({ error: { message: '네이버 로그인이 설정되지 않았습니다. server/.env의 NAVER_* 값을 확인해주세요.' } });
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    // NODE_ENV가 아니라 별도 COOKIE_SECURE로 제어한다. 도메인 없이 IP+HTTP로 배포하는 동안
    // NODE_ENV=production이어도 이 쿠키의 Secure 플래그가 true가 되면 브라우저가
    // HTTP 연결에서는 쿠키를 저장/전송하지 않아 매번 invalid_state로 로그인이 실패한다.
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    state,
  });
  res.redirect(`${NAVER_AUTHORIZE_URL}?${params.toString()}`);
});

// 2단계: 네이버가 사용자를 돌려보내는 곳. code를 토큰으로 바꾸고, 프로필을 조회해 로그인 처리한다.
router.get('/naver/callback', async (req: Request, res: Response) => {
  const config = naverConfig();
  if (!config) {
    return redirectToLoginWithError(res, 'not_configured');
  }

  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const savedState = req.cookies?.[STATE_COOKIE] as string | undefined;
  res.clearCookie(STATE_COOKIE);

  // 사용자가 동의 화면에서 취소한 경우
  if (error) {
    return redirectToLoginWithError(res, 'denied');
  }
  if (!code || !state || !savedState || state !== savedState) {
    return redirectToLoginWithError(res, 'invalid_state');
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      state,
    });
    const tokenRes = await fetch(`${NAVER_TOKEN_URL}?${tokenParams.toString()}`);
    const tokenData = (await tokenRes.json()) as NaverTokenResponse;
    if (!tokenData.access_token) {
      throw new Error(`네이버 토큰 발급 실패: ${tokenData.error_description || tokenData.error}`);
    }

    const profileRes = await fetch(NAVER_PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as NaverProfileResponse;
    if (profile.resultcode !== '00' || !profile.response?.id) {
      throw new Error(`네이버 프로필 조회 실패: ${profile.message}`);
    }

    const naverId = profile.response.id;
    const email = profile.response.email ?? null;
    const name = profile.response.name || profile.response.nickname || '사용자';

    // 처음 로그인하면 가입, 이미 가입된 사용자면 이름/이메일만 최신 값으로 갱신한다.
    const [existing] = await pool.query<UserRow[]>('SELECT id FROM users WHERE naver_id = ?', [naverId]);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId]);
    } else {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO users (naver_id, email, name) VALUES (?, ?, ?)',
        [naverId, email, name]
      );
      userId = result.insertId;
    }

    // 토큰은 URL fragment(#)로 넘긴다. fragment는 서버 로그나 Referer로 전송되지 않는다.
    const token = signToken({ userId });
    res.redirect(`${clientUrl()}/auth/callback#token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(err);
    redirectToLoginWithError(res, 'failed');
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const [rows] = await pool.query<UserRow[]>('SELECT id, email, name FROM users WHERE id = ?', [req.userId]);
  if (rows.length === 0) {
    return res.status(404).json({ error: { message: '사용자를 찾을 수 없습니다.' } });
  }
  res.json({ user: rows[0] });
});

export default router;
