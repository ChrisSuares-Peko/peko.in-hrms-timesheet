// PROTOTYPE-SETUP: Step 3 area C — leave, attendance, holidays, overtime, reimbursements, announcements, HR
// requests and organisation/compliance/HR settings, for both the Payroll admin pages and the ESS employee
// pages (answered as Sneha Iyer). Data comes from ../data/time-*.ts and ../data/settings-org.ts.

import type { IAnnouncement, IAnnouncementData, IEmployeeList } from '@domains/dashboard/Payroll/types/announcementTypes';
import type {
    DailyLogEntry,
    DailyLogEmployeeInfo,
    DailyLogPagination,
    DisputeEntry,
    EventData,
    HolidaysListEntry,
    LeaveRequestEntry,
    MonthlySummaryEntry,
    OvertimeEntry,
    ShiftScheduleApiEntry,
    ShiftSchedulePeriod,
    TodayAttendanceCounts,
    getHolidayResponse,
    holidayUpdateResponse,
} from '@domains/dashboard/Payroll/types/dashboardTypes';
import type {
    GetTakenLeaveResponse,
    LeaveData,
    LeavePolicy,
    LeaveResponse,
    availableLeaveResponse,
    exportLeaveDataResponse,
    leaveListingResponse,
    leaveResponse,
} from '@domains/dashboard/Payroll/types/leaveSection';
import type { LeaveProfileResponse } from '@domains/dashboard/Payroll/types/leaveSection/leaveprofiletypes';
import type {
    GetCompanyProfileType,
    GetPayrollSettingsType,
    LeaveComponent,
    LeaveComponentListResponse,
    existingOrganizationSettings,
} from '@domains/dashboard/Payroll/types/organizationSettings';
import type { gratuityCalculateResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/employeeSalaryProfile';
import type {
    overtimeAmountCalculateResponse,
    overtimeListingResponse,
} from '@domains/dashboard/Payroll/types/salaryProfileTypes/overtimeTypes';
import type {
    reimbursementAllListingResponse,
    reimbursementListingResponse,
} from '@domains/dashboard/Payroll/types/salaryProfileTypes/ReimbursementTypes';
import type { PaymentVirtualAccountBalanceData } from '@domains/dashboard/Payroll/types/virtualAccount';
import type { AnnouncementApiItem } from '@domains/employee/api/announcements';
import type { AttendanceApiRecord, AttendanceMetrics } from '@domains/employee/api/attendance';
import type { AvailableLeave, HolidayDoc, LeaveDoc, ReimbursementRecord } from '@domains/employee/types';
// PROTOTYPE-SETUP: ESS Service 1 — live Attendance & Timesheet store.
import { RuleError } from '@src/prototype/rules/attendance';

import { COMPANY } from '../data/company';
import { EMPLOYEES, ESS_EMPLOYEE, MockEmployee, PAYROLL_TOTALS, findEmployee } from '../data/employees';
import {
    ACTIVE_YEARS_EMPTY,
    COMPLIANCE_SETTINGS,
    ComplianceSettingsDocument,
    CORPORATE_BANKS,
    CORPORATE_DETAILS,
    HR_SETTINGS,
    ONBOARDING_DOCUMENTS,
    ORGANIZATION_SETTINGS,
    WORK_SCHEDULE,
    activeYears,
} from '../data/settings-org';
import {
    DISPUTES,
    MockAttendance,
    MockDispute,
    attendanceInRange,
    disputeFor,
    totalsOf,
} from '../data/time-attendance';
import {
    HOLIDAYS,
    MockHoliday,
    SHIFT_END_MIN,
    SHIFT_START_MIN,
    addDays,
    datesBetween,
    holidayOn,
    isWeekend,
    isWorkingDay,
    localDateTime,
    monthBounds,
    parseIsoDate,
    toLocalIsoDate,
    todayIso,
} from '../data/time-calendar';
import {
    LEAVES,
    LEAVE_TYPES,
    MockLeave,
    MockLeaveType,
    UNPAID_LEAVE,
    balanceOf,
    carryOverOf,
    findLeave,
    leaveTypeById,
    leaveTypesFor,
    leavesOf,
    managerEmailOf,
    takenOf,
} from '../data/time-leaves';
import { MockOvertime, OVERTIME, findOvertime, overtimeOf } from '../data/time-overtime';
import {
    ANNOUNCEMENTS,
    MockAnnouncement,
    MockReimbursement,
    REIMBURSEMENTS,
    findReimbursement,
    reimbursementsOf,
} from '../data/time-requests';
import { DataMode, ModeData, byMode, raw } from '../envelope';
import { fail } from '../errors';
import { essRequester } from '../requester';
import { MockRoute, route } from '../router';
import { checkIn as atsCheckIn, checkOut as atsCheckOut } from '../store/atsEss';
import {
    findLiveAttendance,
    legacyDay,
    liveAttendanceAll,
    liveAttendanceOf,
    liveMonthRecordsOf,
    liveTodaySummary,
} from '../store/atsLegacy';
import { getSettings } from '../store/atsStore';
import { updateSettings } from '../store/atsTeam';

// ---- shared helpers ---------------------------------------------------------------------------------------

const CORPORATE_USER = String(COMPANY.corporateUserId);

const positive = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const pageOf = <T>(list: T[], page: unknown, limit: unknown, defaultLimit = 10) => {
    const l = positive(limit, defaultLimit);
    const p = positive(page, 1);
    return list.slice((p - 1) * l, p * l);
};

const paginationOf = (total: number, page: unknown, limit: unknown, defaultLimit = 10): DailyLogPagination => {
    const l = positive(limit, defaultLimit);
    return { total, page: positive(page, 1), limit: l, totalPages: Math.ceil(total / l) };
};

/** Whole-envelope body for callers that read `pagination`/`period` next to `data`. */
const envelopeWith = (extra: Record<string, unknown>) =>
    raw({ status: true, message: 'OK', responseCode: '000', ...extra });

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim().toLowerCase());

const employeeMatches = (employee: MockEmployee, search: unknown) => {
    const term = text(search);
    return (
        !term ||
        [employee.fullName, employee.employeeId, employee.email, String(employee.id)].some(v =>
            v.toLowerCase().includes(term)
        )
    );
};

/** `employee` filter params carry the record id ('1004') or the code ('ACME-004'). */
const employeeFilter = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    return findEmployee(String(value)) ?? null;
};

/** month/year query values (month 1–12); anything else means "no filter". */
const monthYearFilter = (query: Record<string, any>) => {
    const month = Number(query.month);
    const year = Number(query.year);
    return {
        month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : undefined,
        year: Number.isInteger(year) && year > 2000 ? year : undefined,
    };
};

