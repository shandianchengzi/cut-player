// Keep application licensing consistent without changing dependency or historical licenses.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
assert.equal(pkg.license,'PolyForm-Noncommercial-1.0.0','Application license must match LICENSE');
assert.equal(lock.packages[''].license,pkg.license,'Root lockfile license differs');
assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
assert.equal(crypto.createHash('sha256').update(read('LICENSE')).digest('hex'),'befa041db77c25fa8f6028908d16fde1588e5b65a3957b8630c2dda66773bbe2','Use the unmodified official PolyForm license');
for(const file of ['LICENSE','LICENSE-NOTICE.md','COMMERCIAL-LICENSE.md']){
 assert.ok(pkg.build.files.includes(file),'Missing application license file: '+file);
 assert.ok(pkg.build.extraResources.some(x=>x.from===file&&x.to==='licensing/'+file),'Missing installed license resource: '+file);
}
for(const file of ['README.md','docs/index.html','docs/DEVELOPING.md','docs/USER_GUIDE.md','THIRD_PARTY_NOTICES.md']){
 const text=read(file);assert.ok(text.includes('PolyForm Noncommercial'),'Missing current license in '+file);
 assert.ok(!/应用代码(?:采用|\s*)MIT|application source remains MIT licensed/i.test(text),'Outdated current MIT claim in '+file);
}
assert.ok(read('LICENSE-NOTICE.md').includes('Versions through v1.5.11'),'Preserve prior MIT licensing boundary');
assert.ok(read('release-notes/v'+pkg.version+'.md').trim(),'Missing release notes');
console.log('PASS: official license, application metadata, installed notices, current docs and legacy boundary');
