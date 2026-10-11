// Keep current and two recent release blockmaps on the backup feed.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const repo=process.env.GITHUB_REPOSITORY;if(!repo)throw Error('Missing GITHUB_REPOSITORY');
fs.mkdirSync('docs/updates',{recursive:true});
const tags=JSON.parse(execFileSync('gh',['release','list','--repo',repo,'--limit','5','--json','tagName,isDraft,isPrerelease'],{encoding:'utf8'})).filter(r=>!r.isDraft&&!r.isPrerelease).slice(0,3);
for(const release of tags)execFileSync('gh',['release','download',release.tagName,'--repo',repo,'--pattern','*.blockmap','--dir','docs/updates','--clobber'],{stdio:'inherit'});
