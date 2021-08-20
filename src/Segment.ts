import { Socket } from 'net';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';
import { Cmd } from './Cmds';
import seqStr from './seq-str';

export class Segment {
  constructor(
    private uuid: string,
    private cmd: Cmd,
    private content: Buffer
  ) {}

  getCmd() {
    return this.cmd;
  }

  getContent() {
    return this.content;
  }

  getContentStr() {
    const decoder = new StringDecoder('utf-8');
    return decoder.write(this.content);
  }

  getId() {
    return this.uuid;
  }

  private static fromBuffer(buf: Buffer) {
    const seqIndex = buf.lastIndexOf(seqStr);
    try {
      if (seqIndex >= 0) {
        const rawBuf = buf.slice(0, seqIndex);
        let sep = ':';
        let uuid = '';
        let cmd: any = 'doNothing';
        let content = Buffer.alloc(0);
        const firstIndex = rawBuf.indexOf(sep);
        if (firstIndex >= 0) {
          const decoder = new StringDecoder('utf8');
          const uuidBuf = rawBuf.slice(0, firstIndex);
          uuid = decoder.write(uuidBuf);

          const remainBuf = rawBuf.slice(firstIndex + 1);
          const secondIndex = remainBuf.indexOf(sep);
          if (secondIndex >= 0) {
            const cmdBuf = remainBuf.slice(0, secondIndex);
            cmd = decoder.write(cmdBuf);

            content = remainBuf.slice(secondIndex + 1);
          }
        }
        return new Segment(uuid, cmd, content);
      } else {
        return null;
      }
    } catch(err) {
      console.error(err);
      return null;
    }
  }

  toStr() {
    const decoder = new StringDecoder('utf8');
    return JSON.stringify({
      uuid: this.uuid,
      cmd: this.cmd,
      content: decoder.write(this.content)
    }) + seqStr;
  }

  toBuffer() {
    const uuidBuf = Buffer.from(this.uuid, 'utf-8');
    const cmdBuf = Buffer.from(this.cmd, 'utf-8');
    const sepBuf = Buffer.from(':', 'utf-8');
    const seqBuff = Buffer.from(seqStr, 'utf-8');
    return Buffer.concat([uuidBuf, sepBuf, cmdBuf, sepBuf, this.content, seqBuff]);
  }

  static async readNext(socket: Socket): Promise<Segment | null> {
    return new Promise((resolve, reject) => {
      parseSelf(socket, (err: any, selfBuff: Buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(Segment.fromBuffer(selfBuff));
        }
      });
    });

    function parseSelf(stream: Readable, callback: any) {
      stream.on('error', callback);
      stream.on('readable', onReadable);
      let totalBuff = Buffer.alloc(0);
      const seqStrBuff = Buffer.from(seqStr, 'utf-8');

      function onReadable() {
        let chunk;
        while (null !== (chunk = stream.read() as Buffer)) {
          const newBuff = Buffer.concat([totalBuff, chunk]);
          const findIndex = newBuff.indexOf(seqStrBuff);
          if (findIndex >= 0) {
            const split = [newBuff.slice(0, findIndex + seqStrBuff.length), newBuff.slice(findIndex + seqStrBuff.length)];
            totalBuff = split.shift()!;

            const remainingBuf = split.shift()!;
            stream.off('error', callback);
            // Remove the 'readable' listener before unshifting.
            stream.off('readable', onReadable);
            setTimeout(() => {
              if (remainingBuf.length)
                stream.unshift(remainingBuf);
              // Now the body of the message can be read from the stream.
              callback(null, totalBuff);
            }, 0);
          } else {
            // Still reading.
            totalBuff = newBuff;
          }
        }
    }
    }
  }

  send(socket: Socket, callback?: any) {
    return socket.write(this.toBuffer(), callback);
  }
}
