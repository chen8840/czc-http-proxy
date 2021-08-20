import net from 'net';
import http, { IncomingMessage } from 'http';
import { R404 } from '../HttpResponses';
import { StringDecoder } from 'string_decoder';

// const server = http.createServer((req, res) => {
//   var body = "";
//   req.on('data', function(data) {
//     body += data;
//   });
//   req.on('end', function() {
//     console.log(body);
//     res.socket!.end(R404);
//   });
// });

// server.listen(8124, () => {
//   console.log('server bound');
// });

// const localSocket = net.createConnection(5503, undefined, () => {
//   let response = '';
//   let reqStr = 'GET / HTTP/1.1\r\n'
//             // + 'Connection: keep-alive\r\n'
//             + 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36\r\n'
//             + 'Accept-Language: zh-CN,zh;q=0.9,zh-TW;q=0.8,en-US;q=0.7,en;q=0.6\r\n'
//             + '\r\n';
//   localSocket.write(Buffer.from(reqStr));
//   // localSocket.end();


//   localSocket.on('data', data => {
//     console.log(typeof data);
//     response += data;
//   });
//   localSocket.on('end', () => {
//     console.log(response);
//   });
// });

// localSocket.on('error', error => {
//   localSocket.end();
//   console.log(error);
// });

const postData = JSON.stringify({
  'msg': 'Hello World!'
});

const options = {
  port: 5503,
  // path: '/bg3.png',
  path: '/1.html',
  method: 'GET',
  headers: {
    // 'Content-Type': 'application/json'
    'connection': 'keep-alive'
  }
};

const req = http.request(options, async (res) => {
  // const raw = await getRawHttpRequest(res);
  // const decoder = new StringDecoder('utf-8');
  // console.log(decoder.write(raw));
  console.log(res);
  // let body = Buffer.alloc(0);
  // res.on('data', data => {
  //   body = Buffer.concat([body, data]);
  // });
  // res.on('end', () => {
  //   console.log(body);
  //   debugger;
  // })
});



req.on('error', (e) => {
  console.log(req);
  console.error(`problem with request: ${e.message}`);
});

req.on('socket', socket => {
  let body = Buffer.alloc(0);
  socket.on('data', data => {
    // console.log('===' + data);
    body = Buffer.concat([body, data]);
  });
  socket.on('end', () => {
    console.log(body);
  });

});

// Write data to request body
// req.write(postData);
req.end();

async function getRawHttpRequest(req: IncomingMessage): Promise<Buffer> {
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
