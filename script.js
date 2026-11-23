// ============================================================================
// 1. BIBLIOTECA DE MÚSICAS PRÉ-INSTALADAS (Sintetizador Rítmico Sincronizado)
// ============================================================================
const SONGS = [
  {
    id: "0",
    title: "Cyber Synthwave",
    bpm: 110,
    duration: 35, // segundos
    scale: [220.00, 261.63, 329.63, 392.00], // Lá menor (A3, C4, E4, G4)
    bass: [110.00, 110.00, 87.31, 98.00],
    wave: "sawtooth"
  },
  {
    id: "1",
    title: "Neon Drive",
    bpm: 128,
    duration: 40,
    scale: [261.63, 311.13, 392.00, 466.16], // Dó menor (C4, Eb4, G4, Bb4)
    bass: [130.81, 103.83, 116.54, 98.00],
    wave: "triangle"
  },
  {
    id: "2",
    title: "Retro Arcade",
    bpm: 140,
    duration: 45,
    scale: [293.66, 349.23, 440.00, 523.25], // Ré menor (D4, F4, A4, C5)
    bass: [146.83, 116.54, 130.81, 146.83],
    wave: "square"
  },
  {
    id: "3",
    title: "Hyper Bass",
    bpm: 160,
    duration: 45,
    scale: [164.81, 196.00, 246.94, 329.63], // Mi menor (E3, G3, B3, E4)
    bass: [82.41, 82.41, 98.00, 73.42],
    wave: "sawtooth"
  }
];

const DIFFICULTIES = {
  easy: { speed: 4.0, doubleNoteChance: 0.0, stepMultiplier: 2 },
  medium: { speed: 5.5, doubleNoteChance: 0.18, stepMultiplier: 1 },
  hard: { speed: 7.2, doubleNoteChance: 0.35, stepMultiplier: 1 }
};

// ============================================================================
// 2. CAMADA DE BANCO DE DADOS (Pronta para conectar o Firebase na Etapa 2)
// ============================================================================
// Por enquanto usa localStorage para você testar o ranking imediatamente.
// Na próxima etapa, trocaremos o interior destas 2 funções pelo Firebase Firestore!

async function salvarPontuacaoNoBanco(registro) {
  const dadosAtuais = JSON.parse(localStorage.getItem("neon_beats_ranking") || "[]");
  dadosAtuais.push(registro);
  localStorage.setItem("neon_beats_ranking", JSON.stringify(dadosAtuais));
}

async function carregarRankingDoBanco(filtroMusicaId = "all") {
  let dados = JSON.parse(localStorage.getItem("neon_beats_ranking") || "[]");

  if (filtroMusicaId !== "all") {
    dados = dados.filter((item) => item.songId === filtroMusicaId);
  }

  // Ordena da maior pontuação para a menor e pega os 10 primeiros
  dados.sort((a, b) => b.score - a.score);
  return dados.slice(0, 10);
}

// ============================================================================
// 3. ELEMENTOS DA INTERFACE E ESTADO DO JOGO
// ============================================================================
const lanes = document.querySelectorAll(".lane");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const accuracyEl = document.getElementById("accuracy");
const healthBarEl = document.getElementById("health-bar");
const progressBarEl = document.getElementById("song-progress");
const feedbackEl = document.getElementById("feedback");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayDesc = document.getElementById("overlay-desc");
const playerInput = document.getElementById("player-name");
const songSelect = document.getElementById("song-select");
const difficultySelect = document.getElementById("difficulty-select");
const startBtn = document.getElementById("start-btn");

const rankingList = document.getElementById("ranking-list");
const rankingFilter = document.getElementById("ranking-filter");

const KEYS = ["d", "f", "j", "k"];
let audioCtx = null;
let isPlaying = false;
let activeNotes = [];
let beatInterval = null;
let progressInterval = null;
let animFrameId = null;

