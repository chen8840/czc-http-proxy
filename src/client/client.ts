import net from 'net';
import fs from 'fs';
import path from 'path';
import { CheckVersionCmd, CmdBase, RequestOpenPortCmd, RequestShowClientsCmd } from '../Cmds';
import { Segment } from '../Segment';
import global from '../Global';

fs.readFile(path.join(__dirname, 'config.json'), 'utf-8', (err, data) => {
  const config = JSON.parse(data);
  global.localPort = config.localPort;

  const client = net.createConnection(config.serverPort, config.server, async () => {
    console.debug(config.serverOepnPort);

    if (process.argv[2] && process.argv[2].toLowerCase() === 'showclients') {
      const requestShowClients = new RequestShowClientsCmd();
      await requestShowClients.send(client);

      const segment = await Segment.readNext(client);
      if (segment) {
        const cmd = CmdBase.fromSegment(segment);
        if (cmd) {
          await cmd.deal(client);
        }
      }
    } else {
      const checkVersion = new CheckVersionCmd(global.version);
      await checkVersion.send(client);
      const checkVersionReturnSegment = await Segment.readNext(client);
      if (checkVersionReturnSegment) {
        const checkVersionReturnCmd = CmdBase.fromSegment(checkVersionReturnSegment);
        if (checkVersionReturnCmd) {
          await checkVersionReturnCmd.deal(client);
        }
      }

      const requestOpenPort = new RequestOpenPortCmd(config.serverOepnPort);
      await requestOpenPort.send(client);

      while(true) {
        const segment = await Segment.readNext(client);
        if (segment) {
          console.debug(segment.toStr() + '\r\n');
          const cmd = CmdBase.fromSegment(segment);
          if (cmd) {
            console.debug(cmd.toSegment().toStr());
            await cmd.deal(client);
          }
        }
      }
    }
  });
});
