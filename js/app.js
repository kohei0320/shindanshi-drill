const App = (() => {
  let questions = [];
  let state = Storage.emptyState();
  let lastResult = null;
  let selectedSubject = null;
  let selectedCategory = null;
  let editingQuestionId = null;

  const CUSTOM_QUESTIONS_KEY = "shindanshi_drill_custom_questions";
  const THEME_KEY = "shindanshi_drill_theme";
  const STREAK_KEY = "shindanshi_drill_streak";

  const screens = {
    home: document.getElementById("screen-home"),
    subject: document.getElementById("screen-subject"),
    category: document.getElementById("screen-category"),
    favorites: document.getElementById("screen-favorites"),
    quiz: document.getElementById("screen-quiz"),
    explain: document.getElementById("screen-explain"),
    result: document.getElementById("screen-result"),
    createQuestion: document.getElementById("screen-create-question"),
    manageQuestions: document.getElementById("screen-manage-questions")
  };

  /* =========================
     セキュリティ / 共通
     ========================= */

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

  function showScreen(name) {
    Object.keys(screens).forEach(key => {
      screens[key].hidden = key !== name;
    });
    window.scrollTo(0, 0);
  }

  function getSubjectName(subjectId) {
    const subject = APP_CONFIG.subjects.find(item => item.id === subjectId);
    return subject ? subject.name : subjectId;
  }

  /* =========================
     トースト通知
     ========================= */

  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");

    if (!container) {
      window.alert(message);
      return;
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    window.requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, 3400);
  }

  /* =========================
     確認ダイアログ（カスタムモーダル）
     ========================= */

  function confirmDialog(message, options = {}) {
    return new Promise(resolve => {
      const overlay = document.getElementById("confirm-modal");

      if (!overlay) {
        resolve(window.confirm(message));
        return;
      }

      const titleEl = document.getElementById("confirm-modal-title");
      const messageEl = document.getElementById("confirm-modal-message");
      const okButton = document.getElementById("confirm-modal-ok");
      const cancelButton = document.getElementById("confirm-modal-cancel");

      titleEl.textContent = options.title || "確認";
      messageEl.textContent = message;
      okButton.textContent = options.okLabel || "OK";
      overlay.hidden = false;

      window.requestAnimationFrame(() => {
        overlay.classList.add("is-visible");
      });

      function cleanup(result) {
        overlay.classList.remove("is-visible");
        window.setTimeout(() => { overlay.hidden = true; }, 160);
        okButton.removeEventListener("click", onOk);
        cancelButton.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      }

      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlayClick(event) {
        if (event.target === overlay) cleanup(false);
      }
      function onKeydown(event) {
        if (event.key === "Escape") cleanup(false);
      }

      okButton.addEventListener("click", onOk);
      cancelButton.addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeydown);
    });
  }

  /* =========================
     テーマ（ライト／ダーク）
     ========================= */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    const button = document.getElementById("btn-theme-toggle");
    if (!button) return;

    button.textContent = theme === "dark" ? "☀️" : "🌙";
    button.setAttribute(
      "aria-label",
      theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"
    );
  }

  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    applyTheme(stored || (prefersDark ? "dark" : "light"));

    const button = document.getElementById("btn-theme-toggle");
    if (!button) return;

    button.addEventListener("click", () => {
      const next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  /* =========================
     学習ストリーク（連続学習日数）
     ========================= */

  function loadStreak() {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      if (!raw) return { lastDate: null, count: 0 };

      const parsed = JSON.parse(raw);
      return {
        lastDate: parsed?.lastDate || null,
        count: Number(parsed?.count) || 0
      };
    } catch (error) {
      return { lastDate: null, count: 0 };
    }
  }

  function saveStreak(streak) {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  }

  function dateKeyOffset(days) {
    const now = new Date();
    now.setDate(now.getDate() + days);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function updateStreak() {
    const today = todayKey();
    const streak = loadStreak();

    if (streak.lastDate === today) return streak;

    const yesterday = dateKeyOffset(-1);
    const nextCount = streak.lastDate === yesterday ? streak.count + 1 : 1;

    const next = { lastDate: today, count: nextCount };
    saveStreak(next);
    renderStreakBadge();
    return next;
  }

  function renderStreakBadge() {
    const badge = document.getElementById("streak-badge");
    const countEl = document.getElementById("streak-count");
    if (!badge || !countEl) return;

    const streak = loadStreak();
    const isActiveToday = streak.lastDate === todayKey();

    badge.hidden = streak.count === 0;
    countEl.textContent = String(streak.count);
    badge.classList.toggle("is-today", isActiveToday);
  }

  /* =========================
     自作問題
     ========================= */

  function loadCustomQuestions() {
    try {
      const raw = localStorage.getItem(CUSTOM_QUESTIONS_KEY);
      if (!raw) return [];

      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];

      const normalized = [];

      for (const item of data) {
        try {
          normalized.push(QuestionDB.normalizeQuestion(item));
        } catch (error) {
          console.warn("不正な自作問題をスキップしました:", error, item);
        }
      }

      return normalized;
    } catch (error) {
      console.error("自作問題の読み込みに失敗しました", error);
      return [];
    }
  }

  function saveCustomQuestions(customQuestions) {
    const normalized = customQuestions.map(question =>
      QuestionDB.normalizeQuestion(question)
    );
    localStorage.setItem(
      CUSTOM_QUESTIONS_KEY,
      JSON.stringify(normalized)
    );
  }

     function isCustomQuestion(question) {
     return !!(question && question.custom === true);
   }

   function getCustomQuestions() {
     return questions.filter(question => isCustomQuestion(question));
   }

   function questionById(id) {
     return questions.find(question => question.id === id);
   }

   /* =========================
      問題読み込み
      ========================= */

  async function loadQuestions() {
    questions = await QuestionDB.getAll();

    /*
     * 旧版でlocalStorageに保存されていた自作問題も救済。
     * IndexedDBを正本に寄せる。
     */
    const legacyCustom = loadCustomQuestions();

    if (legacyCustom.length) {
      await QuestionDB.putMany(legacyCustom);
      questions = await QuestionDB.getAll();
    }

    console.log(`問題を${questions.length}問読み込みました`);
  }

  /* =========================
     今日の問題
     ========================= */

  function todaysDaily() {
    if (state.daily && state.daily.date === todayKey()) {
      return state.daily;
    }
    return null;
  }

  function persistDailyFromSession(session) {
    if (!session || session.type !== "daily") return;

    if (!state.daily || state.daily.date !== todayKey()) {
      state.daily = Storage.createDailyState(session.questionIds);
    }

    state.daily.questionIds = session.questionIds;
    state.daily.currentIndex = session.currentIndex;
    state.daily.answers = session.answers;
    state.daily.completed = session.completed;

    if (session.completed) {
      Storage.saveDailyResult(state);
    }

    Storage.save(state);
  }

  function startDaily() {
    const existing = todaysDaily();

    if (existing && existing.completed) {
      renderHome();
      return;
    }

    let sessionData;

    if (existing) {
      sessionData = {
        type: "daily",
        questionIds: existing.questionIds,
        currentIndex: existing.answers.length,
        answers: existing.answers,
        completed: false
      };
    } else {
      const ids = Selector.selectQuestionIds(
        questions,
        state.history,
        {
          count: APP_CONFIG.dailyCount,
          strategy: "optimized-daily",
          filters: {}
        }
      );

      if (!ids.length) {
        showToast("出題できる問題がありません。", "error");
        return;
      }

      state.daily = Storage.createDailyState(ids);

      sessionData = {
        type: "daily",
        questionIds: ids,
        currentIndex: 0,
        answers: [],
        completed: false
      };
    }

    Quiz.start("daily", sessionData.questionIds, sessionData);
    persistDailyFromSession(Quiz.getSession());
    renderQuiz();
  }

  function startExtraDaily() {
    const daily = todaysDaily();

    if (!daily || !daily.completed) {
      startDaily();
      return;
    }

    const ids = Selector.selectQuestionIds(
      questions,
      state.history,
      {
        count: APP_CONFIG.extraCount,
        strategy: "unanswered-first",
        filters: {},
        excludeIds: daily.questionIds || []
      }
    );

    if (!ids.length) {
      showToast("出題できる問題がありません。", "error");
      return;
    }

    const oldQuestionIds = daily.questionIds || [];
    const oldAnswers = daily.answers || [];
    const newQuestionIds = [...oldQuestionIds, ...ids];

    state.daily = {
      date: todayKey(),
      questionIds: newQuestionIds,
      currentIndex: oldAnswers.length,
      answers: oldAnswers,
      completed: false,
      result: daily.result || null
    };

    Storage.save(state);

    const sessionData = {
      type: "daily",
      questionIds: newQuestionIds,
      currentIndex: oldAnswers.length,
      answers: oldAnswers,
      completed: false
    };

    Quiz.start("daily", sessionData.questionIds, sessionData);
    persistDailyFromSession(Quiz.getSession());
    renderQuiz();
  }

  /* =========================
     科目
     ========================= */

  function renderSubjects() {
    const summary = Stats.summarize(questions, state);
    const container = document.getElementById("subject-stats");

    container.innerHTML = APP_CONFIG.subjects.map(subject => {
      const item = summary.bySubject[subject.id];
      const total = item ? item.total : 0;
      const accuracy = total
        ? Math.round((item.correct / total) * 100)
        : 0;

      return `
        <button class="subject-card" type="button"
          data-subject="${escapeHtml(subject.id)}">
          <span class="subject-card-name">${escapeHtml(subject.name)}</span>
          <span class="subject-card-meta">
            ${total ? `${accuracy}% / ${total}問` : "未学習"}
          </span>
        </button>
      `;
    }).join("");
  }

  function openSubject(subjectId) {
    selectedSubject = subjectId;

    const subject = APP_CONFIG.subjects.find(item => item.id === subjectId);
    if (!subject) return;

    document.getElementById("subject-screen-title").textContent = subject.name;

    const categories = [];

    questions.forEach(question => {
      if (question.subject !== subjectId) return;

      const category = question.category || "その他";
      if (!categories.includes(category)) categories.push(category);
    });

    const summary = Stats.summarize(questions, state);
    const container = document.getElementById("category-list");

    container.innerHTML = categories.map(category => {
      const key = `${subjectId}::${category}`;
      const item = summary.byCategory[key];
      const total = item ? item.total : 0;
      const accuracy = total
        ? Math.round((item.correct / total) * 100)
        : 0;

      const questionCount = questions.filter(q =>
        q.subject === subjectId &&
        (q.category || "その他") === category
      ).length;

      return `
        <button class="category-card" type="button"
          data-category="${escapeHtml(encodeURIComponent(category))}">
          <span class="category-card-name">${escapeHtml(category)}</span>
          <span class="category-card-meta">
            ${total ? `${accuracy}% / ${total}問` : "未学習"}
            <br>
            問題数 ${questionCount}問
          </span>
        </button>
      `;
    }).join("");

    showScreen("subject");
  }

  /* =========================
     分野
     ========================= */

  function openCategory(category) {
    selectedCategory = category;

    const subject = APP_CONFIG.subjects.find(
      item => item.id === selectedSubject
    );
    if (!subject) return;

    document.getElementById("category-screen-title").textContent = category;

    const summary = Stats.summarize(questions, state);
    const key = `${selectedSubject}::${category}`;
    const item = summary.byCategory[key];
    const total = item ? item.total : 0;
    const accuracy = total
      ? Math.round((item.correct / total) * 100)
      : 0;

    const container = document.getElementById("category-detail");

    container.innerHTML = `
      <div class="category-summary">
        <p class="category-summary-subject">${escapeHtml(subject.name)}</p>
        <h2>${escapeHtml(category)}</h2>
        <p class="category-summary-stat">
          ${total ? `正答率 ${accuracy}% ／ ${total}問` : "まだ学習していません"}
        </p>
      </div>

      <button id="btn-category-10" class="btn primary" type="button">
        この分野を10問
      </button>

      <button id="btn-category-20" class="btn" type="button">
        この分野を20問
      </button>

      ${total ? `
        <button id="btn-category-weak" class="btn" type="button">
          弱点問題だけ
        </button>
      ` : ""}
    `;

    document.getElementById("btn-category-10").addEventListener(
      "click", () => startCategoryQuiz(10, false)
    );

    document.getElementById("btn-category-20").addEventListener(
      "click", () => startCategoryQuiz(20, false)
    );

    const weakButton = document.getElementById("btn-category-weak");
    if (weakButton) {
      weakButton.addEventListener(
        "click", () => startCategoryQuiz(20, true)
      );
    }

    showScreen("category");
  }

  function startCategoryQuiz(count, weakOnly) {
    const filters = {
      subject: selectedSubject,
      category: selectedCategory
    };

    const strategy = weakOnly ? "weakest-first" : "unanswered-first";

    const ids = Selector.selectQuestionIds(
      questions,
      state.history,
      { count, strategy, filters }
    );

    if (!ids.length) {
      showToast("この分野には出題できる問題がありません。", "error");
      return;
    }

    Quiz.start("category", ids, null);
    renderQuiz();
  }

  /* =========================
     弱点
     ========================= */

  function renderWeakCategories() {
    const summary = Stats.summarize(questions, state);

    const list = Object.values(summary.byCategory)
      .filter(item => item.total > 0)
      .map(item => ({
        ...item,
        accuracy: Math.round((item.correct / item.total) * 100)
      }))
      .sort((a, b) => {
        if (a.accuracy !== b.accuracy) {
          return a.accuracy - b.accuracy;
        }
        return b.total - a.total;
      })
      .slice(0, 5);

    const container = document.getElementById("weak-category-list");

    if (!list.length) {
      container.innerHTML = `<p class="note">まだ十分な学習データがありません。</p>`;
      return;
    }

    container.innerHTML = list.map(item => `
      <button class="weak-category-card" type="button"
        data-subject="${escapeHtml(item.subject)}"
        data-category="${escapeHtml(encodeURIComponent(item.category))}">
        <span>
          <strong>${escapeHtml(item.category)}</strong>
          <small>${escapeHtml(item.subjectName)}</small>
        </span>
        <span class="weak-rate">${item.accuracy}%</span>
      </button>
    `).join("");
  }

  /* =========================
     HOME
     ========================= */

  function renderHome() {
    const summary = Stats.summarize(questions, state);
    const daily = todaysDaily();

    const startButton = document.getElementById("btn-start-daily");
    const extraButton = document.getElementById("btn-extra-daily");
    const resumeNote = document.getElementById("resume-note");

    /*
     * 今日の学習はStatsではなく、当日のdailyセッション自体を正本として表示。
     * これにより20/20→40/40→60/60と追加学習にも対応し、0/0問題を防ぐ。
     */
    const todayAnswered = daily && Array.isArray(daily.answers)
      ? daily.answers.length
      : 0;
    const todayTotal = daily && Array.isArray(daily.questionIds)
      ? daily.questionIds.length
      : 0;

    document.getElementById("stat-today").textContent =
      `${todayAnswered} / ${todayTotal}問`;

    document.getElementById("stat-accuracy").textContent =
      `${summary.accuracy}%`;

    document.getElementById("stat-total").textContent =
      `${summary.total}問`;

    renderSubjects();
    renderWeakCategories();
    renderStreakBadge();

    if (daily && !daily.completed) {
      startButton.textContent = "今日の演習を再開";
      startButton.disabled = false;
      extraButton.hidden = true;
      resumeNote.hidden = false;
      resumeNote.textContent =
        `${daily.answers.length}問まで回答済みです。続きから再開できます。`;
    } else if (daily && daily.completed) {
      startButton.textContent = "今日の20問は完了";
      startButton.disabled = true;
      extraButton.hidden = false;
      extraButton.textContent =
        `追加で${Number(APP_CONFIG.extraCount) || 20}問解く`;
      extraButton.disabled = false;
      resumeNote.hidden = false;
      resumeNote.textContent =
        `本日の学習は${daily.answers.length}問完了しています。さらに学習できます。`;
    } else {
      startButton.textContent = "今日の20問を始める";
      startButton.disabled = false;
      extraButton.hidden = true;
      resumeNote.hidden = true;
    }

    document.getElementById("btn-review").disabled =
      !Selector.selectReviewIds(questions, state.history).length;

    showScreen("home");
  }

  /* =========================
     QUIZ
     ========================= */

  function renderQuiz() {
    const question = Quiz.currentQuestion();
    const session = Quiz.getSession();

    if (!question) {
      renderHome();
      return;
    }

    document.getElementById("quiz-progress").textContent =
      `${session.currentIndex + 1} / ${session.questionIds.length}`;

    const progressFill = document.getElementById("quiz-progress-fill");
    if (progressFill) {
      const percent = Math.round(
        (session.currentIndex / session.questionIds.length) * 100
      );
      progressFill.style.width = `${Math.min(100, Math.max(4, percent))}%`;
    }

    document.getElementById("quiz-meta").textContent =
      `${getSubjectName(question.subject)} ／ ${question.category || "その他"} ／ 難易度${question.difficulty}`;

    document.getElementById("quiz-question").textContent =
      question.question;

    const choices = document.getElementById("quiz-choices");
    choices.innerHTML = "";
    choices.classList.remove("answered");

    question.choices.forEach((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.index = String(index);
      button.innerHTML =
        `<span class="choice-letter">${["ア", "イ", "ウ", "エ"][index]}</span>` +
        `<span class="choice-text">${escapeHtml(label)}</span>`;
      button.addEventListener("click", () => answerQuestion(index));
      choices.appendChild(button);
    });

    renderFavoriteButton();
    showScreen("quiz");
  }

  function answerQuestion(choiceIndex) {
    const choicesContainer = document.getElementById("quiz-choices");
    if (choicesContainer.classList.contains("answered")) return;

    const submitted = Quiz.submit(choiceIndex);
    if (!submitted) return;

    Storage.recordAnswer(
      state,
      submitted.question.id,
      submitted.result.isCorrect
    );

    persistDailyFromSession(Quiz.getSession());
    Storage.save(state);
    updateStreak();

    lastResult = submitted;

    /*
     * 一瞬だけ正解／不正解を選択肢上に表示してから解説画面へ。
     */
    choicesContainer.classList.add("answered");

    choicesContainer.querySelectorAll(".choice").forEach(button => {
      const index = Number(button.dataset.index);

      if (index === submitted.question.answer) {
        button.classList.add("is-correct");
      } else if (index === choiceIndex) {
        button.classList.add("is-wrong");
      }
    });

    window.setTimeout(renderExplain, 420);
  }

  function renderFavoriteButton() {
    const button = document.getElementById("btn-favorite");
    const question = Quiz.currentQuestion();

    const on = !!(
      question &&
      Storage.isFavorite(state, question.id)
    );

    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = on ? "★" : "☆";
  }

  function toggleCurrentFavorite() {
    const question = Quiz.currentQuestion();
    if (!question) return;

    Storage.toggleFavorite(state, question.id);
    Storage.save(state);
    renderFavoriteButton();
  }

  /* =========================
     解説
     ========================= */

  function renderExplain() {
    const { question, result } = lastResult;

    const badge = document.getElementById("explain-badge");
    badge.textContent = result.isCorrect ? "正解" : "不正解";
    badge.className = result.isCorrect ? "badge ok" : "badge ng";

    document.getElementById("explain-question").textContent =
      question.question;

    document.getElementById("explain-answer").textContent =
      `正解：${["ア", "イ", "ウ", "エ"][question.answer]} ${question.choices[question.answer]}`;

    document.getElementById("explain-body").textContent =
      question.explanation ||
      "この問題の解説はまだ登録されていません。";

    const choiceSection =
      document.getElementById("choice-explanations-section");
    const choiceContainer =
      document.getElementById("choice-explanations");
    const choiceExplanations =
      question.choiceExplanations;

    if (Array.isArray(choiceExplanations) && choiceExplanations.length) {
      choiceSection.hidden = false;

      choiceContainer.innerHTML = question.choices.map((choice, index) => {
        const isCorrect = index === question.answer;
        const explanation =
          choiceExplanations[index] ||
          "この選択肢の詳しい解説はまだ登録されていません。";

        return `
          <details class="choice-explanation ${isCorrect ? "correct-choice" : "wrong-choice"}"
            ${isCorrect ? "open" : ""}>
            <summary>
              <span class="choice-label">${["ア", "イ", "ウ", "エ"][index]}</span>
              <span class="choice-text">${escapeHtml(choice)}</span>
              <span class="choice-result">${isCorrect ? "✓ 正解" : "×"}</span>
            </summary>
            <div class="choice-explanation-body">${escapeHtml(explanation).replace(/\n/g, "<br>")}</div>
          </details>
        `;
      }).join("");
    } else {
      choiceSection.hidden = true;
      choiceContainer.innerHTML = "";
    }

    const keyPointSection = document.getElementById("key-point-section");
    const keyPoint = document.getElementById("key-point");

    if (question.keyPoint) {
      keyPointSection.hidden = false;
      keyPoint.textContent = question.keyPoint;
    } else {
      keyPointSection.hidden = true;
      keyPoint.textContent = "";
    }

    const relatedSection =
      document.getElementById("related-knowledge-section");
    const relatedContainer =
      document.getElementById("related-knowledge");
    const relatedKnowledge = question.relatedKnowledge;

    if (Array.isArray(relatedKnowledge) && relatedKnowledge.length) {
      relatedSection.hidden = false;

      relatedContainer.innerHTML = relatedKnowledge.map(item => `
        <div class="related-knowledge-item">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.body).replace(/\n/g, "<br>")}</p>
        </div>
      `).join("");
    } else {
      relatedSection.hidden = true;
      relatedContainer.innerHTML = "";
    }

    const mistakeSection = document.getElementById("mistake-point-section");
    const mistakePoint = document.getElementById("mistake-point");

    if (question.mistakePoint) {
      mistakeSection.hidden = false;
      mistakePoint.textContent = question.mistakePoint;
    } else {
      mistakeSection.hidden = true;
      mistakePoint.textContent = "";
    }

    const nextButton = document.getElementById("btn-next");
    const session = Quiz.getSession();

    nextButton.textContent =
      session.currentIndex >= session.questionIds.length - 1
        ? "結果を見る"
        : "次の問題へ";

    showScreen("explain");
  }

  function goNext() {
    const session = Quiz.goNext();
    persistDailyFromSession(session);

    if (session.completed) {
      renderResult();
    } else {
      renderQuiz();
    }
  }

  function renderResult() {
    const summary = Quiz.resultSummary();

    document.getElementById("result-score").textContent =
      `${summary.correct} / ${summary.total}`;

    document.getElementById("result-accuracy").textContent =
      `正答率 ${summary.accuracy}%`;

    showScreen("result");
  }

  /* =========================
     FAVORITES
     ========================= */

  function renderFavorites() {
    const ids = Selector.selectFavoriteIds(
      questions,
      state.favorites
    );

    const empty = document.getElementById("favorites-empty");
    const quizButton = document.getElementById("btn-favorites-quiz");
    const list = document.getElementById("favorites-list");

    empty.hidden = ids.length > 0;
    quizButton.disabled = ids.length === 0;

    list.innerHTML = ids.map(id => {
      const question = questionById(id);
      if (!question) return "";

      return `
        <li>
          <button class="favorite-item" type="button"
            data-id="${escapeHtml(question.id)}">
            <span class="fav-subject">
              ${escapeHtml(getSubjectName(question.subject))}
              ／
              ${escapeHtml(question.category || "その他")}
            </span>
            ${escapeHtml(question.question)}
          </button>
        </li>
      `;
    }).join("");

    showScreen("favorites");
  }

  /* =========================
     自作問題フォーム
     ========================= */

  function populateSubjectSelect() {
    const select = document.getElementById("create-subject");

    select.innerHTML = `<option value="">選択してください</option>`;

    APP_CONFIG.subjects.forEach(subject => {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = subject.name;
      select.appendChild(option);
    });
  }

  function clearQuestionForm() {
    editingQuestionId = null;
    populateSubjectSelect();

    document.getElementById("create-subject").value = "";
    document.getElementById("create-category").value = "";
    document.getElementById("create-difficulty").value = "2";
    document.getElementById("create-question").value = "";

    for (let i = 0; i < 4; i++) {
      document.getElementById(`create-choice-${i}`).value = "";
      document.getElementById(`create-choice-explanation-${i}`).value = "";
    }

    document.getElementById("create-answer").value = "0";
    document.getElementById("create-explanation").value = "";
    document.getElementById("create-key-point").value = "";
    document.getElementById("create-related").value = "";

    document.getElementById("create-screen-title").textContent = "問題を作成";
    document.getElementById("create-form-heading").textContent = "新しい問題";
    document.getElementById("btn-save-question").textContent = "問題を保存";
    document.getElementById("btn-delete-editing-question").hidden = true;
  }

  function openCreateQuestion() {
    clearQuestionForm();
    showScreen("createQuestion");
  }

  function openEditQuestion(id) {
    const question = questionById(id);

    if (!question || !isCustomQuestion(question)) {
      showToast("この問題は編集できません。", "error");
      return;
    }

    editingQuestionId = id;
    populateSubjectSelect();

    document.getElementById("create-subject").value = question.subject || "";
    document.getElementById("create-category").value = question.category || "";
    document.getElementById("create-difficulty").value =
      String(question.difficulty || 2);
    document.getElementById("create-question").value =
      question.question || "";

    for (let i = 0; i < 4; i++) {
      document.getElementById(`create-choice-${i}`).value =
        question.choices?.[i] || "";
      document.getElementById(`create-choice-explanation-${i}`).value =
        question.choiceExplanations?.[i] || "";
    }

    document.getElementById("create-answer").value =
      String(question.answer ?? 0);
    document.getElementById("create-explanation").value =
      question.explanation || "";
    document.getElementById("create-key-point").value =
      question.keyPoint || "";
    document.getElementById("create-related").value =
      Array.isArray(question.relatedKnowledge)
        ? question.relatedKnowledge.map(item => item.body || "").join("\n")
        : "";

    document.getElementById("create-screen-title").textContent = "問題を編集";
    document.getElementById("create-form-heading").textContent = "自作問題を編集";
    document.getElementById("btn-save-question").textContent = "変更を保存";
    document.getElementById("btn-delete-editing-question").hidden = false;

    showScreen("createQuestion");
  }

  function buildQuestionFromForm(existing = null) {
    const subject = document.getElementById("create-subject").value;
    const category = document.getElementById("create-category").value.trim();
    const difficulty = Number(
      document.getElementById("create-difficulty").value
    );
    const questionText =
      document.getElementById("create-question").value.trim();

    const choices = [0, 1, 2, 3].map(index =>
      document.getElementById(`create-choice-${index}`).value.trim()
    );

    const answer = Number(
      document.getElementById("create-answer").value
    );

    const explanation =
      document.getElementById("create-explanation").value.trim();

    const choiceExplanations = [0, 1, 2, 3].map(index =>
      document.getElementById(
        `create-choice-explanation-${index}`
      ).value.trim()
    );

    const keyPoint =
      document.getElementById("create-key-point").value.trim();

    const relatedText =
      document.getElementById("create-related").value.trim();

    if (!subject) {
      showToast("科目を選択してください。", "error");
      return null;
    }
    if (!category) {
      showToast("分野を入力してください。", "error");
      return null;
    }
    if (!questionText) {
      showToast("問題文を入力してください。", "error");
      return null;
    }
    if (choices.some(choice => !choice)) {
      showToast("4つの選択肢をすべて入力してください。", "error");
      return null;
    }

    const relatedKnowledge = relatedText
      ? relatedText.split("\n")
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => ({ title: "", body: line }))
      : [];

    const now = new Date().toISOString();

    return QuestionDB.normalizeQuestion({
      ...(existing || {}),
      id: existing?.id || `custom-${Date.now()}`,
      year: existing?.year || new Date().getFullYear(),
      subject,
      category,
      difficulty,
      question: questionText,
      choices,
      answer,
      explanation,
      choiceExplanations,
      keyPoint,
      relatedKnowledge,
      mistakePoint: existing?.mistakePoint || "",
      custom: true,
      sourceType: existing?.sourceType || "manual",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      importedAt: existing?.importedAt || null
    });
  }

  async function saveNewQuestion() {
    try {
      const existing = editingQuestionId
        ? questionById(editingQuestionId)
        : null;

      const newQuestion = buildQuestionFromForm(existing);
      if (!newQuestion) return;

      await QuestionDB.put(newQuestion);
      questions = await QuestionDB.getAll();

      /*
       * 旧版localStorageも更新して互換性を維持。
       */
      const customQuestions = loadCustomQuestions()
        .filter(item => item.id !== newQuestion.id);

      customQuestions.push(newQuestion);
      saveCustomQuestions(customQuestions);

      showToast(editingQuestionId ? "問題を更新しました。" : "問題を保存しました。", "success");

      editingQuestionId = null;
      clearQuestionForm();
      renderHome();
    } catch (error) {
      console.error("問題の保存に失敗しました", error);
      showToast(`問題の保存に失敗しました。${error.message}`, "error");
    }
  }

  /* =========================
     自作問題削除
     ========================= */

  async function deleteQuestion(id) {
    const question = questionById(id);

    if (!question || !isCustomQuestion(question)) {
      showToast("削除できる自作問題ではありません。", "error");
      return;
    }

    const confirmed = await confirmDialog(
      question.question,
      { title: "この問題を削除しますか？", okLabel: "削除する" }
    );

    if (!confirmed) return;

    try {
      await QuestionDB.remove(id);

      const customQuestions = loadCustomQuestions()
        .filter(item => item.id !== id);

      saveCustomQuestions(customQuestions);

      questions = questions.filter(item => item.id !== id);

      if (state.history && state.history[id]) {
        delete state.history[id];
      }

      if (Array.isArray(state.favorites)) {
        state.favorites = state.favorites.filter(
          favoriteId => favoriteId !== id
        );
      }

      Storage.save(state);

      showToast("問題を削除しました。", "success");

      editingQuestionId = null;
      renderManageQuestions();
    } catch (error) {
      console.error("問題の削除に失敗しました", error);
      showToast(`問題の削除に失敗しました。${error.message}`, "error");
    }
  }

  /* =========================
     自作問題管理
     ========================= */

  function renderManageQuestions() {
    const customQuestions = getCustomQuestions();
    const countElement = document.getElementById("custom-question-count");
    const searchInput = document.getElementById("custom-question-search");
    const keyword = (searchInput.value || "").trim().toLowerCase();
    const container = document.getElementById("custom-question-list");

    countElement.textContent = `${customQuestions.length}問`;

    const filtered = customQuestions.filter(question => {
      if (!keyword) return true;

      const subjectName = getSubjectName(question.subject);
      const text = [
        question.question,
        question.category,
        subjectName,
        question.explanation,
        question.keyPoint
      ].filter(Boolean).join(" ").toLowerCase();

      return text.includes(keyword);
    });

    if (!customQuestions.length) {
      container.innerHTML = `
        <div class="empty-custom-questions">
          <p>自作問題はまだありません。</p>
          <p class="note">
            「＋ 新しい問題を作成」または「AI問題を一括インポート」から追加できます。
          </p>
        </div>
      `;
      showScreen("manageQuestions");
      return;
    }

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-custom-questions">
          <p>「${escapeHtml(keyword)}」に一致する問題はありません。</p>
        </div>
      `;
      showScreen("manageQuestions");
      return;
    }

    /* 科目 → 分野 → 問題。初期状態はすべて折りたたむ。 */
    const subjectGroups = new Map();

    filtered.forEach(question => {
      const subjectId = question.subject || "unknown";
      const category = question.category || "その他";

      if (!subjectGroups.has(subjectId)) {
        subjectGroups.set(subjectId, new Map());
      }

      const categoryGroups = subjectGroups.get(subjectId);
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }

      categoryGroups.get(category).push(question);
    });

    const subjectOrder = APP_CONFIG.subjects.map(subject => subject.id);

    const orderedSubjectGroups = Array.from(subjectGroups.entries())
      .sort((a, b) => {
        const ai = subjectOrder.indexOf(a[0]);
        const bi = subjectOrder.indexOf(b[0]);
        if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "ja");
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    container.innerHTML = orderedSubjectGroups.map(([subjectId, categoryGroups]) => {
      const subjectTotal = Array.from(categoryGroups.values())
        .reduce((sum, items) => sum + items.length, 0);

      const categoryHtml = Array.from(categoryGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ja"))
        .map(([category, items]) => `
          <details class="custom-category-group">
            <summary class="custom-category-summary">
              <span class="custom-category-name">${escapeHtml(category)}</span>
              <span class="custom-category-count">${items.length}問</span>
            </summary>

            <div class="custom-category-questions">
              ${items.map(question => `
                <article class="custom-question-card">
                  <div class="custom-question-meta">
                    <span>難易度${escapeHtml(question.difficulty || 2)}</span>
                    ${question.year ? `<span>${escapeHtml(question.year)}年</span>` : ""}
                  </div>

                  <h3 class="custom-question-title">
                    ${escapeHtml(question.question)}
                  </h3>

                  <div class="custom-question-actions">
                    <button type="button" class="btn small-btn edit-custom-question" data-id="${escapeHtml(question.id)}">
                      編集
                    </button>
                    <button type="button" class="btn small-btn danger delete-custom-question" data-id="${escapeHtml(question.id)}">
                      削除
                    </button>
                  </div>
                </article>
              `).join("")}
            </div>
          </details>
        `).join("");

      return `
        <details class="custom-subject-group">
          <summary class="custom-subject-summary">
            <span>
              <strong>${escapeHtml(getSubjectName(subjectId))}</strong>
              <small>${subjectTotal}問</small>
            </span>
            <span class="custom-subject-chevron">⌄</span>
          </summary>
          <div class="custom-subject-categories">
            ${categoryHtml}
          </div>
        </details>
      `;
    }).join("");

    showScreen("manageQuestions");
  }

  /* =========================
     自作問題を全クリア
     ========================= */

  async function clearAllCustomQuestions() {
    const customQuestions = getCustomQuestions();

    if (!customQuestions.length) {
      showToast("削除する自作問題はありません。", "info");
      return;
    }

    const confirmed = await confirmDialog(
      `${customQuestions.length}問が削除されます。この操作は元に戻せません。`,
      { title: "自作問題をすべて削除しますか？", okLabel: "すべて削除" }
    );

    if (!confirmed) return;

    try {
      for (const question of customQuestions) {
        await QuestionDB.remove(question.id);
      }

      localStorage.removeItem(CUSTOM_QUESTIONS_KEY);

      const customIds = new Set(customQuestions.map(question => question.id));
      questions = questions.filter(question => !customIds.has(question.id));

      if (state.history) {
        customQuestions.forEach(question => {
          delete state.history[question.id];
        });
      }

      if (Array.isArray(state.favorites)) {
        state.favorites = state.favorites.filter(id => !customIds.has(id));
      }

      if (state.daily && Array.isArray(state.daily.questionIds)) {
        state.daily.questionIds = state.daily.questionIds.filter(id => !customIds.has(id));
        state.daily.answers = Array.isArray(state.daily.answers)
          ? state.daily.answers.filter(answer => {
              const id = answer?.questionId || answer?.id;
              return !customIds.has(id);
            })
          : [];
        state.daily.currentIndex = state.daily.answers.length;
      }

      Storage.save(state);
      editingQuestionId = null;

      showToast(`${customQuestions.length}問の自作問題を削除しました。`, "success");
      renderManageQuestions();
    } catch (error) {
      console.error("自作問題の全削除に失敗しました", error);
      showToast(`自作問題の全削除に失敗しました。${error.message}`, "error");
    }
  }

  /* =========================
     AI問題JSONインポート
     ========================= */

  async function importQuestionsFromFile(file) {
    if (!file) return;

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("JSONファイルが大きすぎます。5MB以下にしてください。");
      }

      const text = await file.text();

      if (text.length > 5 * 1024 * 1024) {
        throw new Error("JSONデータが大きすぎます。5MB以下にしてください。");
      }

      const data = JSON.parse(text);

      const importedQuestions = Array.isArray(data)
        ? data
        : data?.questions;

      if (!Array.isArray(importedQuestions)) {
        throw new Error("questions配列が見つかりません。");
      }

      if (!importedQuestions.length) {
        throw new Error("問題が0問です。");
      }

      if (importedQuestions.length > 1000) {
        throw new Error("一度に取り込める問題は1000問までです。");
      }

      /*
       * ここでJSONスキーマを統一。
       * HTML文字列は保存せず、表示時にもescapeHtmlする。
       */
      const normalized = importedQuestions.map((question, index) => {
        const now = new Date().toISOString();

        return QuestionDB.normalizeQuestion({
          ...question,
          id: question.id || `ai-${Date.now()}-${index}`,
          custom: true,
          sourceType: "ai",
          importedAt: now,
          createdAt: question.createdAt || now
        });
      });

      await QuestionDB.putMany(normalized);

      questions = await QuestionDB.getAll();

      /*
       * 旧版localStorageからIndexedDBへ移行済みなら、
       * AI問題も互換用localStorageへ反映。
       */
      const customQuestions = loadCustomQuestions();

      const map = new Map(
        customQuestions.map(question => [question.id, question])
      );

      normalized.forEach(question => {
        map.set(question.id, question);
      });

      saveCustomQuestions(Array.from(map.values()));

      showToast(
        `${normalized.length}問を取り込みました。現在の総問題数：${questions.length}問`,
        "success"
      );

      renderManageQuestions();
    } catch (error) {
      console.error("AI問題のインポートに失敗しました", error);

      showToast(`問題の読み込みに失敗しました。${error.message}`, "error");
    }
  }

  /* =========================
     復習
     ========================= */

  function startReview() {
    const ids = Selector.selectReviewIds(
      questions,
      state.history
    );

    if (!ids.length) {
      showToast("復習できる間違えた問題はまだありません。", "info");
      return;
    }

    Quiz.start("review", ids, null);
    renderQuiz();
  }

  /* =========================
     お気に入り演習
     ========================= */

  function startFavoriteSession(ids) {
    if (!ids.length) {
      showToast("お気に入りの問題はまだありません。", "info");
      return;
    }

    Quiz.start("favorite", ids, null);
    renderQuiz();
  }

  /* =========================
     イベント
     ========================= */

  function bindEvents() {
    /*
     * キーボードショートカット：
     * 問題画面では数字キー1〜4で選択肢を回答、
     * 解説画面ではEnter／スペースで次の問題へ。
     */
    document.addEventListener("keydown", event => {
      const tag = (event.target && event.target.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      if (!screens.quiz.hidden) {
        const indexMap = { "1": 0, "2": 1, "3": 2, "4": 3 };
        if (indexMap[event.key] === undefined) return;

        const choicesContainer = document.getElementById("quiz-choices");
        if (choicesContainer.classList.contains("answered")) return;

        const button = choicesContainer.querySelector(
          `[data-index="${indexMap[event.key]}"]`
        );
        if (button) button.click();
        return;
      }

      if (!screens.explain.hidden) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          document.getElementById("btn-next").click();
        }
      }
    });

    document.getElementById("btn-start-daily")
      .addEventListener("click", startDaily);

    document.getElementById("btn-extra-daily")
      .addEventListener("click", startExtraDaily);

    document.getElementById("btn-review")
      .addEventListener("click", startReview);

    document.getElementById("btn-favorites")
      .addEventListener("click", renderFavorites);

    document.getElementById("btn-create-question")
      .addEventListener("click", openCreateQuestion);

    document.getElementById("btn-manage-questions")
      .addEventListener("click", renderManageQuestions);

    document.getElementById("btn-manage-back")
      .addEventListener("click", renderHome);

    document.getElementById("btn-create-from-manage")
      .addEventListener("click", openCreateQuestion);

    const clearAllButton = document.getElementById("btn-clear-all-custom-questions");
    if (clearAllButton) {
      clearAllButton.addEventListener("click", clearAllCustomQuestions);
    }

    document.getElementById("custom-question-search")
      .addEventListener("input", renderManageQuestions);

    document.getElementById("custom-question-list")
      .addEventListener("click", event => {
        const editButton = event.target.closest(".edit-custom-question");
        if (editButton) {
          openEditQuestion(editButton.dataset.id);
          return;
        }

        const deleteButton = event.target.closest(".delete-custom-question");
        if (deleteButton) {
          deleteQuestion(deleteButton.dataset.id);
        }
      });

    document.getElementById("subject-stats")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-subject]");
        if (button) openSubject(button.dataset.subject);
      });

    document.getElementById("category-list")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-category]");
        if (button) {
          openCategory(
            decodeURIComponent(button.dataset.category)
          );
        }
      });

    document.getElementById("weak-category-list")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-category]");
        if (!button) return;

        selectedSubject = button.dataset.subject;

        openCategory(
          decodeURIComponent(button.dataset.category)
        );
      });

    document.getElementById("btn-subject-back")
      .addEventListener("click", renderHome);

    document.getElementById("btn-category-back")
      .addEventListener("click", () => openSubject(selectedSubject));

    document.getElementById("btn-favorites-back")
      .addEventListener("click", renderHome);

    document.getElementById("btn-create-question-back")
      .addEventListener("click", () => {
        editingQuestionId = null;
        renderHome();
      });

    document.getElementById("btn-favorites-quiz")
      .addEventListener("click", () => {
        startFavoriteSession(
          Selector.selectFavoriteIds(questions, state.favorites)
        );
      });

    document.getElementById("favorites-list")
      .addEventListener("click", event => {
        const button = event.target.closest("[data-id]");
        if (button) {
          startFavoriteSession([button.getAttribute("data-id")]);
        }
      });

    document.getElementById("btn-favorite")
      .addEventListener("click", toggleCurrentFavorite);

    document.getElementById("btn-next")
      .addEventListener("click", goNext);

    document.getElementById("btn-home")
      .addEventListener("click", renderHome);

    document.getElementById("btn-back-home")
      .addEventListener("click", () => {
        const session = Quiz.getSession();
        persistDailyFromSession(session);

        if (session && session.type === "favorite") {
          renderFavorites();
        } else {
          renderHome();
        }
      });

    document.getElementById("btn-save-question")
      .addEventListener("click", saveNewQuestion);

    document.getElementById("btn-delete-editing-question")
      .addEventListener("click", () => {
        if (editingQuestionId) {
          deleteQuestion(editingQuestionId);
        }
      });

    /*
     * AI JSONインポート
     */
    const importFile = document.getElementById("question-import-file");
    const importButton = document.getElementById("btn-import-questions");

    importButton.addEventListener("click", () => {
      importFile.value = "";
      importFile.click();
    });

    importFile.addEventListener("change", async event => {
      const file = event.target.files?.[0];
      await importQuestionsFromFile(file);
    });
  }

  /* =========================
     Start
     ========================= */

  async function start() {
    try {
      await loadQuestions();
    } catch (error) {
      console.error(error);

      const errorElement = document.getElementById("boot-error");
      errorElement.hidden = false;
      errorElement.textContent =
        "問題データを読み込めませんでした。ローカルサーバー経由で開いてください。";
      return;
    }

    state = Storage.load();

    Quiz.init(questions, {
      onUpdate: persistDailyFromSession
    });

    initTheme();
    bindEvents();
    renderHome();
  }

  return { start };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.start();
});
