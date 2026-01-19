/* global dayjs */

dayjs.extend(window.dayjs_plugin_utc);
dayjs.extend(window.dayjs_plugin_isoWeek);

const state = {
  token: localStorage.getItem('token') || '',
  employees: [],
  leaves: [],
  shiftTypes: [],
  assignments: [],
  reports: [],
  warnings: [],
  month: 1,
  year: new Date().getFullYear()
};

const authFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Eroare la solicitare');
  }
  return response.json();
};

const login = async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const data = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then((res) => res.json());

  if (data.token) {
    state.token = data.token;
    localStorage.setItem('token', data.token);
    document.getElementById('login-status').textContent = 'Autentificat.';
    await refreshAll();
  } else {
    document.getElementById('login-status').textContent = 'Autentificare esuata.';
  }
};

const refreshEmployees = async () => {
  state.employees = await authFetch('/api/employees');
  renderEmployees();
  renderEmployeeOptions();
};

const refreshLeaves = async () => {
  state.leaves = await authFetch('/api/leaves');
  renderLeaves();
};

const refreshShiftTypes = async () => {
  state.shiftTypes = await authFetch('/api/shift-types');
  renderShiftTypes();
};

const refreshAssignments = async () => {
  state.assignments = await authFetch(`/api/assignments?month=${state.month}&year=${state.year}`);
  renderCalendar();
};

const refreshReports = async () => {
  const data = await authFetch(`/api/reports?month=${state.month}&year=${state.year}`);
  state.reports = data.reports;
  state.warnings = data.warnings;
  renderReports();
};

const refreshAll = async () => {
  await Promise.all([refreshEmployees(), refreshLeaves(), refreshShiftTypes()]);
  await refreshAssignments();
  await refreshReports();
};

const renderEmployees = () => {
  const tbody = document.querySelector('#employee-table tbody');
  tbody.innerHTML = '';
  state.employees.forEach((employee) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${employee.name}</td>
      <td>${employee.role}</td>
      <td>${employee.accepted_shift_types}</td>
      <td>${employee.vacation_days_left}</td>
      <td>${employee.medical_days}</td>
      <td>${employee.personal_time_off}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-id="${employee.id}">Sterge</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      await authFetch(`/api/employees/${employee.id}`, { method: 'DELETE' });
      await refreshAll();
    });
    tbody.appendChild(tr);
  });
};

const renderEmployeeOptions = () => {
  const select = document.getElementById('leave-employee');
  select.innerHTML = '';
  state.employees.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.name;
    select.appendChild(option);
  });
};

const renderLeaves = () => {
  const list = document.getElementById('leave-list');
  list.innerHTML = '';
  state.leaves.forEach((leave) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    const employee = state.employees.find((emp) => emp.id === leave.employee_id);
    item.innerHTML = `
      <span>${employee ? employee.name : 'Angajat'} - ${leave.date} (${leave.type})</span>
      <button class="btn btn-sm btn-outline-danger" data-id="${leave.id}">Sterge</button>
    `;
    item.querySelector('button').addEventListener('click', async () => {
      await authFetch(`/api/leaves/${leave.id}`, { method: 'DELETE' });
      await refreshAll();
    });
    list.appendChild(item);
  });
};

