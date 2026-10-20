require('./node-compat');
const dayNames=['Mo','Di','Mi','Do','Fr','Sa','So'];
const dayPattern=/^(Mo|Di|Mi|Do|Fr|Sa|So)\.?[,]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/;
const tPattern=/^(\d{2}:\d{2})\s*(?:Uhr)?$/;
const dateRange=/(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/;
const iso=s=>{const [d,m,y]=s.split('.');return (y.length===2?'20'+y:y)+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');};
const clean=s=>s.replace(/\s+([,;])/g,'$1').replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ').trim();
function metaFrom(items){const text=items.map(x=>x.s).join(' ');const schools=[[/Friedrich-Alexander-Universität|\bFAU\b/i,'FAU','BY'],[/Technische Universität München|\bTUM\b/i,'TUM','BY'],[/Ludwig-Maximilians-Universität|\bLMU\b/i,'LMU','BY'],[/RWTH|Rheinisch-Westfälische Technische Hochschule/i,'RWTH Aachen','NW'],[/Karlsruher Institut für Technologie|\bKIT\b/i,'KIT','BW'],[/Technische Universität Dresden|TU Dresden/i,'TU Dresden','SN'],[/Universität zu Köln/i,'Universität zu Köln','NW'],[/Universität Stuttgart/i,'Universität Stuttgart','BW']];const known=schools.find(x=>x[0].test(text));const university=items.find(x=>/Universität|Hochschule|University|Universit[äa]t/i.test(x.s));const term=text.match(/(Wintersemester|Sommersemester|WiSe|SoSe|WS|SS)\s*(\d{4}(?:\s*[/–-]\s*\d{2,4})?)/i);return {school:known?known[1]:university?university.s.trim():'',semester:term?((/Winter|WiSe|WS/i.test(term[1])?'Wintersemester ':'Sommersemester ')+term[2].replace(/\s/g,'')):'',state:known?known[2]:''};}
function parseItems(pages){const courses=[],warnings=[];let seq=0;
 for(const items of pages){let currentDay=-1;const pairs=[];
  for(let i=0;i<items.length-1;i++){const dm=items[i].s.match(dayPattern);if(dm)currentDay=dayNames.indexOf(dm[1]);const a=items[i].s.match(tPattern),b=items[i+1].s.match(tPattern);if(currentDay<0||!a||!b||a[1]>=b[1]||Math.abs(items[i].y-items[i+1].y)>3)continue;
   const base=items[i].x,font=items[i].h;let begin=-1;
   for(let j=i-1;j>=Math.max(0,i-16);j--){if(dayPattern.test(items[j].s))break;if(Math.abs(items[j].x-base-font)<1.4&&!/^\s*[,;]|^\d+\.\s*PG/.test(items[j].s)){begin=j;break;}}
   if(begin<0){for(let j=i-1;j>=Math.max(0,i-10);j--){if(dayPattern.test(items[j].s)||/Durchführende|Dozent|Status:/.test(items[j].s))break;begin=j;}}
   if(begin<0)continue;pairs.push({begin,time:i,start:a[1],end:b[1],day:currentDay});i++;
  }
  pairs.forEach((p,n)=>{let stop=n+1<pairs.length?pairs[n+1].begin:items.length;for(let j=p.time+2;j<stop;j++){if(dayPattern.test(items[j].s)||/^(Einzeltermin|Erstellt am|Stundenplan für|Seite$)/.test(items[j].s)){stop=j;break;}}
   const heading=clean(items.slice(p.begin,p.time).map(x=>x.s).join(' ')).replace(/^\d+\)\s*/, '');const match=heading.match(/,\s*(Vorlesung|Übung|Tutorium|Seminar|Praktikum|Kolloquium)\b/);if(!match){warnings.push('有课程缺少可识别的类型/标题，请核对原PDF');return;}
   let title=heading.slice(0,match.index).replace(/^Vorlesung\s+/,'').trim();if(!title)return;const tail=clean(items.slice(p.time+2,stop).map(x=>x.s).join(' '));const dr=tail.match(dateRange);if(!dr){warnings.push(title+'：缺少日期范围，未自动加入');return;}
   const after=tail.slice(dr.index+dr[0].length).trim();const loc=after.split(/Status:|Durchführende/)[0].trim();const room=loc.match(/^(\d{5}\.[A-Za-z0-9]{2}\.\d{3}\s*\([^)]*\))/);const teacher=after.match(/Dozentinnen\s*\/\s*Dozenten:\s*(.*)/);const pg=heading.match(/\d+\.\s*PG/);courses.push({id:'parsed_'+seq++,day:p.day,title,type:match[1],start:p.start,end:p.end,from:iso(dr[1]),to:iso(dr[2]),room:room?room[1]:'',building:room?loc.slice(room[0].length).replace(/^\s*,\s*/,''):loc,teacher:teacher?teacher[1].replace(/\s+\d+\)\s*$/,''):'',note:pg?pg[0]:'',color:seq%7});
  });
 }
 const unique=[];const seen=new Set();courses.forEach(c=>{const key=[c.day,c.title,c.type,c.start,c.end,c.from,c.to].join('|');if(!seen.has(key)){seen.add(key);unique.push(c);}});
 return {courses:unique.sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start)),meta:metaFrom(pages.flat()),warnings:[...new Set(warnings)],adapter:'text-blocks'};
}
async function parsePDF(buffer){
 const raw=buffer.toString('latin1');const attachment=raw.match(/%STUNDENPLAN_DATA_BEGIN\s*([A-Za-z0-9+/=\r\n]+)\s*%STUNDENPLAN_DATA_END/);
 if(attachment){try{const state=JSON.parse(Buffer.from(attachment[1].replace(/\s/g,''),'base64').toString('utf8'));if(state.format==='STUNDENPLAN-v2'&&Array.isArray(state.courses))return {courses:state.courses,meta:state.meta||{},holiday:state.holiday,view:state.view,warnings:[],adapter:'own-pdf-backup'};}catch(e){throw Error('此PDF内的课表备份数据损坏');}}
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});let doc;
 try{doc=await task.promise;if(doc.numPages>30)throw Error('最多识别30页，请只上传课表相关页面');const pages=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);const text=await p.getTextContent();pages.push(text.items.filter(x=>typeof x.str==='string'&&x.str.trim()).map(x=>({s:x.str,x:x.transform[4],y:p.view[3]-x.transform[5],w:x.width,h:x.height})));}const result=parseItems(pages);result.pages=doc.numPages;if(!result.courses.length)result.warnings.push('未识别到课程。扫描件不支持；其他排版请查看提取文字并手动添加。');result.textPreview=pages.flat().map(x=>x.s).join(' ').slice(0,12000);return result;}finally{await task.destroy();}
}
module.exports={parsePDF,parseItems,metaFrom};
