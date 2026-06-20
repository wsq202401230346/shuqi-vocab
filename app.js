const STORAGE_KEY = "shuqi-vocab-state-v1";
const APP_VERSION = "1.0.0";
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const state = loadState();
let words = mergeWords(window.BUILTIN_WORDS, state.customWords);
let currentWord = null;
let memoryWord = null;

const $ = (id) => document.getElementById(id);

const els = {
  learnedCount: $("learnedCount"),
  dueCount: $("dueCount"),
  streakCount: $("streakCount"),
  tagText: $("tagText"),
  wordText: $("wordText"),
  phoneticText: $("phoneticText"),
  answerPanel: $("answerPanel"),
  meaningText: $("meaningText"),
  exampleText: $("exampleText"),
  hintText: $("hintText"),
  reviewSummary: $("reviewSummary"),
  reviewList: $("reviewList"),
  totalWords: $("totalWords"),
  libraryList: $("libraryList"),
  searchInput: $("searchInput"),
  memoryPrompt: $("memoryPrompt"),
  memoryAnswer: $("memoryAnswer"),
  versionLine: $("versionLine")
};

function loadState() {
  const fallback = {
    progress: {},
    customWords: [],
    streak: 0,
    lastStudyDate: "",
    sessionSeen: []
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderVersion() {
  els.versionLine.textContent = `v${APP_VERSION}`;
}

function mergeWords(builtin, custom) {
  const seen = new Set();
  return [...builtin, ...(custom || [])].filter((item) => {
    const key = item.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function progressFor(wordId) {
  if (!state.progress[wordId]) {
    state.progress[wordId] = {
      reviews: 0,
      ease: 2.3,
      interval: 0,
      dueAt: 0,
      lastGrade: "",
      lapses: 0
    };
  }
  return state.progress[wordId];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function touchStreak() {
  const today = todayKey();
  if (state.lastStudyDate === today) return;
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  state.streak = state.lastStudyDate === yesterday ? state.streak + 1 : 1;
  state.lastStudyDate = today;
}

function dueWords() {
  const now = Date.now();
  return words.filter((word) => {
    const progress = progressFor(word.id);
    return progress.reviews > 0 && progress.dueAt <= now;
  });
}

function newWords() {
  return words.filter((word) => progressFor(word.id).reviews === 0);
}

function weakWords() {
  return words
    .filter((word) => {
      const progress = progressFor(word.id);
      return progress.reviews > 0 && (progress.lastGrade !== "easy" || progress.lapses > 0);
    })
    .sort((a, b) => progressFor(b.id).lapses - progressFor(a.id).lapses);
}

function chooseNextWord(preferDue = false) {
  const due = dueWords();
  const fresh = newWords();
  const pool = preferDue && due.length ? due : due.length ? due : fresh.length ? fresh : weakWords();
  currentWord = pool[0] || words[0];
  renderCurrentWord(false);
}

function renderCurrentWord(revealed) {
  if (!currentWord) return;
  const progress = progressFor(currentWord.id);
  els.tagText.textContent = progress.reviews ? "复习词" : "今日新词";
  els.wordText.textContent = currentWord.word;
  els.phoneticText.textContent = currentWord.phonetic || "";
  els.meaningText.textContent = currentWord.meaning;
  els.exampleText.textContent = currentWord.example || "把它放进自己的句子里，记得会更牢。";
  els.hintText.textContent = currentWord.hint || "把词根、发音或生活场景连起来记。";
  els.answerPanel.classList.toggle("revealed", revealed);
}

function gradeCurrent(grade) {
  if (!currentWord) return;
  touchStreak();
  const progress = progressFor(currentWord.id);
  progress.reviews += 1;
  progress.lastGrade = grade;

  if (grade === "again") {
    progress.ease = Math.max(1.3, progress.ease - 0.25);
    progress.interval = 0;
    progress.dueAt = Date.now() + 5 * MINUTE;
    progress.lapses += 1;
  } else if (grade === "hard") {
    progress.ease = Math.max(1.5, progress.ease - 0.08);
    progress.interval = Math.max(1, Math.ceil(progress.interval * 1.25 || 1));
    progress.dueAt = Date.now() + progress.interval * DAY;
  } else {
    progress.ease = Math.min(3.0, progress.ease + 0.12);
    progress.interval = progress.interval ? Math.ceil(progress.interval * progress.ease) : 2;
    progress.dueAt = Date.now() + progress.interval * DAY;
  }

  state.sessionSeen = [...new Set([...(state.sessionSeen || []), currentWord.id])].slice(-80);
  saveState();
  chooseNextWord();
  renderStats();
  renderReview();
}

function renderStats() {
  const learned = words.filter((word) => progressFor(word.id).reviews > 0).length;
  els.learnedCount.textContent = learned;
  els.dueCount.textContent = dueWords().length;
  els.streakCount.textContent = state.streak || 0;
  els.totalWords.textContent = words.length;
}

function renderReview() {
  const due = dueWords();
  els.reviewSummary.textContent = due.length
    ? `现在有 ${due.length} 个词该复习。不认识的词会更快回来。`
    : "现在没有到期复习词。可以先学新词，系统会自动安排。";
  els.reviewList.innerHTML = due.slice(0, 20).map(wordRow).join("");
}

function wordRow(word) {
  const progress = progressFor(word.id);
  const label = progress.reviews ? `复习 ${progress.reviews} 次` : word.source;
  return `<div class="mini-word"><strong>${escapeHtml(word.word)}</strong><small>${escapeHtml(word.meaning)} · ${escapeHtml(label)}</small></div>`;
}

function renderLibrary() {
  const query = els.searchInput.value.trim().toLowerCase();
  const list = words.filter((word) => {
    if (!query) return true;
    return `${word.word} ${word.meaning}`.toLowerCase().includes(query);
  });
  els.libraryList.innerHTML = list.slice(0, 80).map(wordRow).join("");
}

function chooseMemoryWord() {
  const pool = weakWords();
  memoryWord = (pool.length ? pool : words)[Math.floor(Math.random() * (pool.length ? pool.length : words.length))];
  els.memoryPrompt.textContent = memoryWord.meaning;
  els.memoryAnswer.textContent = "";
}

function revealMemory() {
  if (!memoryWord) return;
  els.memoryAnswer.textContent = `${memoryWord.word} ${memoryWord.phonetic || ""}`;
}

function speakCurrent() {
  if (!currentWord || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(currentWord.word);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function parseImport(text) {
  return text.split(/\r?\n/).map((line, index) => {
    const parts = line.split(/[,\t，]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return {
      id: `custom-${Date.now()}-${index}`,
      word: parts[0],
      phonetic: "",
      meaning: parts[1],
      example: parts[2] || "",
      hint: parts[3] || "",
      source: "自定义导入"
    };
  }).filter(Boolean);
}

function importWords(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const imported = parseImport(String(reader.result || ""));
    state.customWords = mergeWords(state.customWords || [], imported);
    words = mergeWords(window.BUILTIN_WORDS, state.customWords);
    saveState();
    renderStats();
    renderLibrary();
    alert(`已导入 ${imported.length} 个词。格式：word,中文释义,例句,记忆提示`);
  };
  reader.readAsText(file);
}

function exportProgress() {
  const payload = {
    app: "书琦词光",
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    customWords: state.customWords
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shuqi-vocab-progress.json";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.view).classList.add("active");
    if (tab.dataset.view === "libraryView") renderLibrary();
    if (tab.dataset.view === "reviewView") renderReview();
    if (tab.dataset.view === "memoryView") chooseMemoryWord();
  });
});

$("flipBtn").addEventListener("click", () => renderCurrentWord(true));
$("wordCard").addEventListener("click", (event) => {
  if (event.target.id !== "speakBtn") renderCurrentWord(true);
});
$("speakBtn").addEventListener("click", speakCurrent);
document.querySelectorAll(".grade").forEach((button) => {
  button.addEventListener("click", () => gradeCurrent(button.dataset.grade));
});
$("startReviewBtn").addEventListener("click", () => chooseNextWord(true));
$("searchInput").addEventListener("input", renderLibrary);
$("memoryRevealBtn").addEventListener("click", revealMemory);
$("memoryNextBtn").addEventListener("click", chooseMemoryWord);
$("importInput").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) importWords(file);
});
$("exportBtn").addEventListener("click", exportProgress);
$("installHelpBtn").addEventListener("click", () => $("installDialog").showModal());
$("closeDialogBtn").addEventListener("click", () => $("installDialog").close());

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            $("updateDialog").showModal();
          }
        });
      });
    });
  });
}

$("refreshAppBtn").addEventListener("click", () => window.location.reload());

renderVersion();
renderStats();
renderReview();
chooseNextWord();
chooseMemoryWord();
registerServiceWorker();
