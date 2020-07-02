const net = require("net");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const { argv } = require("process");
const screen = blessed.screen();

const DATA_SEP = "<CMD OK>\n";
const filter = [
  "Welcome to skynet console\n",
  "Invalid command, type help for command list\n<CMD Error>\n",
  "<CMD Error>\n",
];
const FIELD = { ID: 0, NAME: 1, MEM: 2, CPU: 3, MSG: 4, MQLEN: 5, TASK: 6 };
const PRE_CPU_LEN = "cpu:".length;
const PRE_MSG_LEN = "message:".length;
const PRE_MQLEN_LEN = "mqlen:".length;
const PRE_TASK_LEN = "task:".length;
const HEADER = ["ID", "NAME", "MEM(KB)", "CPU", "MSG", "MQLEN", "TASK"];

let host = "127.0.0.1";
let port = 8000;
if (argv.length == 3) port = parseInt(argv[2]);
if (argv.length >= 4) {
  host = argv[2];
  port = parseInt(argv[3]);
}
let reqs = [];

function command(cmd) {
  if (cmd[0] == "/") return refreshData(cmd.substr(1));
  log.setValue(log.getValue() + cmd + "\n");
  sock.write(cmd + "\n");
  reqs.push(cmd);
}
function updateScreen() {
  command("list");
  command("mem");
  command("stat");
}

let sock = net.connect(port, host, () => {
  reqs.push("first");
  updateScreen();
});

let chunk = "";
let svc = {};
let svcData = [];
let nameMaxLen = 0;
let totalLuaMem = 0;
let grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });
let bar = grid.set(0, 0, 3, 7, contrib.bar, {
  label: "Top10 lua memory (%)",
  /*barWidth:4,*/ barSpacing: 12 /*xOffset:2,*/,
  barBgColor: "green",
  maxHeight: 9,
});
let svcinfo = grid.set(0, 7, 3, 5, blessed.textarea, { label: "Service info" });
let table = grid.set(3, 0, 8, 7, contrib.table, {
  keys: true,
  vi: true,
  fg: "write",
  selectedFg: "write",
  selectedBg: "blue",
  interactive: true,
  label: "Services",
  width: "99%",
  height: "95%",
  order: { type: "line", fg: "cyan" },
  columnSpacing: 5,
  columnWidth: [12, 30, 10, 6, 6, 6, 6],
});
let log = grid.set(3, 7, 7, 5, blessed.textarea, {
  label: "Log  [e - Open with editor]",
  style: { scrollbar: { bg: "blue" } },
});
let input = grid.set(10, 7, 1, 5, blessed.textbox, {
  label: `Command  [p - Paste ID] [Start with / to match service name]`,
});

const commands = {
  j: "Down",
  k: "Up",
  g: "Jump to top",
  G: "Jump to bottom",
  c: "Sort by CPU",
  m: "Sort by Mem",
  n: "Sort by Name",
  i: "Input Cmd",
  r: "Update Screen",
  'Esc/q': "quit"
};
let text = "";
for (const c in commands) {
  const command = commands[c];
  text += `  {white-bg}{black-fg}${c}{/black-fg}{/white-bg} ${command}`;
}
let footer = grid.set(11, 0, 1, 12, blessed.box, {
  label: "help",
  width: "100%",
  tags: true,
  content: text,
});

table.focus();

function serviceName(name) {
  let arr = name.split(" ");
  if (arr[0] == "snlua")
    if (arr[1] == "snaxd") return arr[2];
    else return arr[1];
  else return arr[0];
}

function refreshData(match) {
  match = match || "";
  svcData = [];
  let memstatistic = {};
  totalLuaMem = 0;
  for (let k in svc) {
    let fields = svc[k];
    let n = serviceName(fields[FIELD.NAME]);
    if (fields[FIELD.NAME].indexOf(match) >= 0) svcData.push(fields);
    memstatistic[n] = (memstatistic[n] || 0) + fields[FIELD.MEM];
    totalLuaMem += fields[FIELD.MEM];
  }
  let arrMemStatistic = [];
  for (let k in memstatistic) {
    arrMemStatistic.push([
      k,
      Math.round((memstatistic[k] * 100) / totalLuaMem),
    ]);
  }
  arrMemStatistic.sort((a, b) => b[1] - a[1]);
  arrMemStatistic = arrMemStatistic.slice(0, 10);
  if (!svcData.length) return;
  table.setData({ headers: HEADER, data: svcData });
  bar.setData({
    titles: arrMemStatistic.map((a) => a[0]),
    data: arrMemStatistic.map((a) => a[1]),
  });
  screen.render();
}

