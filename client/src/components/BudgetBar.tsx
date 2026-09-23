import { CategorySummary } from '../types';
import { formatCurrency } from '../utils/format';

export default function BudgetBar({ category }: { category: CategorySummary }) {
  const { categoryName, spent, budgetLimit, isOverBudget, categoryColor } = category;
  const percent = budgetLimit ? Math.min(100, Math.round((spent / budgetLimit) * 100)) : 0;

  return (
    <div className="budget-bar">
      <div className="budget-bar-header">
        <span style={{ color: categoryColor }}>{categoryName}</span>
        <span className={isOverBudget ? 'over' : ''}>
          {formatCurrency(spent)}
          {budgetLimit ? ` / ${formatCurrency(budgetLimit)}` : ''}
        </span>
      </div>
      {budgetLimit != null && (
        <div className="progress-track">
          <div
            className={`progress-fill ${isOverBudget ? 'over' : ''}`}
            style={{ width: `${percent}%`, backgroundColor: isOverBudget ? '#e03131' : categoryColor }}
          />
        </div>
      )}
      {isOverBudget && budgetLimit != null && (
        <p className="warning">예산을 {formatCurrency(spent - budgetLimit)} 초과했어요!</p>
      )}
    </div>
  );
}
