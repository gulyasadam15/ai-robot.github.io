let robotHost = null;
let bodyModel;
let detectionInterval = null;
let activeMode = "body";
robotHost = new URLSearchParams(window.location.search).get("robot-host");
  if (!robotHost) alert('Hiányzik a robot-host paraméter az URL-ből.');
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const modeSelect = document.getElementById('modeSelect');
const offscreenCanvas = document.getElementById('offscreenCanvas');
const offscreenCtx = offscreenCanvas.getContext('2d');
const CENTER_TOLERANCE = 100;
const FACE_CENTER_TOLERANCE = 150;
const DISTANCE_TOLERANCE = 250;
let DISTANCE_NEAR = 300;
let DISTANCE_FAR = 350;
const modeButtons = document.querySelectorAll('.mode-btn');
const customCodeContainer = document.getElementById('customCodeContainer');
const exampleSelect = document.getElementById('exampleSelect');
const codeArea = document.getElementById('customCode');
let lastSentCommand= null;
let lastSentDirection= null;
let customCodeAbort = false;

const exampleCodes = {
  forward2s: `// Előre 2 másodpercig
(async function moveForward2s() {
  sendCommand('forward');
  await sleep(2000);
  sendCommand('stop');
})();`,
  random: `// Véletlenszerű mozgás
(async function randomMove() {
  const directions = ['forward', 'backward', 'left', 'right'];
  while (!customCodeAbort) {
      const dir = directions[Math.floor(Math.random() * directions.length)];
      sendCommand(dir);
      await sleep(1000);
  }
})();`,
  circle: `// Körbe-körbe mozgás
(async function circleMove() {
  while (!customCodeAbort) {
      sendCommand('right');
      await sleep(1000);
      sendCommand('stop');
  }
})();`
};

async function startStream() {
  const ip = document.getElementById('ipInput').value;
  if (!ip) return alert('Kérlek add meg az IP-t!');

  const videoUrl = `http://${ip}/video`;
  video.src = videoUrl;
}

video.onload = async () => {
    canvas.width = video.naturalWidth;
    canvas.height = video.naturalHeight;
    DISTANCE_NEAR = 300 * video.naturalHeight/1080;
    DISTANCE_FAR = 350 * video.naturalHeight/1080;

    await loadModel();
  
    startDetection(); // induláskor alapértelmezett mód
  };

function startDetection() {
    if (detectionInterval) clearInterval(detectionInterval); // leállítja a korábbi ciklust
    
    detectionInterval = setInterval(async () => {
      if (activeMode === 'body') {
        await detectPose();
      } else {
        await detectFace();
      }
    }, 250);
  }


