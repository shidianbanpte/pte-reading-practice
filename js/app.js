const STORAGE_KEY = "pte_reading_practice_records_v1";
const VOCAB_STORAGE_KEY = "pte_reading_practice_vocab_bank_v1";
const CUSTOM_CORE_STORAGE_KEY = "pte_reading_practice_teacher_pte_core_v1";
const VOCAB_REVIEW_STORAGE_KEY = "pte_reading_practice_vocab_review_v1";
const ACCESS_STORAGE_KEY = "pte_reading_practice_access_v1";
const ACCESS_GATE_ENABLED = false;
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const ACCESS_UNLOCK_CODES = ["PTE2026"];
const QUESTION_PAGE_SIZE = 12;
const VOCAB_PAGE_SIZE = 60;
const REVIEW_DETAIL_PAGE_SIZE = 10;
const OPTION_VOCAB_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "in",
  "is",
  "it",
  "its",
  "may",
  "might",
  "not",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "would",
]);
const VOCAB_PHONETIC_FALLBACKS = {
  contrary: "/ˈkɒntrəri/",
};

const state = {
  questions: [],
  currentId: null,
  records: [],
  questionPage: 1,
  typeFilter: "FIB_RW",
  frequencyFilter: null,
  questionStatusFilter: "all",
  submittedQuestionIds: new Set(),
  wordIndex: new Map(),
  coreWordIndex: new Map(),
  wordbook: new Set(),
  customCoreWords: new Map(),
  vocabReviewRecords: {},
  vocabReviewSource: "wordbook",
  vocabReviewQueue: [],
  vocabReviewIndex: 0,
  vocabReviewRevealed: false,
  vocabReviewLastSpokenWord: "",
  selectedCoreVocabWord: "",
  selectedWordbookWord: "",
  wordbookEditMode: false,
  coreVocabPage: 1,
  teacherMode: false,
  currentCoreVocabulary: [],
  currentOptionVocabulary: [],
  currentAttemptSubmitted: false,
  practiceLabelFilter: "",
  practiceLabelType: "",
  practiceQuestionIds: [],
  practiceContextText: "",
  reviewTypeFilter: "FIB_RW",
  reviewDetailLabel: "",
  reviewRelatedStatus: "all",
  reviewWrongPage: 1,
  reviewRelatedPage: 1,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    bindElements();
    bindEvents();
    if (!ensureAccessAllowed()) return;
    state.records = loadRecords();
    state.wordbook = loadWordbook();
    state.customCoreWords = loadTeacherWordMap(CUSTOM_CORE_STORAGE_KEY);
    state.vocabReviewRecords = loadVocabReviewRecords();
    state.submittedQuestionIds = new Set(state.records.map((record) => record.questionId));
    const data = window.PTE_QUESTIONS_DATA || window.QUESTIONS || (await loadQuestionsJson());
    state.questions = data.questions || [];
    state.currentId = state.questions[0]?.id || null;
    renderAll();
  } catch (error) {
    showBootError(error);
  }
}

async function loadQuestionsJson() {
  const response = await fetch("data/questions.json");
  return response.json();
}

function loadAccessState() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESS_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveAccessState(accessState) {
  try {
    localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(accessState));
  } catch (error) {
    console.warn("无法保存试用状态。", error);
  }
}

function getTrialDaysLeft(startedAt, now = Date.now()) {
  const expiresAt = Number(startedAt || 0) + TRIAL_DURATION_MS;
  return Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
}

function ensureAccessAllowed() {
  if (!ACCESS_GATE_ENABLED) {
    hideAccessGate();
    return true;
  }

  const now = Date.now();
  const accessState = loadAccessState();

  if (accessState.unlocked) {
    hideAccessGate();
    return true;
  }

  if (!accessState.trialStartedAt) {
    accessState.trialStartedAt = now;
    saveAccessState(accessState);
  }

  const trialExpiresAt = Number(accessState.trialStartedAt) + TRIAL_DURATION_MS;
  if (now < trialExpiresAt) {
    hideAccessGate();
    return true;
  }

  showAccessGate(accessState);
  return false;
}

function showAccessGate(accessState = loadAccessState()) {
  if (!els["access-gate"]) return;
  document.body.classList.add("access-locked");
  els["access-gate"].classList.remove("hidden");
  setText("access-trial-status", `本设备 3 天试用期已结束。请输入验证码继续使用。`);
  setText("access-code-message", "");
  els["access-code-input"]?.focus();
}

function hideAccessGate() {
  document.body.classList.remove("access-locked");
  els["access-gate"]?.classList.add("hidden");
}

function submitAccessCode() {
  const input = els["access-code-input"];
  const code = (input?.value || "").trim().toUpperCase();
  const validCodes = new Set(ACCESS_UNLOCK_CODES.map((item) => item.trim().toUpperCase()));
  if (!validCodes.has(code)) {
    setText("access-code-message", "验证码不正确，请重新输入。");
    input?.select();
    return;
  }

  const accessState = loadAccessState();
  accessState.unlocked = true;
  accessState.unlockedAt = Date.now();
  saveAccessState(accessState);
  hideAccessGate();
  window.location.reload();
}

function bindElements() {
  [
    "question-list",
    "overview-page",
    "practice-page",
    "review-page",
    "review-type-page",
    "review-detail-page",
    "core-vocab-page",
    "wordbook-page",
    "vocab-review-page",
    "open-overview",
    "overview-browse-bank",
    "overview-open-wordbook",
    "overview-open-records",
    "overview-random",
    "overview-start-fibrw",
    "overview-random-fibrw",
    "overview-fibrw-very-high",
    "overview-fibrw-high",
    "overview-fibrw-medium",
    "overview-fibrw-very-high-count",
    "overview-fibrw-high-count",
    "overview-fibrw-medium-count",
    "overview-start-fibr",
    "overview-random-fibr",
    "overview-fibr-very-high",
    "overview-fibr-high",
    "overview-fibr-medium",
    "overview-fibr-very-high-count",
    "overview-fibr-high-count",
    "overview-fibr-medium-count",
    "overview-review-errors",
    "overview-clear-records",
    "overview-wordbook-jump",
    "overview-wordbook-review",
    "overview-wordbook-export",
    "overview-core-practice",
    "overview-core-review",
    "overview-core-export",
    "overview-fibrw-count",
    "overview-fibr-count",
    "overview-record-count",
    "overview-wordbook-count",
    "overview-core-count",
    "overview-fibrw-accuracy-count",
    "overview-fibr-accuracy-count",
    "prev-page",
    "next-page",
    "page-info",
    "practice-context",
    "weakness-list",
    "review-open-fibrw",
    "review-open-fibr",
    "review-fibrw-summary",
    "review-fibr-summary",
    "review-type-title",
    "review-type-summary",
    "review-weakness-list",
    "review-back-practice",
    "review-type-back",
    "review-detail-title",
    "review-detail-summary",
    "review-wrong-question-list",
    "review-related-question-list",
    "review-detail-back",
    "review-wrong-prev-page",
    "review-wrong-next-page",
    "review-wrong-page-info",
    "review-related-prev-page",
    "review-related-next-page",
    "review-related-page-info",
    "review-related-all",
    "review-related-done",
    "review-related-undone",
    "core-vocab-search-input",
    "core-vocab-page-list",
    "core-vocab-prev-page",
    "core-vocab-next-page",
    "core-vocab-page-info",
    "core-vocab-back-practice",
    "core-vocab-start-review",
    "core-vocab-start-review-all",
    "core-vocab-review-start-word",
    "core-vocab-due-count",
    "core-vocab-export",
    "core-vocab-detail",
    "wordbook-list",
    "wordbook-page-list",
    "wordbook-page-edit",
    "wordbook-clear",
    "wordbook-page-clear",
    "wordbook-page-export",
    "wordbook-start-review",
    "wordbook-start-review-all",
    "wordbook-review-start-word",
    "wordbook-due-count",
    "wordbook-back-practice",
    "wordbook-detail",
    "vocab-review-title",
    "vocab-review-summary",
    "vocab-review-card",
    "vocab-review-back",
    "open-wordbook",
    "search-input",
    "question-meta",
    "question-title",
    "score-pill",
    "passage",
    "word-card",
    "prev-question",
    "next-question",
    "submit-answer",
    "retry-question",
    "toggle-analysis",
    "result-panel",
    "core-vocab-panel",
    "core-vocab-count",
    "core-vocab-list",
    "vocab-select-all",
    "vocab-clear-selection",
    "vocab-add-selected",
    "vocab-export",
    "option-vocab-panel",
    "option-vocab-count",
    "option-vocab-list",
    "option-vocab-select-all",
    "option-vocab-clear-selection",
    "option-vocab-add-selected",
    "option-vocab-export",
    "analysis-panel",
    "analysis-content",
    "translation-content",
    "reset-records",
    "teacher-mode-indicator",
    "teacher-export-vocab",
    "app-toast",
    "access-gate",
    "access-trial-status",
    "access-code-input",
    "access-code-submit",
    "access-code-message",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  on("access-code-submit", "click", submitAccessCode);
  on("access-code-input", "keydown", (event) => {
    if (event.key === "Enter") submitAccessCode();
  });
  on("search-input", "input", () => {
    state.questionPage = 1;
    renderQuestionList();
  });
  on("core-vocab-search-input", "input", () => {
    state.coreVocabPage = 1;
    renderCoreVocabPage();
  });
  on("core-vocab-prev-page", "click", () => {
    state.coreVocabPage = Math.max(1, state.coreVocabPage - 1);
    renderCoreVocabPage();
  });
  on("core-vocab-next-page", "click", () => {
    state.coreVocabPage += 1;
    renderCoreVocabPage();
  });
  document.querySelectorAll(".type-filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      clearPracticeLabelFilter();
      showPractice();
      state.typeFilter = button.dataset.typeFilter || "ALL";
      state.frequencyFilter = null;
      state.questionPage = 1;
      const firstQuestion = getFilteredQuestions()[0];
      if (firstQuestion) {
        state.currentId = firstQuestion.id;
      }
      renderAll();
    });
  });
  document.querySelectorAll(".question-status-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.questionStatusFilter = button.dataset.questionStatus || "all";
      state.questionPage = 1;
      ensureCurrentQuestionInFilter();
      renderAll();
    });
  });
  document.querySelectorAll(".question-frequency-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.frequencyFilter = button.dataset.questionFrequency || null;
      state.questionPage = 1;
      ensureCurrentQuestionInFilter();
      renderAll();
    });
  });
  on("prev-page", "click", () => {
    state.questionPage = Math.max(1, state.questionPage - 1);
    renderQuestionList();
  });
  on("next-page", "click", () => {
    state.questionPage += 1;
    renderQuestionList();
  });
  on("prev-question", "click", () => navigateQuestion(-1));
  on("next-question", "click", () => navigateQuestion(1));
  on("submit-answer", "click", submitCurrentQuestion);
  on("retry-question", "click", () => renderQuestion(getCurrentQuestion()));
  on("vocab-select-all", "click", () => setCoreVocabSelection(true));
  on("vocab-clear-selection", "click", () => setCoreVocabSelection(false));
  on("vocab-add-selected", "click", addSelectedCoreWords);
  on("vocab-export", "click", exportWordbook);
  on("option-vocab-select-all", "click", () => setOptionVocabSelection(true));
  on("option-vocab-clear-selection", "click", () => setOptionVocabSelection(false));
  on("option-vocab-add-selected", "click", addSelectedOptionWords);
  on("option-vocab-export", "click", exportOptionVocabulary);
  on("toggle-analysis", "click", () => {
    const isHidden = els["analysis-panel"].classList.toggle("hidden");
    if (isHidden) {
      hideAnalysisPanel();
    } else {
      showAnalysisPanel();
    }
  });
  on("reset-records", "click", resetRecords);
  on("wordbook-clear", "click", clearWordbook);
  on("wordbook-page-edit", "click", toggleWordbookEditMode);
  on("open-overview", "click", showOverview);
  on("open-wordbook", "click", showWordbookPage);
  on("overview-browse-bank", "click", () => {
    clearPracticeLabelFilter();
    showPractice();
    renderAll();
  });
  on("overview-open-wordbook", "click", showWordbookPage);
  on("overview-open-records", "click", showReviewPage);
  on("overview-random", "click", () => startRandomQuestion());
  on("overview-start-fibrw", "click", () => startQuestionType("FIB_RW"));
  on("overview-random-fibrw", "click", () => startRandomQuestion("FIB_RW"));
  on("overview-fibrw-very-high", "click", () => startQuestionSet("FIB_RW", "极高频"));
  on("overview-fibrw-high", "click", () => startQuestionSet("FIB_RW", "高频"));
  on("overview-fibrw-medium", "click", () => startQuestionSet("FIB_RW", "中频"));
  on("overview-start-fibr", "click", () => startQuestionType("FIB_R"));
  on("overview-random-fibr", "click", () => startRandomQuestion("FIB_R"));
  on("overview-fibr-very-high", "click", () => startQuestionSet("FIB_R", "极高频"));
  on("overview-fibr-high", "click", () => startQuestionSet("FIB_R", "高频"));
  on("overview-fibr-medium", "click", () => startQuestionSet("FIB_R", "中频"));
  on("overview-review-errors", "click", showReviewPage);
  on("overview-clear-records", "click", resetRecords);
  on("overview-wordbook-jump", "click", showWordbookPage);
  on("overview-wordbook-review", "click", () => startVocabReview("wordbook"));
  on("overview-wordbook-export", "click", exportWordbook);
  on("overview-core-practice", "click", showCoreVocabPage);
  on("overview-core-review", "click", () => startVocabReview("core"));
  on("overview-core-export", "click", () => exportVocabList("core"));
  on("review-back-practice", "click", () => {
    clearPracticeLabelFilter();
    showPractice();
    renderAll();
  });
  on("review-open-fibrw", "click", () => showReviewTypePage("FIB_RW"));
  on("review-open-fibr", "click", () => showReviewTypePage("FIB_R"));
  on("review-type-back", "click", showReviewPage);
  on("review-detail-back", "click", () => showReviewTypePage(state.reviewTypeFilter));
  ["review-related-all", "review-related-done", "review-related-undone"].forEach((id) => {
    on(id, "click", () => {
      state.reviewRelatedStatus = els[id].dataset.reviewStatus || "all";
      state.reviewRelatedPage = 1;
      renderReviewDetail(state.reviewDetailLabel);
    });
  });
  on("review-wrong-prev-page", "click", () => {
    state.reviewWrongPage = Math.max(1, state.reviewWrongPage - 1);
    renderReviewDetail(state.reviewDetailLabel);
  });
  on("review-wrong-next-page", "click", () => {
    state.reviewWrongPage += 1;
    renderReviewDetail(state.reviewDetailLabel);
  });
  on("review-related-prev-page", "click", () => {
    state.reviewRelatedPage = Math.max(1, state.reviewRelatedPage - 1);
    renderReviewDetail(state.reviewDetailLabel);
  });
  on("review-related-next-page", "click", () => {
    state.reviewRelatedPage += 1;
    renderReviewDetail(state.reviewDetailLabel);
  });
  on("core-vocab-back-practice", "click", () => {
    clearPracticeLabelFilter();
    showPractice();
    renderAll();
  });
  on("core-vocab-start-review", "click", () => startVocabReview("core", getReviewStartWord("core")));
  on("core-vocab-start-review-all", "click", () => startVocabReview("core", getReviewStartWord("core"), { includeAll: true }));
  on("core-vocab-export", "click", () => exportVocabList("core"));
  on("wordbook-back-practice", "click", () => {
    clearPracticeLabelFilter();
    showPractice();
    renderAll();
  });
  on("wordbook-page-export", "click", exportWordbook);
  on("wordbook-page-clear", "click", clearWordbook);
  on("wordbook-start-review", "click", () => startVocabReview("wordbook", getReviewStartWord("wordbook")));
  on("wordbook-start-review-all", "click", () => startVocabReview("wordbook", getReviewStartWord("wordbook"), { includeAll: true }));
  on("vocab-review-back", "click", backFromVocabReview);
  on("teacher-export-vocab", "click", exportTeacherVocab);
  if (els["passage"]) {
    els["passage"].addEventListener("click", handlePassageWordClick);
  }
  document.addEventListener("keydown", handleTeacherModeShortcut);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".word-card") && !event.target.closest(".lookup-word")) {
      hideWordCard();
    }
  });
}

