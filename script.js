let robotHost = null;
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

async function startStream() {
  const ip = document.getElementById('ipInput').value;
  if (!ip) return alert('Kérlek add meg az IP-t!');

  robotHost = new URLSearchParams(window.location.search).get("robot-host");
  if (!robotHost) return alert('Hiányzik a robot-host paraméter az URL-ből.');

  const videoUrl = `http://${ip}/video`;
  video.src = videoUrl;

  await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
  detectFaceLoop();
}

async function detectFaceLoop() {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(video, options);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(det => {
      const { x, y, width, height } = det.box;
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const offsetX = centerX - canvas.width / 2;
      const offsetY = centerY - canvas.height / 2;

      if (offsetX > 50) sendCommand('right');
      else if (offsetX < -50) sendCommand('left');

      if (offsetY > 50) sendCommand('down');
      else if (offsetY < -50) sendCommand('up');
    });
  }, 500);
}

function sendCommand(direction) {
  if (!robotHost) return console.error("Robot-host nem elérhető.");
  fetch(`http://${robotHost}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: direction
  });
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp': sendCommand('up'); break;
    case 'ArrowDown': sendCommand('down'); break;
    case 'ArrowLeft': sendCommand('left'); break;
    case 'ArrowRight': sendCommand('right'); break;
  }
});
