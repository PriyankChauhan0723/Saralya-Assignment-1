import fs from 'node:fs';
import path from 'node:path';

// Seeded random number generator for 100% reproducible data generation
class Mulberry32 {
  private s: number;
  constructor(seed: number) {
    this.s = seed;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  choice<T>(arr: T[]): T {
    return arr[this.rangeInt(0, arr.length - 1)];
  }
}

const rng = new Mulberry32(42);

const FIRST_NAMES = [
  'Sunita', 'Anita', 'Rekha', 'Manju', 'Geeta', 'Pooja', 'Shanti', 'Meena', 'Kavita', 'Sita',
  'Radha', 'Lalita', 'Urmila', 'Mamta', 'Sangeeta', 'Aarti', 'Kiran', 'Sarita', 'Rani', 'Guddi',
  'Ramesh', 'Suresh', 'Mukesh', 'Rajesh', 'Dinesh', 'Santosh', 'Manoj', 'Anil', 'Sunil', 'Vijay'
];

const LAST_NAMES = [
  'Devi', 'Kaur', 'Kumari', 'Bai', 'Begum', 'Sharma', 'Verma', 'Yadav', 'Singh', 'Gupta',
  'Patel', 'Paswan', 'Manjhi', 'Mondal', 'Das', 'Roy', 'Mahto', 'Tiwari', 'Pandey', 'Khatun'
];

const STATES_DISTRICTS: Record<string, string[]> = {
  'Bihar': ['Patna', 'Gaya', 'Muzaffarpur', 'Darbhanga', 'Bhagalpur', 'Purnia', 'Samastipur'],
  'Uttar Pradesh': ['Varanasi', 'Gorakhpur', 'Lucknow', 'Kanpur', 'Prayagraj', 'Azamgarh', 'Bareilly'],
  'West Bengal': ['Murshidabad', 'North 24 Parganas', 'South 24 Parganas', 'Nadia', 'Hooghly', 'Malda'],
  'Odisha': ['Cuttack', 'Ganjam', 'Balasore', 'Khordha', 'Mayurbhanj', 'Puri'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Rewa'],
  'Maharashtra': ['Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Solapur', 'Amravati'],
  'Tamil Nadu': ['Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Thanjavur'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur']
};

const PRODUCTS = ['JLG', 'Micro-Enterprise', 'Individual Loan', 'Agriculture Allied'];

function generatePhoneNumber(): string {
  const rand = rng.next();
  if (rand < 0.015) {
    return `0${rng.rangeInt(20, 80)}-${rng.rangeInt(2000000, 8999999)}`;
  }
  if (rand < 0.03) {
    return `${rng.rangeInt(60000000, 99999999)}`;
  }
  if (rand < 0.04) {
    return '9999999999';
  }
  const prefix = rng.choice([6, 7, 8, 9]);
  const rest = rng.rangeInt(100000000, 999999999);
  return `${prefix}${rest}`;
}

export function generatePortfolioCSV(totalRows = 25000, outputPath = 'data/portfolio.csv') {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  const headers = [
    'LOAN_NO',
    'MEMBER_NAME',
    'MOBILE_NUMBER',
    'STATE',
    'DISTRICT',
    'RURAL_URBAN',
    'PRODUCT',
    'DISBURSEMENT_DATE',
    'TENURE',
    'TOTAL_INSTAL',
    'PRINCIPAL_TOTAL',
    'OUTSTANDING_PRINCIPAL',
    'PRIN_COLLECTED',
    'INT_COLLECTED',
    'LAST_EMI',
    'TOTAL_ARREAR',
    'Total_EMI_Paid_Count',
    'LAST_COLL_DATE',
    'LAST_COLL_AMOUNT',
    'OD_DAYS',
    'OD_BUCKET',
    'STATUS',
    'TOTAL_INCOME',
    'TOTAL_EXPENSE',
    'FOIR',
    'AGE',
    'CYCLE',
    'PAID_WITHIN_30D',
    'AMOUNT_PAID_30D'
  ];

  writeStream.write(headers.join(',') + '\n');

  const snapshotDate = new Date('2024-03-31');

  for (let i = 1; i <= totalRows; i++) {
    const loanNo = `LN${1000000 + i}`;
    const memberName = `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)}`;
    const mobileNumber = generatePhoneNumber();
    const state = rng.choice(Object.keys(STATES_DISTRICTS));
    const district = rng.choice(STATES_DISTRICTS[state]);
    const ruralUrban = rng.next() < 0.75 ? 'RURAL' : 'URBAN';
    const product = rng.choice(PRODUCTS);

    const tenureMonths = rng.choice([12, 18, 24, 36]);
    const totalInstal = tenureMonths;
    const principalTotal = rng.choice([25000, 30000, 40000, 50000, 60000, 75000, 100000]);
    const monthlyRate = 0.02;
    const emi = Math.round((principalTotal * (1 + monthlyRate * tenureMonths)) / tenureMonths);

    const disbDaysAgo = rng.rangeInt(90, tenureMonths * 30 + 60);
    const disbDateObj = new Date(snapshotDate.getTime() - disbDaysAgo * 86400000);
    const disbDate = disbDateObj.toISOString().split('T')[0];

    const odRand = rng.next();
    let odDays = 0;
    let odBucket = '0-30';

    if (odRand < 0.35) {
      odDays = rng.rangeInt(1, 30);
      odBucket = '0-30';
    } else if (odRand < 0.55) {
      odDays = rng.rangeInt(31, 60);
      odBucket = '31-60';
    } else if (odRand < 0.72) {
      odDays = rng.rangeInt(61, 90);
      odBucket = '61-90';
    } else if (odRand < 0.88) {
      odDays = rng.rangeInt(91, 180);
      odBucket = '91-180';
    } else if (odRand < 0.96) {
      odDays = rng.rangeInt(181, 360);
      odBucket = '181-360';
    } else {
      odDays = rng.rangeInt(361, 500);
      odBucket = '360+';
    }

    const elapsedInstal = Math.min(totalInstal, Math.max(1, Math.floor(disbDaysAgo / 30)));
    const missedInstal = Math.max(1, Math.ceil(odDays / 30));
    const paidCount = Math.max(0, Math.min(elapsedInstal - missedInstal, totalInstal));

    const prinPerInstal = principalTotal / totalInstal;
    let prinCollected = Math.round(paidCount * prinPerInstal);
    let outstandingPrin = principalTotal - prinCollected;

    if (rng.next() < 0.02) {
      outstandingPrin = Math.round(principalTotal * rng.range(1.02, 1.15));
    }

    const intCollected = Math.round(prinCollected * 0.18);
    const totalArrear = Math.round(missedInstal * emi);

    const daysSincePayment = odDays + rng.rangeInt(5, 25);
    const lastCollDateObj = new Date(snapshotDate.getTime() - daysSincePayment * 86400000);
    const lastCollDate = lastCollDateObj.toISOString().split('T')[0];
    let lastCollAmount: string | number = emi;

    if (rng.next() < 0.05) {
      lastCollAmount = '';
    }

    let status = 'Active';
    if (odDays > 180 && rng.next() < 0.4) {
      status = 'Write-Off';
    } else if (odDays > 90 && rng.next() < 0.3) {
      status = 'NPA';
    }

    let totalIncomeStr = '';
    let totalExpenseStr = '';
    let foirStr = '';

    const hasIncomeData = rng.next() > 0.06;
    if (hasIncomeData) {
      const income = rng.rangeInt(15000, 65000);
      const expense = Math.round(income * rng.range(0.40, 0.85));
      const foir = Math.min(1.2, Number(((expense + emi) / income).toFixed(4)));
      totalIncomeStr = income.toString();
      totalExpenseStr = expense.toString();
      foirStr = foir.toFixed(4);
    }

    const age = rng.rangeInt(21, 58);
    const cycle = rng.rangeInt(1, 5);

    const ptpKeptRate = paidCount / totalInstal;
    const isValidPhone = /^([6-9]\d{9})$/.test(mobileNumber) ? 1 : 0;
    const odSeverity = Math.min(odDays, 210) / 210;

    let logOdds = 0.5;
    logOdds += 2.2 * ptpKeptRate;
    logOdds -= 3.0 * odSeverity;
    logOdds += 0.8 * isValidPhone;
    logOdds += 0.3 * (cycle - 1);
    if (hasIncomeData && Number(foirStr) < 0.6) {
      logOdds += 0.6;
    } else if (hasIncomeData && Number(foirStr) > 0.85) {
      logOdds -= 0.8;
    }
    if (status === 'Write-Off') logOdds -= 2.0;

    const probPay = 1 / (1 + Math.exp(-logOdds));
    const paidWithin30D = rng.next() < probPay ? 1 : 0;
    const amountPaid30D = paidWithin30D === 1 ? (rng.next() < 0.7 ? emi : Math.round(emi * rng.range(0.3, 2.0))) : 0;

    const row = [
      loanNo,
      memberName,
      mobileNumber,
      state,
      district,
      ruralUrban,
      product,
      disbDate,
      tenureMonths,
      totalInstal,
      principalTotal.toFixed(2),
      outstandingPrin.toFixed(2),
      prinCollected.toFixed(2),
      intCollected.toFixed(2),
      emi.toFixed(2),
      totalArrear.toFixed(2),
      paidCount,
      lastCollDate,
      lastCollAmount !== '' ? Number(lastCollAmount).toFixed(2) : '',
      odDays,
      odBucket,
      status,
      totalIncomeStr,
      totalExpenseStr,
      foirStr,
      age,
      cycle,
      paidWithin30D,
      amountPaid30D.toFixed(2)
    ];

    writeStream.write(row.join(',') + '\n');
  }

  writeStream.end();
  console.log(`Successfully generated ${totalRows} rows to ${outputPath}`);
}
