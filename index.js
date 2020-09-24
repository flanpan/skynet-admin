const {remote} = require('electron')
const {Menu, BrowserWindow} = remote
const config = require('./config')
const fs = require('fs')
let sharedObject = require('electron').remote.getGlobal('sharedObject')

const template = [
    {
    label: "Application",
    submenu: [
        { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
    ]
    }, 
    {
      label: 'DebugServer',
      submenu: []
    },
    {
    label: "Edit",
    submenu: [
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
    ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'window',
      submenu: [
        {role: 'close'},
        {role: 'minimize'},
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'About', click() { 
            alert("This tool use for skynet project.") 
        } }
      ]
    }
  ]

function changeDbgServer(item) {
  let host = config.hosts[item.host]
  if(!host) return
  let ip = host.ip
  let port = item.port
  if(!ip || !port) return
  localStorage.setItem('config.debug', JSON.stringify({ip,port}))
  let win = BrowserWindow.getFocusedWindow();
  if(!win) return;
  win.webContents.openDevTools()
  win.loadFile('index.html')
}

for(let key in config.hosts) {
    let debugPort = config.hosts[key].debugPort
    for(let k in debugPort)
      template[1].submenu.push({ label:`${key}[${k}]`, host:key, port:debugPort[k], click:changeDbgServer})
}

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)
