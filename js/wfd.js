const WFD_RECORDS_KEY = "pte_wfd_practice_records_v1";
const WFD_FAVORITES_KEY = "pte_reading_practice_favorite_questions_v1";
const WFD_FAVORITE_PREFIX = "WFD:";
const WFD_VOCAB_STORAGE_KEY = "pte_reading_practice_vocab_bank_v1";

const wfdState = {
  questions: [],
  filtered: [],
  currentIndex: 0,
  records: {},
  favoriteIds: new Set(),
  statusFilter: "all",
  favoritesOnly: false,
  showListAnswers: false,
  wordIndex: new Map(),
  coreWordIndex: new Map(),
  wordbook: new Set(),
  selectedLookupWord: "",
};

const wfdEls = {};

document.addEventListener("DOMContentLoaded", initWfd);

function initWfd() {
  bindWfdElements();
  bindWfdEvents();
  wfdState.questions = (window.PTE_WFD_DATA && window.PTE_WFD_DATA.questions) || [];
  wfdState.filtered = [...wfdState.questions];
  wfdState.records = loadWfdRecords();
  wfdState.favoriteIds = loadWfdFavoriteIds();
  wfdState.wordbook = loadWfdWordbook();
  buildWfdWordIndexes();
  const params = new URLSearchParams(window.location.search);
  wfdState.favoritesOnly = params.get("favorites") === "1";
  applyWfdStatusFilter(false);
  selectWfdFromQuery(params);
  renderWfdAll();
}

function bindWfdElements() {
  [
    "wfd-list",
    "wfd-search",
    "wfd-meta",
    "wfd-title",
    "wfd-play",
    "wfd-slow",
    "wfd-show-answer",
    "wfd-answer-input",
    "wfd-submit",
    "wfd-redo",
    "wfd-result",
    "wfd-answer",
    "wfd-char-count",
    "wfd-prev",
    "wfd-next",
    "wfd-random",
    "wfd-reset-records",
    "wfd-toggle-list-answers",
    "wfd-favorite",
    "wfd-word-card",
  ].forEach((id) => {
    wfdEls[id] = document.getElementById(id);
  });
}

function bindWfdEvents() {
  wfdEls["wfd-search"]?.addEventListener("change", filterWfdList);
  wfdEls["wfd-play"]?.addEventListener("click", () => speakCurrentWfd(1));
  wfdEls["wfd-slow"]?.addEventListener("click", () => speakCurrentWfd(0.8));
  wfdEls["wfd-show-answer"]?.addEventListener("click", toggleWfdAnswer);
  wfdEls["wfd-submit"]?.addEventListener("click", submitWfdAnswer);
  wfdEls["wfd-redo"]?.addEventListener("click", resetCurrentWfdAttempt);
  wfdEls["wfd-answer-input"]?.addEventListener("input", updateWfdCharCount);
  wfdEls["wfd-prev"]?.addEventListener("click", () => moveWfd(-1));
  wfdEls["wfd-next"]?.addEventListener("click", () => moveWfd(1, { autoPlay: true }));
  wfdEls["wfd-random"]?.addEventListener("click", randomWfd);
  wfdEls["wfd-reset-records"]?.addEventListener("click", resetWfdRecords);
  wfdEls["wfd-toggle-list-answers"]?.addEventListener("click", toggleWfdListAnswers);
  wfdEls["wfd-favorite"]?.addEventListener("click", toggleCurrentWfdFavorite);
  document.addEventListener("click", handleWfdDocumentClick);
}

function renderWfdAll() {
  renderWfdList();
  renderCurrentWfd();
}

function getCurrentWfd() {
  if (wfdState.favoritesOnly || wfdState.statusFilter !== "all") {
    return wfdState.filtered[wfdState.currentIndex] || null;
  }
  return wfdState.filtered[wfdState.currentIndex] || wfdState.questions[0] || null;
}

