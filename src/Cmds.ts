import { Segment } from "./Segment";
import { v4 as uuidv4 } from 'uuid';
import { ChildProcess, fork } from 'child_process';
import path from 'path';
import { Socket } from "net";
import global from './Global';
import { R500, R501, R504 } from "./HttpResponses";
import { getRawHttpResponse, parseRawHttpRequest } from "./utils";
import http from 'http';

export type Cmd = 'requestOpenPort' | 'ping' | 'pong' | 'httpReq' | 'httpRes' | 'errorMessage' | 'showClients' | 'doNothing' | 'checkVersion';

export abstract class CmdBase {
  static fromSegment(seg: Segment): CmdBase | null {
    const cmd = seg.getCmd();
    if (cmd === 'requestOpenPort') {
      const port = Number.parseInt(seg.getContentStr(), 10);
      return new RequestOpenPortCmd(port);
    } else if (cmd === 'ping') {
      return new PingCmd();
    } else if (cmd === 'pong') {
      return new PongCmd();
    } else if (cmd ==='errorMessage') {
      return new ErrorMessageCmd(seg.getContentStr());
    } else if (cmd === 'showClients') {
      return new RequestShowClientsCmd();
    } else if (cmd === 'httpReq') {
      return new HttpRequestCmd(seg.getId(), seg.getContent());
    } else if (cmd === 'httpRes') {
      return new HttpResponseCmd(seg.getId(), seg.getContent());
    } else if (cmd === 'doNothing') {
      return new DoNothingCmd();
    } else if (cmd === 'checkVersion') {
      return new CheckVersionCmd(seg.getContentStr());
    }
    return null;
  };

  toSegment(): Segment {
    throw new Error();
  };

  async deal(anyParam?: any): Promise<any> {
    throw new Error();
  }

  async send(socket: Socket, callback?: any): Promise<boolean> {
    const segment = this.toSegment();
    const writableNeedDrain = (socket as any).writableNeedDrain;
    if (writableNeedDrain) {
      return new Promise((resolve) => {
        socket.once('drain', () => {
          resolve(segment.send(socket, callback));
        });
      });
    } else {
      return segment.send(socket, callback);
    }
  }
}

export class DoNothingCmd extends CmdBase {
  toSegment() {
    return new Segment(uuidv4(), 'doNothing', Buffer.alloc(0));
  }

  async deal(anyParam?: any): Promise<any> {}
}

export class RequestOpenPortCmd extends CmdBase {
  constructor(
    private readonly port: number,
  ) {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'requestOpenPort', Buffer.from(`${this.port}`, 'utf-8'));
  }

  async deal(socket: Socket): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const child = fork(path.join(__dirname, 'server', 'child.js'));

      child.send({cmd: 'requestOpenPort', port: this.port}, socket);

      child.once('message', async (res: string) => {
        if (res === 'success') {
          resolve(child);
        } else {
          reject(new Error(res));
        }
      });
    });
  }
}

export class PingCmd extends CmdBase {
  constructor() {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'ping', Buffer.alloc(0));
  }

  async deal(socket: Socket): Promise<void> {
    const requestPong = new PongCmd();
    await requestPong.send(socket);
  }
}

export class PongCmd extends CmdBase {
  constructor() {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'pong', Buffer.alloc(0));
  }

  async deal(socket: Socket): Promise<void> {}
}

export class HttpRequestCmd extends CmdBase {
  static resHandlerObj: {[key: string]: any} = {};

  static addHandler(uuid: string, fn: (res: any) => void) {
    HttpRequestCmd.resHandlerObj[uuid] = fn;
  }

  static removeHandler(uuid: string) {
    delete HttpRequestCmd.resHandlerObj[uuid];
  }

  constructor(private uuid: string, private content: Buffer) {
    super();
  }

  toSegment() {
    return new Segment(this.uuid, 'httpReq', this.content);
  }

  async deal(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      const {method, path, headers, body} = parseRawHttpRequest(this.content);
      if (Object.keys(headers).find(key => key.toLowerCase() === 'upgrade')) {
        const httpResponseCmd = new HttpResponseCmd(this.uuid, Buffer.from(R501, 'utf-8'));
        httpResponseCmd.send(socket, resolve);
        return;
      }

      let hasReply = false;

      const req = http.request({
        port: global.localPort || 8080,
        path,
        method,
        headers
      }, async (res) => {
        clearTimeout(timer);
        if (hasReply) {
          return;
        }
        hasReply = true;
        const response = await getRawHttpResponse(res);
        const httpResponseCmd = new HttpResponseCmd(this.uuid, response);
        httpResponseCmd.send(socket, () => {
          req.end();
          resolve();
        });
      });

      let timer: any;
      const timeout = 30000;
      timer = setTimeout(() => {
        if (hasReply) {
          return;
        }
        hasReply = true;
        const httpResponseCmd = new HttpResponseCmd(this.uuid, Buffer.from(R504, 'utf-8'));
        httpResponseCmd.send(socket, () => {
          req.end();
          resolve();
        });
      }, timeout);

      req.on('error', (err) => {
        clearTimeout(timer);
        if (hasReply) {
          return;
        }
        hasReply = true;
        const httpResponseCmd = new HttpResponseCmd(this.uuid, Buffer.from(R500 + err.message, 'utf-8'));
        httpResponseCmd.send(socket, () => {
          req.end();
          resolve();
        });
      });

      req.write(body);
      req.end();
    });
  }

  async send(socket: Socket, callback: any) {
    console.debug(this.uuid);
    const fn = (res: any) => {
      callback(res);
      HttpRequestCmd.removeHandler(this.uuid);
    }
    HttpRequestCmd.addHandler(this.uuid, fn);
    return await super.send(socket);
  }
}

export class HttpResponseCmd extends CmdBase {
  constructor(
    private uuid: string,
    private content: Buffer,
  ) {
    super();
  }

  toSegment() {
    return new Segment(this.uuid, 'httpRes', this.content);
  }

  async deal(socket: Socket): Promise<void> {
    const fn = HttpRequestCmd.resHandlerObj[this.uuid];
    if (fn) {
      fn(this.content);
    }
  }
}

export class ErrorMessageCmd extends CmdBase {
  constructor(private message: string) {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'errorMessage', Buffer.from(this.message, 'utf-8'));
  }

  async deal(socket: Socket) {
    process.stdout.write(`${this.message}\n`);

    await new Promise(resolve => {
      process.stdin.once('data', function (data) {
        socket.end(() => {
          resolve(data);
        });
      });
    });

    process.exit(-1);
  }
}

export class RequestShowClientsCmd extends CmdBase {
  constructor() {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'showClients', Buffer.alloc(0));
  }

  async deal(socket: Socket) {
    const errorMessageCmd = new ErrorMessageCmd(JSON.stringify(global.childList.map(child => ({ip: child.ip, port: child.port}))));
    await new Promise(resolve => {
      errorMessageCmd.send(socket, resolve);
    });
  }
}

export class CheckVersionCmd extends CmdBase {
  constructor(private version: string) {
    super();
  }

  toSegment() {
    return new Segment(uuidv4(), 'checkVersion', Buffer.from(this.version, 'utf-8'));
  }

  async deal(socket: Socket): Promise<ChildProcess> {
    return new Promise((resolve) => {
      if (this.version === global.version) {
        const doNothingCmd = new DoNothingCmd();
        doNothingCmd.send(socket, resolve);
      } else {
        const errorMessageCmd = new ErrorMessageCmd(`Server version is ${global.version}, Client version is ${this.version}, you should use matched Client.`);
        errorMessageCmd.send(socket, resolve);
      }
    });
  }
}
