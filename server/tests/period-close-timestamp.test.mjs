import test from 'node:test';
import assert from 'node:assert/strict';
import { PeriodClosingVoucherController } from '../dist/packages/clouderp-core/src/period-closing-controller.js';

function context(posting_at) {
  return { command:{tenant_id:'demo',command_id:'PCV-create',aggregate:{doctype:'Period Closing Voucher',name:'PCV'},
    action:'create',actor:{user_id:'tester',roles:['Accounts Manager']},
    document:{company:'Demo',fiscal_year:'2026',closing_account:'Retained Earnings',posting_at}},
    existing:null,nextVersion:1,now:'2026-12-31T23:00:00.000Z',reader:{} };
}
for (const timestamp of ['2026-12-31BAD','2026-02-31T12:00:00Z','2026-12-31T24:00:00Z','2026-12-31T23:00:00+07:00']) {
  test('Period Closing rejects timestamp invisible or ambiguous in canonical UTC date scope: '+timestamp,async()=>{
    await assert.rejects(new PeriodClosingVoucherController().buildPlan(context(timestamp)),/valid UTC timestamp/);
  });
}
for(const timestamp of ['2026-12-31T23:59:59Z','2026-12-31T23:59:59.000Z']) {
  test('Period Closing preserves valid UTC posting time '+timestamp,async()=>{
    const plan=await new PeriodClosingVoucherController().buildPlan(context(timestamp));
    assert.equal(plan.document.data.posting_at,timestamp);
    assert.equal(plan.document.docstatus,0);
  });
}
