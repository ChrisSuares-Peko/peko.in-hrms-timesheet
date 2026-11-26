// PROTOTYPE-SETUP (Leave email notifications — notes guide.shared → "Email notifications for leave applications"):
// THE ONE PLACE FOR THE EMAIL WORDING. Product will send the final subject and body for each trigger; paste them over the
// placeholders below. Nothing else needs to change.
//
// One template per trigger:
//   submitted ..... a new request reaches its first approval level that isn't skipped
//   next_level .... a level approved and the request moved on to the next level (the endorsement step or Level 2)
//   resubmitted ... the employee updated (or edited) the request and it starts again at Level 1
//
// Placeholders (all filled for every request type; empty when there's nothing to show):
//   {approver_name}  the person the email goes to
//   {employee_name}  {employee_id}  {department}
//   {request_type}   Leave request · Leave cancellation · Leave change · Comp off request (added: the four request types
//                    share these templates)
//   {leave_type}     e.g. "Annual leave", "Maternity leave", "Loss of pay", "Comp off"
//   {from_date}  {to_date}  e.g. "Mon 7 Dec 2026"
//   {days}           e.g. "2.5 days"
//   {day_type}       Full day(s) · First half · Second half
//   {reason}         the employee's reason
//   {level}          Level 1 · Endorsement · Level 2
//   {request_id}     the request's id
//   {request_link}   opens the request: My team → Approvals for a person, Payroll → Leave → Requests for a team
export type LeaveEmailTrigger = 'submitted' | 'next_level' | 'resubmitted';

export const LEAVE_EMAIL_PLACEHOLDERS = [
    'approver_name',
    'employee_name',
    'employee_id',
    'department',
    'request_type',
    'leave_type',
    'from_date',
    'to_date',
    'days',
    'day_type',
    'reason',
    'level',
    'request_id',
    'request_link',
] as const;

export type LeaveEmailPlaceholder = (typeof LEAVE_EMAIL_PLACEHOLDERS)[number];

export const LEAVE_EMAIL_TEMPLATES: Record<LeaveEmailTrigger, { subject: string; body: string }> = {
    submitted: {
        subject: '[Wording from product] {request_type} from {employee_name} waiting for your approval ({level})',
        body: [
            'Hi {approver_name},',
            '',
            '[Wording from product]',
            '',
            '{employee_name} ({employee_id}, {department}) · {request_type}',
            '{leave_type}: {from_date} to {to_date} · {days} · {day_type}',
            'Reason: {reason}',
            'Approval level: {level} · Request {request_id}',
            '',
            'Open the request: {request_link}',
        ].join('\n'),
    },
    next_level: {
        subject: '[Wording from product] {request_type} from {employee_name} is now with you ({level})',
        body: [
            'Hi {approver_name},',
            '',
            '[Wording from product]',
            '',
            '{employee_name} ({employee_id}, {department}) · {request_type}',
            '{leave_type}: {from_date} to {to_date} · {days} · {day_type}',
            'Reason: {reason}',
            'Approval level: {level} · Request {request_id}',
            '',
            'Open the request: {request_link}',
        ].join('\n'),
    },
    resubmitted: {
        subject: '[Wording from product] {employee_name} updated their {request_type} ({level})',
        body: [
            'Hi {approver_name},',
            '',
            '[Wording from product]',
            '',
            '{employee_name} ({employee_id}, {department}) · {request_type}',
            '{leave_type}: {from_date} to {to_date} · {days} · {day_type}',
            'Reason: {reason}',
            'Approval level: {level} · Request {request_id}',
            '',
            'Open the request: {request_link}',
        ].join('\n'),
    },
};

/** Fills the placeholders; an unknown placeholder is left as it is (so a typo in the wording shows up). */
export const renderLeaveEmail = (template: string, values: Partial<Record<LeaveEmailPlaceholder, string>>) =>
    template.replace(/\{([a-z_]+)\}/g, (all, key: string) => (key in values ? values[key as LeaveEmailPlaceholder] ?? '' : all));
