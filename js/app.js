const App = (() => {
  let questions = [];
  let state = Storage.emptyState();
  let lastResult = null;
  let selectedSubject = null;
  let selectedCategory = null;
  let editingQuestionId = null;

  let pendingSrsQuestionId = null;
  let pendingSrsPrevBox = 0;
  let pendingSrsIsCorrect = false;

  let flashcards = [];
  let flashcardIndex = 0;
  let flashcardFlipped = false;

  const CUSTOM_QUESTIONS_KEY =
    "shindanshi_drill_custom_questions";

  const THEME_KEY =
    "shindanshi_drill_theme";

  const STREAK_KEY =
    "shindanshi_drill_streak";

  const SRS_KEY =
    "shindanshi_drill_srs";

  const NOTES_KEY =
    "shindanshi_drill_notes";

  const DAILY_LOG_KEY =
    "shindanshi_drill_daily_log";

  /*
   * Leitner式の箱ごとの復習間隔（日数）。
   * box1〜box5に対応。
   */
  const LEITNER_INTERVALS = [1, 2, 4, 7, 14];

  const screens = {
    home: document.getElementById("screen-home"),
    subject: document.getElementById("screen-subject"),
    category: document.getElementById("screen-category"),
    favorites: document.getElementById("screen-favorites"),
    notes: document.getElementById("screen-notes"),
    flashcards: document.getElementById("screen-flashcards"),
    subjects: document.getElementById("screen-subjects"),
    study: document.getElementById("screen-study"),
    materials: document.getElementById("screen-materials"),
    materialView: document.getElementById("screen-material-view"),
    materialEdit: document.getElementById("screen-material-edit"),
    dailyPreview: document.getElementById("screen-daily-preview"),
    quiz: document.getElementById("screen-quiz"),
    explain: document.getElementById("screen-explain"),
    result: document.getElementById("screen-result"),
    createQuestion: document.getElementById("screen-create-question"),
    manageQuestions: document.getElementById("screen-manage-questions")
  };

  /* =========================================================
     共通
  ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function todayKey() {
    if (typeof Storage.todayKey === "function") {
      return Storage.todayKey();
    }

    const now = new Date();

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  const TAB_SCREENS = ["home", "subjects", "study", "materials"];

  function updateTabbar(name) {
    const bar = document.getElementById("tabbar");
    if (!bar) return;

    const visible = TAB_SCREENS.includes(name);
    bar.hidden = !visible;
    document.body.classList.toggle("has-tabbar", visible);

    bar.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
  }

  function showScreen(name) {
    Object.keys(screens).forEach(key => {
      screens[key].hidden = key !== name;
    });

    updateTabbar(name);
    window.scrollTo(0, 0);
  }

  function getSubjectName(subjectId) {
    const subject =
      APP_CONFIG.subjects.find(
        item => item.id === subjectId
      );

    return subject
      ? subject.name
      : subjectId;
  }

  function showToast(message, type = "info") {
    const container =
      document.getElementById("toast-container");

    if (!container) {
      window.alert(message);
      return;
    }

    const toast =
      document.createElement("div");

    toast.className =
      `toast toast-${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    window.requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    window.setTimeout(() => {
      toast.classList.remove("is-visible");

      window.setTimeout(() => {
        toast.remove();
      }, 220);
    }, 3400);
  }

  function confirmDialog(message, options = {}) {
    return new Promise(resolve => {
      const overlay =
        document.getElementById("confirm-modal");

      if (!overlay) {
        resolve(window.confirm(message));
        return;
      }

      const titleEl =
        document.getElementById("confirm-modal-title");

      const messageEl =
        document.getElementById("confirm-modal-message");

      const okButton =
        document.getElementById("confirm-modal-ok");

      const cancelButton =
        document.getElementById("confirm-modal-cancel");

      titleEl.textContent =
        options.title || "確認";

      messageEl.textContent = message;

      okButton.textContent =
        options.okLabel || "OK";

      overlay.hidden = false;

      window.requestAnimationFrame(() => {
        overlay.classList.add("is-visible");
      });

      function cleanup(result) {
        overlay.classList.remove("is-visible");

        window.setTimeout(() => {
          overlay.hidden = true;
        }, 160);

        okButton.removeEventListener(
          "click",
          onOk
        );

        cancelButton.removeEventListener(
          "click",
          onCancel
        );

        overlay.removeEventListener(
          "click",
          onOverlayClick
        );

        document.removeEventListener(
          "keydown",
          onKeydown
        );

        resolve(result);
      }

      function onOk() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      function onOverlayClick(event) {
        if (event.target === overlay) {
          cleanup(false);
        }
      }

      function onKeydown(event) {
        if (event.key === "Escape") {
          cleanup(false);
        }
      }

      okButton.addEventListener(
        "click",
        onOk
      );

      cancelButton.addEventListener(
        "click",
        onCancel
      );

      overlay.addEventListener(
        "click",
        onOverlayClick
      );

      document.addEventListener(
        "keydown",
        onKeydown
      );
    });
  }

  /* =========================================================
     テーマ
  ========================================================= */

  function applyTheme(theme) {
    document.documentElement.dataset.theme =
      theme;

    const button =
      document.getElementById(
        "btn-theme-toggle"
      );

    if (!button) return;

    button.textContent =
      theme === "dark"
        ? "☀"
        : "🌙";

    button.setAttribute(
      "aria-label",
      theme === "dark"
        ? "ライトモードに切り替え"
        : "ダークモードに切り替え"
    );
  }

  function initTheme() {
    const stored =
      localStorage.getItem(THEME_KEY);

    const prefersDark =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

    applyTheme(
      stored ||
      (prefersDark
        ? "dark"
        : "light")
    );

    const button =
      document.getElementById(
        "btn-theme-toggle"
      );

    if (!button) return;

    button.addEventListener(
      "click",
      () => {
        const next =
          document.documentElement
            .dataset.theme === "dark"
            ? "light"
            : "dark";

        localStorage.setItem(
          THEME_KEY,
          next
        );

        applyTheme(next);
      }
    );
  }

  /* =========================================================
     ストリーク
  ========================================================= */

  function loadStreak() {
    try {
      const raw =
        localStorage.getItem(
          STREAK_KEY
        );

      if (!raw) {
        return {
          lastDate: null,
          count: 0
        };
      }

      const parsed =
        JSON.parse(raw);

      return {
        lastDate:
          parsed?.lastDate || null,

        count:
          Number(parsed?.count) || 0
      };
    } catch (error) {
      return {
        lastDate: null,
        count: 0
      };
    }
  }

  function saveStreak(streak) {
    localStorage.setItem(
      STREAK_KEY,
      JSON.stringify(streak)
    );
  }

  function dateKeyOffset(days) {
    const now = new Date();

    now.setDate(
      now.getDate() + days
    );

    const y =
      now.getFullYear();

    const m =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");

    const d =
      String(
        now.getDate()
      ).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  function updateStreak() {
    const today =
      todayKey();

    const streak =
      loadStreak();

    if (
      streak.lastDate === today
    ) {
      return streak;
    }

    const yesterday =
      dateKeyOffset(-1);

    const nextCount =
      streak.lastDate === yesterday
        ? streak.count + 1
        : 1;

    const next = {
      lastDate: today,
      count: nextCount
    };

    saveStreak(next);

    renderStreakBadge();

    return next;
  }

  function renderStreakBadge() {
    const badge =
      document.getElementById(
        "streak-badge"
      );

    const countEl =
      document.getElementById(
        "streak-count"
      );

    if (!badge || !countEl) {
      return;
    }

    const streak =
      loadStreak();

    const isActiveToday =
      streak.lastDate ===
      todayKey();

    badge.hidden =
      streak.count === 0;

    countEl.textContent =
      String(streak.count);

    badge.classList.toggle(
      "is-today",
      isActiveToday
    );
  }

  /* =========================================================
     間隔反復（SRS / Leitner式）
  ========================================================= */

  function loadSrs() {
    try {
      const raw = localStorage.getItem(SRS_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSrs(map) {
    localStorage.setItem(SRS_KEY, JSON.stringify(map));
  }

  function computeNextBox(prevBox, isCorrect, confidence) {
    if (!isCorrect) return 1;
    if (confidence === "weak") return 1;

    if (confidence === "review" || confidence === "guess") {
      return Math.max(1, prevBox);
    }

    if (confidence === "confident") {
      return Math.min((prevBox || 1) + 2, LEITNER_INTERVALS.length);
    }

    return Math.min((prevBox || 1) + 1, LEITNER_INTERVALS.length);
  }

  function applySrsUpdate(questionId, isCorrect, confidence, prevBox) {
    if (!questionId) return null;

    const map = loadSrs();
    const nextBox = computeNextBox(prevBox, isCorrect, confidence);
    const interval = LEITNER_INTERVALS[nextBox - 1] || 1;

    map[questionId] = {
      box: nextBox,
      dueDate: dateKeyOffset(interval),
      lastReviewed: todayKey()
    };

    saveSrs(map);
    return map[questionId];
  }

  function selectSrsDueIds() {
    const map = loadSrs();
    const today = todayKey();

    return Object.keys(map).filter(id =>
      map[id] &&
      map[id].dueDate <= today &&
      questionById(id)
    );
  }

  function renderSrsWidget() {
    const countEl = document.getElementById("srs-due-count");
    const button = document.getElementById("btn-srs-review");
    if (!countEl || !button) return;

    const dueCount = selectSrsDueIds().length;
    countEl.textContent = `${dueCount}問`;
    button.disabled = dueCount === 0;
  }

  function startSrsSession() {
    const ids = selectSrsDueIds();

    if (!ids.length) {
      showToast("今日復習すべき間隔反復の問題はありません。", "info");
      return;
    }

    const started = Quiz.start("srs", ids, null);

    if (!started || !Quiz.currentQuestion()) {
      showToast("間隔反復の復習を開始できませんでした。", "error");
      return;
    }

    renderQuiz();
  }

  function setConfidence(level) {
    if (!lastResult || !pendingSrsQuestionId) return;

    applySrsUpdate(
      pendingSrsQuestionId,
      pendingSrsIsCorrect,
      level,
      pendingSrsPrevBox
    );

    const stats = loadQStats();
    const entry = stats[pendingSrsQuestionId] || { n: 1 };
    entry.level = level;
    entry.at = Date.now();
    stats[pendingSrsQuestionId] = entry;
    saveQStats(stats);

    markConfidenceButtons(level);
    renderSrsWidget();
  }

  /* =========================================================
     マイノート（自分の言葉での説明）
  ========================================================= */

  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveNotes(map) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  }

  function saveCurrentNote() {
    if (!lastResult) return;

    const textarea = document.getElementById("explain-note");
    if (!textarea) return;

    const text = textarea.value.trim();
    const map = loadNotes();
    const questionId = lastResult.question.id;

    if (text) {
      map[questionId] = {
        text,
        updatedAt: new Date().toISOString()
      };
    } else {
      delete map[questionId];
    }

    saveNotes(map);
  }

  function renderNotesList() {
    const map = loadNotes();
    const ids = Object.keys(map).filter(id => questionById(id));

    const empty = document.getElementById("notes-empty");
    const list = document.getElementById("notes-list");
    if (!empty || !list) return;

    empty.hidden = ids.length > 0;

    list.innerHTML = ids
      .map(id => {
        const question = questionById(id);
        if (!question) return "";

        return `
          <li>
            <button class="favorite-item" type="button" data-id="${escapeHtml(id)}">
              <span class="fav-subject">
                ${escapeHtml(getSubjectName(question.subject))}
                ／
                ${escapeHtml(question.category || "その他")}
              </span>

              ${escapeHtml(question.question)}

              <span class="note-preview">
                ${escapeHtml(map[id].text)}
              </span>
            </button>
          </li>
        `;
      })
      .join("");

    showScreen("notes");
  }

  /* =========================================================
     学習の記録（ヒートマップ）
  ========================================================= */

  function loadDailyLog() {
    try {
      const raw = localStorage.getItem(DAILY_LOG_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveDailyLog(map) {
    localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(map));
  }

  function incrementDailyLog() {
    const map = loadDailyLog();
    const key = todayKey();
    map[key] = (map[key] || 0) + 1;
    saveDailyLog(map);
  }

  function renderHeatmap() {
    const container = document.getElementById("study-heatmap");
    if (!container) return;

    const map = loadDailyLog();
    const totalDays = 84;

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (totalDays - 1));

    const startPad = start.getDay();
    const cells = [];

    for (let i = 0; i < startPad; i++) {
      cells.push('<span class="heatmap-cell is-empty"></span>');
    }

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);

      const key =
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, "0")}-` +
        `${String(d.getDate()).padStart(2, "0")}`;

      const count = map[key] || 0;

      const level =
        count === 0 ? 0 :
        count <= 2 ? 1 :
        count <= 5 ? 2 :
        count <= 10 ? 3 : 4;

      cells.push(
        `<span class="heatmap-cell level-${level}" title="${key}：${count}問"></span>`
      );
    }

    container.innerHTML = cells.join("");
  }

  /* =========================================================
     用語集フラッシュカード
  ========================================================= */

  function shuffleArray(source) {
    const array = source.slice();

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  function buildFlashcardDeck() {
    const map = new Map();

    questions.forEach(question => {
      (question.relatedKnowledge || []).forEach(item => {
        const title = (item.title || "").trim();
        const body = (item.body || "").trim();
        if (!title || !body) return;

        const key = title.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { title, body });
        }
      });
    });

    return Array.from(map.values());
  }

  function renderFlashcard() {
    if (!flashcards.length) return;

    const card = flashcards[flashcardIndex];
    const flashcardEl = document.getElementById("flashcard");

    document.getElementById("flashcard-front-text").textContent = card.title;
    document.getElementById("flashcard-back-text").textContent = card.body;

    document.getElementById("flashcard-progress").textContent =
      `${flashcardIndex + 1} / ${flashcards.length}`;

    flashcardFlipped = false;
    if (flashcardEl) flashcardEl.classList.remove("flipped");
  }

  function flipFlashcard() {
    flashcardFlipped = !flashcardFlipped;

    const flashcardEl = document.getElementById("flashcard");
    if (flashcardEl) {
      flashcardEl.classList.toggle("flipped", flashcardFlipped);
    }
  }

  function nextFlashcard() {
    if (!flashcards.length) return;
    flashcardIndex = (flashcardIndex + 1) % flashcards.length;
    renderFlashcard();
  }

  function prevFlashcard() {
    if (!flashcards.length) return;
    flashcardIndex =
      (flashcardIndex - 1 + flashcards.length) % flashcards.length;
    renderFlashcard();
  }

  function shuffleFlashcards() {
    flashcards = shuffleArray(flashcards);
    flashcardIndex = 0;
    renderFlashcard();
  }

  function openFlashcards() {
    flashcards = shuffleArray(buildFlashcardDeck());
    flashcardIndex = 0;

    if (!flashcards.length) {
      showToast("関連知識が登録された問題がまだありません。", "info");
      return;
    }

    renderFlashcard();
    showScreen("flashcards");
  }

  /* =========================================================
     弱点だけで自動ドリル
  ========================================================= */


  /* =========================================================
     出題の優先順位づけ
     1) 未回答 → 2) 直近3回で1回でも誤答 / 長期間未回答
  ========================================================= */

  const ATTEMPTS_KEY = "shindanshi_drill_attempts";

  function loadAttempts() {
    try {
      const raw = localStorage.getItem(ATTEMPTS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function recordAttempt(questionId, isCorrect) {
    if (!questionId) return;

    try {
      const map = loadAttempts();
      const list = Array.isArray(map[questionId]) ? map[questionId] : [];

      list.push([Date.now(), isCorrect ? 1 : 0]);
      map[questionId] = list.slice(-5);

      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map));
    } catch (error) {
      console.warn("回答履歴の保存に失敗しました", error);
    }
  }

  function toTimestamp(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (typeof value === "string") {
      const t = Date.parse(value);
      return isNaN(t) ? null : t;
    }
    return null;
  }

  /*
   * Storage側の履歴の形式に依存しないよう、
   * 取得できる情報だけを防御的に読み取る。
   */
  function parseHistoryEntry(entry) {
    if (!entry) return { answered: false, recent: [], lastTs: null };

    let items = Array.isArray(entry) ? entry : null;

    if (!items && typeof entry === "object") {
      for (const key of ["attempts", "log", "logs", "results", "records", "answers", "history"]) {
        if (Array.isArray(entry[key])) {
          items = entry[key];
          break;
        }
      }
    }

    if (items && items.length) {
      const flags = items
        .map(item => {
          if (typeof item === "boolean") return item;
          if (item && typeof item === "object") {
            for (const key of ["isCorrect", "correct", "ok"]) {
              if (typeof item[key] === "boolean") return item[key];
            }
          }
          return null;
        })
        .filter(flag => flag !== null);

      const lastItem = items[items.length - 1];
      const lastTs =
        lastItem && typeof lastItem === "object"
          ? toTimestamp(
              lastItem.at ?? lastItem.date ?? lastItem.timestamp ??
              lastItem.answeredAt ?? lastItem.time
            )
          : null;

      return { answered: true, recent: flags.slice(-3), lastTs };
    }

    if (typeof entry === "object") {
      const num = value => (typeof value === "number" ? value : 0);

      const wrong =
        num(entry.wrong) + num(entry.incorrect) +
        num(entry.wrongCount) + num(entry.incorrectCount);
      const correct = num(entry.correct) + num(entry.correctCount);
      const total = num(entry.total) || num(entry.count) || correct + wrong;

      let recent = [];
      if (typeof entry.lastCorrect === "boolean") {
        recent = [entry.lastCorrect];
      } else if (wrong > 0 && (total <= 3 || wrong / Math.max(total, 1) >= 0.3)) {
        recent = [false];
      }

      const lastTs = toTimestamp(
        entry.lastAnsweredAt ?? entry.lastAnswered ?? entry.lastAt ??
        entry.last ?? entry.updatedAt ?? entry.date ?? entry.timestamp
      );

      return { answered: true, recent, lastTs };
    }

    return { answered: true, recent: [], lastTs: null };
  }

  function questionStudyInfo(id, attempts) {
    const log = attempts[id];

    if (Array.isArray(log) && log.length) {
      return {
        answered: true,
        recent: log.slice(-3).map(item => item[1] === 1),
        lastTs: log[log.length - 1][0]
      };
    }

    return parseHistoryEntry(state.history ? state.history[id] : null);
  }

  function selectPrioritized(count, excludeIds, fallbackStrategy) {
    const limit = Math.max(1, Number(count) || 20);
    const exclude = new Set(excludeIds || []);
    const attempts = loadAttempts();
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    const unanswered = [];
    const answered = [];

    questions.forEach(question => {
      if (exclude.has(question.id)) return;

      const info = questionStudyInfo(question.id, attempts);

      if (!info.answered) {
        unanswered.push(question.id);
        return;
      }

      const days = info.lastTs
        ? Math.max(0, (now - info.lastTs) / 86400000)
        : 14;

      const missed = info.recent.some(flag => flag === false);
      const answeredToday = info.lastTs !== null && info.lastTs >= todayStart;

      answered.push({
        id: question.id,
        score:
          (missed ? 100 : 0) +
          Math.min(days, 60) +
          Math.random() * 5 -
          (answeredToday ? 1000 : 0)
      });
    });

    const picked = shuffleArray(unanswered).slice(0, limit);

    if (picked.length < limit) {
      answered
        .sort((a, b) => b.score - a.score)
        .slice(0, limit - picked.length)
        .forEach(item => picked.push(item.id));
    }

    if (!picked.length) {
      return Selector.selectQuestionIds(
        questions,
        state.history,
        {
          count: limit,
          strategy: fallbackStrategy,
          filters: {},
          excludeIds: Array.from(exclude)
        }
      );
    }

    return shuffleArray(picked);
  }


  /* =========================================================
     ホーム：今日の進捗リング／紙吹雪
  ========================================================= */

  function renderTodayHero() {
    const ring = document.getElementById("today-ring");
    const text = document.getElementById("stat-today");
    if (!ring || !text) return;

    const match = text.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    const done = match ? Number(match[1]) : 0;
    const total = match ? Number(match[2]) : 0;
    const goal = total || Number(APP_CONFIG.dailyCount) || 20;
    const pct = Math.min(100, Math.round((done / goal) * 100));

    ring.style.setProperty("--pct", String(pct));
    document.getElementById("today-ring-count").textContent = String(done);
    document.getElementById("today-ring-total").textContent = `/ ${goal}`;

    const sub = document.getElementById("today-hero-sub");
    if (sub) {
      sub.textContent =
        pct >= 100 ? "今日の目標を達成！おつかれさま 🎉" :
        done > 0 ? `あと${goal - done}問で達成` :
        "まずは1問から始めよう";
    }
  }

  function launchConfetti() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    const layer = document.createElement("div");
    layer.className = "confetti-layer";

    const colors = ["#c98a2b", "#2f7d5c", "#2d4a8a", "#b23a3a", "#e0a640"];

    for (let i = 0; i < 48; i++) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.6}s`;
      piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      piece.style.setProperty("--dx", `${Math.random() * 120 - 60}px`);
      layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 4200);
  }

  /* =========================================================
     教材ライブラリ（解説画像＋テキスト）
  ========================================================= */

  const MATERIAL_DB_NAME = "shindanshi-drill-materials";
  const MATERIAL_STORE = "materials";
  const MAX_MATERIAL_IMAGES = 12;

  let materials = [];
  let editingMaterialId = null;
  let editingMaterialImages = [];
  let viewingMaterialId = null;
  let materialReturnScreen = "materials";

  function openMaterialDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("このブラウザではIndexedDBが利用できません。"));
        return;
      }

      const request = indexedDB.open(MATERIAL_DB_NAME, 1);

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(MATERIAL_STORE)) {
          db.createObjectStore(MATERIAL_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("教材データベースを開けませんでした。"));
    });
  }

  async function withMaterialStore(mode, work) {
    const db = await openMaterialDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(MATERIAL_STORE, mode);
      const store = tx.objectStore(MATERIAL_STORE);
      let result;

      const request = work(store);
      if (request) request.onsuccess = () => { result = request.result; };

      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("教材データの処理に失敗しました。"));
      };
    });
  }

  async function idbMaterialsAll() {
    const list = await withMaterialStore("readonly", store => store.getAll());
    return Array.isArray(list) ? list : [];
  }

  function idbMaterialPut(material) {
    return withMaterialStore("readwrite", store => store.put(material));
  }

  function idbMaterialDelete(id) {
    return withMaterialStore("readwrite", store => store.delete(id));
  }

  function idbMaterialsPutMany(list) {
    return withMaterialStore("readwrite", store => {
      list.forEach(item => store.put(item));
      return null;
    });
  }

  async function loadMaterialsCache() {
    try {
      const list = await idbMaterialsAll();
      materials = list.sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
      );
    } catch (error) {
      console.warn("教材の読み込みに失敗しました", error);
      materials = [];
    }
  }

  function materialCategories(material) {
    return String(material.category || "")
      .split(/[、,，\n]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function materialMatchesQuestion(material, question) {
    if (material.subject !== question.subject) return false;

    const cats = materialCategories(material);
    return !cats.length || cats.includes(question.category || "その他");
  }

  function renderRelatedMaterials(question) {
    const section = document.getElementById("related-materials-section");
    const box = document.getElementById("related-materials");
    if (!section || !box || !question) return;

    const related = materials.filter(item =>
      materialMatchesQuestion(item, question)
    );

    section.hidden = related.length === 0;

    box.innerHTML = related
      .map(item => `
        <button class="material-chip" type="button" data-id="${escapeHtml(item.id)}">
          <span class="material-chip-title">${escapeHtml(item.title)}</span>
          <span class="material-chip-meta">
            ${(item.images || []).length ? `🖼 ${(item.images || []).length}枚` : "📄 テキスト"}
          </span>
        </button>
      `)
      .join("");
  }

  async function openMaterials() {
    await loadMaterialsCache();

    const empty = document.getElementById("materials-empty");
    const list = document.getElementById("materials-list");

    empty.hidden = materials.length > 0;

    list.innerHTML = APP_CONFIG.subjects
      .map(subject => {
        const items = materials.filter(item => item.subject === subject.id);
        if (!items.length) return "";

        return `
          <div class="material-group">
            <h3 class="material-group-title">${escapeHtml(subject.name)}</h3>
            ${items.map(item => `
              <button class="material-item" type="button" data-id="${escapeHtml(item.id)}">
                <span class="material-item-title">${escapeHtml(item.title)}</span>
                <span class="material-item-meta">
                  ${escapeHtml(materialCategories(item).join("・") || "科目全体")}
                  ${(item.images || []).length ? ` ／ 🖼 ${(item.images || []).length}枚` : ""}
                </span>
              </button>
            `).join("")}
          </div>
        `;
      })
      .join("");

    showScreen("materials");
  }

  function renderMaterialBody(text) {
    const inline = value =>
      escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    let html = "";
    let inList = false;

    const closeList = () => {
      if (inList) { html += "</ul>"; inList = false; }
    };

    String(text || "").split("\n").forEach(raw => {
      const line = raw.trimEnd();

      if (!line.trim()) { closeList(); return; }

      if (/^#{1,3}\s+/.test(line)) {
        closeList();
        html += `<h4>${inline(line.replace(/^#{1,3}\s+/, ""))}</h4>`;
        return;
      }

      if (/^[-・●*]\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inline(line.replace(/^[-・●*]\s+/, ""))}</li>`;
        return;
      }

      closeList();
      html += `<p>${inline(line)}</p>`;
    });

    closeList();
    return html;
  }

  function openMaterialView(id, returnTo) {
    const material = materials.find(item => item.id === id);
    if (!material) return;

    viewingMaterialId = id;
    materialReturnScreen = returnTo || "materials";

    document.getElementById("material-view-title").textContent = material.title;
    document.getElementById("material-view-meta").textContent =
      `${getSubjectName(material.subject)} ／ ${materialCategories(material).join("・") || "科目全体"}`;

    document.getElementById("material-view-images").innerHTML =
      (material.images || [])
        .map((src, index) =>
          `<img class="material-image" src="${src}" alt="${escapeHtml(material.title)} ${index + 1}">`
        )
        .join("");

    document.getElementById("material-view-body").innerHTML =
      renderMaterialBody(material.body);

    const related = questions.filter(q => materialMatchesQuestion(material, q));
    const quizButton = document.getElementById("btn-material-quiz");
    quizButton.disabled = related.length === 0;
    quizButton.textContent = related.length
      ? `この教材に関連する問題を解く（${Math.min(related.length, 20)}問）`
      : "関連する問題がありません";

    showScreen("materialView");
  }

  function closeMaterialView() {
    if (materialReturnScreen === "explain" && lastResult) {
      showScreen("explain");
    } else {
      openMaterials();
    }
  }

  function startMaterialQuiz() {
    const material = materials.find(item => item.id === viewingMaterialId);
    if (!material) return;

    const ids = shuffleArray(
      questions.filter(q => materialMatchesQuestion(material, q)).map(q => q.id)
    ).slice(0, 20);

    if (!ids.length) {
      showToast("関連する問題がありません。", "info");
      return;
    }

    const started = Quiz.start("material", ids, null);

    if (!started || !Quiz.currentQuestion()) {
      showToast("演習を開始できませんでした。", "error");
      return;
    }

    renderQuiz();
  }

  function renderEditorImages() {
    document.getElementById("material-image-previews").innerHTML =
      editingMaterialImages
        .map((src, index) => `
          <div class="material-preview">
            <img src="${src}" alt="画像${index + 1}">
            <button type="button" class="material-preview-remove" data-remove="${index}" aria-label="画像を削除">×</button>
          </div>
        `)
        .join("");
  }

  function openMaterialEditor(id) {
    const material = id ? materials.find(item => item.id === id) : null;

    editingMaterialId = material ? material.id : null;
    editingMaterialImages = material ? (material.images || []).slice() : [];

    const subjectSelect = document.getElementById("material-subject");
    subjectSelect.innerHTML = APP_CONFIG.subjects
      .map(subject =>
        `<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`
      )
      .join("");

    document.getElementById("material-edit-heading").textContent =
      material ? "教材を編集" : "新しい教材";

    document.getElementById("material-title").value = material ? material.title : "";
    subjectSelect.value = material ? material.subject : (APP_CONFIG.subjects[0]?.id || "");
    document.getElementById("material-category").value = material ? (material.category || "") : "";
    document.getElementById("material-body").value = material ? (material.body || "") : "";
    document.getElementById("btn-material-delete").hidden = !material;

    renderEditorImages();
    showScreen("materialEdit");
  }

  function readImageAsDataUrl(file, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      reader.onload = () => {
        const image = new Image();

        image.onerror = () => reject(new Error("対応していない画像形式です。"));
        image.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };

        image.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  async function addEditorImages(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
      for (const file of files) {
        if (editingMaterialImages.length >= MAX_MATERIAL_IMAGES) {
          showToast(`画像は1教材につき${MAX_MATERIAL_IMAGES}枚までです。`, "info");
          break;
        }

        editingMaterialImages.push(await readImageAsDataUrl(file));
      }

      renderEditorImages();
    } catch (error) {
      console.error(error);
      showToast(error.message, "error");
    }
  }

  async function saveMaterialFromForm() {
    const title = document.getElementById("material-title").value.trim();
    const subject = document.getElementById("material-subject").value;
    const category = document.getElementById("material-category").value.trim();
    const body = document.getElementById("material-body").value.trim();

    if (!title) { showToast("タイトルを入力してください。", "error"); return; }
    if (!subject) { showToast("科目を選択してください。", "error"); return; }
    if (!body && !editingMaterialImages.length) {
      showToast("画像かテキストのどちらかは入力してください。", "error");
      return;
    }

    const existing = editingMaterialId
      ? materials.find(item => item.id === editingMaterialId)
      : null;

    const now = new Date().toISOString();

    const material = {
      id: existing
        ? existing.id
        : `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title,
      subject,
      category,
      body,
      images: editingMaterialImages.slice(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    try {
      await idbMaterialPut(material);
      await loadMaterialsCache();
      showToast("教材を保存しました。", "success");
      openMaterialView(material.id, "materials");
    } catch (error) {
      console.error(error);
      showToast(`教材の保存に失敗しました。${error.message}`, "error");
    }
  }

  async function deleteEditingMaterial() {
    if (!editingMaterialId) return;

    const confirmed = await confirmDialog(
      "この教材（画像・テキスト）を削除します。この操作は元に戻せません。",
      { title: "教材を削除しますか？", okLabel: "削除する" }
    );

    if (!confirmed) return;

    try {
      await idbMaterialDelete(editingMaterialId);
      await loadMaterialsCache();
      showToast("教材を削除しました。", "success");
      openMaterials();
    } catch (error) {
      console.error(error);
      showToast(`削除に失敗しました。${error.message}`, "error");
    }
  }

  function openLightbox(src) {
    const box = document.getElementById("lightbox");
    document.getElementById("lightbox-img").src = src;
    box.hidden = false;
  }

  function switchTab(tab) {
    if (tab === "materials") {
      openMaterials();
      return;
    }

    renderHome();

    if (tab !== "home") showScreen(tab);
  }


  /* =========================================================
     自信度（4段階）・回答数
  ========================================================= */

  const QSTATS_KEY = "shindanshi_drill_qstats";

  const CONFIDENCE_LEVELS = [
    { id: "confident", label: "自信あり", icon: "💪" },
    { id: "normal", label: "普通", icon: "🙂" },
    { id: "review", label: "要復習", icon: "🔁" },
    { id: "weak", label: "理解不足", icon: "😣" }
  ];

  function confidenceMeta(level) {
    return CONFIDENCE_LEVELS.find(item => item.id === level) || null;
  }

  function loadQStats() {
    try {
      const raw = localStorage.getItem(QSTATS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveQStats(map) {
    localStorage.setItem(QSTATS_KEY, JSON.stringify(map));
  }

  function historyCount(entry) {
    if (!entry) return 0;
    if (Array.isArray(entry)) return entry.length;

    if (typeof entry === "object") {
      for (const key of ["attempts", "log", "logs", "results", "records", "answers", "history"]) {
        if (Array.isArray(entry[key])) return entry[key].length;
      }

      const num = value => (typeof value === "number" ? value : 0);
      const wrong =
        num(entry.wrong) + num(entry.incorrect) +
        num(entry.wrongCount) + num(entry.incorrectCount);
      const correct = num(entry.correct) + num(entry.correctCount);

      return num(entry.total) || num(entry.count) || num(entry.attempts) || correct + wrong;
    }

    return 1;
  }

  /*
   * 回答直後：正解→普通、不正解→理解不足を自動設定。
   */
  function recordQuestionStat(questionId, isCorrect) {
    if (!questionId) return;

    const stats = loadQStats();
    const previous = stats[questionId];

    const firstCount = Math.max(
      historyCount(state.history ? state.history[questionId] : null),
      1
    );

    stats[questionId] = {
      level: isCorrect ? "normal" : "weak",
      n: previous && previous.n ? previous.n + 1 : firstCount,
      at: Date.now()
    };

    saveQStats(stats);
  }

  function effectiveConfidence(id, stats, attempts) {
    const stat = stats[id];
    if (stat && stat.level) return stat.level;

    const info = questionStudyInfo(id, attempts);
    if (!info.answered) return null;

    const last = info.recent[info.recent.length - 1];
    return last === false ? "weak" : "normal";
  }

  function effectiveAnswerCount(id, stats, attempts) {
    const stat = stats[id];
    if (stat && stat.n) return stat.n;

    const log = attempts[id];
    if (Array.isArray(log) && log.length) return log.length;

    return historyCount(state.history ? state.history[id] : null);
  }

  function currentConfidenceLevel(questionId) {
    const stat = loadQStats()[questionId];
    return stat ? stat.level : null;
  }

  function markConfidenceButtons(level) {
    document
      .querySelectorAll("#confidence-group .confidence-btn")
      .forEach(button => {
        button.classList.toggle("selected", button.dataset.level === level);
      });
  }

  function confidenceChipHtml(level) {
    const meta = confidenceMeta(level);

    return meta
      ? `<span class="conf-chip" data-level="${meta.id}">${meta.icon} ${meta.label}</span>`
      : `<span class="conf-chip" data-level="none">🆕 未回答</span>`;
  }

  function renderQuizConfidence(questionId) {
    const el = document.getElementById("quiz-confidence");
    if (!el) return;

    const stats = loadQStats();
    const attempts = loadAttempts();
    const level = effectiveConfidence(questionId, stats, attempts);

    if (!level) {
      el.innerHTML = confidenceChipHtml(null);
      return;
    }

    const count = Math.max(effectiveAnswerCount(questionId, stats, attempts), 1);

    el.innerHTML =
      `<span class="conf-label">前回の自信度</span>` +
      confidenceChipHtml(level) +
      `<span class="preview-count">回答${count}回</span>`;
  }

  /* =========================================================
     今日の出題一覧（開始前プレビュー）
  ========================================================= */

  let pendingDailyIds = null;
  let previewIds = [];

  function onStartDailyClick() {
    const daily = todaysDaily();
    const started =
      daily && Array.isArray(daily.answers) && daily.answers.length > 0;

    if (started) {
      startDaily();
      return;
    }

    openDailyPreview(false);
  }

  function openDailyPreview(reroll) {
    const daily = todaysDaily();
    let ids;

    if (
      daily && !reroll &&
      Array.isArray(daily.questionIds) && daily.questionIds.length
    ) {
      ids = daily.questionIds.filter(id => questionById(id));
      pendingDailyIds = null;
    } else {
      if (reroll) state.daily = null;

      ids = selectPrioritized(APP_CONFIG.dailyCount, [], "optimized-daily");
      pendingDailyIds = ids;
    }

    if (!ids.length) {
      showToast("出題できる問題がありません。", "error");
      return;
    }

    previewIds = ids;
    renderDailyPreview();
    showScreen("dailyPreview");
  }

  function renderDailyPreview() {
    const stats = loadQStats();
    const attempts = loadAttempts();
    const tally = { none: 0, confident: 0, normal: 0, review: 0, weak: 0 };

    const rows = previewIds
      .map((id, index) => {
        const question = questionById(id);
        if (!question) return "";

        const level = effectiveConfidence(id, stats, attempts);
        const count = level
          ? Math.max(effectiveAnswerCount(id, stats, attempts), 1)
          : 0;

        tally[level || "none"] += 1;

        const title =
          question.question.length > 70
            ? `${question.question.slice(0, 70)}…`
            : question.question;

        return `
          <div class="preview-row">
            <span class="preview-no">${index + 1}</span>
            <div class="preview-body">
              <p class="preview-title">${escapeHtml(title)}</p>
              <p class="preview-sub">
                ${escapeHtml(getSubjectName(question.subject))}
                ／ ${escapeHtml(question.category || "その他")}
              </p>
            </div>
            <div class="preview-meta">
              ${confidenceChipHtml(level)}
              <span class="preview-count">回答${count}回</span>
            </div>
          </div>
        `;
      })
      .join("");

    document.getElementById("preview-title").textContent =
      `今日の${previewIds.length}問`;

    document.getElementById("preview-summary").textContent =
      `未回答${tally.none}問 ／ 理解不足${tally.weak}問 ／ 要復習${tally.review}問 ／ 普通${tally.normal}問 ／ 自信あり${tally.confident}問`;

    document.getElementById("preview-list").innerHTML = rows;
  }

  /* =========================================================
     問題ごとの解説画像（その場でアップロード）
  ========================================================= */

  const QIMG_DB_NAME = "shindanshi-drill-qimages";
  const QIMG_STORE = "qimages";
  const MAX_QUESTION_IMAGES = 8;

  let currentQImages = [];

  function openQImgDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("このブラウザではIndexedDBが利用できません。"));
        return;
      }

      const request = indexedDB.open(QIMG_DB_NAME, 1);

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(QIMG_STORE)) {
          db.createObjectStore(QIMG_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("画像データベースを開けませんでした。"));
    });
  }

  async function withQImgStore(mode, work) {
    const db = await openQImgDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(QIMG_STORE, mode);
      const store = tx.objectStore(QIMG_STORE);
      let result;

      const request = work(store);
      if (request) request.onsuccess = () => { result = request.result; };

      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("画像データの処理に失敗しました。"));
      };
    });
  }

  function idbQImageGet(id) {
    return withQImgStore("readonly", store => store.get(id));
  }

  function idbQImagePut(record) {
    return withQImgStore("readwrite", store => store.put(record));
  }

  function idbQImageDelete(id) {
    return withQImgStore("readwrite", store => store.delete(id));
  }

  async function idbQImagesAll() {
    const list = await withQImgStore("readonly", store => store.getAll());
    return Array.isArray(list) ? list : [];
  }

  function idbQImagesPutMany(list) {
    return withQImgStore("readwrite", store => {
      list.forEach(item => store.put(item));
      return null;
    });
  }

  function drawQuestionImages() {
    const box = document.getElementById("question-images");
    if (!box) return;

    box.innerHTML = currentQImages
      .map((src, index) => `
        <div class="qimg">
          <img src="${src}" alt="解説画像${index + 1}">
          <button type="button" class="qimg-remove" data-remove="${index}" aria-label="画像を削除">×</button>
        </div>
      `)
      .join("");
  }

  async function renderQuestionImages(question) {
    currentQImages = [];
    drawQuestionImages();
    if (!question) return;

    try {
      const record = await idbQImageGet(question.id);

      if (!lastResult || lastResult.question.id !== question.id) return;

      currentQImages =
        record && Array.isArray(record.images) ? record.images.slice() : [];
      drawQuestionImages();
    } catch (error) {
      console.warn("解説画像の読み込みに失敗しました", error);
    }
  }

  async function persistQuestionImages(questionId) {
    if (!currentQImages.length) {
      await idbQImageDelete(questionId);
      return;
    }

    await idbQImagePut({
      id: questionId,
      images: currentQImages.slice(),
      updatedAt: new Date().toISOString()
    });
  }

  async function addQuestionImages(fileList) {
    if (!lastResult) return;

    const questionId = lastResult.question.id;
    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
      for (const file of files) {
        if (currentQImages.length >= MAX_QUESTION_IMAGES) {
          showToast(`画像は1問につき${MAX_QUESTION_IMAGES}枚までです。`, "info");
          break;
        }

        currentQImages.push(await readImageAsDataUrl(file, 1800, 0.86));
      }

      await persistQuestionImages(questionId);

      if (lastResult && lastResult.question.id === questionId) {
        drawQuestionImages();
      }

      showToast("解説画像を保存しました。", "success");
    } catch (error) {
      console.error(error);
      showToast(`画像の保存に失敗しました。${error.message}`, "error");
    }
  }

  async function removeQuestionImage(index) {
    if (!lastResult) return;

    const confirmed = await confirmDialog(
      "この画像を削除します。",
      { title: "画像を削除しますか？", okLabel: "削除する" }
    );

    if (!confirmed) return;

    currentQImages.splice(index, 1);

    try {
      await persistQuestionImages(lastResult.question.id);
      drawQuestionImages();
    } catch (error) {
      console.error(error);
      showToast(`削除に失敗しました。${error.message}`, "error");
    }
  }

  function buildWeakDrillIds(limit = 20) {
    const summary = Stats.summarize(questions, state);

    const weakCategories = Object.values(summary.byCategory)
      .filter(item => item.total > 0)
      .map(item => ({
        ...item,
        accuracy: item.correct / item.total
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    if (!weakCategories.length) return [];

    const pool = weakCategories.map(item => ({
      ...item,
      questions: questions.filter(q =>
        q.subject === item.subject &&
        (q.category || "その他") === item.category
      )
    }));

    const usedIds = new Set();
    const picked = [];
    let guard = 0;

    while (picked.length < limit && guard < limit * 20) {
      guard++;

      for (const item of pool) {
        if (picked.length >= limit) break;

        const candidates = item.questions.filter(
          q => !usedIds.has(q.id)
        );

        if (!candidates.length) continue;

        const pick =
          candidates[
            Math.floor(Math.random() * candidates.length)
          ];

        usedIds.add(pick.id);
        picked.push(pick.id);
      }

      if (pool.every(item =>
        item.questions.every(q => usedIds.has(q.id))
      )) {
        break;
      }
    }

    return picked.slice(0, limit);
  }

  function startWeakDrill() {
    const ids = buildWeakDrillIds(20);

    if (!ids.length) {
      showToast(
        "弱点ドリルを作成するには、もう少し学習データが必要です。",
        "info"
      );
      return;
    }

    const started = Quiz.start("weak", ids, null);

    if (!started || !Quiz.currentQuestion()) {
      showToast("弱点ドリルを開始できませんでした。", "error");
      return;
    }

    renderQuiz();
  }

  /* =========================================================
     学習データのバックアップ／復元
  ========================================================= */

  async function exportBackup() {
    try {
      const payload = {
        app: "shindanshi-drill",
        version: 1,
        exportedAt: new Date().toISOString(),
        state,
        customQuestions: getCustomQuestions(),
        extras: {
          streak: loadStreak(),
          srs: loadSrs(),
          notes: loadNotes(),
          dailyLog: loadDailyLog(),
          materials: await idbMaterialsAll(),
          attempts: loadAttempts(),
          qstats: loadQStats(),
          qimages: await idbQImagesAll()
        }
      };

      const blob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `shindanshi-drill-backup-${todayKey()}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      showToast("学習データを書き出しました。", "success");
    } catch (error) {
      console.error("バックアップの書き出しに失敗しました", error);
      showToast(`書き出しに失敗しました。${error.message}`, "error");
    }
  }

  async function importBackupFromFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload || typeof payload !== "object" || !payload.state) {
        throw new Error("バックアップファイルの形式が正しくありません。");
      }

      const confirmed = await confirmDialog(
        "現在の学習データはバックアップの内容で上書きされます。この操作は元に戻せません。",
        { title: "学習データを復元しますか？", okLabel: "復元する" }
      );

      if (!confirmed) return;

      if (
        Array.isArray(payload.customQuestions) &&
        payload.customQuestions.length
      ) {
        await QuestionDB.putMany(payload.customQuestions);
      }

      Storage.save(payload.state);

      const extras = payload.extras || {};
      if (extras.streak) saveStreak(extras.streak);
      if (extras.srs) saveSrs(extras.srs);
      if (extras.notes) saveNotes(extras.notes);
      if (extras.dailyLog) saveDailyLog(extras.dailyLog);
      if (extras.attempts) {
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(extras.attempts));
      }
      if (extras.qstats) {
        localStorage.setItem(QSTATS_KEY, JSON.stringify(extras.qstats));
      }
      if (Array.isArray(extras.qimages) && extras.qimages.length) {
        await idbQImagesPutMany(extras.qimages);
      }
      if (Array.isArray(extras.materials) && extras.materials.length) {
        await idbMaterialsPutMany(extras.materials);
      }

      showToast(
        "学習データを復元しました。まもなく再読み込みします。",
        "success"
      );

      window.setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("バックアップの復元に失敗しました", error);
      showToast(`復元に失敗しました。${error.message}`, "error");
    }
  }

  /* =========================================================
     自作問題
  ========================================================= */

  function loadCustomQuestions() {
    try {
      const raw =
        localStorage.getItem(
          CUSTOM_QUESTIONS_KEY
        );

      if (!raw) return [];

      const data =
        JSON.parse(raw);

      if (!Array.isArray(data)) {
        return [];
      }

      const normalized = [];

      for (const item of data) {
        try {
          normalized.push(
            QuestionDB.normalizeQuestion(
              item
            )
          );
        } catch (error) {
          console.warn(
            "不正な自作問題をスキップしました:",
            error,
            item
          );
        }
      }

      return normalized;
    } catch (error) {
      console.error(
        "自作問題の読み込みに失敗しました",
        error
      );

      return [];
    }
  }

  function saveCustomQuestions(
    customQuestions
  ) {
    const normalized =
      customQuestions.map(
        question =>
          QuestionDB.normalizeQuestion(
            question
          )
      );

    localStorage.setItem(
      CUSTOM_QUESTIONS_KEY,
      JSON.stringify(normalized)
    );
  }

  function isCustomQuestion(question) {
    return !!(
      question &&
      question.custom === true
    );
  }

  function getCustomQuestions() {
    return questions.filter(
      question =>
        isCustomQuestion(question)
    );
  }

  function questionById(id) {
    return questions.find(
      question =>
        question.id === id
    );
  }

  async function loadQuestions() {
    questions =
      await QuestionDB.getAll();

    const legacyCustom =
      loadCustomQuestions();

    if (legacyCustom.length) {
      await QuestionDB.putMany(
        legacyCustom
      );

      questions =
        await QuestionDB.getAll();
    }

    console.log(
      `問題を${questions.length}問読み込みました`
    );
  }

  /* =========================================================
     Daily状態
  ========================================================= */

  function todaysDaily() {
    if (
      state.daily &&
      state.daily.date ===
        todayKey()
    ) {
      const configuredCount =
        Number(APP_CONFIG.dailyCount) || 20;

      const hasStarted =
        Array.isArray(state.daily.answers) &&
        state.daily.answers.length > 0;

      const questionCount =
        Array.isArray(state.daily.questionIds)
          ? state.daily.questionIds.length
          : 0;

      /* dailyCount変更時、未着手ならセッションを作り直す */
      if (!hasStarted && questionCount !== configuredCount) {
        state.daily = null;
        return null;
      }

      return state.daily;
    }

    return null;
  }

  /*
   * DailyセッションをlocalStorageへ保存。
   *
   * ここが今回の重要修正。
   *
   * ・answersが問題数に達したらcompleted=true
   * ・currentIndexが範囲外にならないよう補正
   * ・壊れたデータでも可能な限り復旧
   */
  function persistDailyFromSession(
    session
  ) {
    if (
      !session ||
      session.type !== "daily"
    ) {
      return;
    }

    const questionIds =
      Array.isArray(
        session.questionIds
      )
        ? session.questionIds
        : [];

    const answers =
      Array.isArray(
        session.answers
      )
        ? session.answers
        : [];

    if (!questionIds.length) {
      return;
    }

    if (
      !state.daily ||
      state.daily.date !==
        todayKey()
    ) {
      state.daily =
        Storage.createDailyState(
          questionIds
        );
    }

    state.daily.questionIds =
      questionIds;

    const maxIndex =
      Math.max(
        0,
        questionIds.length - 1
      );

    state.daily.currentIndex =
      Math.min(
        Math.max(
          Number(
            session.currentIndex
          ) || 0,
          0
        ),
        maxIndex
      );

    state.daily.answers =
      answers;

    /*
     * ここが重要。
     *
     * 設定された問題数すべてに回答した時点で
     * Quiz側のcompletedがまだfalseでも
     * Dailyを完了扱いにする。
     */
    state.daily.completed =
      session.completed === true ||
      answers.length >=
        questionIds.length;

    if (state.daily.completed) {
      state.daily.currentIndex =
        maxIndex;

      Storage.saveDailyResult(
        state
      );
    }

    Storage.save(state);
  }

  /*
   * 今日の演習を開始・再開
   *
   * 今回の「再開ボタンが反応しない」問題の
   * 中心となる修正版。
   */
  function startDaily() {
    try {
      const existing =
        todaysDaily();

      /*
       * すでに完了している場合
       */
      if (
        existing &&
        existing.completed
      ) {
        renderHome();
        return;
      }

      let sessionData;

      /*
       * -----------------------------------------------------
       * 既存Dailyを再開
       * -----------------------------------------------------
       */
      if (existing) {
        const rawQuestionIds =
          Array.isArray(
            existing.questionIds
          )
            ? existing.questionIds
            : [];

        const rawAnswers =
          Array.isArray(
            existing.answers
          )
            ? existing.answers
            : [];

        /*
         * 現在存在する問題だけを残す。
         *
         * 自作問題を削除した場合などに、
         * 古いIDがDailyに残っていても
         * 再開不能にならないようにする。
         */
        const validQuestionIds =
          rawQuestionIds.filter(
            id =>
              !!questionById(id)
          );

        /*
         * 問題が全部なくなっている場合
         */
        if (
          validQuestionIds.length === 0
        ) {
          state.daily = null;

          Storage.save(state);

          /*
           * 新しいDailyを作成
           */
          startDaily();
          return;
        }

        /*
         * 現在存在しない問題への回答を除外。
         */
        const validIdSet =
          new Set(
            validQuestionIds
          );

        const validAnswers =
          rawAnswers.filter(
            answer => {
              const id =
                answer?.questionId ||
                answer?.id;

              return (
                id &&
                validIdSet.has(id)
              );
            }
          );

        /*
         * すべて回答済みなら、
         * 壊れたcompleted:false状態も自動修復。
         */
        if (
          validAnswers.length >=
          validQuestionIds.length
        ) {
          state.daily.questionIds =
            validQuestionIds;

          state.daily.answers =
            validAnswers;

          state.daily.currentIndex =
            Math.max(
              0,
              validQuestionIds.length - 1
            );

          state.daily.completed =
            true;

          Storage.saveDailyResult(
            state
          );

          Storage.save(state);

          renderHome();
          return;
        }

        /*
         * 通常の途中再開。
         *
         * 回答数＝次に出す問題のindex
         */
        const resumeIndex =
          Math.min(
            validAnswers.length,
            validQuestionIds.length - 1
          );

        state.daily.questionIds =
          validQuestionIds;

        state.daily.answers =
          validAnswers;

        state.daily.currentIndex =
          resumeIndex;

        state.daily.completed =
          false;

        Storage.save(state);

        sessionData = {
          type: "daily",

          questionIds:
            validQuestionIds,

          currentIndex:
            resumeIndex,

          answers:
            validAnswers,

          completed:
            false
        };
      }

      /*
       * -----------------------------------------------------
       * 新しいDailyを開始
       * -----------------------------------------------------
       */
      else {
        const ids =
          pendingDailyIds && pendingDailyIds.length
            ? pendingDailyIds
            : selectPrioritized(
                APP_CONFIG.dailyCount,
                [],
                "optimized-daily"
              );

        pendingDailyIds = null;

        if (!ids.length) {
          showToast(
            "出題できる問題がありません。",
            "error"
          );

          return;
        }

        state.daily =
          Storage.createDailyState(
            ids
          );

        sessionData = {
          type: "daily",

          questionIds:
            ids,

          currentIndex:
            0,

          answers:
            [],

          completed:
            false
        };
      }

      /*
       * Quizセッションを開始
       */
      const started =
        Quiz.start(
          "daily",
          sessionData.questionIds,
          sessionData
        );

      /*
       * Quiz側で現在問題が取得できるか確認。
       */
      if (
        !started ||
        !Quiz.currentQuestion()
      ) {
        console.warn(
          "今日の演習セッションを復元できなかったためリセットします。",
          sessionData
        );

        state.daily = null;

        Storage.save(state);

        showToast(
          "今日の演習データを修復しました。もう一度開始してください。",
          "info"
        );

        renderHome();

        return;
      }

      /*
       * 現在の状態を保存
       */
      persistDailyFromSession(
        Quiz.getSession()
      );

      /*
       * 問題画面表示
       */
      renderQuiz();

    } catch (error) {
      console.error(
        "今日の演習の開始・再開に失敗しました",
        error
      );

      showToast(
        "今日の演習を開始できませんでした。ページを再読み込みしてください。",
        "error"
      );

      renderHome();
    }
  }

  /* =========================================================
     追加Daily
  ========================================================= */

  function startExtraDaily() {
    const daily =
      todaysDaily();

    if (
      !daily ||
      !daily.completed
    ) {
      startDaily();
      return;
    }

    const ids =
      selectPrioritized(
        APP_CONFIG.extraCount,
        daily.questionIds || [],
        "unanswered-first"
      );

    if (!ids.length) {
      showToast(
        "出題できる問題がありません。",
        "error"
      );

      return;
    }

    const oldQuestionIds =
      daily.questionIds || [];

    const oldAnswers =
      daily.answers || [];

    const newQuestionIds =
      [
        ...oldQuestionIds,
        ...ids
      ];

    state.daily = {
      date:
        todayKey(),

      questionIds:
        newQuestionIds,

      currentIndex:
        oldAnswers.length,

      answers:
        oldAnswers,

      completed:
        false,

      result:
        daily.result || null
    };

    Storage.save(state);

    const sessionData = {
      type:
        "daily",

      questionIds:
        newQuestionIds,

      currentIndex:
        oldAnswers.length,

      answers:
        oldAnswers,

      completed:
        false
    };

    const started =
      Quiz.start(
        "daily",
        sessionData.questionIds,
        sessionData
      );

    if (
      !started ||
      !Quiz.currentQuestion()
    ) {
      state.daily = null;

      Storage.save(state);

      showToast(
        "追加問題の開始に失敗しました。",
        "error"
      );

      renderHome();

      return;
    }

    persistDailyFromSession(
      Quiz.getSession()
    );

    renderQuiz();
  }

  /* =========================================================
     科目
  ========================================================= */

  function renderSubjects() {
    const summary =
      Stats.summarize(
        questions,
        state
      );

    const container =
      document.getElementById(
        "subject-stats"
      );

    container.innerHTML =
      APP_CONFIG.subjects
        .map(subject => {
          const item =
            summary.bySubject[
              subject.id
            ];

          const total =
            item
              ? item.total
              : 0;

          const accuracy =
            total
              ? Math.round(
                  (item.correct /
                    total) *
                    100
                )
              : 0;

          return `
            <button
              class="subject-card"
              type="button"
              data-subject="${escapeHtml(
                subject.id
              )}">
              <span class="subject-card-name">
                ${escapeHtml(
                  subject.name
                )}
              </span>

              <span class="subject-card-meta">
                ${
                  total
                    ? `${accuracy}% / ${total}問`
                    : "未学習"
                }
              </span>
            <span class="subject-card-bar" data-i="${APP_CONFIG.subjects.indexOf(subject)}"><i style="width:${accuracy}%"></i></span>
          </button>
          `;
        })
        .join("");
  }

  function openSubject(subjectId) {
    selectedSubject =
      subjectId;

    const subject =
      APP_CONFIG.subjects.find(
        item =>
          item.id ===
          subjectId
      );

    if (!subject) {
      return;
    }

    document.getElementById(
      "subject-screen-title"
    ).textContent =
      subject.name;

    const categories = [];

    questions.forEach(
      question => {
        if (
          question.subject !==
          subjectId
        ) {
          return;
        }

        const category =
          question.category ||
          "その他";

        if (
          !categories.includes(
            category
          )
        ) {
          categories.push(
            category
          );
        }
      }
    );

    const summary =
      Stats.summarize(
        questions,
        state
      );

    const container =
      document.getElementById(
        "category-list"
      );

    container.innerHTML =
      categories
        .map(category => {
          const key =
            `${subjectId}::${category}`;

          const item =
            summary.byCategory[
              key
            ];

          const total =
            item
              ? item.total
              : 0;

          const accuracy =
            total
              ? Math.round(
                  (item.correct /
                    total) *
                    100
                )
              : 0;

          const questionCount =
            questions.filter(
              q =>
                q.subject ===
                  subjectId &&
                (
                  q.category ||
                  "その他"
                ) === category
            ).length;

          return `
            <button
              class="category-card"
              type="button"
              data-category="${escapeHtml(
                encodeURIComponent(
                  category
                )
              )}">

              <span class="category-card-name">
                ${escapeHtml(
                  category
                )}
              </span>

              <span class="category-card-meta">
                ${
                  total
                    ? `${accuracy}% / ${total}問`
                    : "未学習"
                }
                <br>
                問題数 ${questionCount}問
              </span>

            </button>
          `;
        })
        .join("");

    showScreen("subject");
  }

  function openCategory(category) {
    selectedCategory =
      category;

    const subject =
      APP_CONFIG.subjects.find(
        item =>
          item.id ===
          selectedSubject
      );

    if (!subject) {
      return;
    }

    document.getElementById(
      "category-screen-title"
    ).textContent =
      category;

    const summary =
      Stats.summarize(
        questions,
        state
      );

    const key =
      `${selectedSubject}::${category}`;

    const item =
      summary.byCategory[key];

    const total =
      item
        ? item.total
        : 0;

    const accuracy =
      total
        ? Math.round(
            (item.correct /
              total) *
              100
          )
        : 0;

    const container =
      document.getElementById(
        "category-detail"
      );

    container.innerHTML = `
      <div class="category-summary">

        <p class="category-summary-subject">
          ${escapeHtml(
            subject.name
          )}
        </p>

        <h2>
          ${escapeHtml(
            category
          )}
        </h2>

        <p class="category-summary-stat">
          ${
            total
              ? `正答率 ${accuracy}% ／ ${total}問`
              : "まだ学習していません"
          }
        </p>

      </div>

      <button
        id="btn-category-10"
        class="btn primary"
        type="button">
        この分野を10問
      </button>

      <button
        id="btn-category-20"
        class="btn"
        type="button">
        この分野を20問
      </button>

      ${
        total
          ? `
            <button
              id="btn-category-weak"
              class="btn"
              type="button">
              弱点問題だけ
            </button>
          `
          : ""
      }
    `;

    document
      .getElementById(
        "btn-category-10"
      )
      .addEventListener(
        "click",
        () =>
          startCategoryQuiz(
            10,
            false
          )
      );

    document
      .getElementById(
        "btn-category-20"
      )
      .addEventListener(
        "click",
        () =>
          startCategoryQuiz(
            20,
            false
          )
      );

    const weakButton =
      document.getElementById(
        "btn-category-weak"
      );

    if (weakButton) {
      weakButton.addEventListener(
        "click",
        () =>
          startCategoryQuiz(
            20,
            true
          )
      );
    }

    showScreen("category");
  }

  function startCategoryQuiz(
    count,
    weakOnly
  ) {
    const filters = {
      subject:
        selectedSubject,

      category:
        selectedCategory
    };

    const strategy =
      weakOnly
        ? "weakest-first"
        : "unanswered-first";

    const ids =
      Selector.selectQuestionIds(
        questions,
        state.history,
        {
          count,
          strategy,
          filters
        }
      );

    if (!ids.length) {
      showToast(
        "この分野には出題できる問題がありません。",
        "error"
      );

      return;
    }

    const started =
      Quiz.start(
        "category",
        ids,
        null
      );

    if (
      !started ||
      !Quiz.currentQuestion()
    ) {
      showToast(
        "問題を開始できませんでした。",
        "error"
      );

      return;
    }

    renderQuiz();
  }

  /* =========================================================
     弱点分野
  ========================================================= */

  function renderWeakCategories() {
    const summary =
      Stats.summarize(
        questions,
        state
      );

    const list =
      Object.values(
        summary.byCategory
      )
        .filter(
          item =>
            item.total > 0
        )
        .map(item => ({
          ...item,

          accuracy:
            Math.round(
              (item.correct /
                item.total) *
                100
            )
        }))
        .sort(
          (a, b) => {
            if (
              a.accuracy !==
              b.accuracy
            ) {
              return (
                a.accuracy -
                b.accuracy
              );
            }

            return (
              b.total -
              a.total
            );
          }
        )
        .slice(0, 5);

    const container =
      document.getElementById(
        "weak-category-list"
      );

    if (!list.length) {
      container.innerHTML =
        `<p class="note">
          まだ十分な学習データがありません。
        </p>`;

      return;
    }

    container.innerHTML =
      list
        .map(item => `
          <button
            class="weak-category-card"
            type="button"
            data-subject="${escapeHtml(
              item.subject
            )}"
            data-category="${escapeHtml(
              encodeURIComponent(
                item.category
              )
            )}">

            <span>
              <strong>
                ${escapeHtml(
                  item.category
                )}
              </strong>

              <small>
                ${escapeHtml(
                  item.subjectName
                )}
              </small>
            </span>

            <span class="weak-rate">
              ${item.accuracy}%
            </span>

          </button>
        `)
        .join("");
  }

  /* =========================================================
     ホーム
  ========================================================= */

  function renderHome() {
    const summary =
      Stats.summarize(
        questions,
        state
      );

    const daily =
      todaysDaily();

    const startButton =
      document.getElementById(
        "btn-start-daily"
      );

    const extraButton =
      document.getElementById(
        "btn-extra-daily"
      );

    const resumeNote =
      document.getElementById(
        "resume-note"
      );

    const todayAnswered =
      daily &&
      Array.isArray(
        daily.answers
      )
        ? daily.answers.length
        : 0;

    const todayTotal =
      daily &&
      Array.isArray(
        daily.questionIds
      )
        ? daily.questionIds.length
        : 0;

    document.getElementById(
      "stat-today"
    ).textContent =
      `${todayAnswered} / ${todayTotal}問`;

    document.getElementById(
      "stat-accuracy"
    ).textContent =
      `${summary.accuracy}%`;

    document.getElementById(
      "stat-total"
    ).textContent =
      `${summary.total}問`;

    renderSubjects();

    renderWeakCategories();

    renderStreakBadge();

    renderSrsWidget();

    renderHeatmap();

    /*
     * Daily未完了
     */
    if (
      daily &&
      !daily.completed
    ) {
      startButton.textContent =
        "今日の演習を再開";

      startButton.disabled =
        false;

      extraButton.hidden =
        true;

      resumeNote.hidden =
        false;

      resumeNote.textContent =
        `${todayAnswered}問まで回答済みです。続きから再開できます.`;
    }

    /*
     * Daily完了
     */
    else if (
      daily &&
      daily.completed
    ) {
      startButton.textContent =
        `今日の${
          Number(APP_CONFIG.dailyCount) || 20
        }問は完了`;

      startButton.disabled =
        true;

      extraButton.hidden =
        false;

      extraButton.textContent =
        `追加で${
          Number(
            APP_CONFIG.extraCount
          ) || 20
        }問解く`;

      extraButton.disabled =
        false;

      resumeNote.hidden =
        false;

      resumeNote.textContent =
        `本日の学習は${todayAnswered}問完了しています。さらに学習できます。`;
    }

    /*
     * 今日まだ開始していない
     */
    else {
      startButton.textContent =
        `今日の${
          Number(APP_CONFIG.dailyCount) || 20
        }問を始める`;

      startButton.disabled =
        false;

      extraButton.hidden =
        true;

      resumeNote.hidden =
        true;
    }

    document.getElementById(
      "btn-review"
    ).disabled =
      !Selector.selectReviewIds(
        questions,
        state.history
      ).length;

    renderTodayHero();

    showScreen("home");
  }

  /* =========================================================
     Quiz表示
  ========================================================= */

  function renderQuiz() {
    const question =
      Quiz.currentQuestion();

    const session =
      Quiz.getSession();

    if (
      !question ||
      !session
    ) {
      renderHome();
      return;
    }

    document.getElementById(
      "quiz-progress"
    ).textContent =
      `${session.currentIndex + 1} / ${session.questionIds.length}`;

    const progressFill =
      document.getElementById(
        "quiz-progress-fill"
      );

    if (progressFill) {
      const percent =
        Math.round(
          (session.currentIndex /
            session.questionIds.length) *
            100
        );

      progressFill.style.width =
        `${Math.min(
          100,
          Math.max(
            4,
            percent
          )
        )}%`;
    }

    document.getElementById(
      "quiz-meta"
    ).textContent =
      `${getSubjectName(
        question.subject
      )} ／ ${
        question.category ||
        "その他"
      } ／ 難易度${
        question.difficulty
      }`;

    document.getElementById(
      "quiz-question"
    ).textContent =
      question.question;

    renderQuizConfidence(question.id);

    const choices =
      document.getElementById(
        "quiz-choices"
      );

    choices.innerHTML = "";

    choices.classList.remove(
      "answered"
    );

    question.choices.forEach(
      (label, index) => {
        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "choice";

        button.dataset.index =
          String(index);

        button.innerHTML =
          `<span class="choice-letter">${
            ["ア", "イ", "ウ", "エ"][
              index
            ]
          }</span>` +
          `<span class="choice-text">${escapeHtml(
            label
          )}</span>`;

        button.addEventListener(
          "click",
          () =>
            answerQuestion(
              index
            )
        );

        choices.appendChild(
          button
        );
      }
    );

    renderFavoriteButton();

    showScreen("quiz");
  }

  function answerQuestion(
    choiceIndex
  ) {
    const choicesContainer =
      document.getElementById(
        "quiz-choices"
      );

    if (
      choicesContainer.classList.contains(
        "answered"
      )
    ) {
      return;
    }

    const submitted =
      Quiz.submit(
        choiceIndex
      );

    if (!submitted) {
      return;
    }

    Storage.recordAnswer(
      state,
      submitted.question.id,
      submitted.result.isCorrect
    );

    persistDailyFromSession(
      Quiz.getSession()
    );

    Storage.save(state);

    updateStreak();
    incrementDailyLog();
    recordAttempt(submitted.question.id, submitted.result.isCorrect);
    recordQuestionStat(submitted.question.id, submitted.result.isCorrect);

    const srsMapBefore = loadSrs();
    const previousEntry = srsMapBefore[submitted.question.id];

    pendingSrsQuestionId = submitted.question.id;
    pendingSrsPrevBox = previousEntry ? previousEntry.box : 0;
    pendingSrsIsCorrect = submitted.result.isCorrect;

    applySrsUpdate(
      pendingSrsQuestionId,
      pendingSrsIsCorrect,
      "normal",
      pendingSrsPrevBox
    );

    lastResult =
      submitted;

    choicesContainer.classList.add(
      "answered"
    );

    choicesContainer
      .querySelectorAll(
        ".choice"
      )
      .forEach(button => {
        const index =
          Number(
            button.dataset.index
          );

        if (
          index ===
          submitted.question.answer
        ) {
          button.classList.add(
            "is-correct"
          );
        } else if (
          index ===
          choiceIndex
        ) {
          button.classList.add(
            "is-wrong"
          );
        }
      });

    window.setTimeout(
      renderExplain,
      420
    );
  }

  /* =========================================================
     要復習フラグ
  ========================================================= */

  function renderFavoriteButton() {
    const question = Quiz.currentQuestion();
    const on = !!(
      question &&
      Storage.isFavorite(state, question.id)
    );

    const starButton = document.getElementById("btn-favorite");
    if (starButton) {
      starButton.classList.toggle("on", on);
      starButton.setAttribute("aria-pressed", on ? "true" : "false");
      starButton.textContent = on ? "★" : "☆";
    }

    const reviewButton = document.getElementById("btn-favorite-explain");
    if (reviewButton) {
      reviewButton.classList.toggle("on", on);
      reviewButton.setAttribute("aria-pressed", on ? "true" : "false");

      const label = reviewButton.querySelector(".review-toggle-label");
      if (label) {
        label.textContent = on ? "要復習を解除する" : "要復習にする";
      }
    }
  }

  function toggleCurrentFavorite() {
    const question = Quiz.currentQuestion();
    if (!question) return;

    Storage.toggleFavorite(state, question.id);
    Storage.save(state);
    renderFavoriteButton();
  }

  /* =========================================================
     解説
  ========================================================= */

  function renderExplain() {
    if (!lastResult) {
      renderHome();
      return;
    }

    const {
      question,
      result
    } = lastResult;

    const badge =
      document.getElementById(
        "explain-badge"
      );

    badge.textContent =
      result.isCorrect
        ? "正解！"
        : "不正解";

    badge.className =
      result.isCorrect
        ? "badge ok"
        : "badge ng";

    document.getElementById(
      "explain-question"
    ).textContent =
      question.question;

    document
      .querySelectorAll("#confidence-group .confidence-btn")
      .forEach(button =>
        button.classList.toggle(
          "selected",
          button.dataset.level === currentConfidenceLevel(question.id)
        )
      );

    const noteField = document.getElementById("explain-note");
    if (noteField) {
      const savedNote = loadNotes()[question.id];
      noteField.value = savedNote ? savedNote.text : "";
    }

    document.getElementById(
      "explain-answer"
    ).textContent =
      `正解：${
        ["ア", "イ", "ウ", "エ"][
          question.answer
        ]
      } ${
        question.choices[
          question.answer
        ]
      }`;

    document.getElementById(
      "explain-body"
    ).textContent =
      question.explanation ||
      "この問題の解説はまだ登録されていません。";

    const choiceSection =
      document.getElementById(
        "choice-explanations-section"
      );

    const choiceContainer =
      document.getElementById(
        "choice-explanations"
      );

    const choiceExplanations =
      question.choiceExplanations;

    if (
      Array.isArray(
        choiceExplanations
      ) &&
      choiceExplanations.length
    ) {
      choiceSection.hidden =
        false;

      choiceContainer.innerHTML =
        question.choices
          .map(
            (choice, index) => {
              const isCorrect =
                index ===
                question.answer;

              const explanation =
                choiceExplanations[
                  index
                ] ||
                "この選択肢の詳しい解説はまだ登録されていません。";

              return `
                <details
                  class="choice-explanation ${
                    isCorrect
                      ? "correct-choice"
                      : "wrong-choice"
                  }"
                  ${
                    isCorrect
                      ? "open"
                      : ""
                  }>

                  <summary>

                    <span class="choice-label">
                      ${
                        ["ア", "イ", "ウ", "エ"][
                          index
                        ]
                      }
                    </span>

                    <span class="choice-text">
                      ${escapeHtml(
                        choice
                      )}
                    </span>

                    <span class="choice-result">
                      ${
                        isCorrect
                          ? "✓ 正解"
                          : "×"
                      }
                    </span>

                  </summary>

                  <div class="choice-explanation-body">
                    ${escapeHtml(
                      explanation
                    ).replace(
                      /\n/g,
                      "<br>"
                    )}
                  </div>

                </details>
              `;
            }
          )
          .join("");
    } else {
      choiceSection.hidden =
        true;

      choiceContainer.innerHTML =
        "";
    }

    const keyPointSection =
      document.getElementById(
        "key-point-section"
      );

    const keyPoint =
      document.getElementById(
        "key-point"
      );

    if (
      question.keyPoint
    ) {
      keyPointSection.hidden =
        false;

      keyPoint.textContent =
        question.keyPoint;
    } else {
      keyPointSection.hidden =
        true;

      keyPoint.textContent =
        "";
    }

    const relatedSection =
      document.getElementById(
        "related-knowledge-section"
      );

    const relatedContainer =
      document.getElementById(
        "related-knowledge"
      );

    const relatedKnowledge =
      question.relatedKnowledge;

    if (
      Array.isArray(
        relatedKnowledge
      ) &&
      relatedKnowledge.length
    ) {
      relatedSection.hidden =
        false;

      relatedContainer.innerHTML =
        relatedKnowledge
          .map(
            item => `
              <div class="related-knowledge-item">

                <h4>
                  ${escapeHtml(
                    item.title
                  )}
                </h4>

                <p>
                  ${escapeHtml(
                    item.body
                  ).replace(
                    /\n/g,
                    "<br>"
                  )}
                </p>

              </div>
            `
          )
          .join("");
    } else {
      relatedSection.hidden =
        true;

      relatedContainer.innerHTML =
        "";
    }

    const mistakeSection =
      document.getElementById(
        "mistake-point-section"
      );

    const mistakePoint =
      document.getElementById(
        "mistake-point"
      );

    if (
      question.mistakePoint
    ) {
      mistakeSection.hidden =
        false;

      mistakePoint.textContent =
        question.mistakePoint;
    } else {
      mistakeSection.hidden =
        true;

      mistakePoint.textContent =
        "";
    }

    const nextButton =
      document.getElementById(
        "btn-next"
      );

    const session =
      Quiz.getSession();

    nextButton.textContent =
      session.currentIndex >=
      session.questionIds.length - 1
        ? "結果を見る"
        : "次の問題へ";

    renderFavoriteButton();
    renderRelatedMaterials(lastResult.question);
    renderQuestionImages(lastResult.question);
    showScreen("explain");
  }

  function goNext() {
    const session =
      Quiz.goNext();

    if (!session) {
      renderHome();
      return;
    }

    persistDailyFromSession(
      session
    );

    if (
      session.completed
    ) {
      renderResult();
    } else {
      renderQuiz();
    }
  }

  /* =========================================================
     結果
  ========================================================= */

  function renderResult() {
    const summary =
      Quiz.resultSummary();

    document.getElementById(
      "result-score"
    ).textContent =
      `${summary.correct} / ${summary.total}`;

    document.getElementById(
      "result-accuracy"
    ).textContent =
      `正答率 ${summary.accuracy}%`;

    showScreen("result");
    launchConfetti();
  }

  /* =========================================================
     要復習リスト
  ========================================================= */

  function renderFavorites() {
    const ids =
      Selector.selectFavoriteIds(
        questions,
        state.favorites
      );

    const empty =
      document.getElementById(
        "favorites-empty"
      );

    const quizButton =
      document.getElementById(
        "btn-favorites-quiz"
      );

    const list =
      document.getElementById(
        "favorites-list"
      );

    empty.hidden =
      ids.length > 0;

    quizButton.disabled =
      ids.length === 0;

    list.innerHTML =
      ids
        .map(id => {
          const question =
            questionById(id);

          if (!question) {
            return "";
          }

          return `
            <li>

              <button
                class="favorite-item"
                type="button"
                data-id="${escapeHtml(
                  question.id
                )}">

                <span class="fav-subject">
                  ${escapeHtml(
                    getSubjectName(
                      question.subject
                    )
                  )}
                  ／
                  ${escapeHtml(
                    question.category ||
                    "その他"
                  )}
                </span>

                ${escapeHtml(
                  question.question
                )}

              </button>

            </li>
          `;
        })
        .join("");

    showScreen(
      "favorites"
    );
  }

  /* =========================================================
     問題作成
  ========================================================= */

  function populateSubjectSelect() {
    const select =
      document.getElementById(
        "create-subject"
      );

    select.innerHTML =
      `<option value="">
        選択してください
      </option>`;

    APP_CONFIG.subjects.forEach(
      subject => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          subject.id;

        option.textContent =
          subject.name;

        select.appendChild(
          option
        );
      }
    );
  }

  function clearQuestionForm() {
    editingQuestionId =
      null;

    populateSubjectSelect();

    document.getElementById(
      "create-subject"
    ).value =
      "";

    document.getElementById(
      "create-category"
    ).value =
      "";

    document.getElementById(
      "create-difficulty"
    ).value =
      "2";

    document.getElementById(
      "create-question"
    ).value =
      "";

    for (
      let i = 0;
      i < 4;
      i++
    ) {
      document.getElementById(
        `create-choice-${i}`
      ).value =
        "";

      document.getElementById(
        `create-choice-explanation-${i}`
      ).value =
        "";
    }

    document.getElementById(
      "create-answer"
    ).value =
      "0";

    document.getElementById(
      "create-explanation"
    ).value =
      "";

    document.getElementById(
      "create-key-point"
    ).value =
      "";

    document.getElementById(
      "create-related"
    ).value =
      "";

    document.getElementById(
      "create-screen-title"
    ).textContent =
      "問題を作成";

    document.getElementById(
      "create-form-heading"
    ).textContent =
      "新しい問題";

    document.getElementById(
      "btn-save-question"
    ).textContent =
      "問題を保存";

    document.getElementById(
      "btn-delete-editing-question"
    ).hidden =
      true;
  }

  function openCreateQuestion() {
    clearQuestionForm();

    showScreen(
      "createQuestion"
    );
  }

  function openEditQuestion(id) {
    const question =
      questionById(id);

    if (
      !question ||
      !isCustomQuestion(
        question
      )
    ) {
      showToast(
        "この問題は編集できません。",
        "error"
      );

      return;
    }

    editingQuestionId =
      id;

    populateSubjectSelect();

    document.getElementById(
      "create-subject"
    ).value =
      question.subject ||
      "";

    document.getElementById(
      "create-category"
    ).value =
      question.category ||
      "";

    document.getElementById(
      "create-difficulty"
    ).value =
      String(
        question.difficulty ||
        2
      );

    document.getElementById(
      "create-question"
    ).value =
      question.question ||
      "";

    for (
      let i = 0;
      i < 4;
      i++
    ) {
      document.getElementById(
        `create-choice-${i}`
      ).value =
        question.choices?.[i] ||
        "";

      document.getElementById(
        `create-choice-explanation-${i}`
      ).value =
        question.choiceExplanations?.[
          i
        ] || "";
    }

    document.getElementById(
      "create-answer"
    ).value =
      String(
        question.answer ?? 0
      );

    document.getElementById(
      "create-explanation"
    ).value =
      question.explanation ||
      "";

    document.getElementById(
      "create-key-point"
    ).value =
      question.keyPoint ||
      "";

    document.getElementById(
      "create-related"
    ).value =
      Array.isArray(
        question.relatedKnowledge
      )
        ? question.relatedKnowledge
            .map(
              item =>
                item.body || ""
            )
            .join("\n")
        : "";

    document.getElementById(
      "create-screen-title"
    ).textContent =
      "問題を編集";

    document.getElementById(
      "create-form-heading"
    ).textContent =
      "自作問題を編集";

    document.getElementById(
      "btn-save-question"
    ).textContent =
      "変更を保存";

    document.getElementById(
      "btn-delete-editing-question"
    ).hidden =
      false;

    showScreen(
      "createQuestion"
    );
  }

  function buildQuestionFromForm(
    existing = null
  ) {
    const subject =
      document.getElementById(
        "create-subject"
      ).value;

    const category =
      document.getElementById(
        "create-category"
      ).value.trim();

    const difficulty =
      Number(
        document.getElementById(
          "create-difficulty"
        ).value
      );

    const questionText =
      document.getElementById(
        "create-question"
      ).value.trim();

    const choices =
      [0, 1, 2, 3].map(
        index =>
          document.getElementById(
            `create-choice-${index}`
          ).value.trim()
      );

    const answer =
      Number(
        document.getElementById(
          "create-answer"
        ).value
      );

    const explanation =
      document.getElementById(
        "create-explanation"
      ).value.trim();

    const choiceExplanations =
      [0, 1, 2, 3].map(
        index =>
          document.getElementById(
            `create-choice-explanation-${index}`
          ).value.trim()
      );

    const keyPoint =
      document.getElementById(
        "create-key-point"
      ).value.trim();

    const relatedText =
      document.getElementById(
        "create-related"
      ).value.trim();

    if (!subject) {
      showToast(
        "科目を選択してください。",
        "error"
      );

      return null;
    }

    if (!category) {
      showToast(
        "分野を入力してください。",
        "error"
      );

      return null;
    }

    if (!questionText) {
      showToast(
        "問題文を入力してください。",
        "error"
      );

      return null;
    }

    if (
      choices.some(
        choice => !choice
      )
    ) {
      showToast(
        "4つの選択肢をすべて入力してください。",
        "error"
      );

      return null;
    }

    const relatedKnowledge =
      relatedText
        ? relatedText
            .split("\n")
            .map(
              line =>
                line.trim()
            )
            .filter(Boolean)
            .map(
              line => ({
                title: "",
                body: line
              })
            )
        : [];

    const now =
      new Date().toISOString();

    return QuestionDB.normalizeQuestion({
      ...(existing || {}),

      id:
        existing?.id ||
        `custom-${Date.now()}`,

      year:
        existing?.year ||
        new Date().getFullYear(),

      subject,

      category,

      difficulty,

      question:
        questionText,

      choices,

      answer,

      explanation,

      choiceExplanations,

      keyPoint,

      relatedKnowledge,

      mistakePoint:
        existing?.mistakePoint ||
        "",

      custom:
        true,

      sourceType:
        existing?.sourceType ||
        "manual",

      createdAt:
        existing?.createdAt ||
        now,

      updatedAt:
        now,

      importedAt:
        existing?.importedAt ||
        null
    });
  }

  async function saveNewQuestion() {
    try {
      const existing =
        editingQuestionId
          ? questionById(
              editingQuestionId
            )
          : null;

      const newQuestion =
        buildQuestionFromForm(
          existing
        );

      if (!newQuestion) {
        return;
      }

      await QuestionDB.put(
        newQuestion
      );

      questions =
        await QuestionDB.getAll();

      const customQuestions =
        loadCustomQuestions()
          .filter(
            item =>
              item.id !==
              newQuestion.id
          );

      customQuestions.push(
        newQuestion
      );

      saveCustomQuestions(
        customQuestions
      );

      showToast(
        editingQuestionId
          ? "問題を更新しました。"
          : "問題を保存しました。",
        "success"
      );

      editingQuestionId =
        null;

      clearQuestionForm();

      renderHome();

    } catch (error) {
      console.error(
        "問題の保存に失敗しました",
        error
      );

      showToast(
        `問題の保存に失敗しました。${error.message}`,
        "error"
      );
    }
  }

  /* =========================================================
     問題削除
  ========================================================= */

  async function deleteQuestion(id) {
    const question =
      questionById(id);

    if (
      !question ||
      !isCustomQuestion(
        question
      )
    ) {
      showToast(
        "削除できる自作問題ではありません。",
        "error"
      );

      return;
    }

    const confirmed =
      await confirmDialog(
        question.question,
        {
          title:
            "この問題を削除しますか？",

          okLabel:
            "削除する"
        }
      );

    if (!confirmed) {
      return;
    }

    try {
      await QuestionDB.remove(
        id
      );

      const customQuestions =
        loadCustomQuestions()
          .filter(
            item =>
              item.id !== id
          );

      saveCustomQuestions(
        customQuestions
      );

      questions =
        questions.filter(
          item =>
            item.id !== id
        );

      if (
        state.history &&
        state.history[id]
      ) {
        delete state.history[id];
      }

      if (
        Array.isArray(
          state.favorites
        )
      ) {
        state.favorites =
          state.favorites.filter(
            favoriteId =>
              favoriteId !== id
          );
      }

      if (
        state.daily &&
        Array.isArray(
          state.daily.questionIds
        ) &&
        state.daily.questionIds.includes(
          id
        )
      ) {
        const filteredIds =
          state.daily.questionIds.filter(
            qid =>
              qid !== id
          );

        const filteredAnswers =
          Array.isArray(
            state.daily.answers
          )
            ? state.daily.answers.filter(
                answer => {
                  const answerId =
                    answer?.questionId ||
                    answer?.id;

                  return (
                    answerId !==
                    id
                  );
                }
              )
            : [];

        if (
          filteredIds.length ===
          0
        ) {
          state.daily = null;
        } else {
          state.daily.questionIds =
            filteredIds;

          state.daily.answers =
            filteredAnswers;

          state.daily.currentIndex =
            Math.min(
              filteredAnswers.length,
              filteredIds.length - 1
            );

          state.daily.completed =
            filteredAnswers.length >=
            filteredIds.length;
        }
      }

      Storage.save(state);

      showToast(
        "問題を削除しました。",
        "success"
      );

      editingQuestionId =
        null;

      renderManageQuestions();

    } catch (error) {
      console.error(
        "問題の削除に失敗しました",
        error
      );

      showToast(
        `問題の削除に失敗しました。${error.message}`,
        "error"
      );
    }
  }

  /* =========================================================
     自作問題管理
  ========================================================= */

  function renderManageQuestions() {
    const customQuestions =
      getCustomQuestions();

    const countElement =
      document.getElementById(
        "custom-question-count"
      );

    const searchInput =
      document.getElementById(
        "custom-question-search"
      );

    const keyword =
      (
        searchInput.value ||
        ""
      )
        .trim()
        .toLowerCase();

    const container =
      document.getElementById(
        "custom-question-list"
      );

    countElement.textContent =
      `${customQuestions.length}問`;

    const filtered =
      customQuestions.filter(
        question => {
          if (!keyword) {
            return true;
          }

          const subjectName =
            getSubjectName(
              question.subject
            );

          const text =
            [
              question.question,
              question.category,
              subjectName,
              question.explanation,
              question.keyPoint
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return text.includes(
            keyword
          );
        }
      );

    if (!customQuestions.length) {
      container.innerHTML = `
        <div class="empty-custom-questions">

          <p>
            自作問題はまだありません。
          </p>

          <p class="note">
            「＋ 新しい問題を作成」または
            「AI問題を一括インポート」
            から追加できます。
          </p>

        </div>
      `;

      showScreen(
        "manageQuestions"
      );

      return;
    }

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-custom-questions">

          <p>
            「${escapeHtml(
              keyword
            )}」
            に一致する問題はありません。
          </p>

        </div>
      `;

      showScreen(
        "manageQuestions"
      );

      return;
    }

    const subjectGroups =
      new Map();

    filtered.forEach(
      question => {
        const subjectId =
          question.subject ||
          "unknown";

        const category =
          question.category ||
          "その他";

        if (
          !subjectGroups.has(
            subjectId
          )
        ) {
          subjectGroups.set(
            subjectId,
            new Map()
          );
        }

        const categoryGroups =
          subjectGroups.get(
            subjectId
          );

        if (
          !categoryGroups.has(
            category
          )
        ) {
          categoryGroups.set(
            category,
            []
          );
        }

        categoryGroups
          .get(category)
          .push(question);
      }
    );

    const subjectOrder =
      APP_CONFIG.subjects.map(
        subject =>
          subject.id
      );

    const orderedSubjectGroups =
      Array.from(
        subjectGroups.entries()
      ).sort(
        (a, b) => {
          const ai =
            subjectOrder.indexOf(
              a[0]
            );

          const bi =
            subjectOrder.indexOf(
              b[0]
            );

          if (
            ai === -1 &&
            bi === -1
          ) {
            return a[0].localeCompare(
              b[0],
              "ja"
            );
          }

          if (ai === -1) {
            return 1;
          }

          if (bi === -1) {
            return -1;
          }

          return ai - bi;
        }
      );

    container.innerHTML =
      orderedSubjectGroups
        .map(
          ([
            subjectId,
            categoryGroups
          ]) => {
            const subjectTotal =
              Array.from(
                categoryGroups.values()
              ).reduce(
                (sum, items) =>
                  sum +
                  items.length,
                0
              );

            const categoryHtml =
              Array.from(
                categoryGroups.entries()
              )
                .sort(
                  (a, b) =>
                    a[0].localeCompare(
                      b[0],
                      "ja"
                    )
                )
                .map(
                  ([
                    category,
                    items
                  ]) => `
                    <details
                      class="custom-category-group">

                      <summary
                        class="custom-category-summary">

                        <span
                          class="custom-category-name">
                          ${escapeHtml(
                            category
                          )}
                        </span>

                        <span
                          class="custom-category-count">
                          ${items.length}問
                        </span>

                      </summary>

                      <div
                        class="custom-category-questions">

                        ${items
                          .map(
                            question => `
                              <article
                                class="custom-question-card">

                                <div
                                  class="custom-question-meta">

                                  <span>
                                    難易度${
                                      escapeHtml(
                                        question.difficulty ||
                                        2
                                      )
                                    }
                                  </span>

                                  ${
                                    question.year
                                      ? `<span>${escapeHtml(
                                          question.year
                                        )}年</span>`
                                      : ""
                                  }

                                </div>

                                <h3
                                  class="custom-question-title">
                                  ${escapeHtml(
                                    question.question
                                  )}
                                </h3>

                                <div
                                  class="custom-question-actions">

                                  <button
                                    type="button"
                                    class="btn small-btn edit-custom-question"
                                    data-id="${escapeHtml(
                                      question.id
                                    )}">
                                    編集
                                  </button>

                                  <button
                                    type="button"
                                    class="btn small-btn danger delete-custom-question"
                                    data-id="${escapeHtml(
                                      question.id
                                    )}">
                                    削除
                                  </button>

                                </div>

                              </article>
                            `
                          )
                          .join("")}

                      </div>
                    </details>
                  `
                )
                .join("");

            return `
              <details
                class="custom-subject-group">

                <summary
                  class="custom-subject-summary">

                  <span>

                    <strong>
                      ${escapeHtml(
                        getSubjectName(
                          subjectId
                        )
                      )}
                    </strong>

                    <small>
                      ${subjectTotal}問
                    </small>

                  </span>

                  <span
                    class="custom-subject-chevron">
                    ⌄
                  </span>

                </summary>

                <div
                  class="custom-subject-categories">

                  ${categoryHtml}

                </div>

              </details>
            `;
          }
        )
        .join("");

    showScreen(
      "manageQuestions"
    );
  }

  /* =========================================================
     自作問題全削除
  ========================================================= */

  async function clearAllCustomQuestions() {
    const customQuestions =
      getCustomQuestions();

    if (!customQuestions.length) {
      showToast(
        "削除する自作問題はありません。",
        "info"
      );

      return;
    }

    const confirmed =
      await confirmDialog(
        `${customQuestions.length}問が削除されます。この操作は元に戻せません。`,
        {
          title:
            "自作問題をすべて削除しますか？",

          okLabel:
            "すべて削除"
        }
      );

    if (!confirmed) {
      return;
    }

    try {
      for (
        const question
        of customQuestions
      ) {
        await QuestionDB.remove(
          question.id
        );
      }

      localStorage.removeItem(
        CUSTOM_QUESTIONS_KEY
      );

      const customIds =
        new Set(
          customQuestions.map(
            question =>
              question.id
          )
        );

      questions =
        questions.filter(
          question =>
            !customIds.has(
              question.id
            )
        );

      if (state.history) {
        customQuestions.forEach(
          question => {
            delete state.history[
              question.id
            ];
          }
        );
      }

      if (
        Array.isArray(
          state.favorites
        )
      ) {
        state.favorites =
          state.favorites.filter(
            id =>
              !customIds.has(id)
          );
      }

      if (
        state.daily &&
        Array.isArray(
          state.daily.questionIds
        )
      ) {
        const filteredIds =
          state.daily.questionIds.filter(
            id =>
              !customIds.has(id)
          );

        const filteredAnswers =
          Array.isArray(
            state.daily.answers
          )
            ? state.daily.answers.filter(
                answer => {
                  const id =
                    answer?.questionId ||
                    answer?.id;

                  return (
                    !customIds.has(
                      id
                    )
                  );
                }
              )
            : [];

        if (
          filteredIds.length ===
          0
        ) {
          state.daily = null;
        } else {
          state.daily.questionIds =
            filteredIds;

          state.daily.answers =
            filteredAnswers;

          state.daily.currentIndex =
            Math.min(
              filteredAnswers.length,
              filteredIds.length - 1
            );

          state.daily.completed =
            filteredAnswers.length >=
            filteredIds.length;
        }
      }

      Storage.save(state);

      editingQuestionId =
        null;

      showToast(
        `${customQuestions.length}問の自作問題を削除しました。`,
        "success"
      );

      renderManageQuestions();

    } catch (error) {
      console.error(
        "自作問題の全削除に失敗しました",
        error
      );

      showToast(
        `自作問題の全削除に失敗しました。${error.message}`,
        "error"
      );
    }
  }

  /* =========================================================
     AI問題インポート
  ========================================================= */

  async function importQuestionsFromFile(
    file
  ) {
    if (!file) {
      return;
    }

    try {
      if (
        file.size >
        5 * 1024 * 1024
      ) {
        throw new Error(
          "JSONファイルが大きすぎます。5MB以下にしてください。"
        );
      }

      const text =
        await file.text();

      if (
        text.length >
        5 * 1024 * 1024
      ) {
        throw new Error(
          "JSONデータが大きすぎます。5MB以下にしてください。"
        );
      }

      const data =
        JSON.parse(text);

      const importedQuestions =
        Array.isArray(data)
          ? data
          : data?.questions;

      if (
        !Array.isArray(
          importedQuestions
        )
      ) {
        throw new Error(
          "questions配列が見つかりません。"
        );
      }

      if (
        !importedQuestions.length
      ) {
        throw new Error(
          "問題が0問です。"
        );
      }

      if (
        importedQuestions.length >
        1000
      ) {
        throw new Error(
          "一度に取り込める問題は1000問までです。"
        );
      }

      const normalized =
        importedQuestions.map(
          (
            question,
            index
          ) => {
            const now =
              new Date().toISOString();

            return QuestionDB.normalizeQuestion({
              ...question,

              id:
                question.id ||
                `ai-${Date.now()}-${index}`,

              custom:
                true,

              sourceType:
                "ai",

              importedAt:
                now,

              createdAt:
                question.createdAt ||
                now
            });
          }
        );

      await QuestionDB.putMany(
        normalized
      );

      questions =
        await QuestionDB.getAll();

      const customQuestions =
        loadCustomQuestions();

      const map =
        new Map(
          customQuestions.map(
            question => [
              question.id,
              question
            ]
          )
        );

      normalized.forEach(
        question => {
          map.set(
            question.id,
            question
          );
        }
      );

      saveCustomQuestions(
        Array.from(
          map.values()
        )
      );

      showToast(
        `${normalized.length}問を取り込みました。現在の総問題数：${questions.length}問`,
        "success"
      );

      renderManageQuestions();

    } catch (error) {
      console.error(
        "AI問題のインポートに失敗しました",
        error
      );

      showToast(
        `問題の読み込みに失敗しました。${error.message}`,
        "error"
      );
    }
  }

  /* =========================================================
     復習
  ========================================================= */

  function startReview() {
    const ids =
      Selector.selectReviewIds(
        questions,
        state.history
      );

    if (!ids.length) {
      showToast(
        "復習できる間違えた問題はまだありません。",
        "info"
      );

      return;
    }

    const started =
      Quiz.start(
        "review",
        ids,
        null
      );

    if (
      !started ||
      !Quiz.currentQuestion()
    ) {
      showToast(
        "復習問題を開始できませんでした。",
        "error"
      );

      return;
    }

    renderQuiz();
  }

  function startFavoriteSession(
    ids
  ) {
    if (!ids.length) {
      showToast(
        "要復習に登録した問題はまだありません。",
        "info"
      );

      return;
    }

    const started =
      Quiz.start(
        "favorite",
        ids,
        null
      );

    if (
      !started ||
      !Quiz.currentQuestion()
    ) {
      showToast(
        "要復習の問題を開始できませんでした。",
        "error"
      );

      return;
    }

    renderQuiz();
  }

  /* =========================================================
     イベント
  ========================================================= */

  function bindEvents() {
    document.addEventListener(
      "keydown",
      event => {
        const tag =
          (event.target &&
            event.target.tagName) ||
          "";

        if (
          [
            "INPUT",
            "TEXTAREA",
            "SELECT"
          ].includes(tag)
        ) {
          return;
        }

        if (
          !screens.quiz.hidden
        ) {
          const indexMap = {
            "1": 0,
            "2": 1,
            "3": 2,
            "4": 3
          };

          if (
            indexMap[event.key] ===
            undefined
          ) {
            return;
          }

          const choicesContainer =
            document.getElementById(
              "quiz-choices"
            );

          if (
            choicesContainer.classList.contains(
              "answered"
            )
          ) {
            return;
          }

          const button =
            choicesContainer.querySelector(
              `[data-index="${indexMap[event.key]}"]`
            );

          if (button) {
            button.click();
          }

          return;
        }

        if (
          !screens.explain.hidden
        ) {
          if (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          ) {
            event.preventDefault();

            document.getElementById(
              "btn-next"
            ).click();
          }
        }
      }
    );

    document
      .getElementById(
        "btn-start-daily"
      )
      .addEventListener(
        "click",
        onStartDailyClick
      );

    document
      .getElementById(
        "btn-extra-daily"
      )
      .addEventListener(
        "click",
        startExtraDaily
      );

    document
      .getElementById(
        "btn-review"
      )
      .addEventListener(
        "click",
        startReview
      );

    document
      .getElementById(
        "btn-favorites"
      )
      .addEventListener(
        "click",
        renderFavorites
      );

    document
      .getElementById(
        "btn-create-question"
      )
      .addEventListener(
        "click",
        openCreateQuestion
      );

    document
      .getElementById(
        "btn-manage-questions"
      )
      .addEventListener(
        "click",
        renderManageQuestions
      );

    document
      .getElementById(
        "btn-manage-back"
      )
      .addEventListener(
        "click",
        renderHome
      );

    document
      .getElementById(
        "btn-create-from-manage"
      )
      .addEventListener(
        "click",
        openCreateQuestion
      );

    const clearAllButton =
      document.getElementById(
        "btn-clear-all-custom-questions"
      );

    if (clearAllButton) {
      clearAllButton.addEventListener(
        "click",
        clearAllCustomQuestions
      );
    }

    document
      .getElementById(
        "custom-question-search"
      )
      .addEventListener(
        "input",
        renderManageQuestions
      );

    document
      .getElementById(
        "custom-question-list"
      )
      .addEventListener(
        "click",
        event => {
          const editButton =
            event.target.closest(
              ".edit-custom-question"
            );

          if (editButton) {
            openEditQuestion(
              editButton.dataset.id
            );

            return;
          }

          const deleteButton =
            event.target.closest(
              ".delete-custom-question"
            );

          if (deleteButton) {
            deleteQuestion(
              deleteButton.dataset.id
            );
          }
        }
      );

    document
      .getElementById(
        "subject-stats"
      )
      .addEventListener(
        "click",
        event => {
          const button =
            event.target.closest(
              "[data-subject]"
            );

          if (button) {
            openSubject(
              button.dataset.subject
            );
          }
        }
      );

    document
      .getElementById(
        "category-list"
      )
      .addEventListener(
        "click",
        event => {
          const button =
            event.target.closest(
              "[data-category]"
            );

          if (button) {
            openCategory(
              decodeURIComponent(
                button.dataset.category
              )
            );
          }
        }
      );

    document
      .getElementById(
        "weak-category-list"
      )
      .addEventListener(
        "click",
        event => {
          const button =
            event.target.closest(
              "[data-category]"
            );

          if (!button) {
            return;
          }

          selectedSubject =
            button.dataset.subject;

          openCategory(
            decodeURIComponent(
              button.dataset.category
            )
          );
        }
      );

    document
      .getElementById(
        "btn-subject-back"
      )
      .addEventListener(
        "click",
        renderHome
      );

    document
      .getElementById(
        "btn-category-back"
      )
      .addEventListener(
        "click",
        () =>
          openSubject(
            selectedSubject
          )
      );

    document
      .getElementById(
        "btn-favorites-back"
      )
      .addEventListener(
        "click",
        renderHome
      );

    document
      .getElementById(
        "btn-create-question-back"
      )
      .addEventListener(
        "click",
        () => {
          editingQuestionId =
            null;

          renderHome();
        }
      );

    document
      .getElementById(
        "btn-favorites-quiz"
      )
      .addEventListener(
        "click",
        () => {
          startFavoriteSession(
            Selector.selectFavoriteIds(
              questions,
              state.favorites
            )
          );
        }
      );

    document
      .getElementById(
        "favorites-list"
      )
      .addEventListener(
        "click",
        event => {
          const button =
            event.target.closest(
              "[data-id]"
            );

          if (button) {
            startFavoriteSession(
              [
                button.getAttribute(
                  "data-id"
                )
              ]
            );
          }
        }
      );

    document
      .getElementById(
        "btn-favorite"
      )
      .addEventListener(
        "click",
        toggleCurrentFavorite
      );

    document
      .getElementById(
        "btn-favorite-explain"
      )
      .addEventListener(
        "click",
        toggleCurrentFavorite
      );

    document
      .getElementById(
        "btn-next"
      )
      .addEventListener(
        "click",
        goNext
      );

    document
      .getElementById(
        "btn-home"
      )
      .addEventListener(
        "click",
        renderHome
      );

    document
      .getElementById(
        "btn-back-home"
      )
      .addEventListener(
        "click",
        () => {
          const session =
            Quiz.getSession();

          persistDailyFromSession(
            session
          );

          if (
            session &&
            session.type ===
              "favorite"
          ) {
            renderFavorites();
          } else {
            renderHome();
          }
        }
      );

    document
      .getElementById(
        "btn-save-question"
      )
      .addEventListener(
        "click",
        saveNewQuestion
      );

    document
      .getElementById(
        "btn-delete-editing-question"
      )
      .addEventListener(
        "click",
        () => {
          if (
            editingQuestionId
          ) {
            deleteQuestion(
              editingQuestionId
            );
          }
        }
      );

    const importFile =
      document.getElementById(
        "question-import-file"
      );

    const importButton =
      document.getElementById(
        "btn-import-questions"
      );

    importButton.addEventListener(
      "click",
      () => {
        importFile.value = "";

        importFile.click();
      }
    );

    importFile.addEventListener(
      "change",
      async event => {
        const file =
          event.target.files?.[0];

        await importQuestionsFromFile(
          file
        );
      }
    );

    /*
     * 間隔反復
     */
    document
      .getElementById("btn-srs-review")
      .addEventListener("click", startSrsSession);

    /*
     * 弱点だけで自動ドリル
     */
    document
      .getElementById("btn-weak-drill")
      .addEventListener("click", startWeakDrill);

    /*
     * 確信度評価
     */
    document
      .getElementById("confidence-group")
      .addEventListener("click", event => {
        const button = event.target.closest(".confidence-btn");
        if (button) setConfidence(button.dataset.level);
      });

    /*
     * マイノート
     */
    const noteField = document.getElementById("explain-note");
    if (noteField) {
      noteField.addEventListener("blur", saveCurrentNote);
    }

    document
      .getElementById("btn-notes-list")
      .addEventListener("click", renderNotesList);

    document
      .getElementById("btn-notes-back")
      .addEventListener("click", renderHome);

    document
      .getElementById("notes-list")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-id]");
        if (button) {
          startFavoriteSession([button.getAttribute("data-id")]);
        }
      });

    /*
     * 用語集フラッシュカード
     */
    document
      .getElementById("btn-flashcards")
      .addEventListener("click", openFlashcards);

    document
      .getElementById("btn-flashcards-back")
      .addEventListener("click", renderHome);

    document
      .getElementById("flashcard")
      .addEventListener("click", flipFlashcard);

    document
      .getElementById("btn-flashcard-next")
      .addEventListener("click", nextFlashcard);

    document
      .getElementById("btn-flashcard-prev")
      .addEventListener("click", prevFlashcard);

    document
      .getElementById("btn-flashcard-shuffle")
      .addEventListener("click", shuffleFlashcards);

    /*
     * 学習データのバックアップ／復元
     */
    document
      .getElementById("btn-export-backup")
      .addEventListener("click", exportBackup);

    const backupImportFile =
      document.getElementById("backup-import-file");

    const backupImportButton =
      document.getElementById("btn-import-backup");

    backupImportButton.addEventListener("click", () => {
      backupImportFile.value = "";
      backupImportFile.click();
    });

    backupImportFile.addEventListener("change", async event => {
      const file = event.target.files?.[0];
      await importBackupFromFile(file);
    });

    /*
     * ボトムタブ
     */
    document
      .getElementById("tabbar")
      .addEventListener("click", event => {
        const tab = event.target.closest(".tab");
        if (tab) switchTab(tab.dataset.tab);
      });

    /*
     * 教材ライブラリ
     */
    document
      .getElementById("btn-materials-add")
      .addEventListener("click", () => openMaterialEditor(null));

    document
      .getElementById("materials-list")
      .addEventListener("click", event => {
        const item = event.target.closest("[data-id]");
        if (item) openMaterialView(item.dataset.id, "materials");
      });

    document
      .getElementById("related-materials")
      .addEventListener("click", event => {
        const chip = event.target.closest("[data-id]");
        if (chip) openMaterialView(chip.dataset.id, "explain");
      });

    document
      .getElementById("btn-material-view-back")
      .addEventListener("click", closeMaterialView);

    document
      .getElementById("btn-material-edit")
      .addEventListener("click", () => openMaterialEditor(viewingMaterialId));

    document
      .getElementById("btn-material-quiz")
      .addEventListener("click", startMaterialQuiz);

    document
      .getElementById("btn-material-edit-back")
      .addEventListener("click", () => {
        if (editingMaterialId) {
          openMaterialView(editingMaterialId, materialReturnScreen);
        } else {
          openMaterials();
        }
      });

    const materialImageInput = document.getElementById("material-image-input");

    document
      .getElementById("btn-material-add-image")
      .addEventListener("click", () => {
        materialImageInput.value = "";
        materialImageInput.click();
      });

    materialImageInput.addEventListener("change", async event => {
      await addEditorImages(event.target.files);
    });

    document
      .getElementById("material-image-previews")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-remove]");
        if (!button) return;

        editingMaterialImages.splice(Number(button.dataset.remove), 1);
        renderEditorImages();
      });

    document
      .getElementById("btn-material-save")
      .addEventListener("click", saveMaterialFromForm);

    document
      .getElementById("btn-material-delete")
      .addEventListener("click", deleteEditingMaterial);

    document
      .getElementById("material-view-images")
      .addEventListener("click", event => {
        const image = event.target.closest("img");
        if (image) openLightbox(image.src);
      });

    document
      .getElementById("lightbox")
      .addEventListener("click", () => {
        document.getElementById("lightbox").hidden = true;
      });


    /*
     * 出題一覧（開始前プレビュー）
     */
    document
      .getElementById("btn-preview-back")
      .addEventListener("click", () => {
        pendingDailyIds = null;
        renderHome();
      });

    document
      .getElementById("btn-preview-start")
      .addEventListener("click", startDaily);

    document
      .getElementById("btn-preview-reroll")
      .addEventListener("click", () => openDailyPreview(true));

    /*
     * 問題ごとの解説画像
     */
    const qimgInput = document.getElementById("qimg-input");

    document
      .getElementById("btn-qimg-add")
      .addEventListener("click", () => {
        qimgInput.value = "";
        qimgInput.click();
      });

    qimgInput.addEventListener("change", async event => {
      await addQuestionImages(event.target.files);
    });

    document
      .getElementById("question-images")
      .addEventListener("click", event => {
        const remove = event.target.closest("[data-remove]");
        if (remove) {
          removeQuestionImage(Number(remove.dataset.remove));
          return;
        }

        const image = event.target.closest("img");
        if (image) openLightbox(image.src);
      });

    loadMaterialsCache();
  }

  /* =========================================================
     起動
  ========================================================= */

  async function start() {
    try {
      await loadQuestions();

    } catch (error) {
      console.error(error);

      const errorElement =
        document.getElementById(
          "boot-error"
        );

      errorElement.hidden =
        false;

      errorElement.textContent =
        "問題データを読み込めませんでした。ローカルサーバー経由で開いてください。";

      return;
    }

    state =
      Storage.load();

    Quiz.init(
      questions,
      {
        onUpdate:
          persistDailyFromSession
      }
    );

    initTheme();

    bindEvents();

    renderHome();
  }

  return {
    start
  };
})();

document.addEventListener(
  "DOMContentLoaded",
  () => {
    App.start();
  }
);