const inMonthYear = (isoDate: string, filter: { month?: number; year?: number }) => {
    const d = parseIsoDate(isoDate);
    return (!filter.year || d.getFullYear() === filter.year) && (!filter.month || d.getMonth() + 1 === filter.month);
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const to12h = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    return `${pad2(h % 12 || 12)}:${pad2(minutes % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
};
const SHIFT_LABEL = `${to12h(SHIFT_START_MIN)} - ${to12h(SHIFT_END_MIN)}`;

const timestamp = (isoDate: string, time = '09:00:00') => `${isoDate}T${time}.000Z`;
const nowIso = () => new Date().toISOString();

const employeeBrief = (e: MockEmployee) => ({
    _id: String(e.id),
    employeeId: e.employeeId,
    fullName: e.fullName,
    email: e.email,
    designation: e.designation,
});

const essEmployee = essRequester; // PROTOTYPE-SETUP: the persona making the ESS request

// ---- attendance mappers -------------------------------------------------------------------------------------

const toDailyLog = (a: MockAttendance): DailyLogEntry => {
    const employee: DailyLogEmployeeInfo = { ...employeeBrief(a.employee), profileImage: null, shift: SHIFT_LABEL };
    return {
        _id: a.id,
        employee,
        date: a.date,
        checkIn: a.checkIn ?? undefined,
        checkOut: a.checkOut ?? undefined,
        lateMinutes: a.lateMinutes,
        totalHours: a.totalHours > 0 ? a.totalHours : undefined,
        otHours: a.otHours,
        status: a.status,
        notes: a.notes,
    };
};

const toEssAttendance = (a: MockAttendance): AttendanceApiRecord => {
    const dispute = disputeFor(a.id);
    return {
        _id: a.id,
        date: a.date,
        checkIn: a.checkIn ? { time: a.checkIn, method: a.method } : undefined,
        checkOut: a.checkOut ? { time: a.checkOut } : undefined,
        status: a.status,
        lateMinutes: a.lateMinutes || undefined,
        totalHours: a.totalHours || undefined,
        notes: a.notes ?? undefined,
        disputeRaised: Boolean(dispute),
        disputeStatus: dispute?.status,
    };
};

const filterAttendance = (list: MockAttendance[], query: Record<string, any>) => {
    const from = toLocalIsoDate(query.from ?? query.date);
    const to = toLocalIsoDate(query.to ?? query.date);
    const status = text(query.status);
    return attendanceInRange(list, from, to).filter(a => !status || a.status === status);
};

const essMetrics = (records: MockAttendance[]): AttendanceMetrics => {
    const t = totalsOf(records);
    const onTime = t.present + t.halfDay;
    const notPresent = t.absent + t.onLeave;
    return {
        totalCheckIns: onTime + t.late,
        totalLateArrivals: t.late,
        totalLeaves: t.onLeave,
        onTime,
        late: t.late,
        notPresent,
        total: onTime + t.late + notPresent,
    };
};

const EMPTY_ESS_METRICS: AttendanceMetrics = {
    totalCheckIns: 0,
    totalLateArrivals: 0,
    totalLeaves: 0,
    onTime: 0,
    late: 0,
    notPresent: 0,
    total: 0,
};

// PROTOTYPE-SETUP: ESS Service 1 — reads the live Attendance & Timesheet store (store/atsLegacy.ts).
const monthlySummaryOf = (mode: DataMode, employee: MockEmployee, month: string): MonthlySummaryEntry => {
    const records = liveMonthRecordsOf(mode, employee, month);
    const t = totalsOf(records);
    const attended = t.present + t.late + t.halfDay * 0.5;
    return {
        employee: { ...employeeBrief(employee) },
        present: t.present + t.halfDay,
        late: t.late,
        absent: t.absent,
        onLeave: t.onLeave,
        halfDay: t.halfDay,
        totalHours: t.totalHours,
        totalLateMinutes: t.totalLateMinutes,
        otHours: t.otHours,
        attendancePercentage: t.workingDays ? Math.round((attended / t.workingDays) * 100) : 0,
    };
};

/** Monday–Sunday of the current week. */
const currentWeek = (): ShiftSchedulePeriod => {
    const today = todayIso();
    const dow = parseIsoDate(today).getDay();
    const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
    return { from: monday, to: addDays(monday, 6) };
};

const shiftScheduleOf = (mode: DataMode, employee: MockEmployee, period: ShiftSchedulePeriod): ShiftScheduleApiEntry => {
    const records = liveAttendanceOf(mode, employee); // PROTOTYPE-SETUP: ESS Service 1 — live store
    const scheduledStart = localDateTime('2000-01-01', SHIFT_START_MIN).slice(11, 16);
    const scheduledEnd = localDateTime('2000-01-01', SHIFT_END_MIN).slice(11, 16);
    const days = datesBetween(period.from, period.to).map(date => {
        const record = records.find(a => a.date === date);
        const isOff = !isWorkingDay(date);
        return {
            date,
            dayName: parseIsoDate(date).toLocaleDateString('en-GB', { weekday: 'long' }),
            isOff,
            scheduledStart: isOff ? '' : scheduledStart,
            scheduledEnd: isOff ? '' : scheduledEnd,
            checkIn: record?.checkIn ?? null,
            checkOut: record?.checkOut ?? null,
            totalHours: record?.totalHours ?? 0,
            lateMinutes: record?.lateMinutes ?? 0,
            status: record?.status ?? (isOff ? 'off' : ''),
        };
    });
    return {
        employee: { ...employeeBrief(employee), profileImage: null, department: employee.department },
        scheduledStart,
        scheduledEnd,
        breakTimeHrs: COMPANY.workWeek.breakTimeHrs,
        totalHours: COMPANY.workWeek.workingHours,
        days,
    };
};

// ---- dispute mapper ------------------------------------------------------------------------------------------

const toDisputeEntry = (d: MockDispute): DisputeEntry => ({
    _id: d.id,
    employee: employeeBrief(d.attendance.employee),
    attendance: {
        _id: d.attendance.id,
        date: d.attendance.date,
        status: d.attendance.status,
        checkIn: d.attendance.checkIn ? { time: d.attendance.checkIn, method: d.attendance.method } : null,
        checkOut: d.attendance.checkOut ? { time: d.attendance.checkOut, method: d.attendance.method } : null,
    },
    disputeType: d.disputeType,
    reason: d.reason,
    supportingDocs: null,
    status: d.status,
    remarks: d.remarks,
    createdAt: d.createdAt,
});

// ---- leave mappers ----------------------------------------------------------------------------------------

const leaveTypeRef = (l: MockLeave) => ({ _id: l.type.id, leaveType: l.type.name });

const toLeaveRequest = (l: MockLeave): LeaveRequestEntry => ({
    _id: l.id,
    employee: employeeBrief(l.employee),
    typeOfLeave: leaveTypeRef(l),
    start: l.start,
    end: l.end,
    leaveCount: l.leaveCount,
    halfDaySelection: l.halfDaySelection,
    reason: l.reason,
    status: l.status,
    createdAt: l.createdAt,
});

const toEssLeave = (l: MockLeave): LeaveDoc => ({
    id: l.id,
    start: l.start,
    end: l.end,
    typeOfLeave: { id: l.type.id, leaveType: l.type.name },
    halfDaySelection: l.halfDaySelection ?? undefined,
    leaveCount: l.leaveCount,
    status: l.status,
    notes: l.reason,
});

/**
 * `leave-application/all-leaves` feeds two tables with different field names (Leaves tab reads
 * `_id`/`typeOfLeave.leaveType`/`employee.personalInformation`, the older list reads `id`/`leaveType`/
 * `employee.fullName`), so each row carries both spellings.
 */
type AllLeavesRow = leaveResponse & {
    _id: string;
    typeOfLeave: { _id: string; leaveType: string };
    employee: leaveResponse['employee'] & {
        _id: string;
        personalInformation: { fullName: string };
        employeeInformation: { employeeId: string };
    };
};

const toAllLeavesRow = (l: MockLeave): AllLeavesRow => ({
    _id: l.id,
    id: l.id,
    corporateUser: CORPORATE_USER,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    employee: {
        _id: String(l.employee.id),
        id: String(l.employee.id),
        fullName: l.employee.fullName,
        personalInformation: { fullName: l.employee.fullName },
        employeeInformation: { employeeId: l.employee.employeeId },
    },
    start: l.start,
    end: l.end,
    leaveCount: l.leaveCount,
    leaveHours: l.leaveCount * COMPANY.workWeek.workingHours,
    leaveSupportingDocs: '',
    managerEmail: managerEmailOf(l.employee),
    halfDaySelection: l.halfDaySelection ?? '',
    leaveBalance: balanceOf(l.employee, l.type),
    leaveType: { _id: l.type.id, typeOfLeave: l.type.name },
    typeOfLeave: leaveTypeRef(l),
});

const toLeaveData = (l: MockLeave): LeaveData => ({
    corporateUser: COMPANY.corporateUserId,
    employee: String(l.employee.id),
    managerEmail: managerEmailOf(l.employee),
    start: l.start,
    end: l.end,
    leaveHours: l.leaveCount * COMPANY.workWeek.workingHours,
    leaveCount: l.leaveCount,
    halfDaySelection: l.halfDaySelection ?? '',
    leaveType: { _id: l.type.id, typeOfLeave: l.type.name },
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    id: l.id,
    leaveSupportingDocs: '',
    leaveBalance: balanceOf(l.employee, l.type),
});

const toLeaveComponent = (t: MockLeaveType): LeaveComponent => ({
    corporateUser: CORPORATE_USER,
    employee: null,
    leaveType: t.name,
    accrualType: t.accrualType,
    accrualRate: t.accrualRate,
    maximumAccrual: t.maximumAccrual,
    leaveBalanceCarryover: t.leaveBalanceCarryover,
    maximumNumberOfLeaves: t.maximumNumberOfLeaves,
    isGlobal: true,
    applicableGender: t.applicableGender,
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    id: t.id,
});

const toLeavePolicy = (employee: MockEmployee, t: MockLeaveType): LeavePolicy => ({
    carryOverBalance: carryOverOf(employee, t),
    corporateUser: CORPORATE_USER,
    employee: String(employee.id),
    leaveType: t.name,
    accrualType: t.accrualType,
    accrualRate: t.accrualRate || null,
    maximumAccrual: t.maximumAccrual || null,
    leaveBalanceCarryover: t.leaveBalanceCarryover,
    maximumNumberOfLeaves: t.maximumNumberOfLeaves,
    isGlobal: true,
    balanceLeaves: balanceOf(employee, t),
    globalComponentId: t.id,
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    id: t.id,
});

const leavePoliciesOf = (employee: MockEmployee, search?: unknown): LeaveResponse => {
    const term = text(search);
    const list = leaveTypesFor(employee)
        .filter(t => !term || t.name.toLowerCase().includes(term))
        .map(t => toLeavePolicy(employee, t));
    return { totalCount: list.length, leavePolicyData: list };
};

const EMPTY_LEAVE_POLICIES: LeaveResponse = { totalCount: 0, leavePolicyData: [] };

const availableLeavesOf = (employee: MockEmployee): AvailableLeave[] => [
    ...leaveTypesFor(employee).map(t => ({ value: t.id, label: t.name, count: balanceOf(employee, t) })),
    { value: UNPAID_LEAVE.id, label: UNPAID_LEAVE.name, count: 'Available' as const },
];

const adminAvailableLeaves = (employee: MockEmployee): availableLeaveResponse => ({
    availableLeaves: leaveTypesFor(employee).map(t => ({
        value: t.id,
        label: t.name,
        count: balanceOf(employee, t),
        balance: balanceOf(employee, t),
    })),
});

const leaveProfileOf = (employee: MockEmployee, query: Record<string, any>): LeaveProfileResponse => {
    const term = text(query.searchText);
    const rows = leavesOf(employee)
        .filter(l => l.status === 'approved' && (!term || l.type.name.toLowerCase().includes(term)))
        .sort((a, b) => b.start.localeCompare(a.start));
    return {
        count: rows.length,
        employeeDetails: { fullName: employee.fullName, designation: employee.designation, profileImage: null },
        rows: pageOf(rows, query.page, query.limit).map(l => ({
            _id: l.id,
            corporateUser: CORPORATE_USER,
            employee: String(employee.id),
            typeOfLeave: l.type.id,
            leaveTypeName: l.type.name,
            start: l.start,
            end: l.end,
            leaveCount: l.leaveCount,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            __v: 0,
            leaveBalance: { availableLeave: balanceOf(employee, l.type), carryOverBalance: carryOverOf(employee, l.type) },
        })),
    };
};

const leaveListingOf = (employee: MockEmployee, query: Record<string, any>): leaveListingResponse => {
    const filter = monthYearFilter(query);
    const rows = leavesOf(employee)
        .filter(l => l.status === 'approved' && inMonthYear(l.start, filter))
        .sort((a, b) => b.start.localeCompare(a.start));
    return { count: rows.length, rows: pageOf(rows, query.page, query.limit).map(toLeaveData) };
};

const takenLeavesOf = (employee: MockEmployee): GetTakenLeaveResponse => ({
    takenLeaves: Object.fromEntries(leaveTypesFor(employee).map(t => [t.name, takenOf(employee, t)])),
});

const echoLeaveDoc = (employee: MockEmployee, body: any, id: string): LeaveDoc => {
    const type = leaveTypeById(body?.typeOfLeave);
    return {
        id,
        start: toLocalIsoDate(body?.start) ?? todayIso(),
        end: toLocalIsoDate(body?.end) ?? todayIso(),
        typeOfLeave: type ? { id: type.id, leaveType: type.name } : { id: UNPAID_LEAVE.id, leaveType: UNPAID_LEAVE.name },
        halfDaySelection: body?.halfDaySelection,
        leaveCount: Number(body?.leaveCount ?? 1),
        status: 'applied',
        notes: body?.notes ?? `Applied by ${employee.fullName}`,
    };
};

// ---- holidays ----------------------------------------------------------------------------------------------

const holidayRange = (query: Record<string, any>) => {
    const start = toLocalIsoDate(query.start);
    const end = toLocalIsoDate(query.end);
    const term = text(query.search);
    const category = text(query.category);
    return HOLIDAYS.filter(
        h =>
            (!start || h.date >= start) &&
            (!end || h.date <= end) &&
            (!term || h.title.toLowerCase().includes(term)) &&
            (!category || h.category === category || ESS_CATEGORY_LABEL[h.category].toLowerCase() === category)
    );
};

const ESS_CATEGORY_LABEL: Record<MockHoliday['category'], string> = {
    public: 'Public Holiday',
    optional: 'Optional Holiday',
};

const toHolidaysListEntry = (h: MockHoliday): HolidaysListEntry => ({
    _id: h.id,
    title: h.title,
    isAllDay: true,
    start: h.date,
    end: h.date,
    category: h.category,
    sendPriorEmailDate: h.sendPriorEmailDate,
    isEmailSent: h.isEmailSent,
});

const toLegacyHoliday = (h: MockHoliday): getHolidayResponse['holidays'][number] => ({
    corporateUser: COMPANY.corporateUserId,
    title: h.title,
    isAllDay: true,
    start: h.date,
    end: h.date,
    category: h.category,
    sendPriorEmail: true,
    isEmailSent: h.isEmailSent,
    createdAt: timestamp(`${h.date.slice(0, 4)}-01-02`),
    updatedAt: timestamp(`${h.date.slice(0, 4)}-01-02`),
    id: h.id,
});

const echoHoliday = (body: any, id: string): EventData & holidayUpdateResponse => ({
    corporateUser: CORPORATE_USER,
    title: body?.title ?? 'Company holiday',
    isAllDay: body?.isAllDay ?? true,
    start: body?.start ?? todayIso(),
    end: body?.end ?? body?.start ?? todayIso(),
    category: body?.category ?? 'public',
    sendPriorEmail: Boolean(body?.sendPriorEmail ?? body?.sendPriorEmailDate),
    isEmailSent: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    id,
});

// ---- overtime ----------------------------------------------------------------------------------------------

const toOvertimeEntry = (o: MockOvertime): OvertimeEntry => ({
    id: o.id,
    corporateUser: CORPORATE_USER,
    employee: String(o.employee.id),
    employeeDetails: employeeBrief(o.employee),
    overTimeDate: o.date,
    extraHours: o.extraHours,
    overTimeRate: o.overTimeRate,
    overTimeAmount: o.overTimeAmount,
    totalWorkingHours: o.totalWorkingHours,
    hourlyRate: o.hourlyRate,
    paymentStatus: o.paymentStatus,
    status: o.status,
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
});

const toSalaryOvertime = (o: MockOvertime): overtimeListingResponse['overTimeData'][number] => ({
    corporateUser: CORPORATE_USER,
    employee: String(o.employee.id),
    overTimeDate: o.date,
    totalWorkingHours: o.totalWorkingHours,
    extraHours: o.extraHours,
    overTimeAmount: o.overTimeAmount,
    overTimeRate: o.overTimeRate,
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    id: o.id,
    hourlyRate: o.hourlyRate,
});

// ---- reimbursements ----------------------------------------------------------------------------------------

const reimbursementBase = (r: MockReimbursement) => ({
    corporateUser: CORPORATE_USER,
    expenseDate: r.expenseDate,
    managerEmail: managerEmailOf(r.employee),
    supportingDocs: r.supportingDocs,
    expenseDetails: r.expenseDetails,
    totalPay: r.totalPay,
    transferMethod: r.transferMethod,
    paymentStatus: r.paymentStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    id: r.id,
});

const toAdminReimbursement = (r: MockReimbursement): reimbursementAllListingResponse['rows'][number] => ({
    ...reimbursementBase(r),
    employee: {
        employeeInformation: { employeeId: r.employee.employeeId },
        personalInformation: { fullName: r.employee.fullName },
        id: String(r.employee.id),
    },
});

const toEmployeeReimbursement = (r: MockReimbursement): reimbursementListingResponse['rows'][number] => ({
    ...reimbursementBase(r),
    employee: String(r.employee.id),
});

const toEssReimbursement = (r: MockReimbursement): ReimbursementRecord => ({
    id: r.id,
    expenseDate: r.expenseDate,
    totalPay: r.totalPay,
    expenseDetails: r.expenseDetails,
    transferMethod: r.transferMethod,
    status: r.status,
    paymentStatus: r.paymentStatus,
    supportingDocs: r.supportingDocs,
});

const reimbursementMatches = (r: MockReimbursement, search: unknown) => {
    const term = text(search);
    return (
        !term ||
        employeeMatches(r.employee, term) ||
        [r.expenseDetails, String(r.totalPay), r.paymentStatus, r.category].some(v => v.toLowerCase().includes(term))
    );
};

// ---- announcements -----------------------------------------------------------------------------------------

const toAdminAnnouncement = (a: MockAnnouncement): IAnnouncement => ({
    corporateUser: CORPORATE_USER,
    subject: a.subject,
    details: a.details,
    status: a.status,
    excludedEmployees: a.excludedEmployeeCodes
        .map(code => findEmployee(code))
        .filter((e): e is MockEmployee => Boolean(e))
        .map(e => ({ personalInformation: { fullName: e.fullName, email: e.email }, id: String(e.id) })),
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
    id: a.id,
});

const toEssAnnouncement = (a: MockAnnouncement): AnnouncementApiItem => ({
    id: a.id,
    subject: a.subject,
    details: a.details,
    createdAt: a.createdAt,
});

// ---- settings datasets (both modes) ------------------------------------------------------------------------

const organizationSettings: ModeData<existingOrganizationSettings> = {
    dummy: ORGANIZATION_SETTINGS,
    empty: {
        companyProfile: { companyName: COMPANY.name, companyAddressLine1: '', companyAddressLine2: '', city: '', pinCode: '', state: '', contactNumber: '', emailAddress: '', industry: '', companyLogo: '' },
        organizationTaxDetails: { PAN: '', TAN: '', TDSCode: '', taxPaymentFrequency: '' },
        payrollSettings: { selectWorkingDays: [], calculateSalaryBasedOn: 'ACTUALDAYS', payrollFrom: '', payEmployeeOn: '' },
        bankDetails: { bankName: '', accountNumber: '', accountHolderName: '', ifscCode: '', branchAddress: '' },
    },
};

const companyProfile = (mode: Parameters<typeof byMode>[0]): GetCompanyProfileType => {
    const s = byMode(mode, organizationSettings);
    return { companyProfile: s.companyProfile, organizationTaxDetails: s.organizationTaxDetails };
};

const payrollCycle = (mode: Parameters<typeof byMode>[0]): GetPayrollSettingsType => ({
    payrollSettings: byMode(mode, organizationSettings).payrollSettings,
});

const complianceSettings: ModeData<ComplianceSettingsDocument> = {
    dummy: COMPLIANCE_SETTINGS,
    empty: {
        _id: COMPLIANCE_SETTINGS._id,
        epf: { epfNumber: '', pfWagesPolicy: 'CAPPED_15000', enableProRatedPfWage: false, considerSalaryComponents: false },
        esi: { esiNumber: '', deductionCycle: 'Monthly', employeeContribution: 0, employerContribution: 0 },
        professionalTax: { ptNumber: '', deductionCycle: 'Monthly', incomeSlabs: [] },
        laborWelfareFund: { workState: '' },
        tds: { tan: '', bsr: { bsrCode: '' }, authorizedSignatoryDetails: { name: '' } },
    },
};

const leaveComponents = (query: Record<string, any>): LeaveComponentListResponse => {
    const term = text(query.searchText);
    const list = LEAVE_TYPES.filter(t => !term || t.name.toLowerCase().includes(term)).map(toLeaveComponent);
    return { totalCount: list.length, leaveComponentData: pageOf(list, query.page, query.limit) };
};

const PAYROLL_TEMPLATES = {
    categoryDataWithDocuments: [
        { name: 'Offer & Appointment', docs: ['Offer Letter', 'Appointment Letter', 'Probation Confirmation Letter'] },
        { name: 'HR Policies', docs: ['Leave Policy', 'Hybrid Work Policy', 'Code of Conduct', 'POSH Policy'] },
        { name: 'Payroll & Statutory', docs: ['Salary Revision Letter', 'Form 12BB (Investment Declaration)', 'PF Nomination (Form 2)'] },
        { name: 'Exit Documents', docs: ['Resignation Acceptance Letter', 'Relieving Letter', 'Experience Letter', 'Full & Final Settlement'] },
    ].map((category, ci) => ({
        id: ci + 1,
        categoryName: category.name,
        categoryImage: '',
        documents: category.docs.map((name, di) => ({
            id: (ci + 1) * 100 + di + 1,
            name,
            document: `https://files.${COMPANY.emailDomain}/templates/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`,
        })),
    })),
};

