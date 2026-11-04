const https = require('https');
const { Resolver } = require('dns').promises;
const net = require('net');

const MAX = 16 * 1024 * 1024;
const MAX_REDIRECTS = 8;
const LOGIN_LINK = '链接跳转到了学校登录页。请登录学校系统后，重新复制 PDF 下载链接或 iCalendar（ICS）导出链接。';

function isPublic4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) ||
    a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
    a === 203 && b === 0 && c === 113);
}

function scheduleURL(value, base) {
  let url;
  try { url = new URL(value, base); } catch (_) { throw Error('课表链接格式不正确'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw Error('仅支持可直接下载的 HTTPS 课表链接');
  }
  url.hash = '';
  return url;
}

function request(url, address, cookie, signal) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      agent: false,
      signal,
      headers: {
        'User-Agent': 'University-Timetable-Import/2.1',
        Accept: 'text/calendar, application/pdf, application/octet-stream;q=0.8, */*;q=0.1',
        ...(cookie ? { Cookie: cookie } : {})
      },
      lookup: (_hostname, options, callback) => options.all
        ? callback(null, [{ address, family: 4 }])
        : callback(null, address, 4)
    }, res => {
      const {statusCode, headers} = res;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        res.resume();
        if (!headers.location) return reject(Error('下载重定向缺少地址'));
        return resolve({location: headers.location, cookies: headers['set-cookie'] || []});
      }
      if (statusCode !== 200) {
        res.resume();
        return reject(Error([401, 403].includes(statusCode) ? LOGIN_LINK : '课表下载失败（HTTP '+statusCode+'）。请检查导出链接是否仍有效。'));
      }
      if (Number(headers['content-length']) > MAX) {
        res.resume();
        return reject(Error('课表文件不能超过16MB'));
      }
      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX) return req.destroy(Error('课表文件不能超过16MB'));
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('aborted', () => reject(Error('下载中断，请重试')));
      res.on('end', () => resolve({buffer: Buffer.concat(chunks)}));
    });
    req.on('error', reject);
  });
}

async function fetchPublic(value) {
  const { CookieJar } = require('tough-cookie');
  let url = scheduleURL(value);
  const resolver = new Resolver({timeout: 3000, tries: 2});
  const controller = new AbortController();
  const timeout = setTimeout(() => { controller.abort(); resolver.cancel(); }, 25000);
  // Keep anonymous cookies scoped to this download and the origin that issued them.
  const jars = new Map();
  const visited = new Set();
  try {
    for (let step = 0; step <= MAX_REDIRECTS; step++) {
      if (!jars.has(url.origin)) jars.set(url.origin, new CookieJar());
      const jar = jars.get(url.origin);
      const cookie = jar.getCookieStringSync(url.href);
      const key = url.href + '\n' + cookie;
      if (visited.has(key)) break;
      visited.add(key);

      const addresses = net.isIP(url.hostname) ? [url.hostname] : await resolver.resolve4(url.hostname);
      if (!addresses.length || addresses.some(ip => !isPublic4(ip))) throw Error('下载地址不是公开网络地址');
      const result = await request(url, addresses[0], cookie, controller.signal);
      if (result.buffer) return result.buffer;
      for (const value of result.cookies) jar.setCookieSync(value, url.href, {ignoreError: true});
      const next = scheduleURL(result.location, url);
      if (/(?:^|\/)(?:login|sso|shibboleth|saml2)(?:[/.]|$)/i.test(next.pathname)) throw Error(LOGIN_LINK);
      url = next;
    }
    throw Error('学校网站的跳转未能完成。请重新复制导出链接，或下载 PDF 后导入。');
  } catch (error) {
    if (controller.signal.aborted) throw Error('下载超时，请重试或另行导出 PDF');
    if (['ENOTFOUND', 'ENODATA'].includes(error.code)) throw Error('无法解析学校网站地址，请核对导出链接');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {fetchPublic, isPublic4, MAX};
