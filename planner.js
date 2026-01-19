import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import {
  calculateTotalHours,
  calculateWeekendHours,
  calculateWorkingFundHours,
  getNightHoursForShift,
  groupAssignmentsByWeek,
  hasWeeklyRest
} from './calculations.js';

dayjs.extend(utc);
dayjs.extend(isoWeek);

const HOURS_PER_WEEK_LIMIT = 48;
const REST_HOURS_MIN = 12;
const WEEKEND_LIMIT_RATIO = 0.4;

const getShiftEndDateTime = (date, shift) => {
  const start = dayjs.utc(`${date}T${shift.start_time}:00Z`);
  let end = dayjs.utc(`${date}T${shift.end_time}:00Z`);
  if (end.isBefore(start)) {
    end = end.add(1, 'day');
  }
  return { start, end };
};

const hasMinimumRest = (existingAssignments, newAssignmentDate, shift, shiftTypes) => {
  const shiftTypeMap = new Map(shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const newShiftTimes = getShiftEndDateTime(newAssignmentDate, shift);

  return existingAssignments.every((assignment) => {
    const currentShift = shiftTypeMap.get(assignment.shift_type_id);
    if (!currentShift) return true;
    const currentShiftTimes = getShiftEndDateTime(assignment.date, currentShift);
    const diffAfter = newShiftTimes.start.diff(currentShiftTimes.end, 'hour', true);
    const diffBefore = currentShiftTimes.start.diff(newShiftTimes.end, 'hour', true);

    return diffAfter >= REST_HOURS_MIN || diffBefore >= REST_HOURS_MIN;
  });
};

const nightHoursInLast24h = (existingAssignments, date, shift, shiftTypes) => {
  const shiftTypeMap = new Map(shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const windowStart = dayjs.utc(`${date}T00:00:00Z`).subtract(24, 'hour');
  const windowEnd = dayjs.utc(`${date}T23:59:59Z`).add(24, 'hour');

  let total = getNightHoursForShift(shift.start_time, shift.end_time);

  existingAssignments.forEach((assignment) => {
    const shiftType = shiftTypeMap.get(assignment.shift_type_id);
    if (!shiftType) return;
    const { start } = getShiftEndDateTime(assignment.date, shiftType);
    if (start.isAfter(windowStart) && start.isBefore(windowEnd)) {
      total += getNightHoursForShift(shiftType.start_time, shiftType.end_time);
    }
  });

  return total;
};

// Respect legal constraints: 12h rest, 48h weekly limit, 48h weekly rest, max 8h night work in 24h,
// and 40% weekend cap for equity.
const canAssignShift = ({ employeeAssignments, date, shiftType, shiftTypes, year, month }) => {
  if (!hasMinimumRest(employeeAssignments, date, shiftType, shiftTypes)) return false;
  if (!hasWeeklyRest([...employeeAssignments, { date, shift_type_id: shiftType.id }], year, month)) {
    return false;
  }

  const assignmentsForWeek = groupAssignmentsByWeek([...employeeAssignments, { date, shift_type_id: shiftType.id }]);
  const weekKey = dayjs.utc(date).startOf('isoWeek').format('YYYY-MM-DD');
  const weekAssignments = assignmentsForWeek[weekKey] || [];
  const weeklyHours = calculateTotalHours(weekAssignments, shiftTypes);
  if (weeklyHours > HOURS_PER_WEEK_LIMIT) return false;

  const nightHours = nightHoursInLast24h(employeeAssignments, date, shiftType, shiftTypes);
  if (nightHours > 8) return false;

  return true;
};

export const generateSchedule = ({ year, month, employees, leaves, shiftTypes, requiredMap }) => {
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = start.endOf('month');
  const assignments = [];
  const warnings = [];
  const employeeAssignments = new Map(employees.map((employee) => [employee.id, []]));

  const leaveSet = new Set(leaves.map((leave) => `${leave.employee_id}-${leave.date}`));

  for (let date = start; date.isBefore(end) || date.isSame(end, 'day'); date = date.add(1, 'day')) {
    const dateKey = date.format('YYYY-MM-DD');
    shiftTypes.forEach((shift) => {
      const requiredStaff = requiredMap[shift.id] ?? shift.required_staff;
      let assigned = 0;

      const availableEmployees = employees.filter((employee) => {
        if (leaveSet.has(`${employee.id}-${dateKey}`)) return false;
        const accepted = employee.accepted_shift_types.split(',').map((item) => item.trim());
        return accepted.includes(shift.category) || accepted.includes(shift.name);
      });

      // Greedy assignment: prioritize employees with fewer total hours and weekend hours.
      const sortedEmployees = availableEmployees.sort((a, b) => {
        const assignmentsA = employeeAssignments.get(a.id) || [];
        const assignmentsB = employeeAssignments.get(b.id) || [];
        const totalA = calculateTotalHours(assignmentsA, shiftTypes);
        const totalB = calculateTotalHours(assignmentsB, shiftTypes);
        const weekendA = calculateWeekendHours(assignmentsA, shiftTypes);
        const weekendB = calculateWeekendHours(assignmentsB, shiftTypes);

        if (totalA !== totalB) return totalA - totalB;
        return weekendA - weekendB;
      });

      for (const employee of sortedEmployees) {
        if (assigned >= requiredStaff) break;
        const currentAssignments = employeeAssignments.get(employee.id) || [];
        if (!canAssignShift({
          employeeAssignments: currentAssignments,
          date: dateKey,
          shiftType: shift,
          shiftTypes,
          year,
          month
        })) {
          continue;
        }

        const assignment = {
          employee_id: employee.id,
          date: dateKey,
          shift_type_id: shift.id
        };

        assignments.push(assignment);
        employeeAssignments.get(employee.id).push(assignment);
        assigned += 1;
      }

      if (assigned < requiredStaff) {
        warnings.push({
          date: dateKey,
          shift: shift.name,
          message: `Nu sunt suficienti angajati pentru ${shift.name} (${assigned}/${requiredStaff}).`
        });
      }
    });
  }

  const weekendWarnings = employees
    .map((employee) => {
      const assignmentsForEmployee = employeeAssignments.get(employee.id) || [];
      const weekendHours = calculateWeekendHours(assignmentsForEmployee, shiftTypes);
      const employeeLeaves = leaves.filter((leave) => leave.employee_id === employee.id);
      const workingFund = calculateWorkingFundHours({ year, month, leaves: employeeLeaves });
      if (workingFund > 0 && weekendHours / workingFund > WEEKEND_LIMIT_RATIO) {
        return {
          employee_id: employee.id,
          message: `Angajatul ${employee.name} depaseste limita de 40% ore de weekend.`
        };
      }
      return null;
    })
    .filter(Boolean);

  return { assignments, warnings: [...warnings, ...weekendWarnings] };
};

export const buildReports = ({ employees, assignments, leaves, shiftTypes, year, month }) => {
  return employees.map((employee) => {
    const employeeAssignments = assignments.filter((assignment) => assignment.employee_id === employee.id);
    const employeeLeaves = leaves.filter((leave) => leave.employee_id === employee.id);
    const totalHours = calculateTotalHours(employeeAssignments, shiftTypes);
    const weekendHours = calculateWeekendHours(employeeAssignments, shiftTypes);
    const adjustedFund = calculateWorkingFundHours({
      year,
      month,
      leaves: employeeLeaves
    });

    return {
      employee_id: employee.id,
      name: employee.name,
      totalHours,
      weekendHours,
      overtimeHours: totalHours - adjustedFund
    };
  });
};

export const computeWarnings = ({ employees, assignments, leaves, shiftTypes, year, month }) => {
  return employees.flatMap((employee) => {
    const employeeAssignments = assignments.filter((assignment) => assignment.employee_id === employee.id);
    const totalHours = calculateTotalHours(employeeAssignments, shiftTypes);
    const employeeLeaves = leaves.filter((leave) => leave.employee_id === employee.id);
    const workingFund = calculateWorkingFundHours({ year, month, leaves: employeeLeaves });
    const weekendHours = calculateWeekendHours(employeeAssignments, shiftTypes);
    const weekendRatio = workingFund > 0 ? weekendHours / workingFund : 0;
    const grouped = groupAssignmentsByWeek(employeeAssignments);

    const warnings = [];

    Object.entries(grouped).forEach(([week, weekAssignments]) => {
      const weekHours = calculateTotalHours(weekAssignments, shiftTypes);
      if (weekHours > HOURS_PER_WEEK_LIMIT) {
        warnings.push({
          employee_id: employee.id,
          message: `Depasire 48 ore in saptamana care incepe la ${week}.`
        });
      }
    });

    if (weekendRatio > WEEKEND_LIMIT_RATIO) {
      warnings.push({
        employee_id: employee.id,
        message: 'Depasire limita 40% ore de weekend.'
      });
    }

    if (!hasWeeklyRest(employeeAssignments, year, month)) {
      warnings.push({
        employee_id: employee.id,
        message: 'Nu exista repaus saptamanal de 48 de ore consecutive.'
      });
    }

    return warnings;
  });
};
