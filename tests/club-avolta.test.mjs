import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] || 'index.html';
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf("const RC_BI_SPECIAL_REPORT_TYPE_ID='13';");
const end = source.indexOf('async function applyReportingCompliance', start);

assert.notEqual(start, -1, 'ClubAvolta helpers are missing');
assert.notEqual(end, -1, 'Reporting compliance function is missing');

const testSource = `
const rcNorm=value=>String(value??'')
  .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
  .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
${source.slice(start, end)}
const index=rcBuildClubAvoltaSubmissionIndex([
  {activity_date:'2026-10-14',promoter_id:11484,store_id:32466},
  {activity_date:'2026-10-13',source_promoter:'René Test',source_store:'Zürich L2'}
]);
globalThis.results={
  exact:rcHasClubAvoltaSubmission({day:'2026-10-14',promoter_id:11484,pos_id:32466},index),
  normalized:rcHasClubAvoltaSubmission({day:'2026-10-13',promoter_fullname:'Rene Test',pos:'Zurich L2'},index),
  wrongStore:rcHasClubAvoltaSubmission({day:'2026-10-14',promoter_id:11484,pos_id:48},index),
  batchBoundary:rcAddUtcDays('2025-05-01',369)
};`;

const context = {};
vm.runInNewContext(testSource, context, {filename:file});
assert.equal(context.results.exact, true);
assert.equal(context.results.normalized, true);
assert.equal(context.results.wrongStore, false);
assert.equal(context.results.batchBoundary, '2026-05-05');
console.log(`${file}: ClubAvolta matching tests passed`);

