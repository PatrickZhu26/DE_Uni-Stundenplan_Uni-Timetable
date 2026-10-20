const days=['周一','周二','周三','周四','周五','周六','周日'];
const german=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const colors=['#2479d8','#7b5bbf','#d97724','#169e90','#c45398','#4266a9','#6b8e36'];
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const date=s=>new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,Number(s.slice(8,10)),12);
const addDays=(s,n)=>{const d=date(s);d.setDate(d.getDate()+n);return fmt(d);};
const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()-(x.getDay()+6)%7);return fmt(x);};
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const time=n=>pad(Math.floor(n/60))+':'+pad(n%60);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=2100&&fmt(date(s))===s;
const validTime=s=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
const defaultView=()=>({start:'08:00',end:'20:00',days:[0,1,2,3,4]});
const validView=v=>v&&validTime(v.start)&&validTime(v.end)&&v.start<v.end&&Array.isArray(v.days)&&v.days.length>0&&v.days.every(x=>Number.isInteger(x)&&x>=0&&x<7);
const blank=(day=0,from=fmt(new Date()))=>({id:'',day,title:'',type:'Vorlesung',start:'08:15',end:'09:45',from,to:addDays(from,180),room:'',building:'',teacher:'',note:'',color:0});
function normalize(c){if(!c||typeof c!=='object')throw Error('课程数据无效');const f={...blank(),...c};['title','type','room','building','teacher','note'].forEach(k=>{if(typeof f[k]!=='string')throw Error('课程文字字段无效');f[k]=f[k].trim();});if(!f.title||f.title.length>300||f.note.length>5000||!Number.isInteger(f.day)||f.day<0||f.day>6||!validTime(f.start)||!validTime(f.end)||f.start>=f.end||!validDate(f.from)||!validDate(f.to)||f.from>f.to)throw Error('请核对课程名称、星期和日期时间范围');f.id=typeof f.id==='string'&&f.id?f.id:uid();f.color=Number.isInteger(f.color)&&f.color>=0&&f.color<colors.length?f.color:0;return f;}
function normalizeAll(items){if(!Array.isArray(items)||items.length>500)throw Error('最多支持500个课时');const out=items.map(normalize);const ids=new Set();out.forEach(c=>{if(ids.has(c.id))c.id=uid();ids.add(c.id);});return out;}
const overlap=(a,b)=>a.id!==b.id&&a.day===b.day&&a.start<b.end&&b.start<a.end&&a.from<=b.to&&b.from<=a.to;
function conflicts(items){const ids=new Set();items.forEach((a,i)=>items.slice(i+1).forEach(b=>{if(overlap(a,b)){ids.add(a.id);ids.add(b.id);}}));return ids;}
function layout(items,start,end){const a=minute(start),b=minute(end),shown=items.filter(c=>minute(c.start)<b&&minute(c.end)>a).sort((x,y)=>x.start.localeCompare(y.start)||x.end.localeCompare(y.end));const groups=[];let group=[],until=-1;shown.forEach(c=>{if(group.length&&minute(c.start)>=until){groups.push(group);group=[];until=-1;}group.push(c);until=Math.max(until,minute(c.end));});if(group.length)groups.push(group);const blocks=[];let maxColumns=1;const ids=conflicts(shown);groups.forEach(g=>{const ends=[],lanes={};g.forEach(c=>{let lane=ends.findIndex(n=>n<=minute(c.start));if(lane<0)lane=ends.length;ends[lane]=minute(c.end);lanes[c.id]=lane;});maxColumns=Math.max(maxColumns,ends.length);g.forEach(c=>blocks.push({...c,conflict:ids.has(c.id),courseColor:colors[c.color],top:(Math.max(a,minute(c.start))-a)*100/60,height:(Math.min(b,minute(c.end))-Math.max(a,minute(c.start)))*100/60,leftPct:lanes[c.id]*100/ends.length,widthPct:100/ends.length}));});return {blocks,maxColumns,width:Math.max(230,maxColumns*230)};}
const emptyState=()=>({version:2,courses:[],meta:{school:'',semester:'',state:''},baseline:null,view:defaultView(),holiday:{state:'',local:[],custom:[],skipDE:true,skipCN:false},updatedAt:''});
module.exports={days,german,colors,pad,fmt,date,addDays,monday,minute,time,validDate,validTime,clone,uid,defaultView,validView,blank,normalize,normalizeAll,overlap,conflicts,layout,emptyState};
