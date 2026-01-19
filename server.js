import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import db from './db.js';
import { calculateWorkingFundHours, calculateTotalHours, calculateWeekendHours } from './calculations.js';
import { generateSchedule, computeWarnings } from './planner.js';

dayjs.extend(utc);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const activeTokens = new Set();

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ message: 'Autentificare necesara.' });
  }
  return next();
};

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin') {
    const token = uuidv4();
    activeTokens.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ message: 'Credentiale invalide.' });
});

app.get('/api/employees', requireAuth, (req, res) => {
  const employees = db.prepare('SELECT * FROM employees').all();
  res.json(employees);
});

app.post('/api/employees', requireAuth, (req, res) => {
  const { name, role, accepted_shift_types, vacation_days_left, medical_days, personal_time_off } = req.body;
  const statement = db.prepare(`
    INSERT INTO employees (name, role, accepted_shift_types, vacation_days_left, medical_days, personal_time_off)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = statement.run(
    name,
    role,
    accepted_shift_types,
    vacation_days_left || 0,
    medical_days || 0,
    personal_time_off || 0
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/employees/:id', requireAuth, (req, res) => {
  const { name, role, accepted_shift_types, vacation_days_left, medical_days, personal_time_off } = req.body;
  db.prepare(`
    UPDATE employees
    SET name = ?, role = ?, accepted_shift_types = ?, vacation_days_left = ?, medical_days = ?, personal_time_off = ?
    WHERE id = ?
  `).run(name, role, accepted_shift_types, vacation_days_left, medical_days, personal_time_off, req.params.id);
  res.json({ status: 'ok' });
});

app.delete('/api/employees/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ status: 'ok' });
});

app.get('/api/leaves', requireAuth, (req, res) => {
  const leaves = db.prepare('SELECT * FROM leaves').all();
  res.json(leaves);
});

app.post('/api/leaves', requireAuth, (req, res) => {
  const { employee_id, date, type, hours } = req.body;
  const result = db.prepare(`
    INSERT INTO leaves (employee_id, date, type, hours)
    VALUES (?, ?, ?, ?)
  `).run(employee_id, date, type, hours || 8);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/leaves/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  res.json({ status: 'ok' });
});

app.get('/api/shift-types', requireAuth, (req, res) => {
  const shiftTypes = db.prepare('SELECT * FROM shift_types').all();
  res.json(shiftTypes);
});

app.put('/api/shift-types/:id', requireAuth, (req, res) => {
  const { required_staff } = req.body;
  db.prepare('UPDATE shift_types SET required_staff = ? WHERE id = ?').run(required_staff, req.params.id);
  res.json({ status: 'ok' });
});

app.get('/api/assignments', requireAuth, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.json([]);
  }
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`).format('YYYY-MM-DD');
  const end = dayjs.utc(start).endOf('month').format('YYYY-MM-DD');
  const assignments = db.prepare('SELECT * FROM assignments WHERE date BETWEEN ? AND ?').all(start, end);
  return res.json(assignments);
});

app.post('/api/assignments', requireAuth, (req, res) => {
  const { employee_id, date, shift_type_id } = req.body;
  const result = db.prepare(`
    INSERT INTO assignments (employee_id, date, shift_type_id)
    VALUES (?, ?, ?)
  `).run(employee_id, date, shift_type_id);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/assignments/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  res.json({ status: 'ok' });
});

app.post('/api/schedule/generate', requireAuth, (req, res) => {
  const { year, month, requiredMap } = req.body;
  const employees = db.prepare('SELECT * FROM employees').all();
  const leaves = db.prepare('SELECT * FROM leaves').all();
  const shiftTypes = db.prepare('SELECT * FROM shift_types').all();

  const { assignments, warnings } = generateSchedule({
    year,
    month,
    employees,
    leaves,
    shiftTypes,
    requiredMap: requiredMap || {}
  });

  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`).format('YYYY-MM-DD');
  const end = dayjs.utc(start).endOf('month').format('YYYY-MM-DD');
  db.prepare('DELETE FROM assignments WHERE date BETWEEN ? AND ?').run(start, end);

  const insert = db.prepare('INSERT INTO assignments (employee_id, date, shift_type_id) VALUES (?, ?, ?)');
  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => insert.run(row.employee_id, row.date, row.shift_type_id));
  });
  insertMany(assignments);

  res.json({ assignments, warnings });
});

app.get('/api/reports', requireAuth, (req, res) => {
  const { year, month } = req.query;
  const employees = db.prepare('SELECT * FROM employees').all();
  const shiftTypes = db.prepare('SELECT * FROM shift_types').all();
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`).format('YYYY-MM-DD');
  const end = dayjs.utc(start).endOf('month').format('YYYY-MM-DD');
  const assignments = db.prepare('SELECT * FROM assignments WHERE date BETWEEN ? AND ?').all(start, end);
  const leaves = db.prepare('SELECT * FROM leaves').all();

  const reports = employees.map((employee) => {
    const employeeAssignments = assignments.filter((assignment) => assignment.employee_id === employee.id);
    const employeeLeaves = leaves.filter((leave) => leave.employee_id === employee.id);
    const workingFund = calculateWorkingFundHours({ year, month, leaves: employeeLeaves });
    const totalHours = calculateTotalHours(employeeAssignments, shiftTypes);
    const weekendHours = calculateWeekendHours(employeeAssignments, shiftTypes);

    return {
      employee_id: employee.id,
      name: employee.name,
      role: employee.role,
      workingFund,
      totalHours,
      weekendHours,
      overtimeHours: totalHours - workingFund
    };
  });

  const warnings = computeWarnings({ employees, assignments, leaves, shiftTypes, year, month });

  res.json({ reports, warnings });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on http://localhost:${port}`);
});
