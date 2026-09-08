CREATE DATABASE IF NOT EXISTS ward_cafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ward_cafe;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_number VARCHAR(12) NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','cashier','accountant','waiter','kitchen') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_number (user_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_number VARCHAR(12) NULL,
  ip_address VARCHAR(64) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_attempts_number_time (user_number, attempted_at),
  KEY idx_login_attempts_ip_time (ip_address, attempted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description VARCHAR(500) NULL,
  image_url VARCHAR(1000) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_menu_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cafe_tables (
  table_number TINYINT UNSIGNED NOT NULL,
  status ENUM('available','occupied') NOT NULL DEFAULT 'available',
  reserved_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (table_number),
  CONSTRAINT chk_table_number CHECK (table_number BETWEEN 1 AND 20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL,
  table_number TINYINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  status ENUM('preparing','ready','delivered') NOT NULL DEFAULT 'preparing',
  payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at DATETIME NULL,
  delivered_at DATETIME NULL,
  paid_at DATETIME NULL,
  moved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_orders_table_open (table_number, payment_status),
  KEY idx_orders_status (status, payment_status),
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_table FOREIGN KEY (table_number) REFERENCES cafe_tables(table_number),
  CONSTRAINT chk_order_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id CHAR(36) NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  CONSTRAINT chk_order_item_qty CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT chk_order_item_price CHECK (unit_price >= 0 AND line_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_number TINYINT UNSIGNED NOT NULL,
  method ENUM('cash','card') NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  cash_received DECIMAL(10,2) NULL,
  change_amount DECIMAL(10,2) NULL,
  cashier_user_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_business_date (business_date),
  CONSTRAINT fk_payments_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id),
  CONSTRAINT fk_payments_table FOREIGN KEY (table_number) REFERENCES cafe_tables(table_number),
  CONSTRAINT chk_payment_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_orders (
  payment_id BIGINT UNSIGNED NOT NULL,
  order_id CHAR(36) NOT NULL,
  PRIMARY KEY (payment_id, order_id),
  UNIQUE KEY uq_payment_order (order_id),
  CONSTRAINT fk_payment_orders_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_orders_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_expenses_business_date (business_date),
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_expense_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS day_closures (
  business_date DATE NOT NULL,
  total_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  cash_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  closed_by BIGINT UNSIGNED NOT NULL,
  closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_date),
  CONSTRAINT fk_day_closure_user FOREIGN KEY (closed_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO cafe_tables (table_number, status)
SELECT n, 'available'
FROM (
  SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
  UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
  UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
) AS numbers
ON DUPLICATE KEY UPDATE table_number = VALUES(table_number);
