const net = require('net')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const { argv } = require('process')
const screen = blessed.screen()
const program = blessed.program()

let host = '127.0.0.1'
let port = 8000
if(argv.length == 3)
    port = parseInt(argv[2])
if(argv.length >= 4) {
    host = argv[2]
    port = parseInt(argv[3])
}
let reqs = []
function command(cmd) {
    sock.write(cmd + '\n')
    reqs.push(cmd)
}
let sock = net.connect(port,host,()=>{
    reqs.push('first')
    command('list')
    command('mem')
    command('stat')
})

const DATA_SEP = '<CMD OK>\n'
const filter = ["Welcome to skynet console\n", "Invalid command, type help for command list\n", "<CMD Error>\n"]
const FIELD = {ID: 0, NAME: 1, MEM: 2, CPU: 3, MSG: 4,MQLEN: 5, TASK: 6}
const PRE_CPU_LEN = "cpu:".length
const PRE_MSG_LEN = "message:".length
const PRE_MQLEN_LEN = "mqlen:".length
const PRE_TASK_LEN = "task:".length
const HEADER = ['ID','NAME','MEM(KB)','CPU','MSG', 'MQLEN', 'TASK']

let chunk = ''
let svc = {}
let svcData = []
let nameMaxLen = 0
let table
function refreshTable() {
    if(!table) {
        table = contrib.table({
            keys:true, vi:true, fg:'write', selectedFg:'write', selectedBg:'blue', interactive:true, label:'Services',
            width:'99%', height:'95%',border:{type:'line', fg:'cyan'}, columnSpacing:5, columnWidth:[12,nameMaxLen,8,6,6,6,6]
        })
        table.focus()
        screen.append(table)
        drawFooter()
    }
    
    svcData = []
    for(let k in svc)
        svcData.push(svc[k])
    if(svcData.length) table.setData({headers:HEADER, data: svcData})
    screen.render()
}

const drawFooter = () => {
    const commands = {
      'dd': 'Kill process',
      'j': 'Down',
      'k': 'Up',
      'g': 'Jump to top',
      'G': 'Jump to bottom',
      'c': 'Sort by CPU',
      'm': 'Sort by Mem'
    }
    let text = ''
    for (const c in commands) {
      const command = commands[c]
      text += `  {white-bg}{black-fg}${c}{/black-fg}{/white-bg} ${command}`
    }
    text += '{|}https://github.com/flanpan/skynet-cli'
    const footerRight = blessed.box({
      width: '100%',
      top: program.rows - 1,
      tags: true,
    })
    footerRight.setContent(text)
    screen.append(footerRight)
  }

sock.on('data',(data)=>{
    let str = data.toString('utf-8')
    chunk += str
    filter.forEach((s)=>{chunk = chunk.replace(s,DATA_SEP)})
    if(chunk.substr(-DATA_SEP.length) != DATA_SEP) return
    let rets = chunk.split(DATA_SEP)
    let fresh = false
    for(let i = 0; i<rets.length-1; i++) {
        let ret = rets[i]
        let cmd = reqs.shift()
        cmd = cmd.toLowerCase()
        let rows
        switch(cmd) {
            case 'list':
                rows = ret.split('\n')
                rows.forEach((row)=>{
                    let fields = row.split('\t')
                    let id = fields[0]
                    if(!id) return
                    let info = svc[id] = [0,0,0,0,0,0,0]
                    info[FIELD.ID] = id
                    let name = fields[1]
                    if(name.length > nameMaxLen) nameMaxLen = name.length
                    info[FIELD.NAME] = name
                    fresh = true
                })
                break
            case 'mem':
                rows = ret.split('\n')
                rows.forEach((row)=>{
                    let fields = row.split('\t')
                    let id = fields[0]
                    if(!id) return
                    let info = svc[id]
                    if(!info) return
                    let arr = fields[1].split(' ')
                    info[FIELD.MEM] = parseFloat(arr[0]).toFixed(2)
                    fresh = true
                })
                break
            case 'stat':
                rows = ret.split('\n')
                rows.forEach((row)=>{
                    let fields = row.split('\t')
                    let id = fields[0]
                    if(!id) return
                    let info = svc[id]
                    if(!info) return
                    info[FIELD.CPU] = parseFloat(fields[1].substr(PRE_CPU_LEN)).toFixed(2)
                    info[FIELD.MSG] = parseFloat(fields[2].substr(PRE_MSG_LEN))
                    info[FIELD.MQLEN] = parseFloat(fields[3].substr(PRE_MQLEN_LEN))
                    info[FIELD.TASK] = parseFloat(fields[4].substr(PRE_TASK_LEN))
                    fresh = true
                })
                break
        }
    }
    if(fresh) refreshTable()
    chunk = ''
})

screen.key(['escape', 'q', 'C-c'],(ch, key)=>{
    return process.exit(0)
})

screen.key(['m'], (ch, key)=>{
    svcData.sort((a,b)=>b[FIELD.MEM]-a[FIELD.MEM])
    if(svcData.length) table.setData({headers:HEADER, data: svcData})
    screen.render()
})

screen.key(['c'], (ch, key)=>{
    svcData.sort((a,b)=>b[FIELD.CPU]-a[FIELD.CPU])
    if(svcData.length) table.setData({headers:HEADER, data: svcData})
    screen.render()
})