// Estatísticas da partida atual
let currentSong = SONGS[0];
let currentDiff = DIFFICULTIES.medium;
let score = 0;
let combo = 0;
let health = 100;
let hits = 0;
let totalNotes = 0;
let stepCount = 0;
let startTime = 0;

// ============================================================================
// 4. MOTOR DE ÁUDIO (Web Audio API - Trilha + Efeitos de Acerto/Erro)
// ============================================================================
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playSynthTone(freq, type = "triangle", duration = 0.22, volume = 0.14) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// ============================================================================
// 5. LÓGICA PRINCIPAL DO JOGO
// ============================================================================
function startGame() {
  const playerName = playerInput.value.trim();
  if (!playerName) {
    playerInput.style.borderColor = "#ff007f";
    playerInput.focus();
    return;
  }
  playerInput.style.borderColor = "#3a2d7d";

  initAudio();

  // Reseta estado
  currentSong = SONGS[Number(songSelect.value)];
  currentDiff = DIFFICULTIES[difficultySelect.value];
  score = 0;
  combo = 0;
  health = 100;
  hits = 0;
  totalNotes = 0;
  stepCount = 0;
  isPlaying = true;
  startTime = Date.now();

  // Limpa notas antigas
  activeNotes.forEach((n) => n.el.remove());
  activeNotes = [];

  updateHUD();
  overlay.style.display = "none";
  setFeedback("PREPARE-SE!", "#00f3ff");

  // Intervalo da batida baseado no BPM da música
  const beatMs = (60 / currentSong.bpm) * 1000 * currentDiff.stepMultiplier;

  beatInterval = setInterval(() => {
    if (!isPlaying) return;

    // Toca o baixo de fundo no compasso
    const bassFreq = currentSong.bass[stepCount % currentSong.bass.length];
    playSynthTone(bassFreq, "sine", 0.35, 0.18);

    // Gera nota principal
    const laneIdx = Math.floor(Math.random() * 4);
    createNote(laneIdx);

    // Chance de nota dupla dependendo da dificuldade
    if (Math.random() < currentDiff.doubleNoteChance) {
      const secondLane = (laneIdx + 1 + Math.floor(Math.random() * 3)) % 4;
      createNote(secondLane);
    }

    stepCount++;
  }, beatMs);

  // Controle de tempo da música
  progressInterval = setInterval(() => {
    if (!isPlaying) return;
    const elapsed = (Date.now() - startTime) / 1000;
    const pct = Math.min((elapsed / currentSong.duration) * 100, 100);
    progressBarEl.style.width = `${pct}%`;

    if (elapsed >= currentSong.duration) {
      endGame(true);
    }
  }, 100);

  animFrameId = requestAnimationFrame(gameLoop);
}

function createNote(laneIndex) {
  const lane = lanes[laneIndex];
  const noteEl = document.createElement("div");
  noteEl.classList.add("note");
  lane.appendChild(noteEl);

  totalNotes++;
  activeNotes.push({
    el: noteEl,
    key: KEYS[laneIndex],
    laneIndex,
    y: -25
  });
}

function gameLoop() {
  if (!isPlaying) return;

  for (let i = activeNotes.length - 1; i >= 0; i--) {
    const note = activeNotes[i];
    note.y += currentDiff.speed;
    note.el.style.top = `${note.y}px`;

    // Passou da zona limite (435px) sem ser acertada
    if (note.y > 435) {
      note.el.remove();
      activeNotes.splice(i, 1);
      registerMiss();
    }
  }

  if (isPlaying) {
    animFrameId = requestAnimationFrame(gameLoop);
  }
}

