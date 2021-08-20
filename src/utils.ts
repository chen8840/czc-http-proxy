import { IncomingMessage } from "http";
import { StringDecoder } from 'string_decoder';

export async function getRawHttpRequest(req: IncomingMessage): Promise<Buffer> {
  const firstLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
  const header = req.headers;
  const headerStr = Object.keys(header).map(key => `${key}: ${header[key]}`).join('\r\n');

  return new Promise((resolve) => {
    let body = Buffer.alloc(0);;
    req.on('data', dataListener);
    req.on('end', endListener);

    function dataListener(data: Buffer) {
      body = Buffer.concat([body, data])
    };
    function endListener() {
      req.off('data', dataListener);
      req.off('end', endListener);
      resolve(Buffer.concat([Buffer.from(`${firstLine}${headerStr}\r\n\r\n`, 'utf-8'), body]));
    }
  });
}

export async function getRawHttpResponse(req: IncomingMessage): Promise<Buffer> {
  const firstLine = `HTTP/${req.httpVersion} ${req.statusCode} ${req.statusMessage}\r\n`;
  const header = req.headers;
  const headerStr = Object.keys(header).map(key => `${key}: ${header[key]}`).join('\r\n');

  return new Promise((resolve) => {
    let body = Buffer.alloc(0);;
    req.on('data', dataListener);
    req.on('end', endListener);

    function dataListener(data: Buffer) {
      body = Buffer.concat([body, data])
    };
    function endListener() {
      req.off('data', dataListener);
      req.off('end', endListener);
      resolve(Buffer.concat([Buffer.from(`${firstLine}${headerStr}\r\n\r\n`, 'utf-8'), body]));
    }
  });
}

export function parseRawHttpRequest(rawHttpRequest: Buffer) {
  let headerBuffer = Buffer.alloc(0);
  let bodyBuffer = Buffer.alloc(0);
  const sepBuffer = Buffer.from('\r\n\r\n', 'utf-8');

  const bodyIndex = rawHttpRequest.indexOf(sepBuffer);
  if (bodyIndex >= 0) {
    headerBuffer = rawHttpRequest.slice(0, bodyIndex);
    bodyBuffer = rawHttpRequest.slice(bodyIndex + sepBuffer.length);
  } else {
    headerBuffer = rawHttpRequest;
  }

  const decoder = new StringDecoder('utf-8');
  const headerStr = decoder.write(headerBuffer);
  const headerArray = headerStr.split('\r\n');
  const firstLine = headerArray.shift();
  const [method, path] = firstLine?.split(' ')!;

  const headers =  headerArray.reduce((obj, line) => {
    const index = line.indexOf(':');
    if (index >= 0) {
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      obj[key] = value;
    }
    return obj;
  }, {} as any);

  return {
    method,
    path,
    headers,
    body: bodyBuffer
  };
}