async function detectFace() {
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    offscreenCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const poses = await bodyModel.estimatePoses(offscreenCanvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (poses.length > 0) {
        const keypoints = poses[0].keypoints;

        const headPoints = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear']
            .map(name => keypoints.find(p => p.name === name && p.score > 0.5))
            .filter(Boolean);

        if (headPoints.length > 0) {
            const xs = headPoints.map(p => p.x);
            const ys = headPoints.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 5;
            ctx.strokeRect(minX - 10, minY - ((maxX - minX) + 20)/2, (maxX - minX) + 20, (maxX - minX)*1.4);

            // Fej középre igazítása
            const headCenterX = (minX + maxX) / 2;
            const canvasCenterX = canvas.width / 2;

            const offsetX = headCenterX - canvasCenterX;
            if (Math.abs(offsetX) > FACE_CENTER_TOLERANCE) {
                if (offsetX < 0){
                  if(Date.now()%1000 < 300){
                      sendCommand('left', false);
                  } else {
                    sendCommand('stop');
                  }
                } 
                else {
                  if(Date.now()%1000 < 300){
                    sendCommand('right', false);
                  } else {
                    sendCommand('stop');
                  }
                }
            } else {
                sendCommand('stop');
            }
        } else {
          search();
        }
    } else {
      search();
    }
}

function search() {
  if (Date.now() % 1000 < 300) {
    if (lastSentDirection == 'left') {
      sendCommand('left', false);
    } else {
      sendCommand('right', false);
    }
  } else {
    sendCommand('stop');
  }
}

function sendCommand(direction, saveCommand = true) {
  if (!robotHost) return console.error("Robot-host nem elérhető.");
  if(lastSentCommand != direction){
    fetch(`http://${robotHost}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: direction
      });
    lastSentCommand = direction;
    if(saveCommand){
      if(direction=='left' || direction=='right' ){
        lastSentDirection = direction;
      }
    }
  }
  
}

async function loadModel() {
    bodyModel = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      runtime: 'tfjs',
      modelType: 'SinglePose.Lightning'
    });
}

async function detectPose() {
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    offscreenCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const poses = await bodyModel.estimatePoses(offscreenCanvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (poses.length > 0) {
        const legPoints = ['right_knee', 'right_ankle','left_knee', 'left_ankle']
            .map(name => poses[0].keypoints.find(p => p.name === name && p.score > 0.5))
            .filter(Boolean);
        if (poses[0].score > 0.4 || legPoints.length > 0) {
            const keypoints = poses[0].keypoints;

            const bxs = keypoints.map(p => p.x);
            const bminX = Math.min(...bxs);
            const bmaxX = Math.max(...bxs);

            const bodyCenterX = (bminX + bmaxX) / 2;
            const canvasCenterX = canvas.width / 2;

            const offsetX = bodyCenterX - canvasCenterX;

            let turnCommandSent = false;
            let moveCommandSent = false;


            if (Math.abs(offsetX) > CENTER_TOLERANCE) {
                if (offsetX < 0) sendCommand('left');
                else sendCommand('right');
                turnCommandSent = true;
            }

            // Testtávolság: csípő és váll távolságai
            const legPoints2 = ['right_knee', 'right_ankle','left_knee', 'left_ankle']
            .map(name => poses[0].keypoints.find(p => p.name === name).y)
            .filter(Boolean);
            const bminY = Math.min(...legPoints2);
            const bmaxY = Math.max(...legPoints2);
            const legHeight = bmaxY - bminY;
            
            if (legHeight > DISTANCE_FAR) {
                sendCommand('backward'); // túl közel
                moveCommandSent = true;
            } else if (legHeight < DISTANCE_NEAR) {
                sendCommand('forward'); // túl messze
                moveCommandSent = true;
            } else {
                sendCommand('stop'); // ha minden rendben
            }

            if(turnCommandSent && !moveCommandSent){
                await sleep(200);
                sendCommand('stop');
            }

            // Fej kirajzolása
            const headPoints = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear']
            .map(name => keypoints.find(p => p.name === name && p.score > 0.5))
            .filter(Boolean);

            const xs = headPoints.map(p => p.x);
            const ys = headPoints.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 5;
            ctx.strokeRect(minX - 10, minY - ((maxX - minX) + 20)/2, (maxX - minX) + 20, (maxX - minX)*1.4);

            const pairs = [
                ['left_shoulder', 'right_shoulder'],
                ['left_shoulder', 'left_elbow'],
                ['left_elbow', 'left_wrist'],
                ['right_shoulder', 'right_elbow'],
                ['right_elbow', 'right_wrist'],
                ['left_shoulder', 'left_hip'],
                ['right_shoulder', 'right_hip'],
                ['left_hip', 'right_hip'],
                ['left_hip', 'left_knee'],
                ['left_knee', 'left_ankle'],
                ['right_hip', 'right_knee'],
                ['right_knee', 'right_ankle']
            ];
    
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 5;
            pairs.forEach(([a, b]) => {
                const kpA = keypoints.find(p => p.name === a && p.score > 0.1);
                const kpB = keypoints.find(p => p.name === b && p.score > 0.1);
                if (kpA && kpB) {
                    ctx.beginPath();
                    ctx.moveTo(kpA.x, kpA.y);
                    ctx.lineTo(kpB.x, kpB.y);
                    ctx.stroke();
                }
            });
        } else {
          search();
        }
    } else {
      search();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp': sendCommand('forward'); break;
    case 'ArrowDown': sendCommand('backward'); break;
    case 'ArrowLeft': sendCommand('left'); break;
    case 'ArrowRight': sendCommand('right'); break;
  }
});

document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowUp': 
      case 'ArrowDown': 
      case 'ArrowLeft': 
      case 'ArrowRight': sendCommand('stop'); break;
    }
  });
  
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeMode = btn.dataset.mode;

        // Megfelelő tartalom megjelenítése
        if (activeMode === 'custom') {
        customCodeContainer.style.display = 'block';
        if (detectionInterval) clearInterval(detectionInterval);
        } else {
        customCodeContainer.style.display = 'none';
        startDetection();
        }
    });
});

function runCustomCode() {
    customCodeAbort = false;
    const code = codeArea.value;
    try {
      new Function(code)();
    } catch (err) {
      alert("❌ Hiba a kódban:\n" + err.message);
    }
  }
  
  function stopCustomCode() {
    customCodeAbort = true;
    sendCommand('stop'); // Biztonság kedvéért leállítjuk
  }

  
  function updateExampleCode() {
    const selected = exampleSelect.value;
    codeArea.value = exampleCodes[selected] || '';
  }
  
  // Automatikus betöltés induláskor
  updateExampleCode();
  
  exampleSelect.addEventListener('change', updateExampleCode);