function on(id, eventName, handler) {
  if (els[id]) {
    els[id].addEventListener(eventName, handler);
  }
}

function showBootError(error) {
  console.error(error);
  const message = error && error.message ? error.message : String(error);
  document.body.innerHTML = `
    <main class="boot-error">
      <h1>页面加载失败</h1>
      <p>请按 Ctrl + F5 强制刷新。如果仍然失败，把下面这行错误发给我：</p>
      <pre>${escapeHtml(message)}</pre>
    </main>
  `;
}

function renderAll() {
  buildWordIndex();
  buildCoreWordIndex();
  ensureCurrentQuestionInFilter();
  renderQuestionList();
  renderWeaknessList();
  renderWordbook();
  renderOverview();
  renderQuestion(getCurrentQuestion());
}

function getCurrentQuestion() {
  const questions = getFilteredQuestions();
  return questions.find((question) => question.id === state.currentId) || questions[0] || state.questions[0];
}

function ensureCurrentQuestionInFilter() {
  const questions = getFilteredQuestions();
  if (!questions.length) {
    state.currentId = null;
    return;
  }
  if (!questions.some((question) => question.id === state.currentId)) {
    state.currentId = questions[0].id;
  }
}

function renderQuestionList() {
  const questions = getFilteredQuestions();
  renderPracticeContext();
  const totalPages = Math.max(1, Math.ceil(questions.length / QUESTION_PAGE_SIZE));
  state.questionPage = Math.min(Math.max(1, state.questionPage), totalPages);
  const startIndex = (state.questionPage - 1) * QUESTION_PAGE_SIZE;
  const pageQuestions = questions.slice(startIndex, startIndex + QUESTION_PAGE_SIZE);

  els["question-list"].innerHTML = pageQuestions
    .map((question) => {
      const latest = getLatestRecord(question.id);
      const scoreText = latest ? `最近 ${latest.correct}/${latest.total}` : "未练习";
      return `
        <button class="question-item ${question.id === state.currentId ? "active" : ""}" data-id="${question.id}" type="button">
          <div class="item-title">${escapeHtml(question.question_id)}. ${escapeHtml(question.title)}</div>
          <div class="item-meta">${escapeHtml(question.frequency)} · ${escapeHtml(question.type)} · ${question.blanks.length} 空 · ${scoreText}</div>
        </button>
      `;
    })
    .join("");

  if (!pageQuestions.length) {
    els["question-list"].innerHTML = '<div class="empty-state">没有找到匹配题目</div>';
  }

  if (els["page-info"]) {
    els["page-info"].textContent = `第 ${state.questionPage} / ${totalPages} 页 · 共 ${questions.length} 题`;
  }
  if (els["prev-page"]) {
    els["prev-page"].disabled = state.questionPage <= 1;
  }
  if (els["next-page"]) {
    els["next-page"].disabled = state.questionPage >= totalPages;
  }

  els["question-list"].querySelectorAll(".question-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentId = button.dataset.id;
      renderAll();
    });
  });
  updateTypeFilterButtons();
  updateQuestionStatusButtons();
  updateQuestionFrequencyButtons();
}

function getFilteredQuestions() {
  const keyword = els["search-input"].value.trim().toLowerCase();
  const practiceIdOrder = new Map(state.practiceQuestionIds.map((id, index) => [id, index]));
  const questions = state.questions.filter((question) => {
    const questionNumber = String(question.question_id || "");
    const searchableText = `${questionNumber} ${questionNumber}. ${question.title || ""}`.toLowerCase();
    const matchesKeyword = !keyword || searchableText.includes(keyword);
    const matchesPracticeSet = !practiceIdOrder.size || practiceIdOrder.has(question.id);
    const matchesType = question.type === state.typeFilter;
    const matchesFrequency = !state.frequencyFilter || question.frequency === state.frequencyFilter;
    const matchesPracticeLabel =
      !state.practiceLabelFilter ||
      ((state.practiceLabelType ? question.type === state.practiceLabelType : true) &&
        question.blanks.some((blank) => blank.label === state.practiceLabelFilter));
    const isDone = state.submittedQuestionIds.has(question.id);
    const matchesStatus =
      state.questionStatusFilter === "done"
        ? isDone
        : state.questionStatusFilter === "undone"
          ? !isDone
          : true;
    return matchesKeyword && matchesPracticeSet && matchesType && matchesFrequency && matchesPracticeLabel && matchesStatus;
  });
  if (practiceIdOrder.size) {
    return questions.sort((a, b) => (practiceIdOrder.get(a.id) ?? 0) - (practiceIdOrder.get(b.id) ?? 0));
  }
  return questions.sort(compareQuestionsByFrequency);
}

function clearPracticeLabelFilter() {
  state.practiceLabelFilter = "";
  state.practiceLabelType = "";
  state.practiceQuestionIds = [];
  state.practiceContextText = "";
}

function renderPracticeContext() {
  if (!els["practice-context"]) return;
  if (!state.practiceContextText) {
    els["practice-context"].classList.add("hidden");
    els["practice-context"].textContent = "";
    return;
  }
  els["practice-context"].classList.remove("hidden");
  els["practice-context"].textContent = state.practiceContextText;
}

function updateTypeFilterButtons() {
  const isPracticeVisible = els["practice-page"] && !els["practice-page"].classList.contains("hidden");
  document.querySelectorAll(".type-filter-button").forEach((button) => {
    button.classList.toggle("active", isPracticeVisible && (button.dataset.typeFilter || "ALL") === state.typeFilter);
  });
}

