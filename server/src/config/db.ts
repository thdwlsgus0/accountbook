import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  // 서버리스(Vercel)에서는 인스턴스마다 자기만의 풀을 새로 만들기 때문에,
  // 동시에 여러 인스턴스가 뜨면 DB의 최대 연결 수를 금방 채울 수 있다.
  // 기본값을 낮게 두고, Docker/VM처럼 풀을 하나만 오래 쓰는 환경에서는 필요시 올린다.
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 5,
  // DATE/DATETIME 컬럼을 JS Date 객체 대신 문자열로 받는다.
  // (Date 객체로 받으면 서버 타임존에 따라 JSON 직렬화 시 날짜가 하루 밀리는 문제가 생길 수 있다)
  dateStrings: true,
  // TiDB Cloud 같은 매니지드 DB는 TLS 연결을 강제한다.
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined,
});