const VIRTUAL_ACCOUNT: PaymentVirtualAccountBalanceData = {
    virtualAccountNumber: '462515001045871',
    accountName: COMPANY.name,
    ifsc: 'YESB0CMSNOC',
    // Comfortably funds one month's net payroll (Process Salary is gated on a VA number + balance).
    balance: Math.max(2750000, Math.round((PAYROLL_TOTALS.netPay * 1.5) / 1000) * 1000),
    providerData: {},
};

const yearsBetween = (from: string, to: string) =>
    Math.max(0, (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / (365.25 * 86400000));

// ---- routes ------------------------------------------------------------------------------------------------

const P = ':type/:uid/payroll';

const attendanceRoutes: MockRoute[] = [
    route('GET', `${P}/attendance-record/today-summary`, ({ mode }) =>
        byMode<TodayAttendanceCounts>(mode, { dummy: liveTodaySummary(mode), empty: { present: 0, late: 0, absent: 0, onLeave: 0 } })
    ),
    route('GET', `${P}/attendance-record/daily-log`, ({ mode, query }) => {
        const employee = employeeFilter(query.employee);
        const list =
            mode === 'empty' || employee === null
                ? []
                : filterAttendance(employee ? liveAttendanceOf(mode, employee) : liveAttendanceAll(mode), query).filter(a =>
                      employeeMatches(a.employee, query.search)
                  );
        return envelopeWith({
            data: pageOf(list, query.page, query.limit).map(toDailyLog),
            pagination: paginationOf(list.length, query.page, query.limit),
        });
    }),
    route('GET', `${P}/attendance-record/monthly-summary`, ({ mode, query }) => {
        const month = /^\d{4}-\d{2}$/.test(String(query.month ?? '')) ? String(query.month) : todayIso().slice(0, 7);
        const employee = employeeFilter(query.employee);
        const { last } = monthBounds(month);
        const people =
            mode === 'empty' || employee === null
                ? []
                : (employee ? [employee] : EMPLOYEES).filter(
                      e => e.dateOfJoin <= last && employeeMatches(e, query.search)
                  );
        return envelopeWith({
            data: pageOf(people, query.page, query.limit).map(e => monthlySummaryOf(mode, e, month)),
            pagination: paginationOf(people.length, query.page, query.limit),
        });
    }),
    route('GET', `${P}/attendance-record/shift-schedule`, ({ mode, query }) => {
        const week = currentWeek();
        const period: ShiftSchedulePeriod = {
            from: toLocalIsoDate(query.from) ?? week.from,
            to: toLocalIsoDate(query.to) ?? week.to,
        };
        const employee = employeeFilter(query.employee);
        const people =
            mode === 'empty' || employee === null
                ? []
                : (employee ? [employee] : EMPLOYEES).filter(
                      e => e.dateOfJoin <= period.to && employeeMatches(e, query.search)
                  );
        return envelopeWith({
            period,
            data: pageOf(people, query.page, query.limit).map(e => shiftScheduleOf(mode, e, period)),
            pagination: paginationOf(people.length, query.page, query.limit),
        });
    }),
    route('POST', `${P}/attendance-record/mark`, ({ body }) => ({
        _id: `att-manual-${Date.now()}`,
        ...body,
        method: 'manual',
        createdAt: nowIso(),
    })),
    route('PUT', `${P}/attendance-record/:attendanceId`, ({ mode, params, body }) => ({
        ...(findLiveAttendance(mode, params.attendanceId) ? toDailyLog(findLiveAttendance(mode, params.attendanceId)!) : {}),
        ...body,
        _id: params.attendanceId,
        updatedAt: nowIso(),
    })),
    // Attendance disputes (late / absent) raised from ESS.
    route('GET', `${P}/disputes`, ({ mode, query }) => {
        const employee = employeeFilter(query.employee);
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const list =
            mode === 'empty' || employee === null
                ? []
                : DISPUTES.filter(
                      d =>
                          (!employee || d.attendance.employee.id === employee.id) &&
                          (!from || d.attendance.date >= from) &&
                          (!to || d.attendance.date <= to) &&
                          (!query.status || d.status === query.status) &&
                          (!query.reason || d.disputeType === query.reason) &&
                          employeeMatches(d.attendance.employee, query.search)
                  );
        const limit = positive(query.limit, 10);
        return {
            records: pageOf(list, query.page, limit).map(toDisputeEntry),
            total: list.length,
            page: positive(query.page, 1),
            limit,
        };
    }),
    route('PUT', `${P}/disputes/:disputeId/review`, ({ params, body }) => {
        const dispute = DISPUTES.find(d => d.id === params.disputeId);
        return {
            ...(dispute ? toDisputeEntry(dispute) : { _id: params.disputeId }),
            status: body?.status ?? 'approved',
            remarks: body?.remarks ?? null,
        };
    }),
];

const holidayRoutes: MockRoute[] = [
    route('GET', `${P}/holidays/list`, ({ mode, query }) => {
        const list = mode === 'empty' ? [] : holidayRange(query);
        return envelopeWith({
            data: { holidays: pageOf(list, query.page, query.limit).map(toHolidaysListEntry) },
            pagination: paginationOf(list.length, query.page, query.limit),
        });
    }),
    route('GET', `${P}/holiday`, ({ mode, query }) =>
        byMode<getHolidayResponse>(mode, { dummy: { holidays: holidayRange(query).map(toLegacyHoliday) }, empty: { holidays: [] } })
    ),
    route('POST', `${P}/holiday/sendEmail/:holidayId`, ({ params }) => ({ holidayId: params.holidayId, isEmailSent: true })),
    route('POST', `${P}/holiday`, ({ body }) => echoHoliday(body, `hol-new-${Date.now()}`)),
    route('PUT', `${P}/holiday/:holidayId`, ({ params, body }) => echoHoliday(body, params.holidayId ?? '')),
    route('DELETE', `${P}/holiday/:holidayId`, ({ params }) => {
        const holiday = HOLIDAYS.find(h => h.id === params.holidayId);
        return holiday ? toLegacyHoliday(holiday) : { id: params.holidayId };
    }),
];

const leaveRoutes: MockRoute[] = [
    // Literal sub-paths first: `leave-application/:eId` would otherwise swallow them.
    route('GET', `${P}/leave-application/all-leaves`, ({ mode, query }) => {
        const filter = monthYearFilter(query);
        const list =
            mode === 'empty'
                ? []
                : LEAVES.filter(
                      l => l.status === 'approved' && inMonthYear(l.start, filter) && employeeMatches(l.employee, query.searchText)
                  ).sort((a, b) => b.start.localeCompare(a.start));
        return { leaveData: pageOf(list, query.page, query.limit).map(toAllLeavesRow), totalCount: list.length };
    }),
    route('GET', `${P}/leave-application/leave-requests`, ({ mode, query }) => {
        const employee = employeeFilter(query.employee);
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const list =
            mode === 'empty' || employee === null
                ? []
                : LEAVES.filter(
                      l =>
                          (!employee || l.employee.id === employee.id) &&
                          (!from || l.end >= from) &&
                          (!to || l.start <= to) &&
                          (!query.status || l.status === query.status) &&
                          employeeMatches(l.employee, query.search)
                  );
        return envelopeWith({
            data: pageOf(list, query.page, query.limit).map(toLeaveRequest),
            pagination: paginationOf(list.length, query.page, query.limit),
        });
    }),
    route('GET', `${P}/leave-application/available-leaves/:id`, ({ mode, params }) => {
        const employee = findEmployee(params.id);
        return byMode<availableLeaveResponse>(mode, {
            dummy: employee ? adminAvailableLeaves(employee) : { availableLeaves: [] },
            empty: { availableLeaves: [] },
        });
    }),
    route('GET', `${P}/leave-application/leaves-taken/:eId`, ({ mode, params }) => {
        const employee = findEmployee(params.eId);
        return byMode<GetTakenLeaveResponse>(mode, {
            dummy: employee ? takenLeavesOf(employee) : { takenLeaves: {} },
            empty: { takenLeaves: {} },
        });
    }),
    route('GET', `${P}/leave-application/leaves/export`, (): exportLeaveDataResponse => ({
        buffer: { type: 'Buffer', data: [] },
    })),
    // Same URL, two callers: the salary-profile leave list sends year/month, the leave summary page doesn't.
    route('GET', `${P}/leave-application/:eId`, ({ mode, params, query }) => {
        const employee = findEmployee(params.eId);
        const wantsListing = (query.year !== undefined && query.year !== '') || (query.month !== undefined && query.month !== '');
        if (wantsListing) {
            return byMode<leaveListingResponse>(mode, {
                dummy: employee ? leaveListingOf(employee, query) : { count: 0, rows: [] },
                empty: { count: 0, rows: [] },
            });
        }
        const emptyProfile: LeaveProfileResponse = {
            count: 0,
            employeeDetails: { fullName: employee?.fullName ?? '', designation: employee?.designation ?? '', profileImage: null },
            rows: [],
        };
        return byMode<LeaveProfileResponse>(mode, {
            dummy: employee ? leaveProfileOf(employee, query) : emptyProfile,
            empty: emptyProfile,
        });
    }),
    route('PATCH', `${P}/leave-application/:leaveId/status`, ({ params, body }) => {
        const leave = findLeave(params.leaveId);
        return {
            ...(leave ? toLeaveRequest(leave) : { _id: params.leaveId }),
            status: body?.status ?? 'approved',
            notes: body?.notes ?? null,
        };
    }),
    route('POST', `${P}/leave-application/:employeeId`, ({ params, body }) => {
        const employee = findEmployee(params.employeeId) ?? ESS_EMPLOYEE;
        const type = leaveTypeById(body?.typeOfLeave);
        return {
            ...body,
            id: `lv-new-${Date.now()}`,
            employee: String(employee.id),
            leaveType: { _id: type?.id ?? UNPAID_LEAVE.id, typeOfLeave: type?.name ?? UNPAID_LEAVE.name },
            leaveBalance: type ? Math.max(0, balanceOf(employee, type) - Number(body?.leaveCount ?? 0)) : 0,
            createdAt: nowIso(),
        };
    }),
    route('PUT', `${P}/leave-application/:leaveId`, ({ params, body }) => ({
        ...(findLeave(params.leaveId) ? toLeaveData(findLeave(params.leaveId)!) : {}),
        ...body,
        id: params.leaveId,
        updatedAt: nowIso(),
    })),
    route('DELETE', `${P}/leave-application/:rId`, ({ params }) => ({ id: params.rId, deleted: true })),

    // Leave policies (Organisation settings → Leave, and per employee).
    route('GET', `${P}/leave-component`, ({ mode, query }) =>
        byMode<LeaveComponentListResponse>(mode, { dummy: leaveComponents(query), empty: { totalCount: 0, leaveComponentData: [] } })
    ),
    route('GET', `${P}/leave-component/all/:employeeId`, ({ mode, params, query }) => {
        const employee = findEmployee(params.employeeId);
        return byMode<LeaveResponse>(mode, {
            dummy: employee ? leavePoliciesOf(employee, query.searchText) : EMPTY_LEAVE_POLICIES,
            empty: EMPTY_LEAVE_POLICIES,
        });
    }),
    route('GET', `${P}/leave-component/:employeeId/leave-policies`, ({ mode, params }) => {
        const employee = findEmployee(params.employeeId);
        return byMode<LeaveResponse>(mode, {
            dummy: employee ? leavePoliciesOf(employee) : EMPTY_LEAVE_POLICIES,
            empty: EMPTY_LEAVE_POLICIES,
        });
    }),
    route('GET', `${P}/leave-component/:employeeId`, ({ mode, params, query }) => {
        const employee = findEmployee(params.employeeId);
        const all = employee ? leavePoliciesOf(employee, query.searchText) : EMPTY_LEAVE_POLICIES;
        return byMode<LeaveResponse>(mode, {
            dummy: { totalCount: all.totalCount, leavePolicyData: pageOf(all.leavePolicyData, query.page, query.limit) },
            empty: EMPTY_LEAVE_POLICIES,
        });
    }),
    route('POST', `${P}/leave-component`, ({ body }) => ({
        ...toLeaveComponent(LEAVE_TYPES[0]),
        ...body,
        id: `lt-new-${Date.now()}`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    })),
    route('POST', `${P}/leave-component/:employeeId`, ({ params, body }) => ({
        ...body,
        id: `lt-emp-${Date.now()}`,
        employee: params.employeeId,
        isGlobal: false,
        createdAt: nowIso(),
    })),
    route('PUT', `${P}/leave-component/:id/:employeeId`, ({ params, body }) => ({
        ...(leaveTypeById(params.id) ? toLeaveComponent(leaveTypeById(params.id)!) : {}),
        ...body,
        id: params.id,
        updatedAt: nowIso(),
    })),
    route('DELETE', `${P}/leave-component/:id`, ({ params }) => ({ id: params.id, deleted: true })),
];

const overtimeRoutes: MockRoute[] = [
    route('GET', `${P}/overtime`, ({ mode, query }) => {
        const list = mode === 'empty' ? [] : OVERTIME.filter(o => !query.status || o.status === query.status);
        return { totalCount: list.length, overTimeData: pageOf(list, query.page, query.limit).map(toOvertimeEntry) };
    }),
    route('GET', `${P}/overtime/overtime-details/:overtimeId`, ({ params }) => {
        const overtime = findOvertime(params.overtimeId);
        return overtime ? toOvertimeEntry(overtime) : {};
    }),
    route('GET', `${P}/overtime/:eId`, ({ mode, params, query }) => {
        const employee = findEmployee(params.eId);
        const filter = monthYearFilter(query);
        const list = employee
            ? overtimeOf(employee).filter(o => o.status === 'approved' && inMonthYear(o.date, filter))
            : [];
        return byMode<overtimeListingResponse>(mode, {
            dummy: { totalCount: list.length, overTimeData: pageOf(list, query.page, query.limit).map(toSalaryOvertime) },
            empty: { totalCount: 0, overTimeData: [] },
        });
    }),
    route('POST', `${P}/overtime/overtime-amount/:eId`, ({ params, body }): overtimeAmountCalculateResponse => {
        const employee = findEmployee(params.eId) ?? ESS_EMPLOYEE;
        const hourlyRate = Math.round(employee.salary.grossEarnings / 30 / 8);
        const extraHours = Number(body?.extraHours ?? 0);
        const rate = Number(body?.overtimeRate ?? 1.5);
        return {
            overtimeAmount: Math.round(extraHours * hourlyRate * rate),
            totalWorkingHours: COMPANY.workWeek.workingHours + extraHours,
            hourlyRate,
        };
    }),
    route('POST', `${P}/overtime/:employeeId`, ({ params, body }) => ({
        ...body,
        id: `ot-new-${Date.now()}`,
        corporateUser: CORPORATE_USER,
        employee: params.employeeId,
        paymentStatus: 'UNPAID',
        createdAt: nowIso(),
        updatedAt: nowIso(),
    })),
    route('PATCH', `${P}/overtime/:overtimeId/status`, ({ params, body }) => {
        const overtime = findOvertime(params.overtimeId);
        return { ...(overtime ? toOvertimeEntry(overtime) : { id: params.overtimeId }), status: body?.status ?? 'approved' };
    }),
    route('PUT', `${P}/overtime/:overtimeId`, ({ params, body }) => ({
        ...(findOvertime(params.overtimeId) ? toOvertimeEntry(findOvertime(params.overtimeId)!) : {}),
        ...body,
        id: params.overtimeId,
        updatedAt: nowIso(),
    })),
    route('DELETE', `${P}/overtime/:rId`, ({ params }) => ({ id: params.rId, deleted: true })),
];

const reimbursementRoutes: MockRoute[] = [
    route('GET', `${P}/reimbursement`, ({ mode, query }) => {
        const filter = monthYearFilter(query);
        const list = REIMBURSEMENTS.filter(r => inMonthYear(r.expenseDate, filter) && reimbursementMatches(r, query.searchText));
        return byMode<reimbursementAllListingResponse>(mode, {
            dummy: { count: list.length, rows: pageOf(list, query.page, query.limit).map(toAdminReimbursement) },
            empty: { count: 0, rows: [] },
        });
    }),
    route('GET', `${P}/reimbursement/export/:eId`, () => ({ buffer: { type: 'Buffer', data: [] } })),
    route('GET', `${P}/reimbursement/:reimbursementId/download`, ({ params }) =>
        raw(new Blob([`Receipt ${params.reimbursementId} – ${COMPANY.name}`], { type: 'application/pdf' }))
    ),
    route('GET', `${P}/reimbursement/:eId`, ({ mode, params, query }) => {
        const employee = findEmployee(params.eId);
        const filter = monthYearFilter(query);
        const list = employee
            ? reimbursementsOf(employee).filter(r => inMonthYear(r.expenseDate, filter) && reimbursementMatches(r, query.searchText))
            : [];
        return byMode<reimbursementListingResponse>(mode, {
            dummy: { count: list.length, rows: pageOf(list, query.page, query.limit).map(toEmployeeReimbursement) },
            empty: { count: 0, rows: [] },
        });
    }),
    route('POST', `${P}/reimbursement/:employeeId`, ({ params, body }) => ({
        ...body,
        supportingDocs: typeof body?.supportingDocs === 'string' ? body.supportingDocs : '',
        id: `rb-new-${Date.now()}`,
        corporateUser: CORPORATE_USER,
        employee: params.employeeId,
        transferMethod: 'With Salary',
        paymentStatus: 'UNPAID',
        createdAt: nowIso(),
        updatedAt: nowIso(),
    })),
    route('PUT', `${P}/reimbursement/:reimbursementId`, ({ params, body }) => {
        const existing = findReimbursement(params.reimbursementId);
        return {
            ...(existing ? toEmployeeReimbursement(existing) : {}),
            ...body,
            supportingDocs: existing?.supportingDocs ?? '',
            id: params.reimbursementId,
            updatedAt: nowIso(),
        };
    }),
    route('DELETE', `${P}/reimbursement/:rId`, ({ params }) => ({ id: params.rId, deleted: true })),
];

const announcementRoutes: MockRoute[] = [
    route('GET', `${P}/announcement/employees`, ({ mode }) =>
        byMode<IEmployeeList>(mode, {
            dummy: {
                employees: EMPLOYEES.map(e => ({ personalInformation: { fullName: e.fullName }, id: String(e.id) })) as IEmployeeList['employees'],
            },
            empty: { employees: [] as unknown as IEmployeeList['employees'] },
        })
    ),
    route('GET', `${P}/announcement`, ({ mode, query }) => {
        const filter = monthYearFilter(query);
        const term = text(query.search);
        const list = ANNOUNCEMENTS.filter(
            a =>
                inMonthYear(a.createdAt.slice(0, 10), filter) &&
                (!term || `${a.subject} ${a.details}`.toLowerCase().includes(term))
        );
        return byMode<IAnnouncementData>(mode, {
            dummy: { count: list.length, rows: pageOf(list, query.page, query.limit).map(toAdminAnnouncement) },
            empty: { count: 0, rows: [] },
        });
    }),
    route('POST', `${P}/announcement`, ({ body }) => ({
        ...toAdminAnnouncement({
            id: `ann-new-${Date.now()}`,
            subject: body?.subject ?? '',
            details: body?.details ?? '',
            status: 'PENDING',
            createdAt: nowIso(),
            excludedEmployeeCodes: [],
        }),
        excludedEmployees: [],
    })),
    route('DELETE', `${P}/announcement/:announcementId`, ({ params }) => ({ id: params.announcementId, deleted: true })),
];

const settingsRoutes: MockRoute[] = [
    route('GET', `${P}/organization-settings`, ({ mode }) => byMode(mode, organizationSettings)),
    route('GET', `${P}/organization-settings/companyProfile`, ({ mode }) => companyProfile(mode)),
    route('GET', `${P}/organization-settings/payrollCycle`, ({ mode }) => payrollCycle(mode)),
    route('GET', `${P}/organization-settings/corporate-details`, () => CORPORATE_DETAILS),
    route('GET', `${P}/organization-settings/active-years`, ({ mode }) =>
        byMode(mode, { dummy: activeYears(), empty: ACTIVE_YEARS_EMPTY })
    ),
    route('POST', `${P}/organization-settings/company-profile`, ({ body }) => ({ ...companyProfile('dummy'), ...body })),
    route('POST', `${P}/organization-settings/payroll-settings`, ({ body }) => ({
        ...ORGANIZATION_SETTINGS.payrollSettings,
        ...body,
    })),
    route('POST', `${P}/organization-settings/bank-details`, ({ body }) => ({ ...ORGANIZATION_SETTINGS.bankDetails, ...body })),
    route('GET', ':type/:uid/others/profile/bank', ({ mode }) =>
        byMode(mode, { dummy: CORPORATE_BANKS, empty: { bankDetails: [] } })
    ),

    route('GET', `${P}/compliance-settings`, ({ mode }) => byMode(mode, complianceSettings)),
    route('PUT', `${P}/compliance-settings`, ({ body }) => ({
        ...COMPLIANCE_SETTINGS,
        epf: { ...COMPLIANCE_SETTINGS.epf, ...body?.epf },
        esi: { ...COMPLIANCE_SETTINGS.esi, ...body?.esi },
        professionalTax: { ...COMPLIANCE_SETTINGS.professionalTax, ...body?.professionalTax },
        laborWelfareFund: { ...COMPLIANCE_SETTINGS.laborWelfareFund, ...body?.laborWelfareFund },
    })),
    // Save calls read the whole envelope (`data: res`), so echo the saved section as `data`.
    route('POST', `${P}/compliance-settings/epf-settings`, ({ body }) => ({ ...COMPLIANCE_SETTINGS.epf, ...body })),
    route('POST', `${P}/compliance-settings/esi-settings`, ({ body }) => ({ ...COMPLIANCE_SETTINGS.esi, ...body })),
    route('POST', `${P}/compliance-settings/tax-settings`, ({ body }) => ({ ...COMPLIANCE_SETTINGS.professionalTax, ...body })),
    route('POST', `${P}/compliance-settings/welfare-settings`, ({ body }) => ({ ...COMPLIANCE_SETTINGS.laborWelfareFund, ...body })),
    route('POST', `${P}/compliance-settings/tds`, ({ body }) => ({ ...COMPLIANCE_SETTINGS.tds, ...body })),

    route('GET', `${P}/hr-settings/onboarding-documents`, ({ mode }) =>
        byMode(mode, { dummy: { onboardingDocuments: ONBOARDING_DOCUMENTS }, empty: { onboardingDocuments: [] } })
    ),
    route('POST', `${P}/hr-settings/onboarding-documents`, ({ body }) => ({
        onboardingDocuments: ONBOARDING_DOCUMENTS.map(doc => ({
            ...doc,
            required:
                (body?.onboardingDocuments as { key: string; required: boolean }[] | undefined)?.find(d => d.key === doc.key)
                    ?.required ?? doc.required,
        })),
    })),
    // PROTOTYPE-SETUP: ESS Service 1 — grace period and default shift are the Attendance & Timesheet settings.
    route('GET', `${P}/hr-settings/grace-period`, ({ mode }) => ({ gracePeriodMinutes: getSettings(mode).graceMinutes })),
    route('POST', `${P}/hr-settings/grace-period`, ({ mode, body }) => ({
        gracePeriodMinutes: updateSettings(mode, { graceMinutes: Number(body?.gracePeriodMinutes) }).graceMinutes,
    })),
    route('GET', `${P}/hr-settings/check-in-out`, ({ mode }) =>
        byMode(mode, { dummy: { checkInOutEnabled: HR_SETTINGS.checkInOutEnabled }, empty: { checkInOutEnabled: false } })
    ),
    route('POST', `${P}/hr-settings/check-in-out`, ({ body }) => ({ checkInOutEnabled: Boolean(body?.checkInOutEnabled) })),
    route('GET', `${P}/hr-settings/work-schedule`, ({ mode }) => ({
        defaultWorkSchedule: { ...WORK_SCHEDULE, checkInTime: getSettings(mode).shift.start, checkOutTime: getSettings(mode).shift.end },
    })),
    route('POST', `${P}/hr-settings/work-schedule`, ({ mode, body }) => {
        const { shift } = updateSettings(mode, {
            shift: { start: body?.checkInTime ?? getSettings(mode).shift.start, end: body?.checkOutTime ?? getSettings(mode).shift.end },
        });
        return { defaultWorkSchedule: { ...WORK_SCHEDULE, checkInTime: shift.start, checkOutTime: shift.end } };
    }),
];

const hrRequestRoutes: MockRoute[] = [
];

const miscRoutes: MockRoute[] = [
    route('GET', `${P}/payrollDocs/templates`, ({ mode }) =>
        byMode(mode, { dummy: PAYROLL_TEMPLATES, empty: { categoryDataWithDocuments: [] } })
    ),
    route('GET', ':type/:uid/payment/payment-links/virtual-account/balance', ({ mode }) =>
        byMode<PaymentVirtualAccountBalanceData>(mode, {
            dummy: VIRTUAL_ACCOUNT,
            empty: { ...VIRTUAL_ACCOUNT, balance: 0 },
        })
    ),
    route('POST', 'corporate/:corporateId/payroll/one-time-payment', ({ body }) =>
        raw({
            status: true,
            responseCode: '000',
            message: `One-time payment of ₹${Number(body?.amount ?? 0).toLocaleString('en-IN')} initiated`,
            data: { ...body, referenceId: `OTP${Date.now()}` },
        })
    ),
    route('POST', `${P}/gratuity`, ({ body }): gratuityCalculateResponse => {
        const from = toLocalIsoDate(body?.fromDate) ?? todayIso();
        const to = toLocalIsoDate(body?.toDate) ?? todayIso();
        const years = yearsBetween(from, to);
        // Payment of Gratuity Act: 15 days' basic per completed year (26 working days a month).
        const gratuity = Math.round((Number(body?.basicSalary ?? 0) * 15 * Math.floor(years)) / 26);
        return { gratuity: String(gratuity), yearsOfExperience: Math.round(years * 10) / 10 };
    }),
];

// ---- ESS (employee self-service) — answered for Sneha Iyer ---------------------------------------------------

const essRoutes: MockRoute[] = [
    route('GET', `${P}/announcements`, ({ mode, query }) => {
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const list = ANNOUNCEMENTS.filter(
            a => (!from || a.createdAt.slice(0, 10) >= from) && (!to || a.createdAt.slice(0, 10) <= to)
        );
        return byMode<{ announcements: AnnouncementApiItem[]; total: number }>(mode, {
            dummy: { announcements: pageOf(list, query.page, query.limit, 20).map(toEssAnnouncement), total: list.length },
            empty: { announcements: [], total: 0 },
        });
    }),
    route('GET', `${P}/attendance/check-in-status`, () => ({ checkInOutEnabled: HR_SETTINGS.checkInOutEnabled })),
    route('GET', `${P}/attendance/check-in-available`, () => {
        const today = todayIso();
        if (isWorkingDay(today)) return { isCheckInAvailable: true, reason: null };
        const holiday = holidayOn(today);
        let reason: string | null = null;
        if (holiday) reason = `Office closed today – ${holiday.title}`;
        else if (isWeekend(today)) reason = 'Today is a weekly off';
        return { isCheckInAvailable: false, reason };
    }),
    // PROTOTYPE-SETUP: ESS Service 1 — the original ESS attendance endpoints read and write the live store.
    route('GET', `${P}/attendance/metrics`, ({ mode, query }) => {
        const me = essEmployee();
        const records = liveAttendanceOf(mode, me);
        const month = /^\d{4}-\d{2}$/.test(String(query.month ?? '')) ? String(query.month) : undefined;
        const scoped = month
            ? liveMonthRecordsOf(mode, me, month)
            : attendanceInRange(records, toLocalIsoDate(query.from), toLocalIsoDate(query.to));
        return scoped.length ? essMetrics(scoped) : EMPTY_ESS_METRICS;
    }),
    route('GET', `${P}/attendance`, ({ mode, query }) => {
        const list = filterAttendance(liveAttendanceOf(mode, essEmployee()), query);
        return { records: pageOf(list, query.page, query.limit).map(toEssAttendance), total: list.length };
    }),
    route('POST', `${P}/attendance/check-in`, ({ mode }) => {
        const me = essEmployee();
        try {
            atsCheckIn(mode, me);
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            throw fail(e.status, e.message);
        }
        return toEssAttendance(legacyDay(mode, me, todayIso())!);
    }),
    route('POST', `${P}/attendance/check-out`, ({ mode }) => {
        const me = essEmployee();
        try {
            atsCheckOut(mode, me);
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            throw fail(e.status, e.message);
        }
        return toEssAttendance(legacyDay(mode, me, todayIso())!);
    }),
    route('POST', `${P}/leave/disputes`, ({ body }) => ({
        id: `dsp-new-${Date.now()}`,
        attendanceId: body?.attendanceId,
        reason: body?.reason,
        status: 'requestedByEmployee',
        createdAt: nowIso(),
    })),
    route('GET', `${P}/holidays`, ({ mode, query }) => {
        const list = holidayRange(query);
        return byMode<{ holidays: HolidayDoc[]; total: number }>(mode, {
            dummy: {
                holidays: pageOf(list, query.page, query.limit).map(h => ({
                    id: h.id,
                    start: h.date,
                    end: h.date,
                    title: h.title,
                    category: ESS_CATEGORY_LABEL[h.category],
                })),
                total: list.length,
            },
            empty: { holidays: [], total: 0 },
        });
    }),
    route('GET', `${P}/leave-balance`, ({ mode }) =>
        byMode<{ availableLeaves: AvailableLeave[] }>(mode, {
            dummy: { availableLeaves: availableLeavesOf(essEmployee()) },
            empty: { availableLeaves: [] },
        })
    ),
    route('GET', `${P}/leave-applications`, ({ mode, query }) => {
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const list = leavesOf(essEmployee()).filter(
            l => (!query.status || l.status === query.status) && (!from || l.end >= from) && (!to || l.start <= to)
        );
        return byMode<{ records: LeaveDoc[]; total: number }>(mode, {
            dummy: { records: pageOf(list, query.page, query.limit).map(toEssLeave), total: list.length },
            empty: { records: [], total: 0 },
        });
    }),
    route('POST', `${P}/leave-applications`, ({ body }) => echoLeaveDoc(essEmployee(), body, `lv-new-${Date.now()}`)),
    // PROTOTYPE-SETUP: ESS overtime requests are stateful now — see handlers/timesheet.ts (essOvertimeRoutes).
    route('PATCH', `${P}/leave-applications/:leaveId/cancel`, ({ params }) => {
        const leave = findLeave(params.leaveId);
        const doc = leave ? toEssLeave(leave) : echoLeaveDoc(essEmployee(), {}, params.leaveId ?? '');
        return { ...doc, status: 'cancelledByEmployee' } satisfies LeaveDoc;
    }),
    route('GET', `${P}/reimbursement-requests`, ({ mode, query }) => {
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const list = reimbursementsOf(essEmployee()).filter(
            r =>
                (!query.status || r.status === query.status) &&
                (!from || r.expenseDate >= from) &&
                (!to || r.expenseDate <= to)
        );
        return byMode<{ records: ReimbursementRecord[]; total: number }>(mode, {
            dummy: { records: pageOf(list, query.page, query.limit).map(toEssReimbursement), total: list.length },
            empty: { records: [], total: 0 },
        });
    }),
    route('POST', `${P}/reimbursement-requests`, ({ body }): ReimbursementRecord => ({
        id: `rb-new-${Date.now()}`,
        expenseDate: toLocalIsoDate(body?.expenseDate) ?? todayIso(),
        totalPay: Number(body?.amount ?? 0),
        expenseDetails: body?.expenseDetails,
        transferMethod: 'With Salary',
        status: 'requestedByEmployee',
        paymentStatus: 'UNPAID',
    })),
    route('PATCH', `${P}/reimbursement-requests/:reimbursementId/cancel`, ({ params }): ReimbursementRecord => {
        const existing = findReimbursement(params.reimbursementId);
        return {
            ...(existing
                ? toEssReimbursement(existing)
                : { id: params.reimbursementId ?? '', expenseDate: todayIso(), totalPay: 0 }),
            status: 'cancelledByEmployee',
        };
    }),
];

export const timeAndSettingsRoutes: MockRoute[] = [
    ...attendanceRoutes,
    ...holidayRoutes,
    ...leaveRoutes,
    ...overtimeRoutes,
    ...reimbursementRoutes,
    ...announcementRoutes,
    ...settingsRoutes,
    ...hrRequestRoutes,
    ...miscRoutes,
    ...essRoutes,
];
