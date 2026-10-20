// Mini-programs expose chat files, not a general iOS/Android Files picker.
function localHelp(openChat){wx.showModal({title:'📁 手机本地 PDF',content:'微信小程序目前不能直接打开手机系统“文件”选择器。\n\n1. 打开手机“文件”App，找到PDF。\n2. 点击分享 → 微信 → 文件传输助手（或自己的聊天）。\n3. 返回本小程序，从微信聊天中选择刚发送的PDF。\n\n这是微信小程序接口限制，并非缺少手机存储权限。无法通过“授权访问手机”打开系统文件列表，也无需去手机设置反复授权。',confirmText:'从聊天选择',cancelText:'稍后操作',success:r=>{if(r.confirm)openChat();}});}
function choose(openChat){wx.showActionSheet({itemList:['💬 微信聊天中的 PDF','📁 本地 PDF：先分享到微信'],success:r=>{if(r.tapIndex===0)openChat();else if(r.tapIndex===1)localHelp(openChat);}});}
module.exports={choose,localHelp};
