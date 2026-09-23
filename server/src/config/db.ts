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
  connectionLimit: 10,
  // DATE/DATETIME 컬럼을 JS Date 객체 대신 문자열로 받는다.
  // (Date 객체로 받으면 서버 타임존에 따라 JSON 직렬화 시 날짜가 하루 밀리는 문제가 생길 수 있다)
  dateStrings: true,
});
