import { ChildProcess } from "child_process";

export interface Child {
  ip: string;
  port: number,
  process: ChildProcess;
}

export default {
  // for server
  childList: [] as Array<Child>,
  serverPort: 8124,
  // for client
  localPort: 8080,
  // common
  version: '1.0.1',
}
