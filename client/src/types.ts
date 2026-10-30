// 서버 API가 내려주는 JSON 응답 모양과 맞춰 둔 프론트엔드 공용 타입들.
// server/src/routes/*.ts 의 SELECT 컬럼 별칭(AS ...)과 이름을 맞춰야 한다.

export interface User {
  id: number;
  // 네이버에서 이메일 제공에 동의하지 않으면 null
  email: string | null;
  name: string;
}

export type TransactionType = 'income' | 'expense';

// 'shared'(공동 지출, 둘이 나눠 부담) / 'personal'(내 개인 지출, 정산 대상 제외)
export type SplitType = 'shared' | 'personal';

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
  splitType: SplitType;
  // split_type이 'shared'일 때, 낸 사람(userId)이 부담하는 비율(%). 50이면 1:1.
  payerSharePercent: number;
  // "더치페이"로 이미 그때그때 정산해버린 건이면 true. 월간 정산에서는 빠진다.
  isSettled: boolean;
  // 영수증 사진이 첨부돼 있는지. 사진 자체는 목록에 안 실리고, 볼 때 따로 받아온다.
  hasReceipt: boolean;
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
  splitType: SplitType;
  payerSharePercent: number;
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

export interface CategoryComparison {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  current: number;
  previous: number;
}

export interface DailyTotal {
  date: string;
  income: number;
  expense: number;
}

export interface TotalsComparison {
  currentIncome: number;
  currentExpense: number;
  previousIncome: number;
  previousExpense: number;
}

export interface MemberPaid {
  userId: number;
  userName: string;
  paid: number;
}

export interface Settlement {
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  toUserName: string;
  amount: number;
}

export interface MonthSettlement {
  month: string;
  members: MemberPaid[];
  totalExpense: number;
  settlement: Settlement | null;
}

export interface MonthInsights {
  month: string;
  previousMonth: string;
  categories: CategoryComparison[];
  daily: DailyTotal[];
  totals: TotalsComparison;
}
