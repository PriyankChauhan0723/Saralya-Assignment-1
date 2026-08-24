import { Loan } from '../domain/models/loan.model.js';

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseNullableNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim().replace(/,/g, '');
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'na' || str.toLowerCase() === 'n/a') {
    return null;
  }
  const parsed = Number(str);
  return isNaN(parsed) ? null : parsed;
}

export function parseNullableDate(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'na' || str.toLowerCase() === 'n/a') {
    return null;
  }
  const dt = new Date(str);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

export function validateIndianMobile(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  const normalized = cleaned.length === 12 && cleaned.startsWith('91')
    ? cleaned.slice(2)
    : cleaned.length === 11 && cleaned.startsWith('0')
      ? cleaned.slice(1)
      : cleaned;

  return /^([6-9]\d{9})$/.test(normalized);
}

/**
 * Normalizes raw incoming CSV rows across heterogeneous lender formats.
 * Preserves missing fields as null and enforces phone validation.
 */
export function normalizeRawRow(raw: Record<string, any>): Loan {
  const normalizedMap: Record<string, any> = {};
  for (const key of Object.keys(raw)) {
    normalizedMap[normalizeHeader(key)] = raw[key];
  }

  const loanNo = String(normalizedMap['loan_no'] || normalizedMap['loanno'] || normalizedMap['account_no'] || '').trim();
  if (!loanNo) {
    throw new Error('Missing primary identifier (LOAN_NO) in row.');
  }

  const memberName = String(normalizedMap['member_name'] || normalizedMap['customer_name'] || normalizedMap['borrower_name'] || '').trim();
  const rawMobile = String(normalizedMap['mobile_number'] || normalizedMap['mobile'] || normalizedMap['phone'] || '').trim();
  const isValidMobile = validateIndianMobile(rawMobile);

  const state = String(normalizedMap['state'] || '').trim();
  const district = String(normalizedMap['district'] || '').trim();
  const ruralUrban = String(normalizedMap['rural_urban'] || 'RURAL').trim().toUpperCase();
  const product = String(normalizedMap['product'] || 'JLG').trim();

  const disbursementDate = parseNullableDate(normalizedMap['disbursement_date'] || normalizedMap['disb_date']);
  const tenure = parseNullableNumber(normalizedMap['tenure']) ?? 12;
  const totalInstal = parseNullableNumber(normalizedMap['total_instal'] || normalizedMap['total_installments']) ?? tenure;
  
  const principalTotal = parseNullableNumber(normalizedMap['principal_total'] || normalizedMap['sanctioned_amount'] || normalizedMap['disbursed_amount']) ?? 0;
  const outstandingPrincipal = parseNullableNumber(normalizedMap['outstanding_principal'] || normalizedMap['pos']) ?? 0;
  const prinCollected = parseNullableNumber(normalizedMap['prin_collected'] || normalizedMap['principal_collected']) ?? 0;
  const intCollected = parseNullableNumber(normalizedMap['int_collected'] || normalizedMap['interest_collected']) ?? 0;
  const lastEmi = parseNullableNumber(normalizedMap['last_emi'] || normalizedMap['emi_amount']) ?? 0;
  const totalArrear = parseNullableNumber(normalizedMap['total_arrear'] || normalizedMap['overdue_amount']) ?? 0;
  const totalEmiPaidCount = parseNullableNumber(normalizedMap['total_emi_paid_count'] || normalizedMap['paid_emi_count'] || normalizedMap['emis_paid']) ?? 0;

  const lastCollDate = parseNullableDate(normalizedMap['last_coll_date'] || normalizedMap['last_payment_date']);
  const lastCollAmount = parseNullableNumber(normalizedMap['last_coll_amount'] || normalizedMap['last_payment_amount']);

  const odDays = parseNullableNumber(normalizedMap['od_days'] || normalizedMap['dpd']) ?? 0;
  const odBucket = String(normalizedMap['od_bucket'] || normalizedMap['dpd_bucket'] || '0-30').trim();
  const status = String(normalizedMap['status'] || 'Active').trim();

  const totalIncome = parseNullableNumber(normalizedMap['total_income'] || normalizedMap['monthly_income']);
  const totalExpense = parseNullableNumber(normalizedMap['total_expense'] || normalizedMap['monthly_expense']);
  const foir = parseNullableNumber(normalizedMap['foir']);

  const age = parseNullableNumber(normalizedMap['age']) ?? 35;
  const cycle = parseNullableNumber(normalizedMap['cycle']) ?? 1;

  const paidWithin30d = parseNullableNumber(normalizedMap['paid_within_30d']);
  const amountPaid30d = parseNullableNumber(normalizedMap['amount_paid_30d']);

  return {
    loan_no: loanNo,
    member_name: memberName,
    mobile_number: rawMobile,
    is_valid_mobile: isValidMobile,
    state,
    district,
    rural_urban: ruralUrban,
    product,
    disbursement_date: disbursementDate,
    tenure,
    total_instal: totalInstal,
    principal_total: principalTotal,
    outstanding_principal: outstandingPrincipal,
    prin_collected: prinCollected,
    int_collected: intCollected,
    last_emi: lastEmi,
    total_arrear: totalArrear,
    total_emi_paid_count: totalEmiPaidCount,
    last_coll_date: lastCollDate,
    last_coll_amount: lastCollAmount,
    od_days: odDays,
    od_bucket: odBucket,
    status,
    total_income: totalIncome,
    total_expense: totalExpense,
    foir,
    age,
    cycle,
    paid_within_30d: paidWithin30d !== null ? Number(paidWithin30d) : null,
    amount_paid_30d: amountPaid30d
  };
}
