// 微信开发者工具默认创建 Node.js 16 云函数；仅补齐 PDF.js 文本解析需要的标准全局。
// Node.js 18/20 中已有的实现保持原样。
if (typeof globalThis.DOMException === 'undefined') {
  const codes={IndexSizeError:1,HierarchyRequestError:3,WrongDocumentError:4,InvalidCharacterError:5,NoModificationAllowedError:7,NotFoundError:8,NotSupportedError:9,InUseAttributeError:10,InvalidStateError:11,SyntaxError:12,InvalidModificationError:13,NamespaceError:14,InvalidAccessError:15,TypeMismatchError:17,SecurityError:18,NetworkError:19,AbortError:20,URLMismatchError:21,QuotaExceededError:22,TimeoutError:23,InvalidNodeTypeError:24,DataCloneError:25};
  globalThis.DOMException=class DOMException extends Error {
    constructor(message='',name='Error'){super(String(message));this.name=String(name);}
    get code(){return codes[this.name]||0;}
    get [Symbol.toStringTag](){return 'DOMException';}
  };
}
if(typeof globalThis.ReadableStream==='undefined'){
  const streams=require('stream/web');
  for(const name of ['ReadableStream','WritableStream','TransformStream'])if(typeof globalThis[name]==='undefined')globalThis[name]=streams[name];
}
if(typeof globalThis.structuredClone==='undefined'){
  // PDF.js 的同线程消息包含数组、字典、Map 和二进制视图。
  // 保留二进制视图的 offset/length；不分离源缓冲区（仅牺牲转移优化）。
  globalThis.structuredClone=function(value){
    const seen=new Map();
    function copy(v){
      if(typeof v==='function'||typeof v==='symbol')throw new DOMException('Value cannot be cloned','DataCloneError');
      if(v===null||typeof v!=='object')return v;
      if(seen.has(v))return seen.get(v);
      let out;
      if(v instanceof ArrayBuffer){out=v.slice(0);seen.set(v,out);return out;}
      if(typeof SharedArrayBuffer!=='undefined'&&v instanceof SharedArrayBuffer)return v;
      if(ArrayBuffer.isView(v)){const b=copy(v.buffer);out=v instanceof DataView?new DataView(b,v.byteOffset,v.byteLength):new v.constructor(b,v.byteOffset,v.length);seen.set(v,out);return out;}
      if(v instanceof Date){out=new Date(v.getTime());seen.set(v,out);return out;}
      if(v instanceof RegExp){out=new RegExp(v.source,v.flags);seen.set(v,out);return out;}
      if(v instanceof Map){out=new Map();seen.set(v,out);for(const [k,x] of v)out.set(copy(k),copy(x));return out;}
      if(v instanceof Set){out=new Set();seen.set(v,out);for(const x of v)out.add(copy(x));return out;}
      if(v instanceof WeakMap||v instanceof WeakSet||v instanceof Promise)throw new DOMException('Value cannot be cloned','DataCloneError');
      if(v instanceof Error){out=new Error(v.message);out.name=v.name;out.stack=v.stack;seen.set(v,out);if('cause' in v)out.cause=copy(v.cause);return out;}
      out=Array.isArray(v)?new Array(v.length):{};seen.set(v,out);
      for(const key of Object.keys(v))Object.defineProperty(out,key,{value:copy(v[key]),writable:true,enumerable:true,configurable:true});
      return out;
    }
    return copy(value);
  };
}
