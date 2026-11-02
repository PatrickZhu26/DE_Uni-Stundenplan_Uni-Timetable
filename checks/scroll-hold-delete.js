const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),M=require('../miniprogram/utils/model');
let p,modal,tick,cancelled=0,writes=0;const wx={showModal:o=>modal=o,showToast:()=>{},getStorageSync:()=>undefined,setStorageSync:k=>{if(k==='stundenplan_complete_v2')writes++;},createSelectorQuery:()=>({in(){return this;},selectAll(){this.all=true;return this;},select(){this.all=false;return this;},boundingClientRect(cb){this.cb=cb;return this;},exec(){this.cb(this.all?[{left:62,right:292,top:100,bottom:1300},{left:292,right:522,top:100,bottom:1300}]:{left:0,right:320,width:320,top:50,bottom:1000});}})};
const root=path.resolve(__dirname,'../miniprogram/pages/index');vm.runInNewContext(fs.readFileSync(path.join(root,'index.js'),'utf8'),{Page:x=>p=x,require:s=>require(path.resolve(root,s)),wx,console,Date,setTimeout,setInterval:f=>(tick=f,1),clearInterval:()=>cancelled++});p.data=JSON.parse(JSON.stringify(p.data));const patches=[];p.setData=function(patch){patches.push(patch);for(const[k,v]of Object.entries(patch)){const a=k.split('.');let d=this.data;for(const x of a.slice(0,-1))d=d[x];d[a.at(-1)]=v;}};
p.data.weekStart='2026-10-19';const first=M.normalize({...M.blank(0,'2026-10-19'),id:'held',title:'保留取消课程',note:'作业'}),other=M.normalize({...first,id:'other',title:'其他课程'});p.data.courses=[first,other];p.refresh();
const start=(x=120)=>p.dragStart({currentTarget:{dataset:{id:'held'}},touches:[{clientX:x,clientY:200}]}),end=(x=120,y=200)=>p.dragEnd({changedTouches:[{clientX:x,clientY:y}]});
// Inline content scrolls directly; only active course dragging captures touch moves.
const wxml=fs.readFileSync(path.join(root,'index.wxml'),'utf8');assert(wxml.includes('capture-catch:touchmove="{{dragging?\'dragMove\':\'\'}}"'));assert(wxml.includes('bindtouchmove="dragMove"'));assert(wxml.includes('scroll-y="{{!dragging}}"'));assert(!wxml.includes('card-read-toggle'));assert(!wxml.includes(' catchtouchmove="dragMove"'));
p.cardTouchStart({touches:[{clientX:120,clientY:200}]});const before=patches.length;p.dragMove({touches:[{clientX:122,clientY:280}]});assert.equal(p._cardTouch.axis,'y');assert.equal(patches.length,before,'ordinary vertical movement must be left to native page scrolling');p.dragEnd();assert(!modal);assert.equal(writes,0);

start();end();assert.equal(modal.title,'是否删除这个课程？');assert.equal(p.data.courses.length,2);modal.success({confirm:false});assert.equal(p.data.courses.length,2);assert.equal(writes,0);assert.equal(p._edgeTimer,null);
// Minor finger tremor is a hold; a hold at the edge must not auto-scroll.
start(315);tick();assert.equal(p.data.gridScrollLeft,0);end(312,202);assert.equal(modal.title,'是否删除这个课程？');modal.success({confirm:false});
// A dragged-away-and-back gesture must never become delete.
start();p.dragMove({touches:[{clientX:150,clientY:220}]});end();assert.notEqual(modal.title,'是否删除这个课程？');assert.equal(p.data.courses.length,2);
// Cancellation and hiding cannot prompt or delete.
modal=null;start();p.dragCancel();assert.equal(modal,null);assert.equal(p.data.courses.length,2);
// Only explicit confirmation deletes exactly the held recurring record.
start();end();modal.success({confirm:true});assert.equal(p.data.courses.length,1);assert.equal(p.data.courses[0].id,'other');assert.equal(writes,1);assert(cancelled>=5);
console.log('PASS: native inline reader and unblocked touch bindings; stationary/jitter/edge holds, move-away-and-back, cancellation, and confirmation-only scoped deletion');
