const App = (() => {

  let questions = [];

  let state =
    Storage.emptyState();

  let lastResult = null;

  let selectedSubject = null;

  let selectedCategory = null;

  let editingQuestionId = null;


  /*
   * 旧バージョンで使用していた
   * localStorageのキー
   *
   * 今後はIndexedDBを正規の保存先とする。
   */
  const LEGACY_CUSTOM_QUESTIONS_KEY =
    "shindanshi_drill_custom_questions";


  const screens = {

    home:
      document.getElementById(
        "screen-home"
      ),

    subject:
      document.getElementById(
        "screen-subject"
      ),

    category:
      document.getElementById(
        "screen-category"
      ),

    favorites:
      document.getElementById(
        "screen-favorites"
      ),

    quiz:
      document.getElementById(
        "screen-quiz"
      ),

    explain:
      document.getElementById(
        "screen-explain"
      ),

    result:
      document.getElementById(
        "screen-result"
      ),

    createQuestion:
      document.getElementById(
        "screen-create-question"
      ),

    manageQuestions:
      document.getElementById(
        "screen-manage-questions"
      )

  };


  /* =========================
     共通
     ========================= */

  function showScreen(name) {

    Object.keys(screens).forEach(
      (key) => {

        screens[key].hidden =
          key !== name;

      }
    );


    window.scrollTo(
      0,
      0
    );

  }


  function getSubjectName(
    subjectId
  ) {

    const subject =
      APP_CONFIG.subjects.find(
        (item) =>
          item.id === subjectId
      );


    return subject
      ? subject.name
      : subjectId;

  }


  /* =========================
     自作問題
     ========================= */

  function getCustomQuestions() {

    return questions.filter(
      (question) =>
        question &&
        question.custom === true
    );

  }


  function isCustomQuestion(
    question
  ) {

    return !!(
      question &&
      question.custom === true
    );

  }


  function questionById(
    id
  ) {

    return questions.find(
      (question) =>
        question.id === id
    );

  }


  /* =========================
     旧localStorage問題の移行
     ========================= */

  async function migrateLegacyCustomQuestions() {

    try {

      const raw =
        localStorage.getItem(
          LEGACY_CUSTOM_QUESTIONS_KEY
        );


      if (!raw) {

        return 0;

      }


      const legacyQuestions =
        JSON.parse(raw);


      if (
        !Array.isArray(
          legacyQuestions
        ) ||
        !legacyQuestions.length
      ) {

        localStorage.removeItem(
          LEGACY_CUSTOM_QUESTIONS_KEY
        );

        return 0;

      }


      /*
       * 既にIndexedDBに存在するIDは
       * 上書きせずスキップする。
       */

      const existingIds =
        new Set(
          questions.map(
            (question) =>
              question.id
          )
        );


      const migrationQuestions =
        legacyQuestions
          .filter(
            (question) =>
              question &&
              question.id &&
              !existingIds.has(
                question.id
              )
          )
          .map(
            (question) => ({

              ...question,

              custom: true,

              migratedAt:
                new Date().toISOString()

            })
          );


      if (
        migrationQuestions.length
      ) {

        await QuestionDB.putMany(
          migrationQuestions
        );

      }


      /*
       * 移行後はIndexedDBを正とする。
       */

      localStorage.removeItem(
        LEGACY_CUSTOM_QUESTIONS_KEY
      );


      /*
       * 問題一覧を再取得
       */

      questions =
        await QuestionDB.getAll();


      console.log(
        `旧自作問題を${migrationQuestions.length}問IndexedDBへ移行しました`
      );


      return (
        migrationQuestions.length
      );

    } catch (error) {

      console.error(
        "旧自作問題の移行に失敗しました",
        error
      );


      /*
       * 移行に失敗した場合は
       * localStorageを削除しない。
       */

      return 0;

    }

  }


  /* =========================
     問題読み込み
     ========================= */

  async function loadQuestions() {

    try {

      questions =
        await QuestionDB.getAll();


      console.log(
        `問題を${questions.length}問読み込みました`
      );


    } catch (error) {

      console.error(
        "問題データの読み込みに失敗しました",
        error
      );


      throw error;

    }

  }


  /* =========================
     今日の問題
     ========================= */

  function todaysDaily() {

    if (
      state.daily &&
      state.daily.date ===
        todayKey()
    ) {

      return state.daily;

    }


    return null;

  }


  function persistDailyFromSession(
    session
  ) {

    if (
      !session ||
      session.type !== "daily"
    ) {

      return;

    }


    if (
      !state.daily ||
      state.daily.date !==
        todayKey()
    ) {

      state.daily =
        Storage.createDailyState(
          session.questionIds
        );

    }


    state.daily.questionIds =
      session.questionIds;


    state.daily.currentIndex =
      session.currentIndex;


    state.daily.answers =
      session.answers;


    state.daily.completed =
      session.completed;


    if (
      session.completed
    ) {

      Storage.saveDailyResult(
        state
      );

    }


    Storage.save(
      state
    );

  }


  function startDaily() {

    const existing =
      todaysDaily();


    if (
      existing &&
      existing.completed
    ) {

      renderHome();

      return;

    }


    let sessionData;


    if (existing) {

      sessionData = {

        type: "daily",

        questionIds:
          existing.questionIds,

        currentIndex:
          existing.answers.length,

        answers:
          existing.answers,

        completed:
          false

      };

    } else {

      const ids =
        Selector.selectQuestionIds(
          questions,
          state.history,
          {

            count:
              APP_CONFIG.dailyCount,

            strategy:
              "optimized-daily",

            filters: {}

          }
        );


      if (!ids.length) {

        alert(
          "出題できる問題がありません。"
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

        currentIndex: 0,

        answers: [],

        completed: false

      };

    }


    Quiz.start(
      "daily",
      sessionData.questionIds,
      sessionData
    );


    persistDailyFromSession(
      Quiz.getSession()
    );


    renderQuiz();

  }


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
      Selector.selectQuestionIds(
        questions,
        state.history,
        {

          count:
            APP_CONFIG.extraCount,

          strategy:
            "unanswered-first",

          filters: {},

          excludeIds:
            daily.questionIds || []

        }
      );


    if (!ids.length) {

      alert(
        "出題できる問題がありません。"
      );

      return;

    }


    const oldQuestionIds =
      daily.questionIds || [];


    const oldAnswers =
      daily.answers || [];


    const newQuestionIds = [

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

      completed: false,

      result:
        daily.result || null

    };


    Storage.save(
      state
    );


    const sessionData = {

      type: "daily",

      questionIds:
        newQuestionIds,

      currentIndex:
        oldAnswers.length,

      answers:
        oldAnswers,

      completed: false

    };


    Quiz.start(
      "daily",
      sessionData.questionIds,
      sessionData
    );


    persistDailyFromSession(
      Quiz.getSession()
    );


    renderQuiz();

  }


  /* =========================
     科目
     ========================= */

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
        .map(
          (subject) => {

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
                    (
                      item.correct /
                      total
                    ) * 100
                  )
                : 0;


            return `

              <button
                class="subject-card"
                type="button"
                data-subject="${subject.id}"
              >

                <span
                  class="subject-card-name"
                >
                  ${subject.name}
                </span>


                <span
                  class="subject-card-meta"
                >
                  ${
                    total
                      ? `${accuracy}% / ${total}問`
                      : "未学習"
                  }
                </span>

              </button>

            `;

          }
        )
        .join("");

  }


  function openSubject(
    subjectId
  ) {

    selectedSubject =
      subjectId;


    const subject =
      APP_CONFIG.subjects.find(
        (item) =>
          item.id === subjectId
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
      (question) => {

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
          categories.indexOf(
            category
          ) < 0
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
        .map(
          (category) => {

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
                    (
                      item.correct /
                      total
                    ) * 100
                  )
                : 0;


            const questionCount =
              questions.filter(
                (q) =>
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
                data-category="${encodeURIComponent(category)}"
              >

                <span
                  class="category-card-name"
                >
                  ${category}
                </span>


                <span
                  class="category-card-meta"
                >
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

          }
        )
        .join("");


    showScreen(
      "subject"
    );

  }


  /* =========================
     分野
     ========================= */

  function openCategory(
    category
  ) {

    selectedCategory =
      category;


    const subject =
      APP_CONFIG.subjects.find(
        (item) =>
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
            (
              item.correct /
              total
            ) * 100
          )
        : 0;


    const container =
      document.getElementById(
        "category-detail"
      );


    container.innerHTML = `

      <div class="category-summary">

        <p
          class="category-summary-subject"
        >
          ${subject.name}
        </p>


        <h2>
          ${category}
        </h2>


        <p
          class="category-summary-stat"
        >
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
        type="button"
      >
        この分野を10問
      </button>


      <button
        id="btn-category-20"
        class="btn"
        type="button"
      >
        この分野を20問
      </button>


      ${
        total
          ? `

            <button
              id="btn-category-weak"
              class="btn"
              type="button"
            >
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


    showScreen(
      "category"
    );

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

      alert(
        "この分野には出題できる問題がありません。"
      );

      return;

    }


    Quiz.start(
      "category",
      ids,
      null
    );


    renderQuiz();

  }


  /* =========================
     弱点
     ========================= */

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
          (item) =>
            item.total > 0
        )
        .map(
          (item) => {

            const accuracy =
              Math.round(
                (
                  item.correct /
                  item.total
                ) * 100
              );


            return {

              ...item,

              accuracy

            };

          }
        )
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
        .slice(
          0,
          5
        );


    const container =
      document.getElementById(
        "weak-category-list"
      );


    if (!list.length) {

      container.innerHTML = `

        <p class="note">
          まだ十分な学習データがありません。
        </p>

      `;

      return;

    }


    container.innerHTML =
      list
        .map(
          (item) => {

            return `

              <button
                class="weak-category-card"
                type="button"
                data-subject="${item.subject}"
                data-category="${encodeURIComponent(item.category)}"
              >

                <span>

                  <strong>
                    ${item.category}
                  </strong>

                  <small>
                    ${item.subjectName}
                  </small>

                </span>


                <span
                  class="weak-rate"
                >
                  ${item.accuracy}%
                </span>

              </button>

            `;

          }
        )
        .join("");

  }


  /* =========================
     HOME
     ========================= */

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


    document.getElementById(
      "stat-today"
    ).textContent =
      daily
        ? `${summary.todayAnswered} / ${summary.todayTotal}問`
        : "未開始";


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
        `${daily.answers.length}問まで回答済みです。続きから再開できます。`;

    } else if (
      daily &&
      daily.completed
    ) {

      startButton.textContent =
        "今日の20問は完了";


      startButton.disabled =
        true;


      extraButton.hidden =
        false;


      extraButton.textContent =
        `追加で${Number(APP_CONFIG.extraCount) || 20}問解く`;


      extraButton.disabled =
        false;


      resumeNote.hidden =
        false;


      resumeNote.textContent =
        `本日の学習は${daily.answers.length}問完了しています。さらに学習できます。`;

    } else {

      startButton.textContent =
        "今日の20問を始める";


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


    showScreen(
      "home"
    );

  }


  /* =========================
     QUIZ
     ========================= */

  function renderQuiz() {

    const question =
      Quiz.currentQuestion();


    const session =
      Quiz.getSession();


    if (!question) {

      renderHome();

      return;

    }


    document.getElementById(
      "quiz-progress"
    ).textContent =
      `${session.currentIndex + 1} / ${session.questionIds.length}`;


    document.getElementById(
      "quiz-meta"
    ).textContent =
      `${getSubjectName(question.subject)} ／ ${question.category || "その他"} ／ 難易度${question.difficulty}`;


    document.getElementById(
      "quiz-question"
    ).textContent =
      question.question;


    const choices =
      document.getElementById(
        "quiz-choices"
      );


    choices.innerHTML =
      "";


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


        button.textContent =
          `${["ア", "イ", "ウ", "エ"][index]} ${label}`;


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


    showScreen(
      "quiz"
    );

  }


  function answerQuestion(
    choiceIndex
  ) {

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


    Storage.save(
      state
    );


    lastResult =
      submitted;


    renderExplain();

  }


  function renderFavoriteButton() {

    const button =
      document.getElementById(
        "btn-favorite"
      );


    const question =
      Quiz.currentQuestion();


    const on = !!(
      question &&
      Storage.isFavorite(
        state,
        question.id
      )
    );


    button.classList.toggle(
      "on",
      on
    );


    button.setAttribute(
      "aria-pressed",
      on
        ? "true"
        : "false"
    );


    button.textContent =
      on
        ? "★"
        : "☆";

  }


  function toggleCurrentFavorite() {

    const question =
      Quiz.currentQuestion();


    if (!question) {

      return;

    }


    Storage.toggleFavorite(
      state,
      question.id
    );


    Storage.save(
      state
    );


    renderFavoriteButton();

  }


  /* =========================
     解説
     ========================= */

  function renderExplain() {

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
        ? "正解"
        : "不正解";


    badge.className =
      result.isCorrect
        ? "badge ok"
        : "badge ng";


    document.getElementById(
      "explain-question"
    ).textContent =
      question.question;


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
                  }
                >

                  <summary>

                    <span
                      class="choice-label"
                    >
                      ${
                        ["ア", "イ", "ウ", "エ"][
                          index
                        ]
                      }
                    </span>


                    <span
                      class="choice-text"
                    >
                      ${choice}
                    </span>


                    <span
                      class="choice-result"
                    >
                      ${
                        isCorrect
                          ? "✓ 正解"
                          : "×"
                      }
                    </span>

                  </summary>


                  <div
                    class="choice-explanation-body"
                  >
                    ${explanation}
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
            (item) => `

              <div
                class="related-knowledge-item"
              >

                <h4>
                  ${item.title || ""}
                </h4>

                <p>
                  ${item.body || ""}
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


    showScreen(
      "explain"
    );

  }


  function goNext() {

    const session =
      Quiz.goNext();


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


    showScreen(
      "result"
    );

  }


  /* =========================
     FAVORITES
     ========================= */

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
        .map(
          (id) => {

            const question =
              questionById(
                id
              );


            if (!question) {

              return "";

            }


            return `

              <li>

                <button
                  class="favorite-item"
                  type="button"
                  data-id="${question.id}"
                >

                  <span
                    class="fav-subject"
                  >
                    ${getSubjectName(question.subject)}
                    ／
                    ${question.category || "その他"}
                  </span>


                  ${question.question}

                </button>

              </li>

            `;

          }
        )
        .join("");


    showScreen(
      "favorites"
    );

  }


  /* =========================
     自作問題フォーム
     ========================= */

  function populateSubjectSelect() {

    const select =
      document.getElementById(
        "create-subject"
      );


    select.innerHTML = `

      <option value="">
        選択してください
      </option>

    `;


    APP_CONFIG.subjects.forEach(
      (subject) => {

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


  function openEditQuestion(
    id
  ) {

    const question =
      questionById(
        id
      );


    if (
      !question ||
      !isCustomQuestion(
        question
      )
    ) {

      alert(
        "この問題は編集できません。"
      );

      return;

    }


    editingQuestionId =
      id;


    populateSubjectSelect();


    document.getElementById(
      "create-subject"
    ).value =
      question.subject || "";


    document.getElementById(
      "create-category"
    ).value =
      question.category || "";


    document.getElementById(
      "create-difficulty"
    ).value =
      String(
        question.difficulty || 2
      );


    document.getElementById(
      "create-question"
    ).value =
      question.question || "";


    for (
      let i = 0;
      i < 4;
      i++
    ) {

      document.getElementById(
        `create-choice-${i}`
      ).value =
        (
          question.choices &&
          question.choices[i]
        ) || "";


      document.getElementById(
        `create-choice-explanation-${i}`
      ).value =
        (
          question.choiceExplanations &&
          question.choiceExplanations[i]
        ) || "";

    }


    document.getElementById(
      "create-answer"
    ).value =
      String(
        Number.isInteger(
          question.answer
        )
          ? question.answer
          : 0
      );


    document.getElementById(
      "create-explanation"
    ).value =
      question.explanation || "";


    document.getElementById(
      "create-key-point"
    ).value =
      question.keyPoint || "";


    document.getElementById(
      "create-related"
    ).value =
      Array.isArray(
        question.relatedKnowledge
      )
        ? question.relatedKnowledge
            .map(
              (item) =>
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


  /* =========================
     問題入力
     ========================= */

  async function saveNewQuestion() {

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


    const choices = [
      0,
      1,
      2,
      3
    ].map(
      (index) =>
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


    const choiceExplanations = [
      0,
      1,
      2,
      3
    ].map(
      (index) =>
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


    /* =========================
       入力チェック
       ========================= */

    if (!subject) {

      alert(
        "科目を選択してください。"
      );

      return;

    }


    if (!category) {

      alert(
        "分野を入力してください。"
      );

      return;

    }


    if (!questionText) {

      alert(
        "問題文を入力してください。"
      );

      return;

    }


    if (
      choices.some(
        (choice) =>
          !choice
      )
    ) {

      alert(
        "4つの選択肢をすべて入力してください。"
      );

      return;

    }


    if (
      !Number.isInteger(
        answer
      ) ||
      answer < 0 ||
      answer > 3
    ) {

      alert(
        "正解を正しく選択してください。"
      );

      return;

    }


    /* =========================
       関連知識
       ========================= */

    const relatedKnowledge =
      relatedText
        ? relatedText
            .split("\n")
            .map(
              (line) =>
                line.trim()
            )
            .filter(Boolean)
            .map(
              (line) => ({

                title: "",

                body: line

              })
            )
        : [];


    /* =========================
       編集
       ========================= */

    if (
      editingQuestionId
    ) {

      const oldQuestion =
        questionById(
          editingQuestionId
        );


      if (
        !oldQuestion ||
        !isCustomQuestion(
          oldQuestion
        )
      ) {

        alert(
          "編集対象の問題が見つかりません。"
        );

        return;

      }


      const updatedQuestion = {

        ...oldQuestion,

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

        updatedAt:
          new Date().toISOString()

      };


      try {

        await QuestionDB.put(
          updatedQuestion
        );


        const appIndex =
          questions.findIndex(
            (question) =>
              question.id ===
              editingQuestionId
          );


        if (
          appIndex >= 0
        ) {

          questions[
            appIndex
          ] =
            updatedQuestion;

        }


        alert(
          "問題を更新しました。"
        );


        editingQuestionId =
          null;


        renderManageQuestions();

      } catch (error) {

        console.error(
          "問題更新エラー",
          error
        );


        alert(
          "問題の更新に失敗しました。\n\n" +
          error.message
        );

      }


      return;

    }


    /* =========================
       新規作成
       ========================= */

    const newQuestion = {

      id:
        `custom-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      year:
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

      custom: true,

      sourceType:
        "manual",

      createdAt:
        new Date().toISOString()

    };


    try {

      /*
       * IndexedDBへ保存
       */

      await QuestionDB.put(
        newQuestion
      );


      /*
       * アプリ内にも追加
       */

      questions.push(
        newQuestion
      );


      alert(
        "問題を保存しました。"
      );


      clearQuestionForm();


      renderHome();

    } catch (error) {

      console.error(
        "問題保存エラー",
        error
      );


      alert(
        "問題の保存に失敗しました。\n\n" +
        error.message
      );

    }

  }


  /* =========================
     自作問題削除
     ========================= */

  async function deleteQuestion(
    id
  ) {

    const question =
      questionById(
        id
      );


    if (
      !question ||
      !isCustomQuestion(
        question
      )
    ) {

      alert(
        "削除できる自作問題ではありません。"
      );

      return;

    }


    const confirmed =
      window.confirm(
        `この問題を削除しますか？\n\n${question.question}`
      );


    if (!confirmed) {

      return;

    }


    try {

      /*
       * IndexedDBから削除
       */

      await QuestionDB.remove(
        id
      );


      /*
       * アプリ内から削除
       */

      questions =
        questions.filter(
          (item) =>
            item.id !== id
        );


      /*
       * 履歴からも削除
       */

      if (
        state.history &&
        state.history[id]
      ) {

        delete state.history[id];

      }


      /*
       * お気に入りからも削除
       */

      if (
        Array.isArray(
          state.favorites
        )
      ) {

        state.favorites =
          state.favorites.filter(
            (favoriteId) =>
              favoriteId !== id
          );

      }


      /*
       * dailyに含まれていた場合
       */

      if (
        state.daily &&
        Array.isArray(
          state.daily.questionIds
        )
      ) {

        state.daily.questionIds =
          state.daily.questionIds.filter(
            (questionId) =>
              questionId !== id
          );

      }


      Storage.save(
        state
      );


      alert(
        "問題を削除しました。"
      );


      /*
       * 編集画面から削除した場合は
       * 管理画面へ戻す
       */

      editingQuestionId =
        null;


      renderManageQuestions();

    } catch (error) {

      console.error(
        "問題削除エラー",
        error
      );


      alert(
        "問題の削除に失敗しました。\n\n" +
        error.message
      );

    }

  }


  /* =========================
     自作問題管理
     ========================= */

  function renderManageQuestions() {

    const customQuestions =
      getCustomQuestions();


    const countElement =
      document.getElementById(
        "custom-question-count"
      );


    countElement.textContent =
      `${customQuestions.length}問`;


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


    const filtered =
      customQuestions.filter(
        (question) => {

          if (!keyword) {

            return true;

          }


          const subjectName =
            getSubjectName(
              question.subject
            );


          const text = [

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


    const container =
      document.getElementById(
        "custom-question-list"
      );


    if (
      !customQuestions.length
    ) {

      container.innerHTML = `

        <div
          class="empty-custom-questions"
        >

          <p>
            自作問題はまだありません。
          </p>


          <p class="note">
            「＋ 新しい問題を作成」から
            問題を追加できます。
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

        <div
          class="empty-custom-questions"
        >

          <p>
            「${keyword}」に一致する問題はありません。
          </p>

        </div>

      `;


      showScreen(
        "manageQuestions"
      );


      return;

    }


    container.innerHTML =
      filtered
        .map(
          (question) => {

            return `

              <article
                class="custom-question-card"
              >

                <div
                  class="custom-question-meta"
                >

                  <span>
                    ${getSubjectName(
                      question.subject
                    )}
                  </span>


                  <span>
                    ${question.category || "その他"}
                  </span>


                  <span>
                    難易度${question.difficulty || 2}
                  </span>

                </div>


                <h3
                  class="custom-question-title"
                >
                  ${question.question}
                </h3>


                <div
                  class="custom-question-actions"
                >

                  <button
                    type="button"
                    class="btn small-btn edit-custom-question"
                    data-id="${question.id}"
                  >
                    編集
                  </button>


                  <button
                    type="button"
                    class="btn small-btn danger delete-custom-question"
                    data-id="${question.id}"
                  >
                    削除
                  </button>

                </div>

              </article>

            `;

          }
        )
        .join("");


    showScreen(
      "manageQuestions"
    );

  }


  /* =========================
     AI問題JSONインポート
     ========================= */

  function normalizeImportedQuestion(
    question,
    index
  ) {

    if (
      !question ||
      typeof question !==
        "object"
    ) {

      throw new Error(
        `${index + 1}問目のデータが不正です。`
      );

    }


    if (
      !question.subject
    ) {

      throw new Error(
        `${index + 1}問目：科目がありません。`
      );

    }


    if (
      !question.category
    ) {

      throw new Error(
        `${index + 1}問目：分野がありません。`
      );

    }


    if (
      !question.question
    ) {

      throw new Error(
        `${index + 1}問目：問題文がありません。`
      );

    }


    if (
      !Array.isArray(
        question.choices
      ) ||
      question.choices.length !== 4
    ) {

      throw new Error(
        `${index + 1}問目：選択肢は4つ必要です。`
      );

    }


    if (
      !Number.isInteger(
        question.answer
      ) ||
      question.answer < 0 ||
      question.answer > 3
    ) {

      throw new Error(
        `${index + 1}問目：正解番号が不正です。`
      );

    }


    const id =
      question.id ||
      `ai-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;


    return {

      ...question,

      id,

      custom: true,

      sourceType:
        question.sourceType ||
        "ai",

      importedAt:
        new Date().toISOString()

    };

  }


  async function importQuestionsFromFile(
    file
  ) {

    if (!file) {

      return;

    }


    try {

      const text =
        await file.text();


      const data =
        JSON.parse(
          text
        );


      const importedQuestions =
        Array.isArray(data)
          ? data
          : data.questions;


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


      /*
       * 既存IDを取得
       */

      const existingIds =
        new Set(
          questions.map(
            (question) =>
              question.id
          )
        );


      /*
       * JSONを正規化
       */

      const normalized =
        importedQuestions.map(
          (
            question,
            index
          ) => {

            const normalizedQuestion =
              normalizeImportedQuestion(
                question,
                index
              );


            /*
             * IDが既存の場合は
             * 上書きする。
             *
             * 新規IDなら追加する。
             */

            return normalizedQuestion;

          }
        );


      /*
       * IndexedDBへ保存
       */

      await QuestionDB.putMany(
        normalized
      );


      /*
       * 問題一覧を再取得
       */

      questions =
        await QuestionDB.getAll();


      const newCount =
        normalized.filter(
          (question) =>
            !existingIds.has(
              question.id
            )
        ).length;


      const updateCount =
        normalized.length -
        newCount;


      alert(

        `${normalized.length}問を取り込みました。\n\n` +

        `新規追加：${newCount}問\n` +

        `更新：${updateCount}問\n\n` +

        `現在の総問題数：${questions.length}問`

      );


      renderHome();


    } catch (error) {

      console.error(
        "AI問題のインポートに失敗しました",
        error
      );


      alert(

        "問題の読み込みに失敗しました。\n\n" +

        error.message

      );

    }

  }


  /* =========================
     復習
     ========================= */

  function startReview() {

    const ids =
      Selector.selectReviewIds(
        questions,
        state.history
      );


    if (!ids.length) {

      alert(
        "復習できる間違えた問題はまだありません。"
      );

      return;

    }


    Quiz.start(
      "review",
      ids,
      null
    );


    renderQuiz();

  }


  /* =========================
     お気に入り演習
     ========================= */

  function startFavoriteSession(
    ids
  ) {

    if (!ids.length) {

      alert(
        "お気に入りの問題はまだありません。"
      );

      return;

    }


    Quiz.start(
      "favorite",
      ids,
      null
    );


    renderQuiz();

  }


  /* =========================
     イベント
     ========================= */

  function bindEvents() {

    /* =========================
       今日の20問
       ========================= */

    document.getElementById(
      "btn-start-daily"
    ).addEventListener(
      "click",
      startDaily
    );


    document.getElementById(
      "btn-extra-daily"
    ).addEventListener(
      "click",
      startExtraDaily
    );


    /* =========================
       復習
       ========================= */

    document.getElementById(
      "btn-review"
    ).addEventListener(
      "click",
      startReview
    );


    /* =========================
       お気に入り
       ========================= */

    document.getElementById(
      "btn-favorites"
    ).addEventListener(
      "click",
      renderFavorites
    );


    /* =========================
       問題作成
       ========================= */

    document.getElementById(
      "btn-create-question"
    ).addEventListener(
      "click",
      openCreateQuestion
    );


    /* =========================
       自作問題管理
       ========================= */

    document.getElementById(
      "btn-manage-questions"
    ).addEventListener(
      "click",
      renderManageQuestions
    );


    document.getElementById(
      "btn-manage-back"
    ).addEventListener(
      "click",
      renderHome
    );


    document.getElementById(
      "btn-create-from-manage"
    ).addEventListener(
      "click",
      openCreateQuestion
    );


    /* =========================
       自作問題検索
       ========================= */

    document.getElementById(
      "custom-question-search"
    ).addEventListener(
      "input",
      renderManageQuestions
    );


    /* =========================
       自作問題一覧
       ========================= */

    document.getElementById(
      "custom-question-list"
    ).addEventListener(
      "click",
      (event) => {

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


    /* =========================
       AI問題インポート
       ========================= */

    document.getElementById(
      "btn-import-questions"
    ).addEventListener(
      "click",
      () => {

        document.getElementById(
          "question-import-file"
        ).click();

      }
    );


    document.getElementById(
      "question-import-file"
    ).addEventListener(
      "change",
      async (event) => {

        const file =
          event.target.files &&
          event.target.files[0];


        if (!file) {

          return;

        }


        await importQuestionsFromFile(
          file
        );


        /*
         * 同じJSONファイルを
         * 再度選択できるようにする
         */

        event.target.value =
          "";

      }
    );


    /* =========================
       科目
       ========================= */

    document.getElementById(
      "subject-stats"
    ).addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-subject]"
          );


        if (!button) {

          return;

        }


        openSubject(
          button.dataset.subject
        );

      }
    );


    /* =========================
       分野
       ========================= */

    document.getElementById(
      "category-list"
    ).addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-category]"
          );


        if (!button) {

          return;

        }


        openCategory(
          decodeURIComponent(
            button.dataset.category
          )
        );

      }
    );


    /* =========================
       弱点分野
       ========================= */

    document.getElementById(
      "weak-category-list"
    ).addEventListener(
      "click",
      (event) => {

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


    /* =========================
       戻る
       ========================= */

    document.getElementById(
      "btn-subject-back"
    ).addEventListener(
      "click",
      renderHome
    );


    document.getElementById(
      "btn-category-back"
    ).addEventListener(
      "click",
      () =>
        openSubject(
          selectedSubject
        )
    );


    document.getElementById(
      "btn-favorites-back"
    ).addEventListener(
      "click",
      renderHome
    );


    document.getElementById(
      "btn-create-question-back"
    ).addEventListener(
      "click",
      () => {

        editingQuestionId =
          null;


        renderHome();

      }
    );


    /* =========================
       お気に入り演習
       ========================= */

    document.getElementById(
      "btn-favorites-quiz"
    ).addEventListener(
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


    document.getElementById(
      "favorites-list"
    ).addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-id]"
          );


        if (!button) {

          return;

        }


        startFavoriteSession([
          button.getAttribute(
            "data-id"
          )
        ]);

      }
    );


    /* =========================
       問題画面お気に入り
       ========================= */

    document.getElementById(
      "btn-favorite"
    ).addEventListener(
      "click",
      toggleCurrentFavorite
    );


    /* =========================
       次へ
       ========================= */

    document.getElementById(
      "btn-next"
    ).addEventListener(
      "click",
      goNext
    );


    /* =========================
       ホーム
       ========================= */

    document.getElementById(
      "btn-home"
    ).addEventListener(
      "click",
      renderHome
    );


    document.getElementById(
      "btn-back-home"
    ).addEventListener(
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


    /* =========================
       保存
       ========================= */

    document.getElementById(
      "btn-save-question"
    ).addEventListener(
      "click",
      saveNewQuestion
    );


    /* =========================
       編集中の削除
       ========================= */

    document.getElementById(
      "btn-delete-editing-question"
    ).addEventListener(
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

  }


  /* =========================
     Start
     ========================= */

  async function start() {

    try {

      /*
       * IndexedDBから問題を読み込む
       */

      await loadQuestions();


      /*
       * 旧バージョンの
       * localStorage自作問題を移行
       */

      await migrateLegacyCustomQuestions();


    } catch (error) {

      console.error(
        error
      );


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


    /*
     * 学習状態を読み込む
     */

    state =
      Storage.load();


    /*
     * Quiz初期化
     */

    Quiz.init(
      questions,
      {
        onUpdate:
          persistDailyFromSession
      }
    );


    /*
     * イベント登録
     */

    bindEvents();


    /*
     * ホーム表示
     */

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