// Diagnostic probes for the 2026-10-21 audit, not a replacement regression suite.
// Uses synthetic data only. Run: node docs/audit-2026-10-21-reproduce.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function between(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert(a >= 0 && b > a, `Extraction failed: ${start}`);
  return html.slice(a, b);
}
const validate = new Function(between('const validateImportedPayslips =', 'const Layout =') + '; return validateImportedPayslips;')();
const base = { id: '2026-01', month: 1, year: 2026, monthName: 'Січень', accruals: [{ name: 'Посадовий оклад', amount: 1000 }], deductions: [] };
for (const [label, data] of [
  ['non-finite amount', [{ ...base, accruals: [{ name: 'Посадовий оклад', amount: 'Infinity' }] }]],
  ['invalid period', [{ ...base, id: '2026-99', month: 99 }]],
  ['duplicate months', [base, base]],
  ['empty backup exported by empty database', []]
]) console.log(label, validate(data));

const summaryBody = html.match(/const summaryData = useMemo\(\(\) => \{([\s\S]*?)\}, \[dbData, historicalRates/)[1];
const summaryFn = new Function('dbData', 'historicalRates', 'liveRate', 'smoothingMode', 'formatCurrency', 'getMilitaryTaxRate', summaryBody);
const summarize = data => summaryFn(data, {}, null, 'raw', String, () => 0.05);
const negative = summarize([{ ...base, accruals: [{ name: 'Посадовий оклад', amount: -1000 }] }])[0];
console.log('negative adjustment', { accrued: negative.totalAccrued, earnedNetPay: negative.earnedNetPay, rawNetPay: negative.rawNetPay });
const unpaid = summarize([base])[0];
console.log('no explicit payment', { explicitBankSum: unpaid.explicitBankSum, inferredBank: unpaid.toBank, rawNetPay: unpaid.rawNetPay });

const oldDeduction = { name: 'Податок з доходів', amount: 180 };
let deductions = [oldDeduction], accruals = [];
const previewBody = between('const confirmParserPreview = () => {', 'const handleFormSubmit =');
new Function('parserPreviewData', 'setAccruals', 'setDeductions', 'setMonthIdx', 'setYear', 'setPastedText', 'markDirty', 'setParserPreviewData', 'showToast', previewBody + '; confirmParserPreview();')(
  { accruals: base.accruals, deductions: [], period: null }, value => { accruals = value; }, value => { deductions = value; }, ...Array(6).fill(() => {})
);
console.log('preview with empty deductions retains old row', deductions[0] === oldDeduction);

let state, disk, storageFails = false;
const hook = new Function('useState', 'window', 'CustomEvent', 'console', between('const useLocalStorage =', 'const getFetchSignal =') + '; return useLocalStorage;')(
  init => { state = init(); return [state, value => { state = value; }]; },
  { localStorage: { getItem: () => null, setItem: (key, value) => { if (storageFails) throw Error('quota'); disk = value; } }, dispatchEvent: () => {} },
  class CustomEvent {}, { error: () => {} }
);
const [, update] = hook('salaryHubData', []);
update(prev => [...prev, 'A']); update(prev => [...prev, 'B']);
console.log('two queued functional updates', { expected: ['A', 'B'], actual: state });
storageFails = true; update(['UNSAVED']);
console.log('failed persistence diverges from UI', { state, disk: JSON.parse(disk) });

const MONTH_NAMES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const parser = new Function('generateId', 'MONTH_NAMES', between('const ParserModule =', 'class WidgetErrorBoundary') + '; return ParserModule;')(() => 'synthetic', MONTH_NAMES);
const mismatch = parser.parseGrid([['за 01.2026'], ['Посадовий оклад', 1000], ['Разом нараховано - 2000']]);
console.log('parser success despite mismatched total', { success: mismatch.success, parsed: mismatch.accruals.reduce((s, a) => s + a.amount, 0), control: mismatch.totalAccruedControl });
