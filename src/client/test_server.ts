import net from 'net';
import http, { IncomingMessage } from 'http';
import { R404 } from '../HttpResponses';

const server = http.createServer(async (req, res) => {
  var rawReq = await getRawHttpRequest(req);
  console.log(rawReq);
  res.socket!.write(R404, () => {

    res.socket!.end();
  });
});

server.listen(8124, () => {
  console.log('server bound');
});


// const server = net.createServer(socket => {
//   var body = '';
//   socket.setEncoding('utf-8');
//   socket.on('data', data => {
//     console.log('data ' + data);
//     body += data;
//     socket.end();
//   });
//   socket.on('end', () => {
//     console.log('end ' + body);
//   });
// });

// server.listen(8124, () => {
//   console.log('server bound');
// });

async function getRawHttpRequest(req: IncomingMessage): Promise<string> {
  req.setEncoding('utf-8');
  const firstLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
  const header = req.headers;
  const headerStr = Object.keys(header).map(key => `${key}: ${header[key]}`).join('\r\n');

  return new Promise((resolve) => {
    let body = '';
    req.on('data', dataListener);
    req.on('end', endListener);

    function dataListener(data: string) {
      body += data;
    };
    function endListener() {
      req.off('data', dataListener);
      req.off('end', endListener);
      resolve(`${firstLine}${headerStr}\r\n\r\n${body}`);
    }
  });
}
