// 서버 API가 내려주는 JSON 응답 모양과 맞춰 둔 프론트엔드 공용 타입들.
// server/src/routes/*.ts 의 SELECT 컬럼 별칭(AS ...)과 이름을 맞춰야 한다.

export interface User {
  id: number;
  // 네이버에서 이메일 제공에 동의하지 않으면 null
  email: string | null;
  name: string;
}

export type TransactionType = 'income' | 'expense';

export interface Household {
  id: number;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
}

export interface HouseholdMember {
  id: number;
  name: string;
  email: string | null;
  role: 'owner' | 'member';
}

export interface HouseholdDetail {
  id: number;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  color: string;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  memo: string | null;
  occurredOn: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  userId: number;
  userName: string;
}

export interface RecurringRule {
  id: number;
  type: TransactionType;
  amount: number;
  memo: string | null;
  dayOfMonth: number;
  isActive: boolean;
  categoryId: number | null;
  categoryName: string | null;
}

export interface Budget {
  categoryId: number;
  categoryName: string;
  amountLimit: number;
}

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  spent: number;
  budgetLimit: number | null;
  isOverBudget: boolean;
}

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  categories: CategorySummary[];
}

export interface SavingsGoal {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
}

export interface ApiError {
  error: {
    message: string;
  };
}
