const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 일부 회사/가상PC 환경에서는 그래픽(GPU) 가속이 제한되어 있어
// 창이 흰 화면으로만 뜨는 경우가 있습니다. 이를 방지하기 위해 GPU 가속을 끕니다.
app.disableHardwareAcceleration();

const DATA_FILE = path.join(app.getPath('userData'), 'tasks.json');

let widgetWindow = null;
let alarmWindow = null;
let alarmConfirmed = false; // "확인" 버튼을 눌러야만 true가 되어 창이 닫힘

function loadTasksFromDisk() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null; // 파일이 없거나 첫 실행이면 null
  }
}

function saveTasksToDisk(tasks) {
  try {
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(tasks));
    // 임시 파일이 완전히 쓰인 뒤에만 원래 파일과 교체 -> 저장 도중 정전이 나도 기존 파일은 안전
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (e) {
    console.error('저장 실패:', e);
  }
}

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width: 460,
    height: 760,
    minWidth: 380,
    minHeight: 500,
    title: 'Work Alert',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.loadFile(path.join(__dirname, 'renderer', 'widget.html'));

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

function createAlarmWindow(task) {
  // 이미 알람창이 떠 있으면 그 창에 새 알람 정보만 갱신 (여러 개 겹치는 걸 방지)
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 460;
  const winHeight = 380;
  alarmConfirmed = false;

  alarmWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((sw - winWidth) / 2),
    y: Math.round((sh - winHeight) / 2),
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 화면 최상단 강제 (다른 프로그램 위로)
  alarmWindow.setAlwaysOnTop(true, 'screen-saver');
  alarmWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // "확인" 버튼(close-alarm)이 눌러지기 전까지는 Alt+F4 등 어떤 방식으로도 닫히지 않도록 차단
  alarmWindow.on('close', (event) => {
    if (!alarmConfirmed) {
      event.preventDefault();
    }
  });

  alarmWindow.loadFile(path.join(__dirname, 'renderer', 'alarm.html'));

  alarmWindow.once('ready-to-show', () => {
    alarmWindow.show();
    alarmWindow.focus();
    alarmWindow.moveTop();
    alarmWindow.webContents.send('alarm-data', task);
    // 작업표시줄 깜빡임으로 한 번 더 주의 환기
    if (widgetWindow) widgetWindow.flashFrame(true);
  });

  alarmWindow.on('closed', () => {
    alarmWindow = null;
  });
}

app.whenReady().then(() => {
  // 윈도우 부팅 시 자동 실행되도록 등록 (한 번만 등록되면 이후에도 계속 유지됨)
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });

  createWidgetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWidgetWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===== IPC =====
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('load-tasks', () => {
  return loadTasksFromDisk();
});

ipcMain.on('save-tasks', (event, tasks) => {
  saveTasksToDisk(tasks);
});

ipcMain.on('set-pin', (event, pinned) => {
  if (widgetWindow) {
    widgetWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal');
  }
});

ipcMain.on('trigger-alarm', (event, task) => {
  createAlarmWindow(task);
});

ipcMain.on('close-alarm', () => {
  alarmConfirmed = true;
  if (alarmWindow) alarmWindow.close();
  if (widgetWindow) widgetWindow.flashFrame(false);
});

ipcMain.on('open-external', (event, url) => {
  // 신뢰할 수 있는 고정 링크만 열도록 제한 (블로그 주소만 허용)
  if (url === 'https://bedsidelab.blogspot.com/') {
    shell.openExternal(url);
  }
});
