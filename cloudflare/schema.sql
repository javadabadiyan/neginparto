-- Cloudflare D1 Schema for سامانه جامع شرکت نگین پرتو نصر
-- Permanent Free Cloud SQLite Database (Zero-Pause, Multi-Browser Sync)

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'کاربر سفارشی',
  department TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  uid TEXT NOT NULL DEFAULT '',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT '',
  last_login TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS personnel (
  id TEXT PRIMARY KEY,
  personnel_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_personnel_code ON personnel(personnel_code);

CREATE TABLE IF NOT EXISTS job_groups (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_classifications (
  id TEXT PRIMARY KEY,
  personnel_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS karaneh (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL DEFAULT '',
  personnel_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_karaneh_period ON karaneh(period);

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  personnel_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL DEFAULT '',
  personnel_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(period);

CREATE TABLE IF NOT EXISTS mining_volumes (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL DEFAULT '',
  unit_name TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mining_volumes_period ON mining_volumes(period);

CREATE TABLE IF NOT EXISTS mining_machinery (
  id TEXT PRIMARY KEY,
  machine_code TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unit_reports (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL DEFAULT '',
  unit_name TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unit_reports_period_unit ON unit_reports(period, unit_name);