function updateQuestionStatusButtons() {
  document.querySelectorAll(".question-status-button").forEach((button) => {
    button.classList.toggle("active", (button.dataset.questionStatus || "all") === state.questionStatusFilter);
  });
}

function updateQuestionFrequencyButtons() {
  document.querySelectorAll(".question-frequency-button").forEach((button) => {
    button.classList.toggle("active", (button.dataset.questionFrequency || null) === state.frequencyFilter);
  });
}

function updateHeaderNavigation(activeId) {
  const wordPages = new Set(["wordbook-page", "core-vocab-page", "vocab-review-page"]);
  const practicePages = new Set(["practice-page"]);
  const overviewPages = new Set(["overview-page"]);
  const reviewPages = new Set(["review-page", "review-type-page", "review-detail-page"]);
  const navState = wordPages.has(activeId)
    ? "wordbook"
    : practicePages.has(activeId)
      ? "practice"
      : overviewPages.has(activeId)
        ? "overview"
        : reviewPages.has(activeId)
          ? "review"
          : "";

  els["open-overview"]?.classList.toggle("active", navState === "overview");
  els["open-wordbook"]?.classList.toggle("active", navState === "wordbook");
  document.querySelectorAll(".type-filter-button").forEach((button) => {
    button.classList.toggle("active", navState === "practice" && (button.dataset.typeFilter || "ALL") === state.typeFilter);
  });
}

