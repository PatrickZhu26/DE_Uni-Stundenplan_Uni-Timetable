const config=require('./config');
App({globalData:{cloudReady:false},onLaunch(){if(wx.cloud&&config.envId){try{wx.cloud.init({env:config.envId,traceUser:false});this.globalData.cloudReady=true;}catch(e){console.error('云开发初始化失败',e);}}}});
