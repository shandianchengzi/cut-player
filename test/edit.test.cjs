const {test}=require('node:test'),assert=require('node:assert/strict');
const {deleteSegment,editableSegments}=require('../app/model.cjs');
test('deletion maintains partition for first middle and final segment',()=>{const t='breakpoints:00:10,00:20\nnames:a,b,c';assert.equal(deleteSegment(t,0),'breakpoints:00:20\nnames:b,c');assert.equal(deleteSegment(t,1),'breakpoints:00:20\nnames:a,c');assert.equal(deleteSegment(t,2),'breakpoints:00:10\nnames:a,b');});
test('invalid records and last segment are protected',()=>{assert.throws(()=>deleteSegment('breakpoints:\nnames:a',0));assert.throws(()=>editableSegments('broken'));assert.throws(()=>editableSegments('breakpoints:00:20,00:10\nnames:a,b,c'));});
