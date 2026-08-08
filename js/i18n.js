// Traditional Chinese as written in Taiwan, English second.
// Deliberately Taiwanese vocabulary: 程式 not 程序, 迴圈 not 循环, 軟體 not 軟件,
// 資料 not 数据, 執行 not 运行, 儲存 not 保存, 新增 not 添加, 拖曳 not 拖拽.

export const DEFAULT_LANG = 'zh-TW';

export const STRINGS = {
  'zh-TW': {
    title1: '紙飛行', title2: '俱樂部',
    age: '8–12 歲',

    whichDrone: '哪一台是你的無人機？',
    connect: '連線', disconnect: '中斷連線', addDrone: '新增一台',
    droneName: '幫它取個名字', noDrones: '還沒有配對過的無人機，按「新增一台」開始。',
    forget: '移除', renameHint: '點名字就可以改',

    bricksTitle: '用積木排程式', bricksHint: '拖曳可以換順序',
    addBrick: '加一塊積木', removeBrick: '拿掉這塊',
    pyTitle: '用 Python 寫', pyHint: '真正的程式碼',
    pyComment: '飛一個正方形。用一個迴圈，不用複製貼上。',
    editPython: '改 Python', backToBricks: '回到積木',
    editWarning: '你現在直接改 Python 了。積木不會再跟著變——按「回到積木」會把你的修改丟掉。',

    tip: '<b>有底色的數字</b>就是你可以點的積木。把 <b>4</b> 改成 <b>3</b> 就會變成三角形。按「開始飛」之前，先猜猜看會發生什麼事。',
    logReady: '準備好就按<b>開始飛</b>。',

    flyIt: '開始飛', stopNow: '馬上停', runPython: '用 Python 執行',
    ready: '就緒', notReady: '還沒連線', propsOff: '螺旋槳拆了嗎？',

    saysTitle: '無人機說…', howTitle: '現在狀況', notConnected: '還沒連上任何一台無人機。',
    sBatt: '電量', sBattSub: '滿電大約可以飛六次',
    sFlat: '有放平嗎？', sFlatSub: '傾斜越小越好', sYes: '有', sNo: '沒有',
    sBlue: '藍燈亮了嗎？', sBlueSub: '代表它知道哪邊是上面',
    sProp: '螺旋槳', sPropSub: '測試程式的時候先拆下來', sCheck: '檢查！',
    sTilt: '傾斜',

    manualTitle: '用鍵盤手動飛',
    manualSub: '按住按鍵就會動，放開就回到中間。空白鍵是馬上停。',
    kThrust: '上升 / 下降', kYaw: '左轉 / 右轉', kPitch: '前進 / 後退', kRoll: '左飛 / 右飛', kStop: '馬上停',

    checkTitle: '每次飛之前',
    c1: '<strong>放在平的地板上，按一下重設按鈕。</strong>等到藍燈不再閃爍，那是無人機在弄清楚哪邊是上面。沒做這一步它就不會起飛，而且不會告訴你原因。',
    c2: '<strong>寫程式的時候先把螺旋槳拆下來。</strong>馬達還是會轉、會嗡嗡叫，你聽得出程式有在動，但無人機會乖乖待在桌上。等它做的跟你想的一樣，再把螺旋槳裝回去。',
    c3: '<strong>把桌面清乾淨。</strong>杯子、鉛筆和手都退遠一點。就算沒有螺旋槳，無人機還是有可能亂滑出去。',
    c4: '<strong>記住停止鍵在哪裡。</strong>紅色的「馬上停」按鈕和空白鍵都會立刻關掉馬達。飛之前先按一次，讓你的手記住位置。',

    needChrome: '<strong>這個瀏覽器不能連藍牙。</strong>請用 Chrome 或 Edge。Safari 和 Firefox 沒有支援 Web Bluetooth，沒辦法跟無人機說話。',

    blocks: {
      takeoff: ['起飛', '慢慢升起來，停在空中'],
      land: ['降落', '慢慢降下來'],
      forward: ['往前飛', '點數字就可以改'],
      back: ['往後飛', '倒退一點點'],
      turn_right: ['右轉', '轉幾度都可以'],
      turn_left: ['左轉', '轉幾度都可以'],
      up: ['往上升', '飛高一點'],
      down: ['往下降', '飛低一點'],
      wait: ['等一下', '停在空中不動'],
      loop: ['重複做', '下面縮排的積木會再做一次'],
    },

    runMsg: {
      takeoff: '起飛中…', land: '降落中…', forward: '往前飛', back: '往後飛',
      turn_right: '右轉', turn_left: '左轉', up: '往上升', down: '往下降',
      wait: '等一下', loop: '第 {n} 次',
    },
    done: '做完了，降落。', stopped: '停下來了。馬達關閉，一切正常。',
    aborted: '中斷了。搖桿已經回到中間。',
    notConnectedRun: '還沒連上無人機，先按「連線」。',
    pyLoading: '正在載入 Python（大約 10 MB，第一次比較久）…',
    pyReady: 'Python 準備好了。',

    foot: '積木和 Python 會同步 · 只能在 Chrome 或 Edge 使用',
  },

  en: {
    title1: 'Paper ', title2: 'Flight Club',
    age: 'Ages 8–12',

    whichDrone: 'Which drone is yours?',
    connect: 'Connect', disconnect: 'Disconnect', addDrone: 'Add a drone',
    droneName: 'give it a name', noDrones: 'No drones paired yet — press “Add a drone”.',
    forget: 'Remove', renameHint: 'tap the name to change it',

    bricksTitle: 'Build with bricks', bricksHint: 'drag to reorder',
    addBrick: 'Add a brick', removeBrick: 'Remove this one',
    pyTitle: 'In Python', pyHint: 'real code',
    pyComment: 'Fly a square. One loop, no copy-paste.',
    editPython: 'Edit the Python', backToBricks: 'Back to bricks',
    editWarning: 'You are editing the Python directly now. The bricks will not follow — “Back to bricks” discards your changes.',

    tip: '<b>The shaded numbers</b> are the bricks you can tap. Change <b>4</b> to <b>3</b> and you get a triangle. Try guessing what happens before you press Fly it.',
    logReady: 'Ready when you are. Press <b>Fly it</b>.',

    flyIt: 'Fly it', stopNow: 'Stop now', runPython: 'Run as Python',
    ready: 'Ready', notReady: 'Not connected', propsOff: 'Propellers off?',

    saysTitle: 'Your drone says…', howTitle: "How it's doing", notConnected: 'No drone connected yet.',
    sBatt: 'Battery', sBattSub: 'a full pack is about six flights',
    sFlat: 'Sitting flat?', sFlatSub: 'the less tilt the better', sYes: 'Yes', sNo: 'No',
    sBlue: 'Blue light on?', sBlueSub: 'means it knows which way is up',
    sProp: 'Propellers', sPropSub: 'take them off while you test your code', sCheck: 'Check!',
    sTilt: 'Tilt',

    manualTitle: 'Fly it by keyboard',
    manualSub: 'Hold a key to move, let go to recentre. Spacebar stops everything.',
    kThrust: 'up / down', kYaw: 'turn left / right', kPitch: 'forward / back', kRoll: 'slide left / right', kStop: 'stop now',

    checkTitle: 'Before every flight',
    c1: '<strong>Flat floor, then press reset.</strong> Wait for the blue light to stop blinking — that is the drone working out which way is up. Skip it and it simply will not take off, and it will not tell you why.',
    c2: '<strong>Propellers off while you are coding.</strong> The motors still spin and buzz, so you can hear your code working, but the drone stays on the table. Put them back on once it does what you meant.',
    c3: '<strong>Clear the table.</strong> Cups, pencils and hands well back. Even with no propellers a drone can skitter.',
    c4: '<strong>Know your stop.</strong> The red Stop now button and the spacebar both cut the motors instantly. Press it once before you fly, so your hands know where it is.',

    needChrome: '<strong>This browser cannot use Bluetooth.</strong> Please use Chrome or Edge. Safari and Firefox do not implement Web Bluetooth and cannot talk to the drone.',

    blocks: {
      takeoff: ['Take off', 'rise gently and hover'],
      land: ['Land', 'come down slowly'],
      forward: ['Fly forward', 'tap the number to change it'],
      back: ['Fly backward', 'back up a little'],
      turn_right: ['Turn right', 'any angle you like'],
      turn_left: ['Turn left', 'any angle you like'],
      up: ['Go up', 'climb a bit'],
      down: ['Go down', 'drop a bit'],
      wait: ['Wait', 'hover without moving'],
      loop: ['Do this again', 'everything indented below repeats'],
    },

    runMsg: {
      takeoff: 'lifting off…', land: 'landing…', forward: 'flying forward', back: 'flying backward',
      turn_right: 'turning right', turn_left: 'turning left', up: 'going up', down: 'going down',
      wait: 'waiting', loop: 'time {n}',
    },
    done: 'all done, landed.', stopped: 'Stopped. Motors off — everything is fine.',
    aborted: 'Stopped. Sticks are back to centre.',
    notConnectedRun: 'Not connected yet — press Connect first.',
    pyLoading: 'Loading Python (about 10 MB, slow the first time)…',
    pyReady: 'Python is ready.',

    foot: 'Bricks and Python stay in sync · Chrome or Edge only',
  },
};

export function t(lang, key) {
  const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}
