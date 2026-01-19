import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWorkingFundHours,
  getNightHoursForShift,
  getShiftDurationHours,
  getWorkingDaysInMonth,
  isWeekend
} from '../calculations.js';

test('calculateWorkingFundHours reduces for leave days', () => {
  const baseHours = getWorkingDaysInMonth(2024, 4) * 8;
  const hours = calculateWorkingFundHours({
    year: 2024,
    month: 4,
    leaves: [{ hours: 8 }, { hours: 8 }]
  });
  assert.equal(hours, baseHours - 16);
});

test('getShiftDurationHours accounts for overnight shifts', () => {
  assert.equal(getShiftDurationHours('20:00', '08:00'), 12);
});

test('getNightHoursForShift counts 22:00-06:00 interval', () => {
  assert.equal(getNightHoursForShift('20:00', '08:00'), 8);
});

test('isWeekend identifies Saturday and Sunday', () => {
  assert.equal(isWeekend('2024-06-08'), true);
  assert.equal(isWeekend('2024-06-10'), false);
});
