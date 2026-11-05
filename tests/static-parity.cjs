const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),original=require('../src/compliance/lib/data'),engine=require('../src/compliance/lib/engine');
const context={window:{},URL,console};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'dist/core.js'),'utf8'),context);
const local=context.window.LocalCore;
const normalize=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(normalize(local.data.bootstrap().counts),original.bootstrap().counts);
let count=0;
for(const item of original.table('典型业务测试案例')){
 assert.deepEqual(normalize(local.engine.evaluateRules(item.input,local.data.table('法规条件与义务规则'))),normalize(engine.evaluateRules(item.input,original.table('法规条件与义务规则'))),item.case_id);
 assert.deepEqual(normalize(local.engine.calculateTaxes(item.input)),normalize(engine.calculateTaxes(item.input)),item.case_id+' taxes');count++;
}
for(const query of [{market:'DE',q:''},{market:'SG',q:'GST'},{market:'MY',q:''}])assert.deepEqual(normalize(local.data.searchPolicies(query)),normalize(original.searchPolicies(query)));
console.log(`PASS: ${count} scenarios: browser/static rule and tax parity; 3 regulatory searches; bootstrap counts.`);
