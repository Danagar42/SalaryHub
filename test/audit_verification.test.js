/**
 * Permanent Automated Verification Suite for SalaryHub
 * Covers all 13 specification items across the 5 sample Excel files (202604 - 202608).
 * Real tests against index.html implementation (no disconnected mocks).
 * 
 * Run with: node test/audit_verification.test.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { ensureSyntheticFixtures } = require('./fixtures_helper');
ensureSyntheticFixtures();

// 1. Load index.html and extract ParserModule & relevant business logic
const indexPath = path.resolve(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Helper to evaluate ParserModule in isolation
function getParserModule() {
  const match = indexHtml.match(/const ParserModule = \{([\s\S]*?)\n    \};/);
  if (!match) throw new Error('ParserModule not found in index.html');
  
  let idCounter = 0;
  const generateId = () => `test-${++idCounter}`;
  
  const fn = new Function('generateId', `
    const ParserModule = {${match[1]}};
    return ParserModule;
  `);
  return fn(generateId);
}

const ParserModule = getParserModule();

// Test stats collector
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

function assertCloseTo(actual, expected, maxDiff = 0.05, testName = '') {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff <= maxDiff) {
    passedTests++;
    console.log(`  [PASS] ${testName} (${actual} ≈ ${expected})`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - Expected: ${expected}, Got: ${actual}, Diff: ${diff}`);
  }
}

console.log('====================================================');
console.log(' Starting SalaryHub Verification Test Suite');
console.log('====================================================\n');

// ----------------------------------------------------
// AREA 1 & 2: Excel Parsing of 5 Sample Files + Period Code Blocker + Control Sums
// ----------------------------------------------------
console.log('--- AREA 1 & 2: Parsing 5 Sample Files & Control Sums ---');

const sampleFiles = [
  { file: 'Розр_Лист_371_202604.xls', expectedPeriod: { month: 4, year: 2026 }, expectedAccrued: 71792.00, expectedDeductions: 38436.58 },
  { file: 'Розр_Лист_371_202605.xls', expectedPeriod: { month: 5, year: 2026 }, expectedAccrued: 75299.12, expectedDeductions: 39171.46 },
  { file: 'Розр_Лист_371_202606.xls', expectedPeriod: { month: 6, year: 2026 }, expectedAccrued: 79320.65, expectedDeductions: 40141.48 },
  { file: 'Розр_Лист_371_202607.xls', expectedPeriod: { month: 7, year: 2026 }, expectedAccrued: 75638.37, expectedDeductions: 40632.31 },
  { file: 'Розр_Лист_371_202608.xls', expectedPeriod: { month: 8, year: 2026 }, expectedAccrued: 89206.73, expectedDeductions: 52695.53 }
];

const parsedMonths = [];

sampleFiles.forEach(sample => {
  const rootPath = path.resolve(__dirname, '..', sample.file);
  const fixturePath = path.resolve(__dirname, 'fixtures', 'samples', sample.file);
  const filePath = fs.existsSync(rootPath) ? rootPath : fixturePath;
  assert(fs.existsSync(filePath), `File exists: ${sample.file}`);
  
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const parsed = ParserModule.parseGrid(rows);
  
  assert(parsed.success, `${sample.file}: parseGrid succeeded`);
  assert(parsed.period !== null, `${sample.file}: period detected`);
  assert(parsed.period.monthIdx + 1 === sample.expectedPeriod.month, `${sample.file}: month === ${sample.expectedPeriod.month}`);
  assert(parsed.period.year === sample.expectedPeriod.year, `${sample.file}: year === ${sample.expectedPeriod.year}`);
  
  const totalAccrued = parsed.accruals.reduce((sum, a) => sum + a.amount, 0);
  const totalDeductions = parsed.deductions.reduce((sum, d) => sum + d.amount, 0);
  
  assertCloseTo(totalAccrued, sample.expectedAccrued, 0.05, `${sample.file}: totalAccrued matches control`);
  assertCloseTo(totalDeductions, sample.expectedDeductions, 0.05, `${sample.file}: totalDeductions matches control (No period code leakage)`);
  
  // Specific blocker check: no deduction should have amount == 202604 or 202605 or 202608
  const periodCodeLeak = parsed.deductions.find(d => /20260\d/.test(String(d.amount)));
  assert(!periodCodeLeak, `${sample.file}: no deduction amount contains period code`, periodCodeLeak ? JSON.stringify(periodCodeLeak) : '');

  // Check control sum parsing for BOTH accrued and deductions
  assert(parsed.totalAccruedControl !== null, `${sample.file}: totalAccruedControl parsed`);
  assertCloseTo(parsed.totalAccruedControl, sample.expectedAccrued, 0.05, `${sample.file}: control accrued matches control`);
  assert(parsed.totalDeductedControl !== null, `${sample.file}: totalDeductedControl parsed`);
  assertCloseTo(parsed.totalDeductedControl, sample.expectedDeductions, 0.05, `${sample.file}: control deductions matches control`);

  parsedMonths.push({
    id: `${parsed.period.year}-${String(parsed.period.monthIdx + 1).padStart(2, '0')}`,
    month: parsed.period.monthIdx + 1,
    year: parsed.period.year,
    monthName: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень'][parsed.period.monthIdx],
    accruals: parsed.accruals,
    deductions: parsed.deductions,
    totalAccrued,
    totalDeductions
  });
});

// Test isPeriodCode and cleanNumberString unit behavior
console.log('\n--- AREA 1 (Unit): isPeriodCode, cleanNumberString and findDeductionAmount ---');
assert(ParserModule.isPeriodCode('202608') === true, 'isPeriodCode("202608") === true');
assert(ParserModule.isPeriodCode('202608.0') === true, 'isPeriodCode("202608.0") === true (strips .0)');
assert(ParserModule.isPeriodCode('202608.00') === true, 'isPeriodCode("202608.00") === true (strips .00)');
assert(ParserModule.isPeriodCode('08.2026') === true, 'isPeriodCode("08.2026") === true');
assert(ParserModule.isPeriodCode('2026-08') === true, 'isPeriodCode("2026-08") === true');
assert(ParserModule.isPeriodCode('2026.04') === false, 'isPeriodCode("2026.04") === false (real currency cents)');
assert(ParserModule.isPeriodCode('202604.50') === false, 'isPeriodCode("202604.50") === false (real currency cents)');
assert(ParserModule.isPeriodCode('10050') === false, 'isPeriodCode("10050") === false (5-digit amount)');
assert(ParserModule.isPeriodCode('71792') === false, 'isPeriodCode("71792") === false (5-digit amount)');
assert(ParserModule.isPeriodCode('-202604') === false, 'isPeriodCode("-202604") === false (negative number)');
assert(ParserModule.isPeriodCode('(202604)') === false, 'isPeriodCode("(202604)") === false (accounting negative parenthesis - Defect 3)');
assert(ParserModule.isPeriodCode('(2026-08)') === false, 'isPeriodCode("(2026-08)") === false (accounting negative with date separator)');

// Storno, Unicode minus, and international number format handling in cleanNumberString (Defect 3 & 12)
assert(ParserModule.cleanNumberString('−1234,56') === '-1234.56', 'cleanNumberString converts unicode minus (−)');
assert(ParserModule.cleanNumberString('–717.92') === '-717.92', 'cleanNumberString converts en-dash (–)');
assert(ParserModule.cleanNumberString('(450,00)') === '-450.00', 'cleanNumberString converts accounting parenthesis format (450,00)');
assert(ParserModule.cleanNumberString('(202604)') === '-202604', 'cleanNumberString converts accounting parenthesis format (202604)');
assert(ParserModule.cleanNumberString('202,604') === '202604', 'cleanNumberString converts standard thousands comma "202,604" (Defect 12)');
assert(ParserModule.cleanNumberString('1,250.50') === '1250.50', 'cleanNumberString converts thousands comma with cents "1,250.50" (Defect 12)');
assert(ParserModule.cleanNumberString('50 000 грн') === '50000', 'cleanNumberString strips "грн" (Defect 12)');
assert(ParserModule.cleanNumberString('75,000 ₴') === '75000', 'cleanNumberString strips "₴" and thousands comma (Defect 12)');
assert(ParserModule.cleanNumberString('1,000.00 UAH') === '1000.00', 'cleanNumberString strips "UAH" and thousands comma (Defect 12)');
assert(ParserModule.cleanNumberString('40 000,00 грн.') === '40000.00', 'cleanNumberString strips "грн." and converts comma decimal (Defect 12)');
assert(ParserModule.cleanNumberString('-1,250.50') === '-1250.50', 'cleanNumberString converts negative thousands comma');
assert(ParserModule.cleanNumberString('(1,250.50)') === '-1250.50', 'cleanNumberString converts accounting parenthesis thousands comma');
assert(ParserModule.isAmount('−1234.56') === true, 'isAmount accepts negative numbers with unicode minus');
assert(ParserModule.parseNum('−1234,56') === -1234.56, 'parseNum parses unicode minus correctly');

// 6-figure salaries and payouts extraction without being swallowed by isPeriodCode (Defect 1)
const samplePeriod = { monthIdx: 3, year: 2026 };
const bonusWithDays = ParserModule.findBestAmount(['Премія', 1, 202604], 1, 3, samplePeriod);
assert(bonusWithDays.amount === 202604, 'findBestAmount(["Премія", 1, 202604]) picks 202604, not 1.00 ₴ (Defect 1 resolved)', `Got: ${bonusWithDays.amount}`);

// Multi-day 1C row: employee worked 22 days and salary is 202,604 with period code 202604
const multiDayRow = [null, null, 1, null, 'Посадовий оклад', 22, '176:30', 202604, 202604];
const parseResultMultiDay = ParserModule.parseGrid([['Розрахунковий листок за 04.2026'], multiDayRow]);
assert(parseResultMultiDay.accruals[0].amount === 202604, 'parseGrid extracts 202604 salary when 22 days worked', `Got: ${parseResultMultiDay.accruals[0].amount}`);
assert(parseResultMultiDay.accruals[0].days === 22, 'parseGrid extracts 22 days worked alongside 202604 salary', `Got: ${parseResultMultiDay.accruals[0].days}`);

const standaloneSalary = ParserModule.findBestAmount(['Посадовий оклад', 202604], 1, 2, samplePeriod);
assert(standaloneSalary.amount === 202604, 'findBestAmount picks standalone 6-figure salary 202604', `Got: ${standaloneSalary.amount}`);

const standaloneDeduction = ParserModule.findDeductionAmount(['Виплата через касу', 202604], 1, 2, samplePeriod);
assert(standaloneDeduction.amount === 202604, 'findDeductionAmount picks standalone 6-figure payout 202604', `Got: ${standaloneDeduction.amount}`);

const bonusBeforePeriod = ParserModule.findBestAmount(['Премія', 202604, 202608], 1, 3, samplePeriod);
assert(bonusBeforePeriod.amount === 202604, 'findBestAmount picks 202604 preceding period code 202608', `Got: ${bonusBeforePeriod.amount}`);

const deductionBeforePeriod = ParserModule.findDeductionAmount(['Перерахування до банку', 202604, 202608], 1, 3);
assert(deductionBeforePeriod.amount === 202604, 'findDeductionAmount picks 202604 preceding period code 202608', `Got: ${deductionBeforePeriod.amount}`);

const stornoDeduction = ParserModule.findDeductionAmount(['Сторно виплати', '(202604)'], 1, 2);
assert(stornoDeduction.amount === -202604, 'findDeductionAmount extracts negative storno (202604) as -202604', `Got: ${stornoDeduction.amount}`);

// Regression test: small integer amounts <= 31 before period code must not leak period code
const smallAllowance = ParserModule.findBestAmount(['Доплата', 20, 202608], 1, 3);
assert(smallAllowance.amount === 20, 'findBestAmount does not leak period code for amounts <= 31', `Got: ${smallAllowance.amount}`);

const smallCents = ParserModule.findBestAmount(['Індексація', 15.50, 202608], 1, 3);
assert(smallCents.amount === 15.50, 'findBestAmount handles small cents before period code', `Got: ${smallCents.amount}`);

// Test row with deduction followed by period code
const dummyRow = [null, 502, 'Плановий аванс', null, 10050, null, 202608];
const deductionFound = ParserModule.findDeductionAmount(dummyRow, 2);
assert(deductionFound.amount === 10050, 'findDeductionAmount finds 10050 before 202608', `Got: ${deductionFound.amount}`);

// Test boundary safety: deduction on left, accrual on right (no column bleeding)
const invertedRow = ['Профвнески', 400, null, 'Посадовий оклад', 40000, 202604];
const parsedInverted = ParserModule.parseGrid([invertedRow]);
assert(parsedInverted.deductions.length > 0 && parsedInverted.deductions[0].amount === 400, 'findDeductionAmount does not bleed into accrual column', `Got: ${parsedInverted.deductions[0]?.amount}`);
assert(parsedInverted.accruals.length > 0 && parsedInverted.accruals[0].amount === 40000, 'Accrual amount remains 40000', `Got: ${parsedInverted.accruals[0]?.amount}`);

// Control sum parsing: Intermediate days/hours columns do not corrupt control sum (Defect 2)
const summaryWithDaysHours = [
  ['Разом нараховано', 22, '176:30', 50000]
];
const parsedSummaryDaysHours = ParserModule.parseGrid(summaryWithDaysHours);
assert(parsedSummaryDaysHours.totalAccruedControl === 50000, 'Control sum with preceding days and hours: 50000 (not 22176 or 2250000 - Defect 2 resolved)', `Got: ${parsedSummaryDaysHours.totalAccruedControl}`);

const summaryWithDaysOnly = [
  ['Разом нараховано', 22, 50000]
];
const parsedSummaryDaysOnly = ParserModule.parseGrid(summaryWithDaysOnly);
assert(parsedSummaryDaysOnly.totalAccruedControl === 50000, 'Control sum with preceding days only: 50000 (not 2250000)', `Got: ${parsedSummaryDaysOnly.totalAccruedControl}`);

const summaryWithBothAndColumns = [
  ['Разом нараховано', 22, '176:30', 50000, null, 'Разом утримано', 20000]
];
const parsedBothCols = ParserModule.parseGrid(summaryWithBothAndColumns);
assert(parsedBothCols.totalAccruedControl === 50000, 'Control accrued sum from multi-column row is 50000', `Got: ${parsedBothCols.totalAccruedControl}`);
assert(parsedBothCols.totalDeductedControl === 20000, 'Control deducted sum from multi-column row is 20000', `Got: ${parsedBothCols.totalDeductedControl}`);

// Test control sum variations: "Всього нараховано", "Усього утримано"
const altControlGrid = [
  ['Всього нараховано: 85000'],
  ['Усього утримано: 42500']
];
const parsedAltControl = ParserModule.parseGrid(altControlGrid);
assert(parsedAltControl.totalAccruedControl === 85000, 'parseGrid extracts "Всього нараховано: 85000"');
assert(parsedAltControl.totalDeductedControl === 42500, 'parseGrid extracts "Усього утримано: 42500"');

// Preservation of original seniority allowance names without hardcoded renaming (Defect 8)
const seniorityGrid = [
  ['Надбавка за вислугу років', 5000]
];
const parsedSeniority = ParserModule.parseGrid(seniorityGrid);
assert(parsedSeniority.accruals.length > 0 && parsedSeniority.accruals[0].name === 'Надбавка за вислугу років', 'parseGrid preserves original accrual name (no forced rename to енергетика - Defect 8 resolved)', `Got: ${parsedSeniority.accruals[0]?.name}`);


// ----------------------------------------------------
// AREA 3: Accruals Blacklist / Whitelist ('дохід' vs 'податок|пдфо')
// ----------------------------------------------------
console.log('\n--- AREA 3: Accruals Whitelist / Blacklist ---');
const juneMonth = parsedMonths.find(m => m.month === 6);
const indexationAccrual = juneMonth.accruals.find(a => a.name.toLowerCase().includes('індексац'));
assert(Boolean(indexationAccrual), 'June accruals contain indexation ("Індексація")');
if (indexationAccrual) {
  assertCloseTo(indexationAccrual.amount, 162.02, 0.01, 'Indexation amount is 162.02');
}

// Test text parsing with "Індексація грошових доходів"
const sampleGridWithIncome = [
  ['Посадовий оклад', 30000, 'ПДФО', 5400],
  ['Індексація грошових доходів', 162.02, 'Військовий збір', 1500]
];
const parsedIncome = ParserModule.parseGrid(sampleGridWithIncome);
const foundIncome = parsedIncome.accruals.find(a => a.name.includes('Індексація'));
assert(Boolean(foundIncome), 'isAccrual correctly accepts "Індексація грошових доходів"');
assert(!parsedIncome.accruals.some(a => a.name.includes('ПДФО')), 'Accruals does not contain ПДФО');


// ----------------------------------------------------
// AREA 4: Homoglyphs Detection (Trade union / Профвнески)
// ----------------------------------------------------
console.log('\n--- AREA 4: Homoglyphs Detection ---');
const homoglyphRegex = /[пp][рp][оo]ф/i;
const cyrillicProf = 'Профвнески';
const mixedProf1 = 'Пpoфвнески'; // Latin p, o
const mixedProf2 = 'Прoфспілка'; // Latin o
const mixedProf3 = 'pроф';      // Latin p

assert(homoglyphRegex.test(cyrillicProf), 'Detects pure Cyrillic "Профвнески"');
assert(homoglyphRegex.test(mixedProf1), 'Detects Latin homoglyphs in "Пpoфвнески"');
assert(homoglyphRegex.test(mixedProf2), 'Detects Latin "o" in "Прoфспілка"');
assert(homoglyphRegex.test(mixedProf3), 'Detects Latin "p" in "pроф"');

const mixedRow = [
  ['Посадовий оклад', 20000, 'Пpoфвнески', 200]
];
const parsedMixed = ParserModule.parseGrid(mixedRow);
assert(parsedMixed.deductions.some(d => d.name.toLowerCase().includes('проф') || homoglyphRegex.test(d.name)), 'Mixed homoglyph trade union is categorized as deduction');


// ----------------------------------------------------
// AREA 5: Rules of Hooks in PayslipView
// ----------------------------------------------------
console.log('\n--- AREA 5: Rules of Hooks in PayslipView ---');
const payslipIdx = indexHtml.indexOf('const PayslipView = () => {');
const addPayslipIdx = indexHtml.indexOf('const AddPayslipView = () => {');
assert(payslipIdx !== -1 && addPayslipIdx !== -1, 'Found PayslipView in index.html');
if (payslipIdx !== -1 && addPayslipIdx !== -1) {
  const code = indexHtml.substring(payslipIdx, addPayslipIdx);
  const useMemoInsightsIndex = code.indexOf('const insights = useMemo');
  const returnEarlyIndex = code.indexOf('if (!activeMonthData) return <div');
  assert(useMemoInsightsIndex !== -1, 'const insights = useMemo exists in PayslipView');
  assert(returnEarlyIndex !== -1, 'Component-level early return check exists in PayslipView');
  assert(useMemoInsightsIndex < returnEarlyIndex, 'useMemo(insights) is declared BEFORE component early return if (!activeMonthData)');
  
  // Verify no other hooks appear after returnEarlyIndex
  const afterReturn = code.substring(returnEarlyIndex);
  const hooksAfter = afterReturn.match(/use[A-Z]\w+/g);
  assert(hooksAfter === null, 'No React hooks declared after component early return in PayslipView');
}


// ----------------------------------------------------
// AREA 6: Net Pay vs Balance Logic in AddPayslipView (Live evaluation from index.html - Defect 6)
// ----------------------------------------------------
console.log('\n--- AREA 6: Net Pay vs Balance Logic (Live evaluation) ---');
function getRealAddPayslipExecutor() {
  const calcMatch = indexHtml.match(/const currentAccrued = accruals\.reduce[\s\S]*?const currentBalance = currentNet - advancesAndPayouts;/);
  if (!calcMatch) throw new Error('AddPayslip calculations not found in index.html');
  const warnMatch = indexHtml.match(/if \((currentBalance < -1 [|&]{2} currentNet < 0)\)/);
  if (!warnMatch) throw new Error('AddPayslip warning condition not found in index.html');
  
  const classMatch = indexHtml.match(/const classifyDeduction = ([\s\S]*?\n    \};)/);
  const classFn = classMatch ? classMatch[0] : '';
  return new Function('accruals', 'deductions', `
    ${classFn}
    ${calcMatch[0]}
    const isNegativeWarning = Boolean(${warnMatch[1]});
    return { currentNet, currentBalance, isNegativeWarning };
  `);
}

const calculateAddPayslipValues = getRealAddPayslipExecutor();
assert(indexHtml.includes('if (currentBalance < -1 || currentNet < 0)'), 'AddPayslipView warning condition uses || (Defect 5 resolved)');

// Case A: Full payout matches net pay exactly
const caseA = calculateAddPayslipValues(
  [{ name: 'Оклад', amount: 50000 }],
  [{ name: 'ПДФО', amount: 9000 }, { name: 'Військовий збір', amount: 2500 }, { name: 'Плановий аванс', amount: 15000 }, { name: 'Виплата зарплати', amount: 23500 }]
);
assertCloseTo(caseA.currentNet, 38500, 0.01, 'Case A Net: 50000 - 11500 = 38500');
assertCloseTo(caseA.currentBalance, 0, 0.01, 'Case A Balance: 38500 - 15000 - 23500 = 0');
assert(caseA.isNegativeWarning === false, 'Case A: Balance 0 does not trigger negative warning');

// Case B: Bank payout / advance equals accrued (no taxes deducted in slip)
const caseB = calculateAddPayslipValues(
  [{ name: 'Оклад', amount: 40000 }],
  [{ name: 'Перерахування до банку', amount: 40000 }]
);
assert(caseB.currentNet === 40000, 'Case B Net equals accrued (40000)');
assert(caseB.currentBalance === 0, 'Case B Balance equals 0');
assert(caseB.isNegativeWarning === false, 'Case B does not trigger negative net warning');

// Case C: True negative debt/storno (net pay itself is negative)
const caseC = calculateAddPayslipValues(
  [{ name: 'Сторно', amount: -5000 }],
  [{ name: 'Виплата', amount: 100 }]
);
assert(caseC.isNegativeWarning === true, 'Case C: Negative net and negative balance triggers warning');

// Case D: Positive net pay (25,000 ₴), but advances/payouts exceed it (balance = -5,000 ₴) (Defect 5)
const caseD = calculateAddPayslipValues(
  [{ name: 'Оклад', amount: 30000 }],
  [{ name: 'ПДФО', amount: 5000 }, { name: 'Плановий аванс', amount: 15000 }, { name: 'Виплата', amount: 15000 }]
);
assertCloseTo(caseD.currentNet, 25000, 0.01, 'Case D Net: 30000 - 5000 = 25000 (> 0)');
assertCloseTo(caseD.currentBalance, -5000, 0.01, 'Case D Balance: 25000 - 30000 = -5000 (< -1)');
assert(caseD.isNegativeWarning === true, 'Case D: Positive net with negative balance triggers warning (Defect 5 resolved)');

// Verify responsive summary grid in AddPayslipView markup
assert(indexHtml.includes('grid grid-cols-2 md:grid-cols-4'), 'AddPayslipView renders responsive summary grid for desktop and mobile');


// ----------------------------------------------------
// AREA 7: Year Fallback in DashboardView
// ----------------------------------------------------
console.log('\n--- AREA 7: Year Fallback in DashboardView ---');
const dashboardSource = indexHtml.match(/const DashboardView = \(\) => \{([\s\S]*?)const renderTableRows =/);
assert(Boolean(dashboardSource), 'Found DashboardView in index.html');
if (dashboardSource) {
  const code = dashboardSource[1];
  assert(code.includes("aYears[0] ? aYears[0].toString() : 'all'") || code.includes("availableYears[0] || 'all'") || code.includes("availableYears[0]"), 'DashboardView includes fallback to available years (aYears[0] / all)');
}


// ----------------------------------------------------
// AREA 8: NBU Exchange Rates Architecture & liveRate Dependency
// ----------------------------------------------------
console.log('\n--- AREA 8: NBU Exchange Rates Architecture ---');
const exchangeHookSource = indexHtml.match(/const useExchangeRates = \([\s\S]*?\{([\s\S]*?)\n    \};/);
assert(Boolean(exchangeHookSource), 'Found useExchangeRates hook');
if (exchangeHookSource) {
  const hookCode = exchangeHookSource[1];
  assert(hookCode.includes('Promise.allSettled'), 'Historical rates fetch uses Promise.allSettled for parallel execution');
  assert(hookCode.includes('getFetchSignal'), 'Uses getFetchSignal with timeout');
}

// Fallback logic check in summaryData
const summaryDataSource = indexHtml.match(/const summaryData = useMemo\(\(\) => \{([\s\S]*?)\}, \[dbData/);
if (summaryDataSource) {
  const code = summaryDataSource[1];
  assert(code.includes('historicalRates[month.id] || liveRate || 41.5'), 'SummaryData uses fallback chain: historicalRates -> liveRate -> 41.5');
}

// Check that summaryData includes liveRate in its useMemo dependencies
assert(/\[dbData,\s*historicalRates,\s*liveRate,\s*smoothingMode\]/.test(indexHtml), 'summaryData useMemo dependency array includes liveRate');


// ----------------------------------------------------
// AREA 9: Real Smoothed Net Pay Execution from index.html
// ----------------------------------------------------
console.log('\n--- AREA 9: Real Smoothed Net Pay Execution ---');
function getRealSummaryDataExecutor() {
  const match = indexHtml.match(/const summaryData = useMemo\(\(\) => \{([\s\S]*?)\}, \[dbData, historicalRates/);
  if (!match) throw new Error('summaryData logic not found in index.html');
  const classMatch = indexHtml.match(/const classifyDeduction = ([\s\S]*?\n    \};)/);
  const classFn = classMatch ? classMatch[0] : '';
  const getMilitaryTaxRate = (y, m) => (y < 2024 || (y === 2024 && m < 12)) ? 0.015 : 0.05;
  const formatCurrency = (val) => String(val);
  return new Function('dbData', 'historicalRates', 'liveRate', 'smoothingMode', 'formatCurrency', 'getMilitaryTaxRate', `
    ${classFn}
    ${match[1]}
  `);
}

const executeSummaryData = getRealSummaryDataExecutor();

// Simulate scenario: July has vacation advance for August (15,000). August takes vacation.
const simMonths = [
  {
    id: '2026-08',
    month: 8,
    year: 2026,
    monthName: 'Серпень',
    accruals: [
      { name: 'Посадовий оклад', amount: 27178.29, days: 12, hours: '96:30' },
      { name: 'Щорічна відпуст', amount: 26154.30, days: 10, hours: '64:45' }
    ],
    deductions: [
      { name: 'Податок з доходів', amount: 16057.21 },
      { name: 'Військовий збір', amount: 4460.34 },
      { name: 'Плановий аванс', amount: 10050.00 },
      { name: 'Виплачено відпускні', amount: 19877.00 }, // same-month vacation payout
      { name: 'Перерахування до банку', amount: 21360.00 }
    ]
  },
  {
    id: '2026-07',
    month: 7,
    year: 2026,
    monthName: 'Липень',
    accruals: [
      { name: 'Посадовий оклад', amount: 47562.00, days: 23, hours: '183:30' }
    ],
    deductions: [
      { name: 'Податок з доходів', amount: 13614.91 },
      { name: 'Військовий збір', amount: 3781.92 },
      { name: 'Плановий аванс', amount: 10050.00 },
      { name: 'Виплачено відпускні', amount: 15000.00 }, // advance for August vacation
      { name: 'Перерахування до банку', amount: 22000.00 }
    ]
  }
];

const smoothedOutputs = executeSummaryData(simMonths, {}, 41.5, 'smoothed', String, (y, m) => 0.05);
const augustResult = smoothedOutputs.find(m => m.id === '2026-08');
const julyResult = smoothedOutputs.find(m => m.id === '2026-07');

// July paid 15,000 ahead, so July smoothed net pay is reduced by 15,000
assertCloseTo(julyResult.netPay, julyResult.rawNetPay - 15000, 0.01, 'July smoothed net pay reduced by 15,000 vacation advance');
// August receives the 15,000 rollover from July
assertCloseTo(augustResult.netPay, augustResult.rawNetPay + 15000, 0.01, 'August smoothed net pay receives 15,000 rollover from July');
// August had vacation in August, so August same-month vacation payout is NOT deducted
assert(augustResult.hasVacation === true, 'August hasVacation detected correctly');

// Non-consecutive months (diffMonths !== 1) do not roll over
const nonConsecutiveMonths = [
  { ...simMonths[0], id: '2026-10', month: 10 },
  simMonths[1] // month 7
];
const nonConsecutiveOutputs = executeSummaryData(nonConsecutiveMonths, {}, 41.5, 'smoothed', String, (y, m) => 0.05);
const octResult = nonConsecutiveOutputs.find(m => m.id === '2026-10');
assert(octResult.netPay === octResult.rawNetPay, 'Non-consecutive month does not receive rollover advance');

// Sick leave exclusion check
const sickMonth = [
  {
    id: '2026-06', month: 6, year: 2026, monthName: 'Червень',
    accruals: [{ name: 'Оклад', amount: 40000, days: 20 }],
    deductions: [{ name: 'Виплачено лікарняні', amount: 5000 }]
  },
  {
    id: '2026-05', month: 5, year: 2026, monthName: 'Травень',
    accruals: [{ name: 'Оклад', amount: 40000, days: 20 }],
    deductions: [{ name: 'Виплачено лікарняні', amount: 5000 }]
  }
];
const sickOutputs = executeSummaryData(sickMonth, {}, 41.5, 'smoothed', String, (y, m) => 0.05);
assert(sickOutputs[0].netPay === sickOutputs[0].rawNetPay, 'Sick leave payouts are strictly excluded from advance rollover');


// ----------------------------------------------------
// AREA 10: Vacation Calculator Complete Removal & Seniority Rate
// ----------------------------------------------------
console.log('\n--- AREA 10: Vacation Calculator Complete Removal & Seniority Rate ---');

// Vacation calculator removed cleanly
assert(!indexHtml.includes('VacationCalculatorView'), 'VacationCalculatorView is completely removed from index.html');
assert(!indexHtml.includes("handleTabChange('vacation')"), 'Vacation tab navigation is completely removed from index.html');
assert(!indexHtml.includes('Калькулятор відпустки'), 'Vacation calculator label is completely removed from index.html');

// Verify hourlyRate calculation includes non-energy seniority allowance (Defect 8 resolved)
const simSeniorityMonth = [
  {
    id: '2026-08', month: 8, year: 2026, monthName: 'Серпень',
    accruals: [
      { name: 'Посадовий оклад', amount: 30000, hours: '150:0' },
      { name: 'Надбавка за вислугу років', amount: 6000 }
    ],
    deductions: []
  }
];
const senioritySummaryResult = executeSummaryData(simSeniorityMonth, {}, 41.5, 'raw', String, (y, m) => 0.05);
// hourlyRate = (30000 + 6000) / 150 = 240
assertCloseTo(senioritySummaryResult[0].hourlyRate, 240, 0.01, 'hourlyRate includes non-energy seniority allowance (Defect 8 resolved)');


// ----------------------------------------------------
// AREA 11: Privacy Mode Coverage
// ----------------------------------------------------
console.log('\n--- AREA 11: Privacy Mode Coverage ---');
assert(indexHtml.includes('<PrivacyText text={formatCurrency(seasonalityInsights.best.average)} />'), 'DashboardView: seasonality best average wrapped in PrivacyText');
assert(indexHtml.includes('<PrivacyText text={formatCurrency(seasonalityInsights.worst.average)} />'), 'DashboardView: seasonality worst average wrapped in PrivacyText');
assert(indexHtml.includes('{activeMonthData.taxWarnings.map((w, i) => <li key={i}><PrivacyText text={w} /></li>)}'), 'PayslipView: taxWarnings wrapped in PrivacyText to protect sensitive tax amounts (Defect 7 resolved)');


// ----------------------------------------------------
// AREA 12: UI Enhancements, Exchange Rate Closure & Multi-sheet Batch Ingestion
// ----------------------------------------------------
console.log('\n--- AREA 12: UI Enhancements, Exchange Rates & Multi-sheet Batch Ingestion ---');
assert(/<input[^>]+type="file"[^>]+multiple/.test(indexHtml), 'AddPayslipView file input has multiple attribute for multi-file upload');
assert(indexHtml.includes('extractSlipsFromWorkbook'), 'AddPayslipView supports multi-sheet Excel workbooks');
assert(indexHtml.includes('renderTableRows'), 'DashboardView renders responsive renderTableRows');
assert(!indexHtml.includes('ROW_HEIGHT = 74'), 'ROW_HEIGHT = 74 virtual windowing constant removed');
assert(!indexHtml.includes('virtualItems'), 'virtualItems scroll calculation removed in favor of native DOM rows');

// Stale closure prevention in useExchangeRates (Defect 10 resolved)
assert(indexHtml.includes('setHistoricalRates(prev => ({ ...prev, ...resolvedRates }))'), 'useExchangeRates uses functional state update to prevent stale closures (Defect 10 resolved)');

// Batch upload error isolation and chronological sort (Defect 11 & 13 resolved)
assert(indexHtml.includes('failedFilesCount++'), 'Batch upload isolates per-file exceptions with try/catch (Defect 11 resolved)');
assert(indexHtml.includes('newSlips.sort((a, b) => a.id.localeCompare(b.id))'), 'Batch upload sorts new slips chronologically before selecting active month (Defect 13 resolved)');

// Test multi-sheet workbook parsing in memory
const multiSheetWb = XLSX.utils.book_new();
const sheet1Data = [
  ['Розрахунковий лист за 04.2026'],
  ['Посадовий оклад', 40000, 'ПДФО', 7200],
  ['Разом нараховано - 40000', null, 'Разом утримано - 7200']
];
const sheet2Data = [
  ['Розрахунковий лист за 05.2026'],
  ['Посадовий оклад', 42000, 'ПДФО', 7560],
  ['Разом нараховано - 42000', null, 'Разом утримано - 7560']
];
XLSX.utils.book_append_sheet(multiSheetWb, XLSX.utils.aoa_to_sheet(sheet1Data), 'Квітень 2026');
XLSX.utils.book_append_sheet(multiSheetWb, XLSX.utils.aoa_to_sheet(sheet2Data), 'Травень 2026');

let extractedCount = 0;
for (const sName of multiSheetWb.SheetNames) {
  const ws = multiSheetWb.Sheets[sName];
  const r = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const p = ParserModule.parseGrid(r);
  if (p.success && p.period) extractedCount++;
}
assert(extractedCount === 2, 'Multi-sheet workbook parsing successfully extracts both monthly sheets');


// ----------------------------------------------------
// Final Summary
// ----------------------------------------------------
console.log('\n====================================================');
console.log(` Test Suite Complete: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
