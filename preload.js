const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 창 고정(항상 위) 켜기/끄기
  setAlwaysOnTop: (pinned) => ipcRenderer.send('set-pin', pinned),

  // 알람 팝업 띄우기 요청 (메인 프로세스가 별도의 항상-최상단 창을 생성)
  triggerAlarm: (task) => ipcRenderer.send('trigger-alarm', task),

  // 알람 팝업 창에서 "확인" 눌렀을 때
  closeAlarm: () => ipcRenderer.send('close-alarm'),
  onAlarmData: (callback) => ipcRenderer.on('alarm-data', (event, data) => callback(data)),

  // 할 일 목록 파일 저장/불러오기 (프로그램 재시작해도 유지)
  loadTasks: () => ipcRenderer.invoke('load-tasks'),
  saveTasks: (tasks) => ipcRenderer.send('save-tasks', tasks),

  // 프로그램 버전 조회 (정보 팝업용)
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
