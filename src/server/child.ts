import { Socket } from "net";
import { Segment } from "../Segment";
import { CmdBase, ErrorMessageCmd, HttpRequestCmd, HttpResponseCmd, PingCmd } from "../Cmds";
import http, { Server } from "http";
import { R504 } from "../HttpResponses";
import { v4 as uuid } from 'uuid';
import { getRawHttpRequest } from '../utils';

let server: Server;

let clientSocket: Socket | undefined;

// 多长时间没有回复就断开连接
let timeout = 60000;

// 发送ping的时间间隔
let pingInterval = 30000;

let timeoutTimer: any;

let pingTimer: any;

process.on('message', async (msg, socket?: Socket) => {
  if (msg.cmd === 'close') {
    closeSelf();
  } else if (msg.cmd === 'requestOpenPort') {
    clientSocket = socket!;
    const port = msg.port;

    clientSocket.on('end', () => {
      console.log('socket end in child');
      closeSelf();
    });
    clientSocket.on('error', (err) => {
      console.error('socket error in child ' + err + ',close child');
      closeSelf(-1);
    });

    server = http.createServer(async (req, res) => {
      let hasSendResult = false;

      await Promise.race([
        new Promise(async resolve => {
          const rawReq = await getRawHttpRequest(req);
          const httpRequestCmd = new HttpRequestCmd(uuid(), rawReq);
          httpRequestCmd.send(clientSocket!, (data: string) => {
            if (hasSendResult) {
              return;
            }
            hasSendResult = true;
            res.socket!.write(Buffer.from(data), () => {
              res.socket!.end();
            });
            resolve(undefined);
          });
        }),
        new Promise(resolve => {
          setTimeout(() => {
            if (hasSendResult) {
              return;
            }
            hasSendResult = true;
            res.socket!.write(R504, () => {
              res.socket!.end();
            });
            resolve(undefined);
          }, timeout);
        })
      ]);
    });

    server.listen(port, () => {
      console.log(`open port ${port} success`);
      process.send!(`success`);
    });

    server.on('error', async (err: any) => {
      if (err.code === 'EADDRINUSE') {
        process.send!('EADDRINUSE');

        const errorMessageCmd = new ErrorMessageCmd(`port ${port} already in use`);
        await new Promise(resolve => {
          errorMessageCmd.send(clientSocket!, () => {
            resolve(undefined);
          });
        });
      } else {
        console.error(err.message);
        closeSelf(-1);
      }
    });

    try {
      while(true) {
        clearTimeout(timeoutTimer);
        clearTimeout(pingTimer);
        timeoutTimer = setTimeout(() => {
          console.error(`child has not receive any reply in ${timeout} seconds, close child.`)
          closeSelf(-1);
        }, timeout);
        pingTimer = setTimeout(async () => {
          const requestPing = new PingCmd();
          await requestPing.send(clientSocket!);
        }, pingInterval);

        const segment = await Segment.readNext(clientSocket);
        if (segment) {
          console.log(segment.toStr());
          const cmd = CmdBase.fromSegment(segment);

          if (cmd) {
            await cmd.deal(clientSocket);
          }
        }
      }
    } catch(err) {
      console.error(err);
      closeSelf(-1);
    }
  }
});

function closeSelf(exitCode = 0) {
  console.log('child exit');
  process.exit(exitCode);
  // if (clientSocket) {
  //   clientSocket.end(() => {
  //     if (server) {
  //       server.close(() => {
  //         process.exit(exitCode);
  //       })
  //     } else {
  //       process.exit(exitCode);
  //     }
  //   });
  // } else {
  //   if (server) {
  //     server.close(() => {
  //       process.exit(exitCode);
  //     })
  //   } else {
  //     process.exit(exitCode);
  //   }
  // }
}
