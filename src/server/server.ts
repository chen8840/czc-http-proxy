import { ChildProcess } from 'child_process';
import net from 'net';
import { CmdBase } from '../Cmds';
import { Segment } from '../Segment';
import global from '../Global';

const server = net.createServer(async (socket) => {
  // // 'connection' listener.
  console.log('client connected');

  try {
    const firstSegment = await Segment.readNext(socket);
    if (firstSegment) {
      if (firstSegment.getCmd() === 'checkVersion') {
        const checkVersionSegment = firstSegment;
        const checkVersionCmd = CmdBase.fromSegment(checkVersionSegment);
        if (checkVersionCmd) {
          await checkVersionCmd.deal(socket);
        }
        const secondSegment = await Segment.readNext(socket);

        if (secondSegment && secondSegment.getCmd() === 'requestOpenPort') {
          const requestOpenPortSegment = secondSegment;
          let childProcess: ChildProcess;
          const openPortCmd = CmdBase.fromSegment(requestOpenPortSegment);
          if (openPortCmd) {
            const socketAddress = socket.remoteAddress;
            childProcess = await openPortCmd.deal(socket);

            const port = Number.parseInt(requestOpenPortSegment.getContentStr(), 10);
            pushChild(socketAddress || '', port, childProcess);

            childProcess.on('exit', () => {
              popChild(childProcess);
            });
          }
        }
      } else if (firstSegment.getCmd() === 'showClients') {
        const showClientsSegment = firstSegment;
        const showClientsCmd = CmdBase.fromSegment(showClientsSegment);
        if (showClientsCmd) {
          await showClientsCmd.deal(socket);
          socket.end();
        }
      } else {
        socket.end();
      }
    }
  } catch(err) {
    console.error(err);
  }
});

server.on('error', (err) => {
  console.error(err);
  throw err;
});

server.listen(global.serverPort, () => {
  console.log(`start listen at port ${global.serverPort}`);
});

function pushChild(ip: string, port: number, process: ChildProcess) {
  global.childList.push({
    ip,
    port,
    process
  });
}

function popChild(childProcess: ChildProcess) {
  const index = global.childList.findIndex(child => child.process === childProcess);
  if (index >= 0) {
    global.childList.splice(index, 1);
  }
}
