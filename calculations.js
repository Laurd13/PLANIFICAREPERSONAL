import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';

// Time calculations are done with dayjs to avoid manual date arithmetic.
dayjs.extend(utc);
dayjs.extend(isoWeek);

export const NIGHT_START = '22:00';
export const NIGHT_END = '06:00';

export const getWorkingDaysInMonth = (year, month) => {
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = start.endOf('month');
  let workingDays = 0;

  for (let date = start; date.isBefore(end) || date.isSame(end, 'day'); date = date.add(1, 'day')) {
    const day = date.day();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
  }

  return workingDays;
};

export const calculateWorkingFundHours = ({ year, month, leaves }) => {
  const workingDays = getWorkingDaysInMonth(year, month);
  const baseHours = workingDays * 8;

  // Each approved leave day reduces the monthly fund by 8 hours.
  const leaveHours = leaves.reduce((total, leave) => {
    if (leave.date && isWeekend(leave.date)) return total;
    return total + leave.hours;
  }, 0);
  return Math.max(baseHours - leaveHours, 0);
};

export const isWeekend = (date) => {
  const day = dayjs.utc(date).day();
  return day === 0 || day === 6;
};

export const getShiftDurationHours = (startTime, endTime) => {
  const today = dayjs.utc().format('YYYY-MM-DD');
  const start = dayjs.utc(`${today}T${startTime}:00Z`);
  let end = dayjs.utc(`${today}T${endTime}:00Z`);
  if (end.isBefore(start)) {
    end = end.add(1, 'day');
  }
  return end.diff(start, 'hour');
};

export const getNightHoursForShift = (startTime, endTime) => {
  const today = dayjs.utc().format('YYYY-MM-DD');
  const shiftStart = dayjs.utc(`${today}T${startTime}:00Z`);
  let shiftEnd = dayjs.utc(`${today}T${endTime}:00Z`);
  if (shiftEnd.isBefore(shiftStart)) {
    shiftEnd = shiftEnd.add(1, 'day');
  }

  const nightStart = dayjs.utc(`${today}T${NIGHT_START}:00Z`);
  const nightEnd = dayjs.utc(`${today}T${NIGHT_END}:00Z`).add(1, 'day');

  const rangeStart = shiftStart.isAfter(nightStart) ? shiftStart : nightStart;
  const rangeEnd = shiftEnd.isBefore(nightEnd) ? shiftEnd : nightEnd;
  const diff = rangeEnd.diff(rangeStart, 'hour', true);

  return Math.max(diff, 0);
};

export const calculateWeekendHours = (assignments, shiftTypes) => {
  const shiftTypeMap = new Map(shiftTypes.map((shift) => [shift.id, shift]));
  return assignments.reduce((total, assignment) => {
    if (!isWeekend(assignment.date)) return total;
    const shift = shiftTypeMap.get(assignment.shift_type_id);
    if (!shift) return total;
    return total + getShiftDurationHours(shift.start_time, shift.end_time);
  }, 0);
};

export const calculateTotalHours = (assignments, shiftTypes) => {
  const shiftTypeMap = new Map(shiftTypes.map((shift) => [shift.id, shift]));
  return assignments.reduce((total, assignment) => {
    const shift = shiftTypeMap.get(assignment.shift_type_id);
    if (!shift) return total;
    return total + getShiftDurationHours(shift.start_time, shift.end_time);
  }, 0);
};

export const groupAssignmentsByWeek = (assignments) => {
  return assignments.reduce((grouped, assignment) => {
    const weekKey = dayjs.utc(assignment.date).startOf('isoWeek').format('YYYY-MM-DD');
    if (!grouped[weekKey]) grouped[weekKey] = [];
    grouped[weekKey].push(assignment);
    return grouped;
  }, {});
};

export const hasWeeklyRest = (assignments, year, month) => {
  // Ensure at least 48 hours consecutive rest per week (two consecutive days off).
  const assignmentsByDate = new Set(assignments.map((assignment) => assignment.date));
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = start.endOf('month');

  for (let weekStart = start.startOf('isoWeek'); weekStart.isBefore(end); weekStart = weekStart.add(1, 'week')) {
    let consecutiveOff = 0;
    for (let day = weekStart; day.isBefore(weekStart.add(7, 'day')); day = day.add(1, 'day')) {
      const dateKey = day.format('YYYY-MM-DD');
      if (assignmentsByDate.has(dateKey)) {
        consecutiveOff = 0;
      } else {
        consecutiveOff += 1;
        if (consecutiveOff >= 2) break;
      }
    }
    if (consecutiveOff < 2) return false;
  }

  return true;
};
