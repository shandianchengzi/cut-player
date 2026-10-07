const {test}=require('node:test');const assert=require('node:assert/strict');const {defaults,chord,format,validate}=require('../app/model.cjs');
test('timestamp preserves milliseconds and long hours',()=>{assert.equal(format(3661.234),'01:01:01.234');assert.equal(format(360000),'100:00:00.000');});
test('shortcuts normalize case',()=>assert.equal(chord({key:'v',ctrlKey:true,altKey:true}),'Ctrl+Alt+V'));
test('config rejects duplicate keys and unsupported speeds',()=>{assert.ok(validate(defaults));assert.ok(!validate({...defaults,speeds:[1,2,4,17]}));assert.ok(!validate({...defaults,keys:{...defaults.keys,copy:defaults.keys.stamp}}));});
