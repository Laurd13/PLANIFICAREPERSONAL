import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSchedule } from '../planner.js';

test('generateSchedule assigns employees while respecting required staff', () => {
  const employees = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    name: `Angajat ${index + 1}`,
    accepted_shift_types: 'day'
  }));
  const shiftTypes = [
    { id: 10, name: 'Zi', start_time: '08:00', end_time: '20:00', required_staff: 1, category: 'day' }
  ];

  const { assignments, warnings } = generateSchedule({
    year: 2024,
    month: 6,
    employees,
    leaves: [],
    shiftTypes,
    requiredMap: {}
  });

  assert.ok(assignments.length > 0);
  assert.equal(warnings.length, 0);
});