sock.on("data", (data) => {
  let str = data.toString("utf-8");
  log.setValue(log.getValue() + str);
  chunk += str;
  filter.forEach((s) => {
    chunk = chunk.replace(s, DATA_SEP);
  });
  if (chunk.substr(-DATA_SEP.length) != DATA_SEP) return;
  let rets = chunk.split(DATA_SEP);
  let fresh = false;
  for (let i = 0; i < rets.length - 1; i++) {
    let ret = rets[i];
    let cmd = reqs.shift();
    cmd = cmd.toLowerCase();
    let rows;
    switch (cmd) {
      case "list":
        rows = ret.split("\n");
        let s = new Set();
        rows.forEach((row) => {
          let fields = row.split("\t");
          let id = fields[0];
          if (!id) return;
          svc[id] = svc[id] || [0, 0, 0, 0, 0, 0, 0];
          let info = svc[id];
          info[FIELD.ID] = id;
          s.add(id);
          let name = fields[1];
          if (name.length > nameMaxLen) nameMaxLen = name.length;
          info[FIELD.NAME] = name;
          fresh = true;
        });
        for (let k in svc) {
          if (!s.has(k)) delete svc[k];
        }
        break;
      case "mem":
        rows = ret.split("\n");
        rows.forEach((row) => {
          let fields = row.split("\t");
          let id = fields[0];
          if (!id) return;
          let info = svc[id];
          if (!info) return;
          let arr = fields[1].split(" ");
          info[FIELD.MEM] = parseFloat(parseFloat(arr[0]).toFixed(2));
          fresh = true;
        });
        break;
      case "stat":
        rows = ret.split("\n");
        rows.forEach((row) => {
          let fields = row.split("\t");
          let id = fields[0];
          if (!id) return;
          let info = svc[id];
          if (!info) return;
          info[FIELD.CPU] = parseFloat(
            parseFloat(fields[1].substr(PRE_CPU_LEN)).toFixed(2)
          );
          info[FIELD.MSG] = parseFloat(fields[2].substr(PRE_MSG_LEN));
          info[FIELD.MQLEN] = parseFloat(fields[3].substr(PRE_MQLEN_LEN));
          info[FIELD.TASK] = parseFloat(fields[4].substr(PRE_TASK_LEN));
          fresh = true;
        });
        break;
    }
  }
  if (fresh) refreshData();
  chunk = "";
});

table.rows.on("select item", () => {
  let info = svcData[table.rows.selected];
  svcinfo.setValue(`ID: ${info[FIELD.ID]}
MEM: ${info[FIELD.MEM]} Kb
CPU: ${info[FIELD.CPU]}
MSG: ${info[FIELD.MSG]}
MQLEN: ${info[FIELD.MQLEN]}
TASK: ${info[FIELD.TASK]}
NAME: ${info[FIELD.NAME]}`);
});

function sortDataBy(field) {
  svcData.sort((a, b) =>
    typeof a[field] == "string"
      ? a[field].localeCompare(b[field])
      : b[field] - a[field]
  );
  if (svcData.length) table.setData({ headers: HEADER, data: svcData });
  screen.render();
}

screen.on("keypress", function (ch, key) {
  switch (key.name) {
    case "escape":
    case "q":
    case "C-c":
      return process.exit(0);
    case "i":
      return input.readInput();
    case "r":
      return updateScreen();
    case "c":
      return sortDataBy(FIELD.CPU);
    case "m":
      return sortDataBy(FIELD.MEM);
    case "n":
      return sortDataBy(FIELD.NAME);
    case "e":
      return log.readEditor();
    case "p":
      let info = svcData[table.rows.selected];
      input.setValue(input.getValue() + info[FIELD.ID]);
      screen.render();
      return input.readInput();
  }
});

input.on("submit", (value) => {
  command(value);
  input.clearInput();
  input.readInput();
});

log.on("focus", () => setTimeout(() => log.cancel(), 10));

screen.render();
