const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'fragrance.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

let db = null;

function initDatabase() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // PERF-03: 开启 WAL 模式的并发优化
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -64000');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // PERF-03: 补充关键索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_skus_product ON skus(product_id);
    CREATE INDEX IF NOT EXISTS idx_skus_deleted ON skus(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_stock_balances_loc_sku ON stock_balances(location_id, sku_id);
    CREATE INDEX IF NOT EXISTS idx_sales_location ON sales(location_id);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(ref_type, ref_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_type ON stock_movements(created_at, movement_type);
  `);

  // 迁移1：更新 stock_movements 表的 CHECK 约束，添加 check_in/check_out 类型
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'").get();
  if (tableInfo && !tableInfo.sql.includes('check_in')) {
    db.exec(`
      CREATE TABLE stock_movements_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER NOT NULL REFERENCES locations(id),
        sku_id INTEGER NOT NULL REFERENCES skus(id),
        movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'sale', 'split', 'transfer_in', 'transfer_out', 'loss', 'check_in', 'check_out')),
        quantity INTEGER NOT NULL,
        ref_type TEXT,
        ref_id INTEGER,
        unit_cost REAL,
        remark TEXT,
        operator TEXT,
        source TEXT DEFAULT 'web',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO stock_movements_new (id, location_id, sku_id, movement_type, quantity, ref_type, ref_id, unit_cost, remark, operator, created_at)
      SELECT id, location_id, sku_id, movement_type, quantity, ref_type, ref_id, unit_cost, remark, operator, created_at FROM stock_movements;
      DROP TABLE stock_movements;
      ALTER TABLE stock_movements_new RENAME TO stock_movements;
      CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(location_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements(sku_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    `);
    console.log('[迁移] stock_movements 表已更新，新增 check_in/check_out 类型 + source 字段');
  }

  // 迁移2：为已有 source 字段缺失的旧表添加 source 列
  if (tableInfo && tableInfo.sql.includes('check_in') && !tableInfo.sql.includes('source')) {
    db.exec(`ALTER TABLE stock_movements ADD COLUMN source TEXT DEFAULT 'web'`);
    console.log('[迁移] stock_movements 表已新增 source 字段');
  }

  // 迁移3：users 表新增 openid 字段（微信小程序登录）
  const userTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (userTableInfo && !userTableInfo.sql.includes('openid')) {
    db.exec(`ALTER TABLE users ADD COLUMN openid TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(openid) WHERE openid IS NOT NULL`);
    console.log('[迁移] users 表已新增 openid 字段');
  }

  // 初始化管理员
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (username, password_hash, role, name) VALUES (?, ?, ?, ?)')
      .run('admin', hash, 'admin', '管理员');
  }

  // 初始化默认场所
  const locExists = db.prepare('SELECT id FROM locations WHERE id = 1').get();
  if (!locExists) {
    db.prepare('INSERT INTO locations (id, name, type) VALUES (1, ?, ?), (2, ?, ?)')
      .run('总仓库', 'warehouse', '门店A', 'store');
  }

  // 初始化默认品类
  const catExists = db.prepare('SELECT id FROM categories WHERE id = 1').get();
  if (!catExists) {
    db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (1, ?, 1), (2, ?, 2), (3, ?, 3), (4, ?, 4)')
      .run('香水', '散香', '蜡烛', '护理');
  }

  // 初始化示例数据（仅在空库时插入）
  const brandExists = db.prepare('SELECT id FROM brands WHERE id = 1').get();
  if (!brandExists) {
    seedSampleData(db);
  }

  return db;
}

function seedSampleData(db) {
  // 品牌
  db.prepare('INSERT INTO brands (id, name) VALUES (1, ?), (2, ?), (3, ?)')
    .run('祖玛珑', '蒂普提克', '百瑞德');

  // 商品
  db.prepare('INSERT INTO products (id, brand_id, name, category, is_splittable) VALUES (1, 1, ?, ?, 1), (2, 2, ?, ?, 1), (3, 3, ?, ?, 0)')
    .run('蓝风铃香水', '香水', '檀香 noir', '香水', '非洲野橙', '散香');

  // SKU
  db.prepare(`INSERT INTO skus (id, product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold) VALUES
    (1, 1, 'SKU001001', '6901234500001', '整装', '100ml', 100, '瓶', 120, 680, 2),
    (2, 1, 'SKU001002', '6901234500002', '分装', '2ml', 2, '瓶', 0, 45, 10),
    (3, 1, 'SKU001003', '6901234500003', '分装', '5ml', 5, '瓶', 0, 80, 5),
    (4, 1, 'SKU001004', '6901234500004', '分装', '10ml', 10, '瓶', 0, 120, 3),
    (5, 2, 'SKU002001', '6901234500005', '整装', '50ml', 50, '瓶', 200, 850, 2),
    (6, 2, 'SKU002002', '6901234500006', '分装', '5ml', 5, '瓶', 0, 100, 5),
    (7, 3, 'SKU003001', '6901234500007', '整装', '80g', 0, '盒', 60, 320, 3)
  `).run();

  // 客户
  db.prepare('INSERT INTO customers (id, wechat_name, phone, points, total_spent, remark) VALUES (1, ?, ?, ?, ?, ?), (2, ?, ?, ?, ?, ?)')
    .run('小芳', '13800138001', 56, 560, '老客户', '阿杰', '13900139002', 24, 240, '');

  // 入库：10瓶蓝风铃100ml + 5瓶檀香50ml
  db.prepare(`INSERT INTO stock_in_orders (id, location_id, supplier, total_cost, operator, remark) VALUES (1, 1, '品牌方直采', 2200, '管理员', '首批进货')`).run();
  db.prepare('INSERT INTO stock_in_items (order_id, sku_id, quantity, unit_cost) VALUES (1, 1, 10, 120), (1, 5, 5, 200)').run();
  db.prepare(`INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (1, 1, 10), (1, 5, 5)`).run();
  db.prepare(`INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, unit_cost, remark, operator) VALUES
    (1, 1, 'in', 10, 'stock_in', 1, 120, '首批进货', '管理员'),
    (1, 5, 'in', 5, 'stock_in', 1, 200, '首批进货', '管理员')`).run();

  // 调拨：3瓶蓝风铃100ml 仓库→门店A
  db.prepare(`INSERT INTO transfers (id, from_location_id, to_location_id, status, operator) VALUES (1, 1, 2, 'completed', '管理员')`).run();
  db.prepare('INSERT INTO transfer_items (transfer_id, sku_id, quantity) VALUES (1, 1, 3)').run();
  db.prepare('UPDATE stock_balances SET quantity = quantity - 3 WHERE location_id = 1 AND sku_id = 1').run();
  db.prepare('INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (2, 1, 3)').run();
  db.prepare(`INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, remark, operator) VALUES
    (1, 1, 'transfer_out', -3, 'transfer', 1, '调拨到门店A', '管理员'),
    (2, 1, 'transfer_in', 3, 'transfer', 1, '仓库调入', '管理员')`).run();

  // 分装：1瓶100ml → 5×2ml + 3×5ml + 4×10ml (共65ml，损耗35ml)
  db.prepare(`INSERT INTO split_orders (id, location_id, source_sku_id, source_quantity, source_total_volume, actual_used_volume, waste_volume, bottle_consumed, operator, remark)
    VALUES (1, 2, 1, 1, 100, 65, 35, 1, '店员A', '首次分装')`).run();
  db.prepare('INSERT INTO split_items (split_order_id, target_sku_id, quantity, unit_volume, subtotal_volume) VALUES (1, 2, 5, 2, 10), (1, 3, 3, 5, 15), (1, 4, 4, 10, 40)').run();
  db.prepare('UPDATE stock_balances SET quantity = quantity - 1 WHERE location_id = 2 AND sku_id = 1').run();
  db.prepare('INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (2, 2, 5), (2, 3, 3), (2, 4, 4)').run();
  db.prepare(`INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, remark, operator) VALUES
    (2, 1, 'split', -1, 'split', 1, '分装消耗', '店员A'),
    (2, 2, 'split', 5, 'split', 1, '分装产出2ml×5', '店员A'),
    (2, 3, 'split', 3, 'split', 1, '分装产出5ml×3', '店员A'),
    (2, 4, 'split', 4, 'split', 1, '分装产出10ml×4', '店员A')`).run();

  // 销售：客户小芳购买 1×2ml蓝风铃 + 1×10ml蓝风铃，微信支付
  db.prepare(`INSERT INTO sales (id, location_id, customer_id, total_amount, discount, final_amount, points_earned, points_used, operator, remark)
    VALUES (1, 2, 1, 165, 0, 165, 16, 0, '店员A', '首次销售')`).run();
  db.prepare('INSERT INTO sale_items (sale_id, sku_id, quantity, unit_price) VALUES (1, 2, 1, 45), (1, 4, 1, 120)').run();
  db.prepare('INSERT INTO payments (sale_id, method, amount) VALUES (1, \'wechat\', 165)').run();
  db.prepare('UPDATE stock_balances SET quantity = quantity - 1 WHERE location_id = 2 AND sku_id = 2').run();
  db.prepare('UPDATE stock_balances SET quantity = quantity - 1 WHERE location_id = 2 AND sku_id = 4').run();
  db.prepare(`INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, remark, operator) VALUES
    (2, 2, 'sale', -1, 'sale', 1, '销售', '店员A'),
    (2, 4, 'sale', -1, 'sale', 1, '销售', '店员A')`).run();
  db.prepare('UPDATE customers SET points = points + 16, total_spent = total_spent + 165 WHERE id = 1').run();

  // 出库/损耗：仓库1瓶蓝风铃100ml破损
  db.prepare(`INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, remark, operator)
    VALUES (1, 1, 'loss', -1, 'stock_out', '运输破损', '管理员')`).run();
  db.prepare('UPDATE stock_balances SET quantity = quantity - 1 WHERE location_id = 1 AND sku_id = 1').run();
}

function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

module.exports = { getDb, initDatabase };