function renderWfdList() {
  const list = wfdEls["wfd-list"];
  if (!list) return;
  if (!wfdState.filtered.length) {
    list.innerHTML = '<div class="empty-state">没有找到匹配题目</div>';
    return;
  }
  list.innerHTML = wfdState.filtered
    .map((question, index) => {
      const record = wfdState.records[question.id];
      const score = record ? Math.round(record.score) : 0;
      const status = record ? `正确率 ${score}%` : "未完成";
      const progressClass = score >= 80 ? "good" : score > 0 ? "mid" : "";
      return `
        <button class="question-item wfd-question-item ${wfdState.showListAnswers ? "wfd-with-answer" : ""} ${index === wfdState.currentIndex ? "active" : ""}" type="button" data-wfd-index="${index}">
          <span class="wfd-list-icon" aria-hidden="true">♬</span>
          <span class="wfd-list-main">
            <strong>WFD #${escapeWfdHtml(String(question.question_id).padStart(3, "0"))}</strong>
            <span class="item-meta">${escapeWfdHtml(status)}</span>
            <span class="wfd-progress-track" aria-hidden="true"><span class="${progressClass}" style="width: ${score}%"></span></span>
            ${wfdState.showListAnswers ? `<span class="wfd-list-answer">${escapeWfdHtml(question.answer)}</span>` : ""}
          </span>
          ${index === wfdState.currentIndex ? '<span class="wfd-current-badge">当前</span>' : ""}
        </button>
      `;
    })
    .join("");

  list.querySelectorAll("[data-wfd-index]").forEach((button) => {
    button.addEventListener("click", () => {
      wfdState.currentIndex = Number(button.dataset.wfdIndex || 0);
      renderWfdAll();
    });
  });
}

function toggleWfdListAnswers() {
  wfdState.showListAnswers = !wfdState.showListAnswers;
  wfdEls["wfd-toggle-list-answers"]?.classList.toggle("active", wfdState.showListAnswers);
  wfdEls["wfd-toggle-list-answers"]?.setAttribute(
    "aria-label",
    wfdState.showListAnswers ? "隐藏左侧句子" : "显示左侧句子",
  );
  renderWfdList();
}

function renderCurrentWfd() {
  const question = getCurrentWfd();
  if (!question) {
    setWfdText("wfd-meta", "WFD");
    setWfdText("wfd-title", wfdState.favoritesOnly ? "暂无 WFD 收藏题目" : "暂无 WFD 题目");
    wfdEls["wfd-favorite"]?.classList.add("hidden");
    return;
  }
  wfdEls["wfd-favorite"]?.classList.remove("hidden");
  const position = wfdState.currentIndex + 1;
  setWfdText("wfd-meta", `WFD · 第 ${position} / ${wfdState.filtered.length} 题`);
  setWfdText("wfd-title", "Write From Dictation");
  updateWfdFavoriteButton(question);
  wfdEls["wfd-answer-input"].value = "";
  updateWfdCharCount();
  wfdEls["wfd-result"].classList.add("hidden");
  wfdEls["wfd-result"].innerHTML = "";
  wfdEls["wfd-answer"].classList.remove("hidden", "revealed");
  updateWfdAnswerToggleButton();
  wfdEls["wfd-answer"].innerHTML = `
    <div class="wfd-answer-locked">
      <div class="wfd-lock-icon" aria-hidden="true">▣</div>
      <strong>答案已隐藏</strong>
      <p>完成听写后，可点击「显示答案」查看原文</p>
    </div>
    <div class="wfd-answer-text"><strong>答案：</strong>${renderWfdLookupSentence(question.answer)}</div>
  `;
}

function filterWfdList() {
  wfdState.statusFilter = wfdEls["wfd-search"]?.value || "all";
  applyWfdStatusFilter(true);
}

function applyWfdStatusFilter(renderCurrent = true) {
  wfdState.filtered = wfdState.questions.filter((question) => {
    const isDone = Boolean(wfdState.records[question.id]);
    if (wfdState.favoritesOnly && !wfdState.favoriteIds.has(getWfdFavoriteId(question))) return false;
    if (wfdState.statusFilter === "done") return isDone;
    if (wfdState.statusFilter === "undone") return !isDone;
    return true;
  });
  if (renderCurrent) {
    wfdState.currentIndex = 0;
    renderWfdAll();
  } else {
    wfdState.currentIndex = Math.min(wfdState.currentIndex, Math.max(0, wfdState.filtered.length - 1));
    renderWfdList();
  }
}