function showOverview() {
  showOnlyPage("overview-page");
  renderOverview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showPractice(options = {}) {
  showOnlyPage("practice-page");
  if (!options.keepScroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function showReviewPage() {
  renderReviewOverview();
  showOnlyPage("review-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showReviewTypePage(type) {
  state.reviewTypeFilter = type || "FIB_RW";
  renderReviewTypePage();
  showOnlyPage("review-type-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showReviewDetailPage(label) {
  state.reviewRelatedStatus = "all";
  state.reviewWrongPage = 1;
  state.reviewRelatedPage = 1;
  renderReviewDetail(label);
  showOnlyPage("review-detail-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCoreVocabPage() {
  state.coreVocabPage = 1;
  renderCoreVocabPage();
  renderVocabDueCounts();
  showOnlyPage("core-vocab-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => els["core-vocab-search-input"]?.focus(), 150);
}

function showWordbookPage() {
  renderWordbook();
  renderVocabDueCounts();
  showOnlyPage("wordbook-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showOnlyPage(activeId) {
  ["overview-page", "practice-page", "review-page", "review-type-page", "review-detail-page", "core-vocab-page", "wordbook-page", "vocab-review-page"].forEach((id) => {
    els[id]?.classList.toggle("hidden", id !== activeId);
  });
  updateHeaderNavigation(activeId);
}

function startQuestionType(type) {
  clearPracticeLabelFilter();
  state.typeFilter = type;
  state.frequencyFilter = null;
  state.questionPage = 1;
  ensureCurrentQuestionInFilter();
  showPractice();
  renderAll();
}

function startQuestionSet(type, frequency) {
  clearPracticeLabelFilter();
  state.typeFilter = type;
  state.frequencyFilter = frequency;
  state.questionPage = 1;
  ensureCurrentQuestionInFilter();
  showPractice();
  renderAll();
}

function startRandomQuestion(type = state.typeFilter, frequency = null) {
  clearPracticeLabelFilter();
  state.typeFilter = type;
  state.frequencyFilter = frequency;
  const questions = state.questions.filter((question) => {
    return question.type === state.typeFilter && (!state.frequencyFilter || question.frequency === state.frequencyFilter);
  });
  if (questions.length) {
    const question = questions[Math.floor(Math.random() * questions.length)];
    state.currentId = question.id;
    moveQuestionIntoCurrentPage(question.id);
  }
  showPractice();
  renderAll();
}

function renderOverview() {
  const counts = state.questions.reduce(
    (total, question) => {
      total[question.type] = (total[question.type] || 0) + 1;
      return total;
    },
    { FIB_RW: 0, FIB_R: 0 },
  );
  setText("overview-fibrw-count", counts.FIB_RW || 0);
  setText("overview-fibrw-very-high-count", countQuestions("FIB_RW", "极高频"));
  setText("overview-fibrw-high-count", countQuestions("FIB_RW", "高频"));
  setText("overview-fibrw-medium-count", countQuestions("FIB_RW", "中频"));
  setText("overview-fibr-count", counts.FIB_R || 0);
  setText("overview-fibr-very-high-count", countQuestions("FIB_R", "极高频"));
  setText("overview-fibr-high-count", countQuestions("FIB_R", "高频"));
  setText("overview-fibr-medium-count", countQuestions("FIB_R", "中频"));
  setText("overview-record-count", state.records.length);
  setText("overview-wordbook-count", state.wordbook.size);
  setText("overview-core-count", state.coreWordIndex.size);
  setText("overview-fibrw-accuracy-count", getAverageAccuracy("FIB_RW"));
  setText("overview-fibr-accuracy-count", getAverageAccuracy("FIB_R"));
}

function getAverageAccuracy(type = null) {
  const records = type ? state.records.filter((record) => record.type === type) : state.records;
  if (!records.length) return 0;
  const totalCorrect = records.reduce((sum, record) => sum + Number(record.correct || 0), 0);
  const totalBlanks = records.reduce((sum, record) => sum + Number(record.total || 0), 0);
  return totalBlanks ? Math.round((totalCorrect / totalBlanks) * 100) : 0;
}

function countQuestions(type, frequency) {
  return state.questions.filter((question) => {
    return question.type === type && question.frequency === frequency;
  }).length;
}

function getFrequencyRank(frequency) {
  return { 极高频: 0, 高频: 1, 中频: 2, 低频: 3 }[frequency] ?? 9;
}

function getQuestionSortNumber(question) {
  const value = Number(question?.question_id);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareQuestionsByFrequency(a, b) {
  const freqOrder = getFrequencyRank(a.frequency) - getFrequencyRank(b.frequency);
  if (freqOrder) return freqOrder;
  const numberOrder = getQuestionSortNumber(a) - getQuestionSortNumber(b);
  if (numberOrder) return numberOrder;
  return String(a.title || "").localeCompare(String(b.title || ""), "zh-CN");
}

function setText(id, value) {
  if (els[id]) {
    els[id].textContent = String(value);
  }
}

function moveQuestionIntoCurrentPage(questionId) {
  const questions = getFilteredQuestions();
  const index = questions.findIndex((question) => question.id === questionId);
  if (index >= 0) {
    state.questionPage = Math.floor(index / QUESTION_PAGE_SIZE) + 1;
  }
}

function getCurrentQuestionIndex() {
  const questions = getFilteredQuestions();
  return questions.findIndex((question) => question.id === state.currentId);
}

function navigateQuestion(direction) {
  const questions = getFilteredQuestions();
  if (!questions.length) return;
  const currentIndex = getCurrentQuestionIndex();
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = Math.min(Math.max(safeIndex + direction, 0), questions.length - 1);
  if (nextIndex === safeIndex) return;
  state.currentId = questions[nextIndex].id;
  moveQuestionIntoCurrentPage(state.currentId);
  renderAll();
  els["question-title"]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateQuestionNavButtons() {
  const questions = getFilteredQuestions();
  const index = getCurrentQuestionIndex();
  const hasCurrent = questions.length > 0 && index >= 0;
  if (els["prev-question"]) {
    els["prev-question"].disabled = !hasCurrent || index <= 0;
  }
  if (els["next-question"]) {
    els["next-question"].disabled = !hasCurrent || index >= questions.length - 1;
  }
}

function renderQuestion(question) {
  if (!question) {
    els["question-title"].textContent = "暂无题目";
    return;
  }

  els["question-meta"].textContent = `${question.frequency} · ${question.type} · ${question.blanks.length} 空`;
  els["question-title"].textContent = `${question.question_id}. ${question.title}`;
  els["passage"].innerHTML = question.passage_html;
  if (question.type === "FIB_R") {
    renderDragDropQuestion(question);
  }
  state.currentAttemptSubmitted = false;
  preparePassageLookup(question);
  hideCoreVocabulary();
  hideOptionVocabulary();
  els["analysis-content"].innerHTML = renderAnalysisHtml(question);
  els["translation-content"].innerHTML = question.translation_html;
  decorateAnalysisText();
  els["result-panel"].classList.add("hidden");
  els["analysis-panel"].classList.add("hidden");
  els["toggle-analysis"].className = "secondary-button";
  els["toggle-analysis"].textContent = "查看解析与翻译";
  els["submit-answer"].classList.remove("active");
  els["score-pill"].className = "score-pill";
  els["score-pill"].textContent = "未提交";
  updateQuestionNavButtons();
  hideWordCard();
}

function renderAnalysisHtml(question) {
  if (!Array.isArray(question?.blanks) || !question.blanks.length) {
    return question?.analysis_html || "";
  }
  return question.blanks
    .map((blank) => {
      const answer = cleanAnalysisAnswer(blank.answer);
      const label = blank.label || "自动诊断";
      const explanation = cleanMeaning(blank.explanation || "");
      return `
        <p class="analysis-answer-line">${escapeHtml(blank.blank_index)}、${escapeHtml(answer || "暂无答案")}</p>
        <p>考点：${escapeHtml(label)}</p>
        <p>解析：${escapeHtml(explanation || "暂无解析")}</p>
      `;
    })
    .join("");
}

function cleanAnalysisAnswer(value) {
  return String(value || "")
    .replace(/\s*考点\s*[:：].*$/s, "")
    .replace(/\s*解析\s*[:：].*$/s, "")
    .trim();
}

function renderDragDropQuestion(question) {
  const selects = Array.from(els["passage"].querySelectorAll(".blank-select"));
  selects.forEach((select) => {
    const blankIndex = Number(select.dataset.blankIndex);
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "drag-blank";
    drop.dataset.blankIndex = String(blankIndex);
    drop.dataset.value = "";
    drop.setAttribute("aria-label", `第 ${blankIndex} 空`);
    drop.addEventListener("dragover", handleBlankDragOver);
    drop.addEventListener("drop", handleBlankDrop);
    drop.addEventListener("click", handleBlankClick);
    select.replaceWith(drop);
  });

  const options = getQuestionOptionPool(question);
  const bank = document.createElement("div");
  bank.className = "drag-option-bank";
  bank.setAttribute("aria-label", "可拖拽选项");
  bank.innerHTML = options
    .map(
      (option, index) => `
        <button class="drag-token" draggable="true" type="button" data-option="${escapeHtml(option)}" data-token-id="token-${index}">
          ${escapeHtml(option)}
        </button>
      `,
    )
    .join("");
  els["passage"].appendChild(bank);
  bank.querySelectorAll(".drag-token").forEach((token) => {
    token.addEventListener("dragstart", handleTokenDragStart);
    token.addEventListener("click", handleTokenClick);
  });
}

function decorateAnalysisText() {
  els["analysis-content"].querySelectorAll("p").forEach((paragraph) => {
    const text = paragraph.textContent.trim();
    if (/^\d+\s*[、,.．]\s*\S+/.test(text)) {
      paragraph.classList.add("analysis-answer-line");
    }
  });

  els["translation-content"].querySelectorAll("p").forEach((paragraph) => {
    if (/[\u4e00-\u9fff]/.test(paragraph.textContent)) {
      paragraph.classList.add("translation-cn-line");
    }
  });
}

function getQuestionOptionPool(question) {
  const seen = new Set();
  const options = [];
  question.blanks.forEach((blank) => {
    (blank.options || []).forEach((option) => {
      const key = normalizeAnswer(option);
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push(option);
    });
  });
  return options;
}

function handleTokenDragStart(event) {
  if (event.currentTarget.disabled) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("text/plain", event.currentTarget.dataset.option || "");
}

function handleBlankDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleBlankDrop(event) {
  event.preventDefault();
  const value = event.dataTransfer.getData("text/plain");
  setDragBlankValue(event.currentTarget, value);
}

function handleTokenClick(event) {
  const token = event.currentTarget;
  if (token.disabled) return;
  const active = els["passage"].querySelector(".drag-blank.selected");
  if (active) {
    setDragBlankValue(active, token.dataset.option || "");
    active.classList.remove("selected");
    return;
  }
  els["passage"].querySelectorAll(".drag-token.selected").forEach((item) => item.classList.remove("selected"));
  token.classList.add("selected");
}

function handleBlankClick(event) {
  const blank = event.currentTarget;
  const selectedToken = els["passage"].querySelector(".drag-token.selected");
  if (selectedToken) {
    setDragBlankValue(blank, selectedToken.dataset.option || "");
    selectedToken.classList.remove("selected");
    return;
  }
  if (blank.dataset.value) {
    setDragBlankValue(blank, "");
    return;
  }
  els["passage"].querySelectorAll(".drag-blank.selected").forEach((item) => item.classList.remove("selected"));
  blank.classList.add("selected");
}

function setDragBlankValue(blank, value) {
  const oldValue = blank.dataset.value || "";
  if (oldValue) {
    releaseDragToken(oldValue);
  }
  if (value) {
    reserveDragToken(value);
  }
  blank.dataset.value = value || "";
  blank.textContent = value || "";
  blank.classList.toggle("filled", Boolean(value));
  blank.classList.remove("drag-over", "correct", "incorrect");
}

function reserveDragToken(value) {
  const token = findAvailableDragToken(value);
  if (!token) return;
  token.disabled = true;
  token.classList.add("used");
  token.classList.remove("selected");
}

function releaseDragToken(value) {
  const token = findUsedDragToken(value);
  if (!token) return;
  token.disabled = false;
  token.classList.remove("used");
}

function findAvailableDragToken(value) {
  return Array.from(els["passage"].querySelectorAll(".drag-token")).find((token) => {
    return normalizeAnswer(token.dataset.option) === normalizeAnswer(value) && !token.disabled;
  });
}

function findUsedDragToken(value) {
  return Array.from(els["passage"].querySelectorAll(".drag-token")).find((token) => {
    return normalizeAnswer(token.dataset.option) === normalizeAnswer(value) && token.disabled;
  });
}

function submitCurrentQuestion() {
  const question = getCurrentQuestion();
  if (!question) return;

  els["score-pill"].className = "score-pill";
  els["score-pill"].textContent = "批改中";
  els["submit-answer"].classList.add("active");

  const selects = Array.from(els["passage"].querySelectorAll(".blank-select"));
  const dragBlanks = Array.from(els["passage"].querySelectorAll(".drag-blank"));
  const details = question.blanks.map((blank) => {
    const select = selects.find((item) => Number(item.dataset.blankIndex) === blank.blank_index);
    const dragBlank = dragBlanks.find((item) => Number(item.dataset.blankIndex) === blank.blank_index);
    const userAnswer = dragBlank ? dragBlank.dataset.value || "" : select ? select.value : "";
    const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(blank.answer);
    if (select) {
      select.classList.toggle("correct", isCorrect);
      select.classList.toggle("incorrect", !isCorrect);
    }
    if (dragBlank) {
      dragBlank.classList.toggle("correct", isCorrect);
      dragBlank.classList.toggle("incorrect", !isCorrect);
      dragBlank.classList.remove("selected", "drag-over");
    }
    return {
      blank_index: blank.blank_index,
      label: blank.label,
      answer: blank.answer,
      userAnswer,
      isCorrect,
    };
  });

  const correct = details.filter((item) => item.isCorrect).length;
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    questionId: question.id,
    questionNumber: question.question_id,
    title: question.title,
    type: question.type,
    frequency: question.frequency,
    createdAt: new Date().toISOString(),
    correct,
    total: details.length,
    details,
  };

  state.records.unshift(record);
  state.submittedQuestionIds.add(question.id);
  state.currentAttemptSubmitted = true;
  preparePassageLookup(question);
  renderCoreVocabulary(question);
  renderOptionVocabulary(question);
  renderResult(record);
  showAnalysisPanel();
  renderWeaknessList();
  renderQuestionList();
  saveRecords();
}

function buildWordIndex() {
  if (state.wordIndex.size || !Array.isArray(window.PTE_WORDLIST)) return;
  window.PTE_WORDLIST.forEach((entry) => {
    if (entry && entry.word) {
      state.wordIndex.set(String(entry.word).toLowerCase(), entry);
    }
  });
}

function buildCoreWordIndex() {
  if (!state.coreWordIndex.size && Array.isArray(window.PTE_CORE_WORDLIST)) {
    window.PTE_CORE_WORDLIST.forEach((entry) => {
      if (entry && entry.word) {
        state.coreWordIndex.set(String(entry.word).toLowerCase(), normalizeTeacherEntry(entry, "built-in"));
      }
    });
  }
  state.customCoreWords.forEach((entry, word) => {
    state.coreWordIndex.set(word, entry);
  });
}

function preparePassageLookup(question) {
  if (!question || !els["passage"]) return;
  if (!state.currentAttemptSubmitted || question.id !== state.currentId) {
    els["passage"].classList.remove("lookup-enabled");
    return;
  }
  els["passage"].classList.add("lookup-enabled");
  wrapTextNodesForLookup(els["passage"]);
}

function wrapTextNodesForLookup(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("select, option, .lookup-word, .drag-token, .drag-blank")) {
        return NodeFilter.FILTER_REJECT;
      }
      return /[A-Za-z]/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    const parts = node.nodeValue.split(/([A-Za-z][A-Za-z'-]*)/g);
    parts.forEach((part) => {
      if (/^[A-Za-z][A-Za-z'-]*$/.test(part)) {
        const span = document.createElement("span");
        span.className = "lookup-word";
        span.textContent = part;
        span.dataset.word = normalizeLookupWord(part);
        const coreEntry = findCoreWordEntry(part);
        if (coreEntry) {
          span.classList.add("core-vocab-hit");
          span.dataset.coreWord = String(coreEntry.word).toLowerCase();
        }
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(fragment, node);
  });
}

function renderCoreVocabulary(question) {
  if (!question || !els["core-vocab-panel"]) return;
  const hitMap = new Map();
  els["passage"].querySelectorAll(".lookup-word.core-vocab-hit").forEach((node) => {
    const word = node.dataset.coreWord || node.dataset.word;
    const entry = state.coreWordIndex.get(word);
    if (!entry) return;
    if (!hitMap.has(word)) {
      hitMap.set(word, {
        entry,
        count: 0,
        forms: new Set(),
      });
    }
    const item = hitMap.get(word);
    item.count += 1;
    item.forms.add(node.textContent);
  });

  const words = Array.from(hitMap.values()).sort((a, b) => {
    return b.count - a.count || (b.entry.freq || 0) - (a.entry.freq || 0) || a.entry.word.localeCompare(b.entry.word);
  });
  state.currentCoreVocabulary = words;

  if (!words.length) {
    hideCoreVocabulary();
    return;
  }

  const savedCount = words.filter((item) => state.wordbook.has(item.entry.word.toLowerCase())).length;
  els["core-vocab-count"].textContent = `命中 ${words.length} 个核心词，已加入 ${savedCount} 个。`;
  els["core-vocab-list"].innerHTML = words.map(renderCoreVocabItem).join("");
  els["core-vocab-panel"].classList.remove("hidden");
}

function renderCoreVocabItem(item) {
  const word = String(item.entry.word).toLowerCase();
  const isSaved = state.wordbook.has(word);
  const forms = Array.from(item.forms).slice(0, 3).join(" / ");
  return `
    <label class="core-vocab-item ${isSaved ? "saved" : ""}">
      <input type="checkbox" data-word="${escapeHtml(word)}" ${isSaved ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(item.entry.word)}</strong>
        <small>${escapeHtml(cleanMeaning(item.entry.meaning) || "暂无释义")}</small>
        <small>原文形式：${escapeHtml(forms || item.entry.word)}</small>
        ${isSaved ? '<small class="saved-text">已加入单词库</small>' : ""}
      </span>
    </label>
  `;
}

function hideCoreVocabulary() {
  state.currentCoreVocabulary = [];
  if (els["core-vocab-panel"]) {
    els["core-vocab-panel"].classList.add("hidden");
  }
}

function renderOptionVocabulary(question) {
  if (!question || !els["option-vocab-panel"]) return;
  const optionMap = new Map();
  getOptionVocabularyWords(question).forEach((optionWord) => {
    const key = normalizeLookupWord(optionWord);
    if (!key || optionMap.has(key)) return;
    const entry = normalizeOptionVocabEntry(findWordEntry(key) || { word: key, meaning: "", phonetic: "" });
    if (!isUsefulOptionVocabEntry(entry)) return;
    optionMap.set(key, {
      entry,
      count: 1,
      forms: new Set([optionWord]),
    });
  });

  const words = Array.from(optionMap.values()).sort((a, b) => {
    const aSaved = state.wordbook.has(String(a.entry.word).toLowerCase()) ? 1 : 0;
    const bSaved = state.wordbook.has(String(b.entry.word).toLowerCase()) ? 1 : 0;
    return bSaved - aSaved || a.entry.word.localeCompare(b.entry.word);
  });
  state.currentOptionVocabulary = words;

  if (!words.length) {
    hideOptionVocabulary();
    return;
  }

  const savedCount = words.filter((item) => state.wordbook.has(String(item.entry.word).toLowerCase())).length;
  els["option-vocab-count"].textContent = `共 ${words.length} 个选项词，已加入 ${savedCount} 个。`;
  els["option-vocab-list"].innerHTML = words.map(renderCoreVocabItem).join("");
  els["option-vocab-panel"].classList.remove("hidden");
}

function getOptionVocabularyWords(question) {
  const seen = new Set();
  const words = [];
  getQuestionOptionPool(question).forEach((option) => {
    const matches = String(option || "").match(/[A-Za-z][A-Za-z'-]*/g) || [];
    matches.forEach((match) => {
      const word = normalizeLookupWord(match);
      if (!word || OPTION_VOCAB_STOPWORDS.has(word) || seen.has(word)) return;
      seen.add(word);
      words.push(match);
    });
  });
  return words;
}

function normalizeOptionVocabEntry(entry) {
  const normalized = normalizeVocabReviewEntry(entry);
  if (normalized.meaning) return normalized;
  const fallbackMeaning = cleanOptionMeaning(entry?.meaning || "");
  return {
    ...normalized,
    meaning: fallbackMeaning,
  };
}

function cleanOptionMeaning(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim().replace(/^\[[^\]]+\]\s*/, ""))
    .filter((line) => /[\u4e00-\u9fff]/.test(line))
    .join("\n");
}

function isUsefulOptionVocabEntry(entry) {
  const meaning = cleanMeaning(entry?.meaning || "").trim();
  if (!meaning) return false;
  return !/(?:\[\s*常\s*pl\.?\s*\]|\[\s*pl\.?\s*\]|(?:^|[;；,，\s])pl\.(?=\s|[;；,，]))/i.test(meaning);
}

function hideOptionVocabulary() {
  state.currentOptionVocabulary = [];
  if (els["option-vocab-panel"]) {
    els["option-vocab-panel"].classList.add("hidden");
  }
}

function setCoreVocabSelection(checked) {
  els["core-vocab-list"].querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = checked;
  });
}

function addSelectedCoreWords() {
  const selected = Array.from(els["core-vocab-list"].querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => checkbox.dataset.word)
    .filter(Boolean);
  selected.forEach((word) => state.wordbook.add(word));
  saveWordbook();
  renderWordbook();
  renderOverview();
  renderCoreVocabulary(getCurrentQuestion());
}

function setOptionVocabSelection(checked) {
  els["option-vocab-list"].querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = checked;
  });
}

function addSelectedOptionWords() {
  const selected = Array.from(els["option-vocab-list"].querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => checkbox.dataset.word)
    .filter(Boolean);
  selected.forEach((word) => state.wordbook.add(word));
  saveWordbook();
  renderWordbook();
  renderOverview();
  const question = getCurrentQuestion();
  renderCoreVocabulary(question);
  renderOptionVocabulary(question);
}

function exportOptionVocabulary() {
  const entries = state.currentOptionVocabulary.map((item) => item.entry);
  exportVocabPdf("本题选项词汇", entries, "pte-option-vocab");
}

function exportWordbook() {
  const entries = Array.from(state.wordbook)
    .sort()
    .map((word) => state.coreWordIndex.get(word) || state.wordIndex.get(word) || { word });
  exportVocabPdf("我的单词库", entries, "pte-wordbook");
}

function exportVocabList(source) {
  const entries = getVocabReviewEntries(source);
  exportVocabPdf("PTE核心词汇", entries, "pte-core-vocab");
}

function exportVocabPdf(title, entries, filenamePrefix) {
  const normalizedEntries = entries.map(normalizeVocabReviewEntry).filter((entry) => entry.word);
  if (!normalizedEntries.length) {
    showToast("当前没有可导出的单词。");
    return;
  }

  const exportedAt = new Date();
  const rows = normalizedEntries
    .map((entry, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td class="word">${escapeHtml(entry.word)}</td>
          <td>${escapeHtml(entry.phonetic || "")}</td>
          <td>${escapeHtml(entry.meaning || "暂无释义")}</td>
        </tr>
      `;
    })
    .join("");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
    }
    .meta {
      margin: 0 0 16px;
      color: #63708b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      border: 1px solid #dbe3ef;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #eef4ff;
      color: #172033;
      font-weight: 700;
    }
    td:first-child {
      width: 42px;
      text-align: center;
      color: #63708b;
    }
    .word {
      width: 120px;
      color: #8b3b0b;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">共 ${normalizedEntries.length} 个词 · 导出时间：${escapeHtml(exportedAt.toLocaleString())}</p>
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>单词</th>
        <th>音标</th>
        <th>中文释义</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>
    document.title = ${JSON.stringify(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}`)};
    window.addEventListener("load", () => setTimeout(() => window.print(), 200));
  <\/script>
</body>
</html>`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("浏览器阻止了弹窗，请允许弹窗后再导出PDF。");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function handlePassageWordClick(event) {
  const wordNode = event.target.closest(".lookup-word");
  const question = getCurrentQuestion();
  if (!wordNode || !question || !state.currentAttemptSubmitted || question.id !== state.currentId) return;
  event.stopPropagation();
  if (state.teacherMode) {
    event.preventDefault();
    addTeacherWord(wordNode, "core");
    return;
  }
  showWordCard(wordNode.dataset.word, wordNode.textContent, wordNode, wordNode.dataset.coreWord || "");
}

function handlePassageWordContextMenu(event) {
  if (state.teacherMode && event.target.closest(".lookup-word")) {
    event.preventDefault();
  }
}

function showWordCard(wordKey, displayWord, anchor, coreWordKey = "") {
  const entry = coreWordKey ? findCoreWordEntry(coreWordKey) : findWordEntry(wordKey);
  const phonetic = entry?.phonetic || entry?.ukphone || entry?.usphone || "暂无本地音标";
  const meaning = cleanMeaning(entry?.meaning) || "本地词库暂无释义，可后续补充更完整词库。";
  const rect = anchor.getBoundingClientRect();

  els["word-card"].innerHTML = `
    <div class="word-card__head">
      <div>
        <strong>${escapeHtml(displayWord)}</strong>
        <span>${escapeHtml(phonetic)}</span>
      </div>
      <button class="word-card__close" type="button" aria-label="关闭">×</button>
    </div>
    <p><b>中文注释：</b>${escapeHtml(meaning)}</p>
    <button class="word-card__sound" type="button">播放发音</button>
  `;
  els["word-card"].style.left = `${Math.min(window.innerWidth - 340, Math.max(16, rect.left))}px`;
  els["word-card"].style.top = `${Math.min(window.innerHeight - 240, rect.bottom + 8)}px`;
  els["word-card"].classList.remove("hidden");
  els["word-card"].querySelector(".word-card__close").addEventListener("click", hideWordCard);
  els["word-card"].querySelector(".word-card__sound").addEventListener("click", () => speakWord(displayWord));
}

function findWordEntry(wordKey) {
  const entries = getLookupCandidates(wordKey)
    .map((candidate) => state.coreWordIndex.get(candidate) || state.wordIndex.get(candidate))
    .filter(Boolean);
  return entries.find((entry) => /[\u4e00-\u9fff]/.test(cleanMeaning(entry.meaning || "")))
    || entries.find((entry) => cleanMeaning(entry.meaning || "").trim())
    || entries[0];
}

function findCoreWordEntry(wordKey) {
  return getLookupCandidates(wordKey).map((candidate) => state.coreWordIndex.get(candidate)).find(Boolean);
}

function findTeacherBaseEntry(wordKey, coreWordKey = "") {
  const coreKey = normalizeLookupWord(coreWordKey);
  if (coreKey && state.coreWordIndex.has(coreKey)) return state.coreWordIndex.get(coreKey);
  const candidates = getLookupCandidates(wordKey);
  const preferred = candidates.length > 1 ? candidates.slice(1).concat(candidates[0]) : candidates;
  return preferred
    .map((candidate) => state.coreWordIndex.get(candidate) || state.wordIndex.get(candidate))
    .find(Boolean);
}

function getLookupCandidates(wordKey) {
  const key = normalizeLookupWord(wordKey);
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
    candidates.push(stem, `${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) candidates.push(stem.slice(0, -1));
  }
  if (key.endsWith("ed") && key.length > 4) {
    const stem = key.slice(0, -2);
    candidates.push(stem, `${stem}e`);
    if (key.endsWith("ied") && key.length > 5) candidates.push(`${key.slice(0, -3)}y`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) candidates.push(stem.slice(0, -1));
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

function inferLookupLemma(wordKey) {
  return getLookupCandidates(wordKey)[1] || normalizeLookupWord(wordKey);
}

function hideWordCard() {
  if (els["word-card"]) {
    els["word-card"].classList.add("hidden");
  }
}

function speakWord(word) {
  if (!window.speechSynthesis || !word) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function autoSpeakReviewWord(word) {
  const normalized = normalizeLookupWord(word);
  if (!normalized || state.vocabReviewLastSpokenWord === normalized) return;
  state.vocabReviewLastSpokenWord = normalized;
  window.setTimeout(() => speakWord(normalized), 220);
}

function normalizeLookupWord(value) {
  return String(value || "").toLowerCase().replace(/^'+|'+$/g, "");
}

function cleanMeaning(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]/.test(line))
    .join("\n");
}

function cleanMainMeaning(value) {
  const cleaned = cleanMeaning(value)
    .split(/\n+/)
    .map((line) => line.replace(/\s+[A-Za-z][A-Za-z\s;,'’()/-]*$/g, "").trim())
    .filter(Boolean);
  const parts = [];
  cleaned.forEach((line) => {
    const prefix = line.match(/^[a-z./]+\.?\s*/i)?.[0] || "";
    const body = line.slice(prefix.length);
    body
      .split(/[;；]/)
      .map((item) => item.trim())
      .filter((item) => /[\u4e00-\u9fff]/.test(item))
      .forEach((item) => {
        if (parts.length < 4 && !parts.includes(item)) {
          parts.push(item);
        }
      });
    if (!parts.length && /[\u4e00-\u9fff]/.test(body)) {
      parts.push(body);
    }
    if (parts.length && prefix && !parts[0].startsWith(prefix.trim())) {
      parts[0] = `${prefix}${parts[0]}`.trim();
    }
  });
  return parts.join("；") || cleaned[0] || "";
}

function normalizeTeacherEntry(entry, source = "local") {
  const word = normalizeLookupWord(entry?.word || "");
  return {
    word,
    meaning: cleanMainMeaning(entry?.meaning || ""),
    phonetic: entry?.phonetic || entry?.ukphone || entry?.usphone || "",
    freq: entry?.freq || 0,
    originalForm: entry?.originalForm || word,
    target: entry?.target || "",
    source,
    updatedAt: entry?.updatedAt || new Date().toISOString(),
  };
}

function createTeacherWordEntry(wordNode, target) {
  const lookupKey = wordNode.dataset.word || wordNode.textContent;
  const found = findTeacherBaseEntry(lookupKey, wordNode.dataset.coreWord || "");
  const word = normalizeLookupWord(found?.word || inferLookupLemma(lookupKey));
  return {
    word,
    meaning: cleanMainMeaning(found?.meaning || ""),
    phonetic: found?.phonetic || found?.ukphone || found?.usphone || "",
    originalForm: wordNode.textContent,
    source: found ? "local_dictionary" : "manual_click",
    target,
    updatedAt: new Date().toISOString(),
  };
}

function addTeacherWord(wordNode, target) {
  const entry = createTeacherWordEntry(wordNode, target);
  if (!entry.word) return;
  const existed = state.customCoreWords.has(entry.word) || state.coreWordIndex.has(entry.word);
  state.customCoreWords.set(entry.word, entry);
  state.coreWordIndex.set(entry.word, entry);
  saveTeacherWordMap(CUSTOM_CORE_STORAGE_KEY, state.customCoreWords);
  markCoreWordInCurrentPassage(entry.word);
  renderCoreVocabulary(getCurrentQuestion());
  renderOverview();
  showToast(existed ? `已在PTE核心词汇：${entry.word}` : `已加入PTE核心词汇：${entry.word}`);
}

function markCoreWordInCurrentPassage(word) {
  els["passage"].querySelectorAll(".lookup-word").forEach((node) => {
    const coreEntry = findCoreWordEntry(node.dataset.word);
    if (coreEntry && normalizeLookupWord(coreEntry.word) === word) {
      node.classList.add("core-vocab-hit");
      node.dataset.coreWord = word;
    }
  });
}

function handleTeacherModeShortcut(event) {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    state.teacherMode = !state.teacherMode;
    document.body.classList.toggle("teacher-mode", state.teacherMode);
    els["teacher-mode-indicator"]?.classList.toggle("hidden", !state.teacherMode);
    showToast(state.teacherMode ? "教师词库编辑模式已开启" : "教师词库编辑模式已关闭");
  }
}

function showToast(message) {
  if (!els["app-toast"]) return;
  els["app-toast"].textContent = message;
  els["app-toast"].classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els["app-toast"]?.classList.add("hidden");
  }, 1800);
}

function exportTeacherVocab() {
  const payload = {
    exportedAt: new Date().toISOString(),
    pteCoreAdditions: Array.from(state.customCoreWords.values()).sort((a, b) => a.word.localeCompare(b.word)),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pte-teacher-vocab-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildFallbackExample(word) {
  return "暂无本地例句，可继续点击正文中的其他单词查词。";
}

function renderResult(record) {
  const percentage = Math.round((record.correct / record.total) * 100);
  els["score-pill"].className = `score-pill ${percentage >= 80 ? "good" : "bad"}`;
  els["score-pill"].textContent = `${record.correct}/${record.total}`;

  els["result-panel"].innerHTML = `
    <h2>本题结果：${record.correct}/${record.total} (${percentage}%)</h2>
    <div class="result-list">
      ${record.details
        .map(
          (item) => `
          <div class="result-row ${item.isCorrect ? "correct" : "incorrect"}">
            <strong>第 ${item.blank_index} 空：${item.isCorrect ? "正确" : "错误"}</strong>
            <span class="label-chip">${escapeHtml(item.label)}</span>
            <span>你的答案：${escapeHtml(item.userAnswer || "未作答")}</span>
            <span>正确答案：${escapeHtml(item.answer)}</span>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
  els["result-panel"].classList.remove("hidden");
}

function showAnalysisPanel() {
  els["analysis-panel"].classList.remove("hidden");
  els["toggle-analysis"].className = "primary-button active";
  els["toggle-analysis"].textContent = "收起解析与翻译";
}

function hideAnalysisPanel() {
  els["analysis-panel"].classList.add("hidden");
  els["toggle-analysis"].className = "secondary-button";
  els["toggle-analysis"].textContent = "查看解析与翻译";
}

function renderWeaknessList() {
  const stats = getLabelStats();
  const rows = Object.entries(stats)
    .sort((a, b) => b[1].wrong - a[1].wrong || a[0].localeCompare(b[0], "zh-CN"))
    .filter(([, item]) => item.attempts > 0);

  if (!rows.length) {
    setSidebarWeaknessHtml('<div class="item-meta">提交一次练习后，这里会显示错得最多的考点。</div>');
    return;
  }

  setSidebarWeaknessHtml(rows
    .map(([label, item]) => {
      const rate = Math.round((item.correct / item.attempts) * 100);
      return `
        <div class="weakness-item">
          <div class="item-title">${escapeHtml(label)}</div>
          <div class="item-meta">错 ${item.wrong} 次 · 对 ${item.correct} 次 · 正确率 ${rate}%</div>
        </div>
      `;
    })
    .join(""));
}

function setSidebarWeaknessHtml(html) {
  if (els["weakness-list"]) {
    els["weakness-list"].innerHTML = html;
  }
}

function renderReviewOverview() {
  setText("review-fibrw-summary", getReviewTypeSummary("FIB_RW"));
  setText("review-fibr-summary", getReviewTypeSummary("FIB_R"));
}

function getReviewTypeSummary(type) {
  const records = state.records.filter((record) => record.type === type);
  const wrong = records.reduce((total, record) => total + record.details.filter((item) => !item.isCorrect).length, 0);
  return `${records.length} 次记录 · 错 ${wrong} 空`;
}

function renderReviewTypePage() {
  const type = state.reviewTypeFilter || "FIB_RW";
  const typeName = type === "FIB_R" ? "FIB-R 拖拽" : "FIB-RW 下拉";
  setText("review-type-title", `${typeName} 错题复盘`);
  setText("review-type-summary", "集中查看该题型当前错得最多的考点。");
  const stats = getLabelStats(type);
  const rows = Object.entries(stats)
    .sort((a, b) => b[1].wrong - a[1].wrong || a[0].localeCompare(b[0], "zh-CN"))
    .filter(([, item]) => item.attempts > 0);

  if (!rows.length) {
    setReviewWeaknessHtml('<div class="item-meta">提交一次该题型练习后，这里会显示错得最多的考点。</div>');
    return;
  }

  setReviewWeaknessHtml(rows
    .map(([label, item]) => {
      const rate = Math.round((item.correct / item.attempts) * 100);
      return `
        <button class="weakness-item" data-label="${escapeHtml(label)}" type="button">
          <div class="item-title">${escapeHtml(label)}</div>
          <div class="item-meta">错 ${item.wrong} 次 · 对 ${item.correct} 次 · 正确率 ${rate}%</div>
        </button>
      `;
    })
    .join(""));
  bindReviewWeaknessItems();
}

function setReviewWeaknessHtml(html) {
  if (els["review-weakness-list"]) {
    els["review-weakness-list"].innerHTML = html;
  }
}

function bindReviewWeaknessItems() {
  if (!els["review-weakness-list"]) return;
  els["review-weakness-list"].querySelectorAll(".weakness-item[data-label]").forEach((button) => {
    button.addEventListener("click", () => showReviewDetailPage(button.dataset.label));
  });
}

function renderReviewDetail(label) {
  const safeLabel = label || "";
  state.reviewDetailLabel = safeLabel;
  const stats = getLabelStats(state.reviewTypeFilter)[safeLabel] || { attempts: 0, correct: 0, wrong: 0 };
  const relatedQuestions = getQuestionsByLabel(safeLabel, state.reviewTypeFilter);
  const filteredRelatedQuestions = filterReviewRelatedQuestions(relatedQuestions);
  const wrongRows = getWrongQuestionsByLabel(safeLabel, state.reviewTypeFilter);
  setText("review-detail-title", `${safeLabel} 复盘`);
  setText(
    "review-detail-summary",
    `错 ${stats.wrong} 次 · 对 ${stats.correct} 次 · 包含该考点 ${relatedQuestions.length} 题`,
  );
  updateReviewRelatedTabs();
  renderReviewQuestionList("review-wrong-question-list", wrongRows, "还没有这个考点的错题记录。", {
    pageKey: "reviewWrongPage",
    prevId: "review-wrong-prev-page",
    nextId: "review-wrong-next-page",
    infoId: "review-wrong-page-info",
  });
  renderReviewQuestionList("review-related-question-list", filteredRelatedQuestions, "当前筛选下没有题目。", {
    pageKey: "reviewRelatedPage",
    prevId: "review-related-prev-page",
    nextId: "review-related-next-page",
    infoId: "review-related-page-info",
  });
}

function getWrongQuestionsByLabel(label, type = null) {
  const grouped = new Map();
  state.records.forEach((record) => {
    if (type && record.type !== type) return;
    const wrongCount = record.details.filter((item) => item.label === label && !item.isCorrect).length;
    if (!wrongCount) return;
    const existing = grouped.get(record.questionId);
    if (!existing || record.createdAt > existing.createdAt) {
      grouped.set(record.questionId, { ...record, wrongCount });
    }
  });
  return Array.from(grouped.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((record) => ({
      id: record.questionId,
      question_id: record.questionNumber,
      title: record.title,
      frequency: record.frequency,
      type: record.type,
      meta: `最近 ${record.correct}/${record.total} · 该考点错 ${record.wrongCount} 空`,
    }));
}

function getQuestionsByLabel(label, type = null) {
  return state.questions
    .filter((question) => !type || question.type === type)
    .map((question) => {
      const matched = question.blanks.filter((blank) => blank.label === label).length;
      return { question, matched };
    })
    .filter((item) => item.matched)
    .sort((a, b) => compareQuestionsByFrequency(a.question, b.question))
    .map(({ question, matched }) => ({
      id: question.id,
      question_id: question.question_id,
      title: question.title,
      frequency: question.frequency,
      type: question.type,
      isDone: state.submittedQuestionIds.has(question.id),
      meta: `${question.blanks.length} 空 · 包含 ${matched} 空`,
    }));
}

function filterReviewRelatedQuestions(rows) {
  if (state.reviewRelatedStatus === "done") {
    return rows.filter((item) => item.isDone);
  }
  if (state.reviewRelatedStatus === "undone") {
    return rows.filter((item) => !item.isDone);
  }
  return rows;
}

function updateReviewRelatedTabs() {
  ["review-related-all", "review-related-done", "review-related-undone"].forEach((id) => {
    els[id]?.classList.toggle("active", (els[id]?.dataset.reviewStatus || "all") === state.reviewRelatedStatus);
  });
}

function renderReviewQuestionList(targetId, rows, emptyText, pager = null) {
  const target = els[targetId];
  if (!target) return;
  const totalPages = Math.max(1, Math.ceil(rows.length / REVIEW_DETAIL_PAGE_SIZE));
  let page = pager?.pageKey ? Number(state[pager.pageKey] || 1) : 1;
  page = Math.min(Math.max(1, page), totalPages);
  if (pager?.pageKey) {
    state[pager.pageKey] = page;
  }
  updateReviewListPager(pager, page, totalPages, rows.length);
  if (!rows.length) {
    target.innerHTML = `<div class="item-meta">${escapeHtml(emptyText)}</div>`;
    return;
  }
  const pageRows = rows.slice((page - 1) * REVIEW_DETAIL_PAGE_SIZE, page * REVIEW_DETAIL_PAGE_SIZE);
  const rowIds = rows.map((item) => item.id);
  target.innerHTML = pageRows
    .map((item) => `
      <button class="review-question-item" data-id="${escapeHtml(item.id)}" type="button">
        <strong>${escapeHtml(item.question_id)}. ${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.frequency)} · ${escapeHtml(item.type)} · ${escapeHtml(item.meta)}</span>
      </button>
    `)
    .join("");
  target.querySelectorAll(".review-question-item").forEach((button) => {
    button.addEventListener("click", () => openQuestionFromReview(button.dataset.id, rowIds, targetId));
  });
}

function updateReviewListPager(pager, page, totalPages, totalRows) {
  if (!pager) return;
  if (els[pager.infoId]) {
    els[pager.infoId].textContent = `第 ${page} / ${totalPages} 页 · 共 ${totalRows} 题`;
  }
  if (els[pager.prevId]) {
    els[pager.prevId].disabled = page <= 1;
  }
  if (els[pager.nextId]) {
    els[pager.nextId].disabled = page >= totalPages;
  }
}

function openQuestionFromReview(questionId, questionIds = [], sourceListId = "") {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;
  state.typeFilter = question.type;
  state.frequencyFilter = null;
  state.questionStatusFilter = sourceListId === "review-related-question-list" ? state.reviewRelatedStatus : "all";
  state.practiceLabelFilter = state.reviewDetailLabel || "";
  state.practiceLabelType = state.reviewTypeFilter || question.type;
  state.practiceQuestionIds = Array.from(new Set(questionIds.filter(Boolean)));
  if (els["search-input"]) {
    els["search-input"].value = "";
  }
  const statusText =
    sourceListId === "review-related-question-list"
      ? getReviewRelatedStatusText(state.reviewRelatedStatus)
      : "错题";
  state.practiceContextText = `${state.practiceLabelFilter} · ${statusText} · ${state.practiceQuestionIds.length || 1} 题`;
  state.currentId = question.id;
  moveQuestionIntoCurrentPage(question.id);
  showPractice();
  renderAll();
}

function getReviewRelatedStatusText(status) {
  if (status === "done") return "已做题";
  if (status === "undone") return "未做题";
  return "全部题";
}

function renderCoreVocabPage() {
  if (!els["core-vocab-page-list"]) return;
  const keyword = (els["core-vocab-search-input"]?.value || "").trim().toLowerCase();
  const allEntries = Array.from(state.coreWordIndex.values())
    .filter((entry) => {
      if (!keyword) return true;
      const word = String(entry.word || "").toLowerCase();
      const meaning = cleanMeaning(entry.meaning || "").toLowerCase();
      return word.includes(keyword) || meaning.includes(keyword);
    })
    .sort((a, b) => String(a.word || "").localeCompare(String(b.word || "")));
  const totalPages = Math.max(1, Math.ceil(allEntries.length / VOCAB_PAGE_SIZE));
  state.coreVocabPage = Math.min(Math.max(1, state.coreVocabPage), totalPages);
  const start = (state.coreVocabPage - 1) * VOCAB_PAGE_SIZE;
  const entries = allEntries.slice(start, start + VOCAB_PAGE_SIZE);

  if (!entries.length) {
    els["core-vocab-page-list"].innerHTML = '<div class="item-meta">没有找到匹配的核心词汇。</div>';
    updateCoreVocabPagination(allEntries.length, totalPages);
    return;
  }

  els["core-vocab-page-list"].innerHTML = entries
    .map((entry) => `
      <button class="dictionary-item vocab-entry-button" type="button" data-vocab-source="core" data-word="${escapeHtml(entry.word || "")}">
        <strong>${escapeHtml(entry.word || "")}</strong>
        <span>${escapeHtml(cleanMainMeaning(entry.meaning) || cleanMeaning(entry.meaning) || "暂无释义")}</span>
      </button>
    `)
    .join("");
  bindVocabEntryButtons(els["core-vocab-page-list"]);
  renderVocabDetail("core");
  updateCoreVocabPagination(allEntries.length, totalPages);
}

function updateCoreVocabPagination(total, totalPages) {
  if (els["core-vocab-page-info"]) {
    els["core-vocab-page-info"].textContent = `第 ${state.coreVocabPage} / ${totalPages} 页 · 共 ${total} 词`;
  }
  if (els["core-vocab-prev-page"]) {
    els["core-vocab-prev-page"].disabled = state.coreVocabPage <= 1;
  }
  if (els["core-vocab-next-page"]) {
    els["core-vocab-next-page"].disabled = state.coreVocabPage >= totalPages;
  }
}

function startVocabReview(source, startWord = "", options = {}) {
  state.vocabReviewSource = source === "core" ? source : "wordbook";
  state.vocabReviewQueue = buildVocabReviewQueue(state.vocabReviewSource, options);
  state.vocabReviewIndex = getVocabReviewStartIndex(state.vocabReviewQueue, startWord);
  state.vocabReviewRevealed = false;
  state.vocabReviewLastSpokenWord = "";
  renderVocabReview();
  showOnlyPage("vocab-review-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getReviewStartWord(source) {
  const inputId =
    source === "core"
        ? "core-vocab-review-start-word"
        : "wordbook-review-start-word";
  return els[inputId]?.value || "";
}

function getVocabReviewStartIndex(queue, startWord) {
  const key = normalizeLookupWord(startWord);
  if (!key) return 0;
  const exactIndex = queue.findIndex((entry) => normalizeLookupWord(entry.word) === key);
  if (exactIndex >= 0) return exactIndex;
  const prefixIndex = queue.findIndex((entry) => normalizeLookupWord(entry.word).startsWith(key));
  if (prefixIndex >= 0) return prefixIndex;
  const includesIndex = queue.findIndex((entry) => normalizeLookupWord(entry.word).includes(key));
  if (includesIndex >= 0) return includesIndex;
  showToast(`没有找到起始单词：${startWord}`);
  return 0;
}

function backFromVocabReview() {
  if (state.vocabReviewSource === "core") {
    showCoreVocabPage();
    return;
  }
  showWordbookPage();
}

function buildVocabReviewQueue(source, options = {}) {
  const now = Date.now();
  const entries = getVocabReviewEntries(source);
  const reviewItems = entries
    .map((entry) => {
      const record = state.vocabReviewRecords[entry.word] || {};
      const nextTime = record.nextReview ? new Date(record.nextReview).getTime() : 0;
      const dueRank = !record.nextReview || nextTime <= now ? 0 : 1;
      return { entry, record, dueRank, nextTime: nextTime || now };
    })
    .filter((item) => options.includeAll || item.dueRank === 0);
  if (options.includeAll) {
    return reviewItems
      .sort((a, b) => a.entry.word.localeCompare(b.entry.word))
      .map((item) => item.entry);
  }
  return reviewItems
    .sort((a, b) => a.dueRank - b.dueRank || a.nextTime - b.nextTime || a.entry.word.localeCompare(b.entry.word))
    .map((item) => item.entry);
}

function getDueVocabCount(source) {
  const now = Date.now();
  return getVocabReviewEntries(source).filter((entry) => {
    const record = state.vocabReviewRecords[entry.word] || {};
    if (!record.nextReview) return true;
    return new Date(record.nextReview).getTime() <= now;
  }).length;
}

function renderVocabDueCounts() {
  setText("wordbook-due-count", `今日待复习：${getDueVocabCount("wordbook")} 个`);
  setText("core-vocab-due-count", `今日待复习：${getDueVocabCount("core")} 个`);
}

function getVocabReviewEntries(source) {
  if (source === "core") {
    return Array.from(state.coreWordIndex.values())
      .map(normalizeVocabReviewEntry)
      .filter((entry) => entry.word);
  }
  return Array.from(state.wordbook)
    .sort()
    .map((word) => {
      const entry = state.coreWordIndex.get(word) || state.wordIndex.get(word) || { word };
      return normalizeVocabReviewEntry(entry);
    })
    .filter((entry) => entry.word);
}

function normalizeVocabReviewEntry(entry) {
  const word = normalizeLookupWord(entry?.word || "");
  const lookupEntry = findWordEntry(word) || {};
  const phonetic =
    entry?.phonetic ||
    entry?.ukphone ||
    entry?.usphone ||
    lookupEntry?.phonetic ||
    lookupEntry?.ukphone ||
    lookupEntry?.usphone ||
    VOCAB_PHONETIC_FALLBACKS[word] ||
    "";
  return {
    word,
    meaning: cleanMainMeaning(entry?.meaning || "") || cleanMeaning(entry?.meaning || ""),
    phonetic,
  };
}

function getVocabEntry(source, word) {
  const key = normalizeLookupWord(word);
  if (!key) return null;
  if (source === "core") {
    return normalizeVocabReviewEntry(state.coreWordIndex.get(key) || state.wordIndex.get(key) || { word: key });
  }
  if (!state.wordbook.has(key)) return null;
  return normalizeVocabReviewEntry(state.coreWordIndex.get(key) || state.wordIndex.get(key) || { word: key });
}

function selectVocabEntry(source, word) {
  const key = normalizeLookupWord(word);
  if (!key) return;
  if (source === "core") {
    state.selectedCoreVocabWord = key;
    if (els["core-vocab-review-start-word"]) els["core-vocab-review-start-word"].value = key;
    renderVocabDetail("core");
    return;
  }
  state.selectedWordbookWord = key;
  if (els["wordbook-review-start-word"]) els["wordbook-review-start-word"].value = key;
  renderVocabDetail("wordbook");
}

function bindVocabEntryButtons(container) {
  if (!container) return;
  container.querySelectorAll("[data-vocab-source][data-word]").forEach((button) => {
    button.addEventListener("click", () => {
      selectVocabEntry(button.dataset.vocabSource, button.dataset.word);
    });
  });
}

function renderVocabDetail(source) {
  const detail = source === "core" ? els["core-vocab-detail"] : els["wordbook-detail"];
  if (!detail) return;
  const selectedWord = source === "core" ? state.selectedCoreVocabWord : state.selectedWordbookWord;
  const entry = getVocabEntry(source, selectedWord);
  if (!entry) {
    detail.classList.add("hidden");
    detail.innerHTML = "";
    return;
  }

  detail.classList.remove("hidden");
  detail.innerHTML = `
    <div>
      <p class="eyebrow">WORD DETAIL</p>
      <h3>${escapeHtml(entry.word)}</h3>
      ${entry.phonetic ? `<p class="vocab-detail-phonetic">${escapeHtml(entry.phonetic)}</p>` : ""}
      <p class="vocab-detail-meaning">${escapeHtml(entry.meaning || "暂无释义")}</p>
    </div>
    <div class="mini-actions">
      <button class="primary-button mini-button" type="button" data-vocab-detail-review="${escapeHtml(source)}">开始复习</button>
      <button class="secondary-button mini-button" type="button" data-vocab-detail-close>收起</button>
    </div>
  `;
  detail.querySelector("[data-vocab-detail-review]")?.addEventListener("click", () => {
    startVocabReview(source, entry.word, { includeAll: true });
  });
  detail.querySelector("[data-vocab-detail-close]")?.addEventListener("click", () => {
    if (source === "core") {
      state.selectedCoreVocabWord = "";
    } else {
      state.selectedWordbookWord = "";
    }
    renderVocabDetail(source);
  });
}

function renderVocabReview() {
  const sourceName = state.vocabReviewSource === "core" ? "PTE核心词汇" : "我的单词库";
  const total = state.vocabReviewQueue.length;
  const current = state.vocabReviewQueue[state.vocabReviewIndex];
  setText("vocab-review-title", `${sourceName}认词复习`);
  setText("vocab-review-summary", total && current ? `第 ${state.vocabReviewIndex + 1} / ${total} 个词` : "暂无可复习单词");

  if (!els["vocab-review-card"]) return;
  if (total && !current) {
    els["vocab-review-card"].innerHTML = `
      <div class="empty-state">本轮认词复习已完成。</div>
      <div class="vocab-review-actions">
        <button class="primary-button" type="button" data-vocab-action="restart">再来一轮</button>
      </div>
    `;
    els["vocab-review-card"].querySelector('[data-vocab-action="restart"]')?.addEventListener("click", () => {
      startVocabReview(state.vocabReviewSource);
    });
    setText("vocab-review-summary", `已完成 ${total} 个词`);
    return;
  }

  if (!total) {
    els["vocab-review-card"].innerHTML = `
      <div class="empty-state">今日没有到期单词。可以返回词库点击“复习全部”。</div>
    `;
    return;
  }

  const record = state.vocabReviewRecords[current.word] || {};
  const lastRatingText = record.lastRating ? `上次选择：${getVocabRatingLabel(record.lastRating)}` : "新词";
  const nextText = record.nextReview ? `下次复习：${new Date(record.nextReview).toLocaleString()}` : "尚未安排复习时间";
  els["vocab-review-card"].innerHTML = `
    <div class="vocab-review-word">${escapeHtml(current.word)}</div>
    <div class="vocab-review-phonetic">${escapeHtml(current.phonetic || "暂无本地音标")}</div>
    <button class="vocab-review-sound" type="button" data-vocab-action="sound" aria-label="播放发音" title="播放发音">▶ 播放发音</button>
    <div class="vocab-review-meta">${escapeHtml(lastRatingText)} · ${escapeHtml(nextText)}</div>
    <div class="vocab-review-meaning ${state.vocabReviewRevealed ? "" : "hidden"}">
      <strong>中文释义</strong>
      <p>${escapeHtml(current.meaning || "暂无释义")}</p>
    </div>
    <div class="vocab-review-actions">
      ${
        state.vocabReviewRevealed
          ? `
            <button class="secondary-button" type="button" data-vocab-rating="known">认识</button>
            <button class="secondary-button" type="button" data-vocab-rating="fuzzy">模糊</button>
            <button class="secondary-button" type="button" data-vocab-rating="unknown">不认识</button>
          `
          : '<button class="primary-button" type="button" data-vocab-action="reveal">查看释义</button>'
      }
    </div>
  `;
  els["vocab-review-card"].querySelector('[data-vocab-action="reveal"]')?.addEventListener("click", () => {
    state.vocabReviewRevealed = true;
    renderVocabReview();
  });
  els["vocab-review-card"].querySelector('[data-vocab-action="sound"]')?.addEventListener("click", () => {
    speakWord(current.word);
  });
  els["vocab-review-card"].querySelectorAll("[data-vocab-rating]").forEach((button) => {
    button.addEventListener("click", () => rateVocabReview(button.dataset.vocabRating));
  });
  autoSpeakReviewWord(current.word);
}

function rateVocabReview(rating) {
  const entry = state.vocabReviewQueue[state.vocabReviewIndex];
  if (!entry) return;
  const now = new Date();
  const nextReview = getNextVocabReviewDate(rating, now);
  const previous = state.vocabReviewRecords[entry.word] || {};
  state.vocabReviewRecords[entry.word] = {
    word: entry.word,
    lastRating: rating,
    lastReviewed: now.toISOString(),
    nextReview: nextReview.toISOString(),
    known: (previous.known || 0) + (rating === "known" ? 1 : 0),
    fuzzy: (previous.fuzzy || 0) + (rating === "fuzzy" ? 1 : 0),
    unknown: (previous.unknown || 0) + (rating === "unknown" ? 1 : 0),
  };
  saveVocabReviewRecords();
  renderVocabDueCounts();
  showToast(`${entry.word} 已按“${getVocabRatingLabel(rating)}”安排：${nextReview.toLocaleString()} 复习`);
  state.vocabReviewIndex += 1;
  state.vocabReviewRevealed = false;
  renderVocabReview();
}

function getVocabRatingLabel(rating) {
  if (rating === "known") return "认识";
  if (rating === "fuzzy") return "模糊";
  return "不认识";
}

function getNextVocabReviewDate(rating, now) {
  const next = new Date(now.getTime());
  if (rating === "known") {
    next.setDate(next.getDate() + 7);
  } else if (rating === "fuzzy") {
    next.setDate(next.getDate() + 1);
  } else {
    next.setMinutes(next.getMinutes() + 10);
  }
  return next;
}

function getLabelStats(type = null) {
  return state.records.reduce((stats, record) => {
    if (type && record.type !== type) return stats;
    record.details.forEach((item) => {
      if (!stats[item.label]) {
        stats[item.label] = { attempts: 0, correct: 0, wrong: 0 };
      }
      stats[item.label].attempts += 1;
      if (item.isCorrect) {
        stats[item.label].correct += 1;
      } else {
        stats[item.label].wrong += 1;
      }
    });
    return stats;
  }, {});
}

function getLatestRecord(questionId) {
  return state.records.find((record) => record.questionId === questionId);
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records.slice(0, 500)));
  } catch (error) {
    console.warn("练习结果已在当前页面显示，但浏览器阻止了本地保存。", error);
  }
}

function loadWordbook() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOCAB_STORAGE_KEY) || "[]"));
  } catch (_) {
    return new Set();
  }
}

function loadVocabReviewRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(VOCAB_REVIEW_STORAGE_KEY) || "{}");
    return records && typeof records === "object" ? records : {};
  } catch (_) {
    return {};
  }
}

function saveVocabReviewRecords() {
  try {
    localStorage.setItem(VOCAB_REVIEW_STORAGE_KEY, JSON.stringify(state.vocabReviewRecords));
  } catch (error) {
    console.warn("词汇复习记录已在当前页面生效，但浏览器阻止了本地保存。", error);
  }
}

function loadTeacherWordMap(storageKey) {
  try {
    const rows = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Map(
      rows
        .map((entry) => normalizeTeacherEntry(entry, entry.source || "teacher"))
        .filter((entry) => entry.word)
        .map((entry) => [entry.word, entry]),
    );
  } catch (_) {
    return new Map();
  }
}

function saveTeacherWordMap(storageKey, wordMap) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(wordMap.values()).sort((a, b) => a.word.localeCompare(b.word))));
  } catch (error) {
    console.warn("教师词库已在当前页面生效，但浏览器阻止了本地保存。", error);
  }
}

