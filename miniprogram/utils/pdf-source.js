// Mini-programs expose chat files, not a general iOS/Android Files picker.
function localHelp(openChat, includeCalendar=false){
 const format=includeCalendar?'PDF / ICS':'PDF';
 wx.showModal({
  title:'📁 导入本地 '+format,
  content:'小程序不能直接打开系统文件选择器。\n\n1. 在手机、平板或电脑上下载 '+format+' 文件。\n2. 在微信中把文件发给文件传输助手或自己。\n3. 回到小程序，从微信聊天中选择刚发送的文件。',
  confirmText:'从聊天选择',cancelText:'稍后操作',success:r=>{if(r.confirm)openChat();}
 });
}
function choose(openChat, includeCalendar=false){
 const format=includeCalendar?'PDF / ICS':'PDF';
 wx.showActionSheet({itemList:['💬 微信聊天中的 '+format,'📁 本地 '+format+'：先分享到微信'],success:r=>{if(r.tapIndex===0)openChat();else if(r.tapIndex===1)localHelp(openChat,includeCalendar);}});
}
module.exports={choose,localHelp};