const renderShiftTypes = () => {
  const tbody = document.querySelector('#shift-table tbody');
  tbody.innerHTML = '';
  state.shiftTypes.forEach((shift) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${shift.name}</td>
      <td>${shift.start_time} - ${shift.end_time}</td>
      <td>
        <input type="number" class="form-control form-control-sm" value="${shift.required_staff}" min="0" data-id="${shift.id}" />
      </td>
    `;
    tr.querySelector('input').addEventListener('change', async (event) => {
      await authFetch(`/api/shift-types/${shift.id}`, {
        method: 'PUT',
        body: JSON.stringify({ required_staff: Number(event.target.value) })
      });
    });
    tbody.appendChild(tr);
  });
};

const renderCalendar = () => {
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';
  const start = dayjs.utc(`${state.year}-${String(state.month).padStart(2, '0')}-01`);
  const end = start.endOf('month');

  for (let date = start; date.isBefore(end) || date.isSame(end, 'day'); date = date.add(1, 'day')) {
    const dayContainer = document.createElement('div');
    dayContainer.className = 'calendar-day';
    const dateKey = date.format('YYYY-MM-DD');
    dayContainer.innerHTML = `<h3>${date.format('DD MMM')}</h3>`;

    state.shiftTypes.forEach((shift) => {
      const shiftCard = document.createElement('div');
      shiftCard.className = 'shift-card';
      shiftCard.dataset.date = dateKey;
      shiftCard.dataset.shiftId = shift.id;
      shiftCard.innerHTML = `<strong>${shift.name}</strong>`;

      const assignments = state.assignments.filter(
        (assignment) => assignment.date === dateKey && assignment.shift_type_id === shift.id
      );

      assignments.forEach((assignment) => {
        const employee = state.employees.find((emp) => emp.id === assignment.employee_id);
        const tag = document.createElement('div');
        tag.className = 'assignment';
        tag.textContent = employee ? employee.name : 'Angajat';
        tag.draggable = true;
        tag.dataset.assignmentId = assignment.id;
        tag.dataset.employeeId = assignment.employee_id;
        tag.dataset.shiftId = assignment.shift_type_id;
        tag.dataset.date = assignment.date;

        tag.addEventListener('dragstart', () => {
          tag.classList.add('dragging');
        });
        tag.addEventListener('dragend', () => {
          tag.classList.remove('dragging');
        });

        shiftCard.appendChild(tag);
      });

      shiftCard.addEventListener('dragover', (event) => {
        event.preventDefault();
        shiftCard.style.backgroundColor = '#e2e8f0';
      });
      shiftCard.addEventListener('dragleave', () => {
        shiftCard.style.backgroundColor = '#f8fafc';
      });
      shiftCard.addEventListener('drop', async (event) => {
        event.preventDefault();
        shiftCard.style.backgroundColor = '#f8fafc';
        const dragged = document.querySelector('.assignment.dragging');
        if (!dragged) return;

        const assignmentId = dragged.dataset.assignmentId;
        const employeeId = Number(dragged.dataset.employeeId);
        const newDate = shiftCard.dataset.date;
        const newShiftId = Number(shiftCard.dataset.shiftId);

        await authFetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
        await authFetch('/api/assignments', {
          method: 'POST',
          body: JSON.stringify({ employee_id: employeeId, date: newDate, shift_type_id: newShiftId })
        });

        await refreshAssignments();
        await refreshReports();
      });

      dayContainer.appendChild(shiftCard);
    });

    calendar.appendChild(dayContainer);
  }
};

const renderReports = () => {
  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = '';
  state.reports.forEach((report) => {
    const tr = document.createElement('tr');
    const warning = state.warnings.some((item) => item.employee_id === report.employee_id);
    if (warning) tr.classList.add('warning-highlight');
    tr.innerHTML = `
      <td>${report.name}</td>
      <td>${report.workingFund}</td>
      <td>${report.totalHours}</td>
      <td>${report.weekendHours}</td>
      <td>${report.overtimeHours}</td>
    `;
    tbody.appendChild(tr);
  });

  const warningBox = document.getElementById('report-warnings');
  if (state.warnings.length) {
    warningBox.classList.remove('d-none');
    warningBox.innerHTML = state.warnings.map((item) => `• ${item.message}`).join('<br />');
  } else {
    warningBox.classList.add('d-none');
  }
};

const exportCsv = () => {
  const headers = ['Angajat', 'Norma ajustata', 'Ore lucrate', 'Ore weekend', 'Ore suplimentare'];
  const rows = state.reports.map((report) => [
    report.name,
    report.workingFund,
    report.totalHours,
    report.weekendHours,
    report.overtimeHours
  ]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map((value) => `"${value}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `raport_${state.year}_${String(state.month).padStart(2, '0')}.csv`;
  link.click();
};

const showGenerateWarnings = (warnings) => {
  const warningBox = document.getElementById('warnings');
  if (warnings.length) {
    warningBox.classList.remove('d-none');
    warningBox.innerHTML = warnings.map((warning) => `• ${warning.message}`).join('<br />');
  } else {
    warningBox.classList.add('d-none');
  }
};

const initialize = () => {
  document.getElementById('login-btn').addEventListener('click', login);

  document.getElementById('employee-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await authFetch('/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('employee-name').value,
        role: document.getElementById('employee-role').value,
        accepted_shift_types: document.getElementById('employee-shifts').value,
        vacation_days_left: Number(document.getElementById('employee-vacation').value),
        medical_days: Number(document.getElementById('employee-medical').value),
        personal_time_off: Number(document.getElementById('employee-personal').value)
      })
    });
    event.target.reset();
    await refreshAll();
  });

  document.getElementById('leave-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await authFetch('/api/leaves', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: Number(document.getElementById('leave-employee').value),
        date: document.getElementById('leave-date').value,
        type: document.getElementById('leave-type').value,
        hours: 8
      })
    });
    event.target.reset();
    await refreshAll();
  });

  document.getElementById('generate-btn').addEventListener('click', async () => {
    state.month = Number(document.getElementById('schedule-month').value);
    state.year = Number(document.getElementById('schedule-year').value);
    const requiredMap = state.shiftTypes.reduce((acc, shift) => {
      const input = document.querySelector(`input[data-id="${shift.id}"]`);
      acc[shift.id] = Number(input.value);
      return acc;
    }, {});

    const data = await authFetch('/api/schedule/generate', {
      method: 'POST',
      body: JSON.stringify({
        year: state.year,
        month: state.month,
        requiredMap
      })
    });

    showGenerateWarnings(data.warnings || []);
    await refreshAssignments();
    await refreshReports();
  });

  document.getElementById('export-btn').addEventListener('click', exportCsv);

  document.getElementById('schedule-month').value = state.month;
  document.getElementById('schedule-year').value = state.year;

  if (state.token) {
    document.getElementById('login-status').textContent = 'Autentificat.';
    refreshAll();
  }
};

initialize();
