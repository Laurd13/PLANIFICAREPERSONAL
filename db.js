import Database from 'better-sqlite3';

const db = new Database('planner.db');

db.pragma('journal_mode = WAL');

// Core tables for employees, leave requests, shift types and assignments.
// The database keeps persistent planning data for the scheduler.
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    accepted_shift_types TEXT NOT NULL,
    vacation_days_left INTEGER NOT NULL DEFAULT 0,
    medical_days INTEGER NOT NULL DEFAULT 0,
    personal_time_off INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    hours INTEGER NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS shift_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    required_staff INTEGER NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    shift_type_id INTEGER NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id)
  );
`);

const seedShiftTypes = () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM shift_types').get().count;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO shift_types (name, start_time, end_time, required_staff, category)
    VALUES (?, ?, ?, ?, ?)
  `);

  insert.run('ECHIPA INTERVENTIE SCH 1', '08:00', '20:00', 6, 'day');
  insert.run('Permanenta SSS Zi', '08:00', '20:00', 5, 'day');
  insert.run('Permanenta SSS Noapte', '20:00', '08:00', 5, 'night');
  insert.run('Patrula Interventie Obiective', '07:00', '19:00', 2, 'day');
  insert.run('ECHIPA INTERVENTIE SCH 2', '20:00', '08:00', 4, 'night');
};

seedShiftTypes();

export default db;