function renderWordbook() {
  const targets = [els["wordbook-list"], els["wordbook-page-list"]].filter(Boolean);
  if (!targets.length) return;
  const words = Array.from(state.wordbook).sort();
  if (els["wordbook-page-edit"]) {
    els["wordbook-page-edit"].textContent = state.wordbookEditMode ? "完成" : "编辑";
    els["wordbook-page-edit"].classList.toggle("active", state.wordbookEditMode);
    els["wordbook-page-edit"].disabled = !words.length;
  }
  if (!words.length) {
    state.wordbookEditMode = false;
    if (els["wordbook-page-edit"]) {
      els["wordbook-page-edit"].textContent = "编辑";
      els["wordbook-page-edit"].classList.remove("active");
      els["wordbook-page-edit"].disabled = true;
    }
    targets.forEach((target) => {
      target.innerHTML = '<div class="item-meta">勾选核心词后，点击“加入单词库”，这里会显示已保存的词。</div>';
    });
    state.selectedWordbookWord = "";
    renderVocabDetail("wordbook");
    return;
  }
  const html = words
    .map((word) => {
      const entry = state.coreWordIndex.get(word) || state.wordIndex.get(word) || { word };
      const wordValue = entry.word || word;
      const itemButton = `
        <button class="wordbook-item vocab-entry-button" type="button" data-vocab-source="wordbook" data-word="${escapeHtml(wordValue)}">
          <strong>${escapeHtml(wordValue)}</strong>
          <span>${escapeHtml(cleanMeaning(entry.meaning) || "暂无释义")}</span>
        </button>
      `;
      if (state.wordbookEditMode) {
        return `
          <div class="wordbook-edit-row">
            ${itemButton}
            <button class="wordbook-delete-button" type="button" data-delete-word="${escapeHtml(wordValue)}" aria-label="删除 ${escapeHtml(wordValue)}">删除</button>
          </div>
        `;
      }
      return `
        ${itemButton}
      `;
    })
    .join("");
  targets.forEach((target) => {
    target.innerHTML = html;
    bindVocabEntryButtons(target);
    bindWordbookDeleteButtons(target);
  });
  if (state.selectedWordbookWord && !state.wordbook.has(state.selectedWordbookWord)) {
    state.selectedWordbookWord = "";
  }
  renderVocabDetail("wordbook");
}

