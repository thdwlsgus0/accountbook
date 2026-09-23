import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './config/db.js';
import authRouter from './routes/auth.js';
import householdsRouter from './routes/households.js';
import categoriesRouter from './routes/categories.js';
import transactionsRouter from './routes/transactions.js';
import summaryRouter from './routes/summary.js';
import recurringRouter from './routes/recurring.js';
import budgetsRouter from './routes/budgets.js';
import goalsRouter from './routes/goals.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: (err as Error).message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/households', householdsRouter);
app.use('/api/households/:householdId/categories', categoriesRouter);
app.use('/api/households/:householdId/transactions', transactionsRouter);
app.use('/api/households/:householdId/summary', summaryRouter);
app.use('/api/households/:householdId/recurring', recurringRouter);
app.use('/api/households/:householdId/budgets', budgetsRouter);
app.use('/api/households/:householdId/goals', goalsRouter);

// 공통 에러 핸들러. express-async-errors 덕분에 라우트 핸들러의 async 함수 안에서
// 던진(throw) 에러도 각 라우트에서 try/catch 없이 여기로 모인다.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { message: '서버 오류가 발생했습니다.' } });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
