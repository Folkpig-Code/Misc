const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
let rows=[], created=false;
const cacheStore={};
const mkRange=(r,c,n,m)=>({setValues:function(v){v.forEach((x,i)=>rows[r-2+i]=x);return this},getValues:()=>rows.slice(r-2,r-2+n),setNumberFormat(){return this},setFontWeight(){return this}});
const sheet={getLastRow:()=>rows.length+1,getRange:mkRange,setFrozenRows(){}};
const ctx={console,Date,Math,JSON,Number,String,Object,Array,isFinite,
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>created?sheet:null,insertSheet:()=>{created=true;return sheet}}),flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 CacheService:{getScriptCache:()=>({get:k=>cacheStore[k]||null,put:(k,v)=>{cacheStore[k]=v}})},
 Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=>'2026103010',computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:1},base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},
 HtmlService:{}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('../work/Code.gs','utf8'),ctx);
const base={name:'Test',contact:'a@b.ch',acceptedPayment:true,elapsed:10,items:[{id:'P01',qty:2},{id:'P03',qty:1}]};
const run=(o)=>ctx.submitOrder(Object.assign({},base,o));
console.log('empty sheet', ctx.getAppData().boxes, 'tab created on read?', created);
let r=run({});console.log('ok order',r.ok,r.total,r.boxes);
console.log('inj', run({name:'=1+1',contact:'x@y.ch'}).ok, rows[rows.length-1][2]);
console.log('hidden', run({contact:'c@d.ch',items:[{id:'P09',qty:1}]}).error);
console.log('neg/decimal/str', run({contact:'e@f.ch',items:[{id:'P01',qty:-1},{id:'P02',qty:'abc'},{id:'P03',qty:1.9}]}).total);
console.log('huge', run({contact:'g@h.ch',items:[{id:'P01',qty:1e9}]}).error);
console.log('dupes', run({contact:'i@j.ch',items:[{id:'P01',qty:15},{id:'P01',qty:15}]}).error);
console.log('bot honeypot rows before/after', rows.length, run({website:'x',contact:'k@l.ch'}).ok, rows.length);
console.log('too fast', run({elapsed:1,contact:'m@n.ch'}).ok, rows.length);
console.log('bad contact', run({contact:'12'}).error);
console.log('no accept', run({acceptedPayment:'true',contact:'o@p.ch'}).error);
for(let i=0;i<6;i++){r=run({contact:'rate@x.ch'})}console.log('rate',r.error);
console.log('null form', ctx.submitOrder(null).error);
console.log('phone', run({contact:'+41 79 123 45 67'}).ok);
console.log('tracker', ctx.getAppData().boxes, 'rows', rows.length);
