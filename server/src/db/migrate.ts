import { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

// 기능을 추가하면서 바뀐 DB 구조를 서버가 시작될 때 "앱 자신의 DB 연결로" 맞춘다.
// 예전엔 운영 DB에 SQL을 손으로 실행해야 했는데, 콘솔에서 실행한 곳과 앱이 실제로 접속하는 곳이
// 어긋나서(payment_method 컬럼이 앱 쪽 DB엔 없었음) 배포 후 거래 목록이 500을 낸 적이 있다.
// 각 항목은 "이미 있으면 건너뛰기"라 몇 번을 실행해도 안전하다(멱등).
// 새 테이블/컬럼을 추가할 땐 schema.sql과 여기에 같이 넣는다.

// 지금 DB에 있는 테이블/컬럼 목록. 항목마다 information_schema를 따로 묻지 않고 두 번에 한꺼번에 읽는다
// (서버리스라 인스턴스가 새로 뜰 때마다 이 확인이 첫 요청 앞에서 돌기 때문에, 왕복 횟수가 곧 첫 응답 지연이다).
interface SchemaSnapshot {
  tables: Set<string>;
  // "table.column"
  columns: Set<string>;
}

interface Migration {
  name: string;
  isApplied: (schema: SchemaSnapshot) => boolean;
  statements: string[];
}

async function loadSchema(): Promise<SchemaSnapshot> {
  const [[tables], [columns]] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'),
    pool.query<RowDataPacket[]>(
      'SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()'
    ),
  ]);
  return {
    tables: new Set(tables.map((r) => String(r.name))),
    columns: new Set(columns.map((r) => `${r.tableName}.${r.columnName}`)),
  };
}

const tableExists = (table: string) => (schema: SchemaSnapshot) => schema.tables.has(table);
const columnExists = (table: string, column: string) => (schema: SchemaSnapshot) =>
  schema.columns.has(`${table}.${column}`);

// 순서가 중요하다: 테이블을 먼저 만들고, 그 테이블에 컬럼을 추가한다.
const MIGRATIONS: Migration[] = [
  {
    name: 'table transaction_receipts',
    isApplied: tableExists('transaction_receipts'),
    statements: [`CREATE TABLE IF NOT EXISTS transaction_receipts (
  transaction_id INT PRIMARY KEY,
  mime_type VARCHAR(50) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`],
  },
  {
    name: 'table expense_templates',
    isApplied: tableExists('expense_templates'),
    statements: [`CREATE TABLE IF NOT EXISTS expense_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  amount INT NOT NULL,
  category_id INT NULL,
  split_type ENUM('shared', 'personal') NOT NULL DEFAULT 'shared',
  payer_share_percent TINYINT NOT NULL DEFAULT 50,
  payment_method ENUM('card', 'cash', 'naverpay') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`],
  },
  {
    name: 'table purchase_requests',
    isApplied: tableExists('purchase_requests'),
    statements: [`CREATE TABLE IF NOT EXISTS purchase_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  requester_id INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  amount INT NOT NULL,
  category_id INT NULL,
  split_type ENUM('shared', 'personal') NOT NULL DEFAULT 'shared',
  payer_share_percent TINYINT NOT NULL DEFAULT 50,
  status ENUM('pending', 'approved', 'rejected', 'cancelled', 'purchased') NOT NULL DEFAULT 'pending',
  responder_id INT NULL,
  response_note VARCHAR(255) NULL,
  responded_at DATETIME NULL,
  transaction_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  INDEX idx_household_status (household_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`],
  },
  {
    name: 'column categories.is_date',
    isApplied: columnExists('categories', 'is_date'),
    statements: [
      'ALTER TABLE categories ADD COLUMN is_date BOOLEAN NOT NULL DEFAULT FALSE',
      "UPDATE categories SET is_date = TRUE WHERE type = 'expense' AND name IN ('데이트', '기념일')",
      `INSERT INTO categories (household_id, name, type, color, is_date)
       SELECT h.id, '기념일', 'expense', '#ff6b81', TRUE FROM households h
       WHERE NOT EXISTS (
         SELECT 1 FROM categories c WHERE c.household_id = h.id AND c.type = 'expense' AND c.name = '기념일'
       )`,
    ],
  },
  {
    name: 'column transactions.payment_method',
    isApplied: columnExists('transactions', 'payment_method'),
    statements: ["ALTER TABLE transactions ADD COLUMN payment_method ENUM('card', 'cash', 'naverpay') NULL"],
  },
  {
    name: 'column expense_templates.payment_method',
    isApplied: columnExists('expense_templates', 'payment_method'),
    statements: ["ALTER TABLE expense_templates ADD COLUMN payment_method ENUM('card', 'cash', 'naverpay') NULL"],
  },
];

async function runMigrations(): Promise<void> {
  const [[who]] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS db, CURRENT_USER() AS user');
  const applied: string[] = [];
  let schema = await loadSchema();
  for (const m of MIGRATIONS) {
    if (m.isApplied(schema)) continue;
    for (const sql of m.statements) {
      await pool.query(sql);
    }
    applied.push(m.name);
    // 방금 만든 테이블에 이미 들어 있는 컬럼을 다음 항목이 또 추가하려 하지 않게 목록을 다시 읽는다 (드문 경로).
    schema = await loadSchema();
  }
  // 어느 DB에 붙었고 무엇을 새로 적용했는지 남겨서, 콘솔과 앱이 다른 DB를 보는 문제를 바로 알아챌 수 있게 한다.
  console.log(`[migrate] db=${who.db} user=${who.user} applied=${applied.length ? applied.join(', ') : 'none'}`);
}

// 서버 인스턴스마다 한 번만 실행한다. 동시에 들어온 요청들은 같은 Promise를 기다린다.
// 실패하면 다음 요청에서 다시 시도하도록 비워두고, 실패 자체가 앱 전체를 막지는 않게 한다.
let running: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!running) {
    running = runMigrations().catch((err) => {
      console.error('[migrate] failed', err);
      running = null;
    });
  }
  return running;
}
