const cloud=require('wx-server-sdk');const crypto=require('crypto');const {parsePDF}=require('./parser');const {fetchPublic,MAX}=require('./fetch');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
function forLegacyClient(result){
 // Earlier mini-program builds know how to hide specific dates, but not whole alternate weeks.
 for(const course of result.courses){
  if(!course||!Number.isInteger(course.weekInterval)||course.weekInterval<2||course.weekInterval>52)continue;
  const first=Date.parse(course.from);
  const last=Date.parse(course.to);
  const dayOffset=(course.day-(new Date(first).getUTCDay()+6)%7+7)%7;
  const cancelled=new Set(course.cancelledDates||[]);
  for(let date=first+dayOffset*86400000,week=0;date<=last;date+=604800000,week++){
   if(week%course.weekInterval!==0)cancelled.add(new Date(date).toISOString().slice(0,10));
   if(cancelled.size>2000)throw Error('课表日期范围过长，请导出一个学期的课表');
  }
  course.cancelledDates=[...cancelled].sort();
 }
 return result;
}
exports.main=async(event={})=>{try{const {OPENID}=cloud.getWXContext();if(!OPENID)throw Error('请从小程序中调用');const prefix='schedule/'+OPENID+'/';
 if(event.action==='transcriptTicket'){const ext=event.kind==='pdf'?'pdf':'jpg';return {cloudPath:'transcripts/'+OPENID+'/'+crypto.randomBytes(16).toString('hex')+'.'+ext};}
 if(event.action==='transcript'){if(typeof event.fileID!=='string'||!event.fileID.startsWith('cloud://')||!event.fileID.includes('/transcripts/'+OPENID+'/'))throw Error('只能识别本人上传的成绩单');const buffer=(await cloud.downloadFile({fileID:event.fileID})).fileContent;if(buffer.length>7*1024*1024)throw Error('成绩单最大7MB');const pdf=buffer.slice(0,5).toString()==='%PDF-';const image=buffer[0]===0xff&&buffer[1]===0xd8||buffer[0]===137&&buffer.slice(1,4).toString()==='PNG'||buffer.slice(0,2).toString()==='BM';if(!pdf&&!image)throw Error('请使用PDF、JPG或PNG成绩单');return await require('./transcript').parseTranscript(buffer,pdf?'pdf':'image');}
 if(event.action==='uploadTicket'){
  const extension=event.kind==='ics'?'.ics':'.pdf';
  return {cloudPath:prefix+crypto.randomBytes(16).toString('hex')+extension};
 }
 let buffer;
 let sourceHost='';
 if(event.fileID){
  if(typeof event.fileID!=='string'||!event.fileID.startsWith('cloud://')||!event.fileID.includes('/'+prefix))throw Error('只能识别本人上传的临时课表');
  buffer=(await cloud.downloadFile({fileID:event.fileID})).fileContent;
 }else if(typeof event.url==='string'&&event.url.length<=4096){
  buffer=await fetchPublic(event.url);
  sourceHost=new URL(event.url).hostname;
 }else throw Error('请选择 PDF / ICS 文件，或填写学校的 HTTPS 导出链接');

 if(buffer.length>MAX)throw Error('课表文件不能超过16MB');
 let result;
 if(buffer.subarray(0,5).toString()==='%PDF-')result=await parsePDF(buffer);
 else{
  const text=buffer.toString('utf8').trim();
  const calendar=require('./calendar');
  if(!calendar.calendarText(text)){
   if(!sourceHost)throw Error('所选文件不是有效的 PDF 或 iCalendar（ICS）文件');
   throw Error('链接返回的是网页或其他格式。请复制学校导出的 PDF / ICS 下载链接，或先下载文件再导入。');
  }
  result=calendar.parseCalendar(text,sourceHost);
 }
 return event.supportsWeekInterval===true||result.adapter==='own-pdf-backup'?result:forLegacyClient(result);
 }catch(e){
  if(typeof event.url==='string'){
   console.error('课表链接识别失败',e.code||e.name);
   return {courses:[],error:e.message||'课表链接识别失败，请重试'};
  }
  console.error('parseSchedule:',e.stack||e.message);
  return {courses:[],error:e.message||'识别失败，请重试',diagnostic:{runtime:process.version,stack:e.stack}};
 }};