function selectWfdFromQuery(params = new URLSearchParams(window.location.search)) {
  const questionId = params.get("questionId");
  if (!questionId) return;
  const index = wfdState.filtered.findIndex((question) => question.id === questionId);
  if (index >= 0) {
    wfdState.currentIndex = index;
    return;
  }
  if (wfdState.favoritesOnly) return;
  const allIndex = wfdState.questions.findIndex((question) => question.id === questionId);
  if (allIndex >= 0) {
    wfdState.statusFilter = "all";
    if (wfdEls["wfd-search"]) wfdEls["wfd-search"].value = "all";
    wfdState.filtered = [...wfdState.questions];
    wfdState.currentIndex = allIndex;
  }
}

function getWfdFavoriteId(question) {
  return `${WFD_FAVORITE_PREFIX}${question?.id || ""}`;
}

function updateWfdFavoriteButton(question = getCurrentWfd()) {
  const button = wfdEls["wfd-favorite"];
  if (!button || !question) return;
  const isFavorite = wfdState.favoriteIds.has(getWfdFavoriteId(question));
  button.classList.toggle("active", isFavorite);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.textContent = isFavorite ? "已收藏" : "加入收藏夹";
}

function toggleCurrentWfdFavorite() {
  const question = getCurrentWfd();
  if (!question) return;
  const favoriteId = getWfdFavoriteId(question);
  if (wfdState.favoriteIds.has(favoriteId)) {
    wfdState.favoriteIds.delete(favoriteId);
    showWfdToast("已取消收藏");
  } else {
    wfdState.favoriteIds.add(favoriteId);
    showWfdToast("已加入题目收藏夹");
  }
  saveWfdFavoriteIds();
  if (wfdState.favoritesOnly && !wfdState.favoriteIds.has(favoriteId)) {
    applyWfdStatusFilter(true);
  } else {
    updateWfdFavoriteButton(question);
    renderWfdList();
  }
}