function toggleWordbookEditMode() {
  state.wordbookEditMode = !state.wordbookEditMode;
  renderWordbook();
}

function bindWordbookDeleteButtons(container) {
  if (!container) return;
  container.querySelectorAll("[data-delete-word]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeWordbookWord(button.dataset.deleteWord);
    });
  });
}

function removeWordbookWord(word) {
  const key = normalizeLookupWord(word);
  if (!key || !state.wordbook.has(key)) return;
  state.wordbook.delete(key);
  if (state.selectedWordbookWord === key) {
    state.selectedWordbookWord = "";
  }
  saveWordbook();
  renderWordbook();
  renderVocabDueCounts();
  renderOverview();
  renderCoreVocabulary(getCurrentQuestion());
  showToast(`已从单词库删除：${key}`);
}

function saveWordbook() {
  try {
    localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(Array.from(state.wordbook).sort()));
  } catch (error) {
    console.warn("单词库已在当前页面显示，但浏览器阻止了本地保存。", error);
  }
}

function clearWordbook() {
  if (!state.wordbook.size) return;
  if (!confirm("确定清空我的单词库吗？")) return;
  state.wordbook = new Set();
  saveWordbook();
  renderWordbook();
  renderOverview();
  renderCoreVocabulary(getCurrentQuestion());
}

function resetRecords() {
  if (!confirm("确定清空本地练习记录吗？")) return;
  state.records = [];
  state.submittedQuestionIds = new Set();
  saveRecords();
  renderAll();
}

function normalizeAnswer(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
