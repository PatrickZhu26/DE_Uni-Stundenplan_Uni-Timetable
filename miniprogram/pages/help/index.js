const guide=require('./guide');
const Study=require('../../utils/study');
Page({data:{guide},onLoad(){this.setData(Study.layoutContext(wx));},onShow(){this.setData(Study.layoutContext(wx));},onResize(e){this.setData(Study.layoutContext(wx,e&&e.size&&e.size.windowWidth));},back(){wx.navigateBack();}});