function speakCurrentWfd(rate) {
  const question = getCurrentWfd();
  if (!question || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(question.answer);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function submitWfdAnswer() {
  const question = getCurrentWfd();
  if (!question) return;
  const userAnswer = wfdEls["wfd-answer-input"].value || "";
  const comparison = compareWfdAnswer(question.answer, userAnswer);
  wfdState.records[question.id] = {
    score: comparison.score,
    answeredAt: new Date().toISOString(),
    answer: userAnswer,
  };
  saveWfdRecords();
  wfdEls["wfd-result"].classList.remove("hidden");
  wfdEls["wfd-result"].innerHTML = `
    <div><strong>得分：</strong>${Math.round(comparison.score)}%</div>
    <div class="wfd-compare"><strong>你的答案：</strong>${comparison.userHtml}</div>
    <div class="wfd-compare"><strong>正确答案：</strong>${comparison.answerHtml}</div>
  `;
  wfdEls["wfd-answer"].classList.remove("hidden");
  wfdEls["wfd-answer"].classList.add("revealed");
  updateWfdAnswerToggleButton();
  applyWfdStatusFilter(false);
}

function compareWfdAnswer(answer, userAnswer) {
  const answerWords = normalizeWfd(answer).split(" ").filter(Boolean);
  const userWords = normalizeWfd(userAnswer).split(" ").filter(Boolean);
  const remaining = [...answerWords];
  let correct = 0;
  const userHtml = userWords
    .map((word) => {
      const index = remaining.indexOf(word);
      if (index >= 0) {
        remaining.splice(index, 1);
        correct += 1;
        return renderWfdWordChip(word, "wfd-word-ok");
      }
      return renderWfdWordChip(word, "wfd-word-extra");
    })
    .join(" ");
  const userCounts = countWords(userWords);
  const answerHtml = answerWords
    .map((word) => {
      const used = userCounts[word] > 0;
      if (used) userCounts[word] -= 1;
      return used ? renderWfdWordChip(word, "wfd-word-ok") : renderWfdWordChip(word, "wfd-word-miss");
    })
    .join(" ");
  const score = answerWords.length ? (correct / answerWords.length) * 100 : 0;
  return { score, userHtml: userHtml || "(空)", answerHtml };
}

function renderWfdWordChip(word, className) {
  const safeWord = escapeWfdHtml(word);
  const lookupWord = escapeWfdHtml(normalizeWfdLookupWord(word));
  return `<button class="${className} wfd-lookup-word" type="button" data-word="${lookupWord}">${safeWord}</button>`;
}

function renderWfdLookupSentence(text) {
  return String(text || "")
    .split(/([A-Za-z]+(?:['-][A-Za-z]+)?)/g)
    .map((part) => {
      if (!/^[A-Za-z]+(?:['-][A-Za-z]+)?$/.test(part)) return escapeWfdHtml(part);
      return renderWfdWordChip(part, "wfd-word-answer");
    })
    .join("");
}

function handleWfdDocumentClick(event) {
  const wordButton = event.target.closest(".wfd-lookup-word");
  if (wordButton) {
    event.preventDefault();
    event.stopPropagation();
    showWfdWordCard(wordButton.dataset.word || wordButton.textContent, wordButton.textContent, wordButton);
    return;
  }
  if (!event.target.closest(".word-card")) {
    hideWfdWordCard();
  }
}

function showWfdWordCard(wordKey, displayWord, anchor) {
  const entry = findWfdWordEntry(wordKey);
  const normalized = normalizeWfdLookupWord(entry?.word || inferWfdLookupLemma(wordKey) || displayWord);
  const isSaved = wfdState.wordbook.has(normalized);
  const phonetic = entry?.phonetic || entry?.ukphone || entry?.usphone || "暂无本地音标";
  const meaning = cleanWfdMeaning(entry?.meaning || "") || "本地词库暂无释义，可后续补充更完整词库。";
  const card = wfdEls["wfd-word-card"];
  if (!card || !anchor) return;

  wfdState.selectedLookupWord = normalizeWfdLookupWord(wordKey);
  document.querySelectorAll(".wfd-lookup-word.selected").forEach((item) => item.classList.remove("selected"));
  anchor.classList.add("selected");

  card.innerHTML = `
    <div class="word-card__head">
      <div>
        <strong>${escapeWfdHtml(displayWord)}</strong>
        <span>${escapeWfdHtml(phonetic)}</span>
      </div>
      <div class="word-card__actions">
        <button class="word-card__add" type="button" ${isSaved ? "disabled" : ""} aria-label="${isSaved ? "saved" : "add to wordbook"}" title="${isSaved ? "saved" : "add to wordbook"}">${isSaved ? "OK" : "+"}</button>
        <button class="word-card__close" type="button" aria-label="关闭">×</button>
      </div>
    </div>
    <p><b>中文释义：</b>${escapeWfdHtml(meaning)}</p>
    <button class="word-card__sound" type="button">播放发音</button>
  `;

  const rect = anchor.getBoundingClientRect();
  card.style.left = `${Math.min(window.innerWidth - 340, Math.max(16, rect.left))}px`;
  card.style.top = `${Math.min(window.innerHeight - 240, rect.bottom + 8)}px`;
  card.classList.remove("hidden");
  card.querySelector(".word-card__close")?.addEventListener("click", hideWfdWordCard);
  card.querySelector(".word-card__sound")?.addEventListener("click", () => speakWfdWord(displayWord));
  card.querySelector(".word-card__add")?.addEventListener("click", () => addWfdLookupWordToWordbook(normalized, displayWord));
}

function hideWfdWordCard() {
  wfdEls["wfd-word-card"]?.classList.add("hidden");
  document.querySelectorAll(".wfd-lookup-word.selected").forEach((item) => item.classList.remove("selected"));
  wfdState.selectedLookupWord = "";
}

function addWfdLookupWordToWordbook(word, displayWord = word) {
  const key = normalizeWfdLookupWord(word);
  if (!key) return;
  const existed = wfdState.wordbook.has(key);
  wfdState.wordbook.add(key);
  saveWfdWordbook();
  const button = wfdEls["wfd-word-card"]?.querySelector(".word-card__add");
  if (button) {
    button.textContent = "OK";
    button.disabled = true;
    button.setAttribute("aria-label", "saved");
    button.setAttribute("title", "saved");
  }
  showWfdToast(existed ? `已在我的单词库：${key}` : `已加入我的单词库：${displayWord}`);
}

function speakWfdWord(word) {
  if (!window.speechSynthesis || !word) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function countWords(words) {
  return words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
}

function normalizeWfd(text) {
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toggleWfdAnswer() {
  wfdEls["wfd-answer"].classList.toggle("revealed");
  updateWfdAnswerToggleButton();
}

function updateWfdAnswerToggleButton() {
  const isRevealed = Boolean(wfdEls["wfd-answer"] && wfdEls["wfd-answer"].classList.contains("revealed"));
  if (wfdEls["wfd-show-answer"]) {
    wfdEls["wfd-show-answer"].textContent = isRevealed ? "⊘ 隐藏答案" : "◉ 显示答案";
    wfdEls["wfd-show-answer"].classList.toggle("active", isRevealed);
  }
}

function resetCurrentWfdAttempt() {
  wfdEls["wfd-answer-input"].value = "";
  updateWfdCharCount();
  wfdEls["wfd-result"].classList.add("hidden");
  wfdEls["wfd-answer"].classList.remove("revealed");
  updateWfdAnswerToggleButton();
  wfdEls["wfd-answer-input"].focus();
}

function updateWfdCharCount() {
  const count = (wfdEls["wfd-answer-input"]?.value || "").length;
  setWfdText("wfd-char-count", `${count} / 500`);
}

function moveWfd(delta, options = {}) {
  if (!wfdState.filtered.length) return;
  const previousIndex = wfdState.currentIndex;
  wfdState.currentIndex = Math.min(
    Math.max(wfdState.currentIndex + delta, 0),
    wfdState.filtered.length - 1
  );
  renderWfdAll();
  if (options.autoPlay && wfdState.currentIndex !== previousIndex) {
    window.setTimeout(() => speakCurrentWfd(1), 120);
  }
}

function randomWfd() {
  if (!wfdState.filtered.length) return;
  wfdState.currentIndex = Math.floor(Math.random() * wfdState.filtered.length);
  renderWfdAll();
}

function resetWfdRecords() {
  if (!window.confirm("确认清空 WFD 练习记录？")) return;
  wfdState.records = {};
  saveWfdRecords();
  applyWfdStatusFilter(true);
}

function exportWfdPdf() {
  const rows = (wfdState.filtered.length ? wfdState.filtered : wfdState.questions).map((question, index) => {
    const record = wfdState.records[question.id];
    const scoreText = record ? `${Math.round(record.score)}%` : "未做";
    const answeredAt = record?.answeredAt ? new Date(record.answeredAt).toLocaleString() : "";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>WFD #${escapeWfdHtml(String(question.question_id).padStart(3, "0"))}</td>
        <td class="answer">${escapeWfdHtml(question.answer)}</td>
        <td>${escapeWfdHtml(scoreText)}</td>
        <td>${escapeWfdHtml(answeredAt)}</td>
      </tr>
    `;
  }).join("");

  if (!rows) {
    window.alert("当前没有可导出的 WFD 题目。");
    return;
  }

  const filterText = getWfdFilterText();
  const exportedAt = new Date();
  const exportDate = exportedAt.toISOString().slice(0, 10);
  const exportFilename = `WFD听写题库-${exportDate}`;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeWfdHtml(exportFilename)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.55;
    }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { margin: 0 0 16px; color: #63708b; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #dbe3ef;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eef4ff; color: #172033; font-weight: 700; }
    td:first-child { width: 42px; text-align: center; color: #63708b; }
    td:nth-child(2) { width: 92px; font-weight: 700; white-space: nowrap; }
    td:nth-child(4) { width: 70px; white-space: nowrap; }
    td:nth-child(5) { width: 130px; color: #63708b; }
    .answer { color: #172033; font-weight: 600; }
  </style>
</head>
<body>
  <h1>WFD听写题库</h1>
  <p class="meta">范围：${escapeWfdHtml(filterText)} · 共 ${wfdState.filtered.length || wfdState.questions.length} 题 · 导出时间：${escapeWfdHtml(exportedAt.toLocaleString())}</p>
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>题号</th>
        <th>英文句子</th>
        <th>状态</th>
        <th>提交时间</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>
    document.title = ${JSON.stringify(exportFilename)};
    window.addEventListener("load", () => setTimeout(() => window.print(), 200));
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const printUrl = URL.createObjectURL(blob);
  const printWindow = window.open(printUrl, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(printUrl);
    window.alert("浏览器阻止了弹窗，请允许弹窗后再导出PDF。");
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(printUrl), 60 * 1000);
}

function getWfdFilterText() {
  if (wfdState.statusFilter === "done") return "已做";
  if (wfdState.statusFilter === "undone") return "未做";
  return "全部";
}

function buildWfdWordIndexes() {
  wfdState.wordIndex = buildWfdWordIndex(window.PTE_WORDLIST);
  wfdState.coreWordIndex = buildWfdWordIndex(window.PTE_CORE_WORDLIST);
}

function buildWfdWordIndex(list) {
  const index = new Map();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    const key = normalizeWfdLookupWord(entry?.word || "");
    if (key && !index.has(key)) index.set(key, entry);
  });
  return index;
}

function findWfdWordEntry(wordKey) {
  const key = normalizeWfdLookupWord(wordKey);
  const exactEntries = [wfdState.coreWordIndex.get(key), wfdState.wordIndex.get(key)].filter(Boolean);
  const exactEntry =
    exactEntries.find((entry) => /[\u4e00-\u9fff]/.test(cleanWfdMeaning(entry.meaning || ""))) ||
    exactEntries.find((entry) => cleanWfdMeaning(entry.meaning || "").trim());
  if (exactEntry) return exactEntry;

  const entries = getWfdLookupCandidates(wordKey)
    .map((candidate) => wfdState.coreWordIndex.get(candidate) || wfdState.wordIndex.get(candidate))
    .filter(Boolean);
  return (
    entries.find((entry) => /[\u4e00-\u9fff]/.test(cleanWfdMeaning(entry.meaning || ""))) ||
    entries.find((entry) => cleanWfdMeaning(entry.meaning || "").trim()) ||
    entries[0]
  );
}

function getWfdLookupCandidates(wordKey) {
  const key = normalizeWfdLookupWord(wordKey);
  const candidates = [key];
  if (key.endsWith("'s")) candidates.push(key.slice(0, -2));
  if (key.endsWith("ies") && key.length > 4) candidates.push(`${key.slice(0, -3)}y`);
  if (key.endsWith("ves") && key.length > 4) {
    candidates.push(`${key.slice(0, -3)}f`);
    candidates.push(`${key.slice(0, -3)}fe`);
  }
  if (key.endsWith("es") && key.length > 3) candidates.push(key.slice(0, -2));
  if (key.endsWith("s") && key.length > 3) candidates.push(key.slice(0, -1));
  if (key.endsWith("ing") && key.length > 5) {
    const stem = key.slice(0, -3);
    candidates.push(`${stem}e`, stem);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) candidates.push(stem.slice(0, -1));
  }
  if (key.endsWith("ed") && key.length > 4) {
    const stem = key.slice(0, -2);
    if (key.endsWith("ied") && key.length > 5) candidates.push(`${key.slice(0, -3)}y`);
    candidates.push(`${stem}e`, stem);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) candidates.push(stem.slice(0, -1));
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

function inferWfdLookupLemma(wordKey) {
  return getWfdLookupCandidates(wordKey)[1] || normalizeWfdLookupWord(wordKey);
}

function normalizeWfdLookupWord(value) {
  return String(value || "").toLowerCase().replace(/^'+|'+$/g, "");
}

function cleanWfdMeaning(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]/.test(line))
    .join("\n");
}

function loadWfdRecords() {
  try {
    return JSON.parse(localStorage.getItem(WFD_RECORDS_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function saveWfdRecords() {
  localStorage.setItem(WFD_RECORDS_KEY, JSON.stringify(wfdState.records));
}

function loadWfdFavoriteIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(WFD_FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    return new Set();
  }
}

function saveWfdFavoriteIds() {
  try {
    localStorage.setItem(WFD_FAVORITES_KEY, JSON.stringify(Array.from(wfdState.favoriteIds)));
  } catch (error) {
    console.warn("收藏状态已在当前页面显示，但浏览器阻止了本地保存。", error);
  }
}

function loadWfdWordbook() {
  try {
    const saved = JSON.parse(localStorage.getItem(WFD_VOCAB_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(normalizeWfdLookupWord).filter(Boolean) : []);
  } catch (error) {
    return new Set();
  }
}

function saveWfdWordbook() {
  try {
    localStorage.setItem(WFD_VOCAB_STORAGE_KEY, JSON.stringify(Array.from(wfdState.wordbook).sort()));
  } catch (error) {
    console.warn("单词库已在当前页面显示，但浏览器阻止了本地保存。", error);
  }
}

function showWfdToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 1600);
}

function setWfdText(id, value) {
  if (wfdEls[id]) wfdEls[id].textContent = value;
}

function escapeWfdHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