function handleInput(key) {
  if (!isPlaying) return;
  const laneIndex = KEYS.indexOf(key);
  if (laneIndex === -1) return;

  // Efeito visual na coluna
  const lane = lanes[laneIndex];
  lane.classList.add("active");
  setTimeout(() => lane.classList.remove("active"), 100);

  // Zona alvo fica em torno de y = 382px (bottom: 22px + height: 46px)
  const hitIndex = activeNotes.findIndex(
    (n) => n.key === key && n.y >= 340 && n.y <= 425
  );

  if (hitIndex !== -1) {
    const note = activeNotes[hitIndex];
    const distance = Math.abs(note.y - 382);

    note.el.remove();
    activeNotes.splice(hitIndex, 1);

    // Toca a nota musical correspondente à coluna
    playSynthTone(currentSong.scale[laneIndex], currentSong.wave, 0.25, 0.16);

    hits++;
    combo++;
    health = Math.min(100, health + 3);

    const multiplier = Math.min(4, 1 + Math.floor(combo / 10));
    if (distance <= 16) {
      score += 100 * multiplier;
      setFeedback(`PERFEITO! (${multiplier}x)`, "#00ff88");
    } else {
      score += 50 * multiplier;
      setFeedback(`BOM! (${multiplier}x)`, "#00f3ff");
    }

    updateHUD();
  } else {
    // Apertou tecla sem nota na zona
    playSynthTone(95, "sawtooth", 0.15, 0.08);
    registerMiss();
  }
}

function registerMiss() {
  combo = 0;
  health = Math.max(0, health - 10);
  setFeedback("ERROU!", "#ff007f");
  updateHUD();

  if (health <= 0) {
    endGame(false);
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  comboEl.textContent = `${combo}x`;
  const acc = totalNotes === 0 ? 100 : Math.round((hits / totalNotes) * 100);
  accuracyEl.textContent = `${acc}%`;
  healthBarEl.style.width = `${health}%`;
}

function setFeedback(text, color) {
  feedbackEl.textContent = text;
  feedbackEl.style.color = color;
}

async function endGame(completed) {
  isPlaying = false;
  clearInterval(beatInterval);
  clearInterval(progressInterval);
  cancelAnimationFrame(animFrameId);

  const acc = totalNotes === 0 ? 0 : Math.round((hits / totalNotes) * 100);
  const playerName = playerInput.value.trim();

  // Salva o resultado no banco (local por enquanto, Firebase na Etapa 2)
  await salvarPontuacaoNoBanco({
    name: playerName,
    songId: currentSong.id,
    songTitle: currentSong.title,
    difficulty: difficultySelect.value,
    score: score,
    accuracy: acc,
    createdAt: Date.now()
  });

  await renderRanking();

  overlayTitle.textContent = completed ? "Música Concluída!" : "Energia Esgotada!";
  overlayDesc.innerHTML = `
    Jogador: <b>${playerName}</b><br>
    Pontuação Final: <b style="color:#00ff88">${score} pts</b> (Precisão: ${acc}%)
  `;
  startBtn.textContent = "JOGAR NOVAMENTE";
  overlay.style.display = "flex";
}

// ============================================================================
// 6. ATUALIZAÇÃO DO RANKING NA TELA
// ============================================================================
async function renderRanking() {
  const filtro = rankingFilter.value;
  const top10 = await carregarRankingDoBanco(filtro);

  rankingList.innerHTML = "";
  if (top10.length === 0) {
    rankingList.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;">Nenhum recorde ainda</td></tr>`;
    return;
  }

  top10.forEach((item, index) => {
    rankingList.innerHTML += `
      <tr>
        <td>${index + 1}º</td>
        <td>${item.name}</td>
        <td>${item.songTitle}</td>
        <td>${item.score}</td>
      </tr>
    `;
  });
}

// ============================================================================
// 7. EVENTOS (Teclado, Toque/Clique e Botões)
// ============================================================================
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (KEYS.includes(key)) {
    handleInput(key);
  }
});

lanes.forEach((lane) => {
  lane.addEventListener("pointerdown", () => {
    const key = lane.getAttribute("data-key");
    handleInput(key);
  });
});

startBtn.addEventListener("click", startGame);
rankingFilter.addEventListener("change", renderRanking);

// Carrega o ranking inicial ao abrir a página
renderRanking();