const App = (() => {

  "use strict";


  /* =========================================================
     State
     ========================================================= */

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

        /* =========================
     問題データ共通処理
     ========================= */

  /*
   * 旧科目ID → 現行科目ID
   *
   * 以前の問題データでは
   * A～G が使われていたため、
   * IndexedDBに残っている古いデータも
   * アプリ側で自動的に正規化する。
   */
  const SUBJECT_ID_ALIASES = Object.freeze({
    A: "economics",
    B: "finance",
    C: "management",
    D: "operations",
    E: "legal",
    F: "info",
    G: "sme"
  });


  /*
   * HTML/XSS対策
   *
   * AI生成問題の内容をinnerHTMLへ
   * 直接入れないためのエスケープ。
   */
  function escapeHTML(value) {

    return String(
      value == null
        ? ""
        : value
    )
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  }


  /*
   * 科目IDを現行形式へ統一
   */
  function normalizeSubjectId(subjectId) {

    if (
      typeof subjectId !== "string"
    ) {

      return "";

    }

    const value =
      subjectId.trim();

    if (!value) {

      return "";

    }

    return (
      SUBJECT_ID_ALIASES[value] ||
      value
    );

  }


  /*
   * 現在のAPP_CONFIGに存在する
   * 正式な科目IDか確認
   */
  function isValidSubjectId(
    subjectId
  ) {

    const normalized =
      normalizeSubjectId(
        subjectId
      );

    return APP_CONFIG.subjects.some(
      (subject) =>
        subject.id === normalized
    );

  }


  /*
   * 問題JSONを統一スキーマへ正規化
   */
  function normalizeQuestionRecord(
    question,
    index = 0,
    options = {}
  ) {

    if (
      !question ||
      typeof question !== "object" ||
      Array.isArray(question)
    ) {

      throw new Error(
        `${index + 1}問目のデータが不正です。`
      );

    }


    const subject =
      normalizeSubjectId(
        question.subject
      );


    if (
      !subject ||
      !isValidSubjectId(subject)
    ) {

      if (
        options.allowInvalidSubject ===
        true
      ) {

        return null;

      }

      throw new Error(
        `${index + 1}問目：存在しない科目IDです「${question.subject}」。`
      );

    }


    const category =
      typeof question.category ===
      "string"
        ? question.category.trim()
        : "";


    const questionText =
      typeof question.question ===
      "string"
        ? question.question.trim()
        : "";


    if (!category) {

      throw new Error(
        `${index + 1}問目：分野がありません。`
      );

    }


    if (!questionText) {

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


    const choices =
      question.choices.map(
        (choice) =>
          typeof choice === "string"
            ? choice.trim()
            : String(
                choice == null
                  ? ""
                  : choice
              ).trim()
      );


    if (
      choices.some(
        (choice) =>
          !choice
      )
    ) {

      throw new Error(
        `${index + 1}問目：4つの選択肢をすべて入力してください。`
      );

    }


    const answer =
      Number(
        question.answer
      );


    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 3
    ) {

      throw new Error(
        `${index + 1}問目：正解番号が不正です。`
      );

    }


    const difficulty =
      Number(
        question.difficulty
      );


    const normalizedDifficulty =
      Number.isInteger(
        difficulty
      ) &&
      difficulty >= 1 &&
      difficulty <= 5
        ? difficulty
        : 2;


    const choiceExplanations =
      Array.isArray(
        question.choiceExplanations
      )
        ? [0, 1, 2, 3].map(
            (i) =>
              typeof question.choiceExplanations[i] ===
              "string"
                ? question.choiceExplanations[i]
                : ""
          )
        : ["", "", "", ""];


    const relatedKnowledge =
      Array.isArray(
        question.relatedKnowledge
      )
        ? question.relatedKnowledge
            .filter(
              (item) =>
                item &&
                typeof item === "object"
            )
            .map(
              (item) => ({
                title:
                  typeof item.title ===
                  "string"
                    ? item.title
                    : "",
                body:
                  typeof item.body ===
                  "string"
                    ? item.body
                    : ""
              })
            )
            .filter(
              (item) =>
                item.title ||
                item.body
            )
        : [];


    return {

      id:
        typeof question.id === "string" &&
        question.id.trim()
          ? question.id.trim()
          : `ai-${Date.now()}-${index}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,

      year:
        Number.isInteger(
          Number(question.year)
        )
          ? Number(question.year)
          : new Date().getFullYear(),

      subject,

      category,

      difficulty:
        normalizedDifficulty,

      question:
        questionText,

      choices,

      answer,

      explanation:
        typeof question.explanation ===
        "string"
          ? question.explanation
          : "",

      choiceExplanations,

      keyPoint:
        typeof question.keyPoint ===
        "string"
          ? question.keyPoint
          : "",

      relatedKnowledge,

      mistakePoint:
        typeof question.mistakePoint ===
        "string"
          ? question.mistakePoint
          : "",

      custom:
        question.custom === true,

      sourceType:
        typeof question.sourceType ===
        "string"
          ? question.sourceType
          : "original",

      createdAt:
        typeof question.createdAt ===
        "string"
          ? question.createdAt
          : new Date().toISOString(),

      ...(question.updatedAt
        ? {
            updatedAt:
              question.updatedAt
          }
        : {}),

      ...(question.importedAt
        ? {
            importedAt:
              question.importedAt
          }
        : {})

    };

  }
  /* =========================================================
     Screen
     ========================================================= */

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


  /* =========================================================
     共通
     ========================================================= */

  function showScreen(name) {

    Object.keys(screens).forEach(
      (key) => {

        if (screens[key]) {

          screens[key].hidden =
            key !== name;

        }

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


  /*
   * =========================================================
   * XSS対策
   *
   * ユーザー入力・AI生成データなどを
   * innerHTMLへ入れる場合に必ず使用する。
   * =========================================================
   */

  function escapeHTML(
    value
  ) {

    if (
      value === null ||
      value === undefined
    ) {

      return "";

    }


    return String(value)
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#39;"
      );

  }


  /*
   * data属性などへ埋め込む値も
   * escapeHTML()を通す。
   */

  function safeAttribute(
    value
  ) {

    return escapeHTML(
      value
    );

  }


  /*
   * innerHTMLで改行を表示したい場合
   *
   * HTMLとして解釈されない状態で
   * 改行だけbrへ変換する。
   */

  function escapeHTMLWithBreaks(
    value
  ) {

    return escapeHTML(
      value
    ).replace(
      /\r?\n/g,
      "<br>"
    );

  }


  /* =========================================================
     自作問題
     ========================================================= */

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


  /* =========================================================
     JSONスキーマ関連
     ========================================================= */

  /*
   * アプリ内で使用する問題データの標準形。
   *
   * AI生成JSON
   * 自作問題
   * 旧データ
   *
   * すべて最終的にはこの形にする。
   */

  function createNormalizedQuestion(
    source,
    options = {}
  ) {

    const question =
      source || {};


    const now =
      new Date().toISOString();


    const normalized = {

      id:
        String(
          question.id ||
          `custom-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`
        ),

      year:
        Number.isInteger(
          Number(question.year)
        )
          ? Number(question.year)
          : new Date().getFullYear(),

      subject:
        String(
          question.subject ||
          ""
        ),

      category:
        String(
          question.category ||
          "その他"
        ).trim(),

      difficulty:
        Number.isInteger(
          Number(question.difficulty)
        )
          ? Number(question.difficulty)
          : 2,

      question:
        String(
          question.question ||
          ""
        ).trim(),

      choices:
        Array.isArray(
          question.choices
        )
          ? question.choices
              .slice(0, 4)
              .map(
                (choice) =>
                  String(
                    choice ??
                    ""
                  ).trim()
              )
          : ["", "", "", ""],

      answer:
        Number.isInteger(
          Number(question.answer)
        )
          ? Number(question.answer)
          : 0,

      explanation:
        String(
          question.explanation ||
          ""
        ).trim(),

      choiceExplanations:
        Array.isArray(
          question.choiceExplanations
        )
          ? [
              0,
              1,
              2,
              3
            ].map(
              (index) =>
                String(
                  question
                    .choiceExplanations[
                      index
                    ] ??
                    ""
                ).trim()
            )
          : ["", "", "", ""],

      keyPoint:
        String(
          question.keyPoint ||
          ""
        ).trim(),

      relatedKnowledge:
        normalizeRelatedKnowledge(
          question.relatedKnowledge
        ),

      mistakePoint:
        String(
          question.mistakePoint ||
          ""
        ).trim(),

      custom:
        options.custom !== undefined
          ? options.custom
          : !!question.custom,

      sourceType:
        String(
          question.sourceType ||
          (
            options.sourceType ||
            "manual"
          )
        ),

      createdAt:
        question.createdAt ||
        now,

      updatedAt:
        question.updatedAt ||
        now,

      importedAt:
        question.importedAt ||
        undefined

    };


    /*
     * undefinedプロパティを削除
     */

    Object.keys(
      normalized
    ).forEach(
      (key) => {

        if (
          normalized[key] ===
          undefined
        ) {

          delete normalized[key];

        }

      }
    );


    return normalized;

  }


  function normalizeRelatedKnowledge(
    value
  ) {

    if (
      !Array.isArray(value)
    ) {

      return [];

    }


    return value
      .map(
        (item) => {

          if (
            typeof item ===
            "string"
          ) {

            return {

              title: "",

              body:
                item.trim()

            };

          }


          if (
            item &&
            typeof item ===
            "object"
          ) {

            return {

              title:
                String(
                  item.title ||
                  ""
                ).trim(),

              body:
                String(
                  item.body ||
                  ""
                ).trim()

            };

          }


          return null;

        }
      )
      .filter(
        (item) =>
          item &&
          item.body
      );

  }


  /*
   * JSONインポート時の厳格な検証
   */

  function validateQuestionSchema(
    question,
    index = 0
  ) {

    const label =
      `${index + 1}問目`;


    if (
      !question ||
      typeof question !==
        "object" ||
      Array.isArray(question)
    ) {

      throw new Error(
        `${label}：問題データがオブジェクトではありません。`
      );

    }


    /*
     * subject
     */

    if (
      typeof question.subject !==
      "string" ||
      !question.subject.trim()
    ) {

      throw new Error(
        `${label}：subjectがありません。`
      );

    }


    const subjectExists =
      APP_CONFIG.subjects.some(
        (subject) =>
          subject.id ===
          question.subject
      );


    if (!subjectExists) {

      throw new Error(
        `${label}：存在しない科目IDです「${question.subject}」。`
      );

    }


    /*
     * category
     */

    if (
      typeof question.category !==
      "string" ||
      !question.category.trim()
    ) {

      throw new Error(
        `${label}：categoryがありません。`
      );

    }


    /*
     * question
     */

    if (
      typeof question.question !==
      "string" ||
      !question.question.trim()
    ) {

      throw new Error(
        `${label}：questionがありません。`
      );

    }


    /*
     * choices
     */

    if (
      !Array.isArray(
        question.choices
      ) ||
      question.choices.length !== 4
    ) {

      throw new Error(
        `${label}：choicesは4個必要です。`
      );

    }


    question.choices.forEach(
      (choice, choiceIndex) => {

        if (
          typeof choice !==
            "string" ||
          !choice.trim()
        ) {

          throw new Error(
            `${label}：選択肢${choiceIndex + 1}が空です。`
          );

        }

      }
    );


    /*
     * answer
     */

    if (
      !Number.isInteger(
        question.answer
      ) ||
      question.answer < 0 ||
      question.answer > 3
    ) {

      throw new Error(
        `${label}：answerは0～3の整数で指定してください。`
      );

    }


    /*
     * difficulty
     */

    if (
      !Number.isInteger(
        question.difficulty
      ) ||
      question.difficulty < 1 ||
      question.difficulty > 5
    ) {

      throw new Error(
        `${label}：difficultyは1～5の整数で指定してください。`
      );

    }


    /*
     * explanation
     */

    if (
      question.explanation !==
        undefined &&
      typeof question.explanation !==
        "string"
    ) {

      throw new Error(
        `${label}：explanationは文字列で指定してください。`
      );

    }


    /*
     * choiceExplanations
     *
     * 存在する場合は4個
     */

    if (
      question.choiceExplanations !==
        undefined
    ) {

      if (
        !Array.isArray(
          question.choiceExplanations
        ) ||
        question.choiceExplanations.length !==
          4
      ) {

        throw new Error(
          `${label}：choiceExplanationsは4個必要です。`
        );

      }


      question.choiceExplanations.forEach(
        (
          explanation,
          explanationIndex
        ) => {

          if (
            typeof explanation !==
            "string"
          ) {

            throw new Error(
              `${label}：choiceExplanations[${explanationIndex}]は文字列で指定してください。`
            );

          }

        }
      );

    }


    /*
     * keyPoint
     */

    if (
      question.keyPoint !==
        undefined &&
      typeof question.keyPoint !==
        "string"
    ) {

      throw new Error(
        `${label}：keyPointは文字列で指定してください。`
      );

    }


    /*
     * relatedKnowledge
     */

    if (
      question.relatedKnowledge !==
        undefined
    ) {

      if (
        !Array.isArray(
          question.relatedKnowledge
        )
      ) {

        throw new Error(
          `${label}：relatedKnowledgeは配列で指定してください。`
        );

      }


      question.relatedKnowledge.forEach(
        (
          item,
          relatedIndex
        ) => {

          if (
            !item ||
            typeof item !==
              "object" ||
            Array.isArray(item)
          ) {

            throw new Error(
              `${label}：relatedKnowledge[${relatedIndex}]が不正です。`
            );

          }


          if (
            item.title !==
              undefined &&
            typeof item.title !==
              "string"
          ) {

            throw new Error(
              `${label}：relatedKnowledge[${relatedIndex}].titleは文字列で指定してください。`
            );

          }


          if (
            item.body !==
              undefined &&
            typeof item.body !==
              "string"
          ) {

            throw new Error(
              `${label}：relatedKnowledge[${relatedIndex}].bodyは文字列で指定してください。`
            );

          }

        }
      );

    }


    /*
     * year
     */

    if (
      question.year !==
        undefined &&
      (
        !Number.isInteger(
          question.year
        ) ||
        question.year < 1900 ||
        question.year > 2100
      )
    ) {

      throw new Error(
        `${label}：yearが不正です。`
      );

    }


    return true;

  }


  /*
   * インポート用正規化
   */

  function normalizeImportedQuestion(
    question,
    index
  ) {

    /*
     * まず入力そのものを検証
     */

    validateQuestionSchema(
      question,
      index
    );


    /*
     * アプリ標準形へ変換
     */

    const normalized =
      createNormalizedQuestion(
        question,
        {
          custom: true,
          sourceType:
            question.sourceType ||
            "ai"
        }
      );


    /*
     * 再度、正規化後のデータを
     * 検証する。
     */

    validateQuestionSchema(
      normalized,
      index
    );


    return normalized;

  }


  /* =========================================================
     旧localStorage問題の移行
     ========================================================= */

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
        JSON.parse(
          raw
        );


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
            (question) => {

              /*
               * 旧データについては
               * 可能な範囲で標準形へ変換する。
               */

              return createNormalizedQuestion(
                question,
                {
                  custom: true,
                  sourceType:
                    question.sourceType ||
                    "manual"
                }
              );

            }
          );


      if (
        migrationQuestions.length
      ) {

        await QuestionDB.putMany(
          migrationQuestions
        );

      }


      /*
       * 移行成功後のみ削除
       */

      localStorage.removeItem(
        LEGACY_CUSTOM_QUESTIONS_KEY
      );


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
       * 失敗した場合は
       * localStorageを削除しない。
       */

      return 0;

    }

  }


  /* =========================================================
     問題読み込み
     ========================================================= */

     async function loadQuestions() {

      try {
  
        const storedQuestions =
          await QuestionDB.getAll();
  
  
        if (
          !Array.isArray(
            storedQuestions
          )
        ) {
  
          questions = [];
  
          return;
  
        }
  
  
        const normalizedQuestions = [];
  
        const questionsToUpdate = [];
  
        let convertedCount = 0;
  
        let skippedCount = 0;
  
  
        storedQuestions.forEach(
          (
            question,
            index
          ) => {
  
            try {
  
              const normalized =
                normalizeQuestionRecord(
                  question,
                  index,
                  {
                    allowInvalidSubject:
                      true
                  }
                );
  
  
              /*
               * 不正な問題は
               * アプリの演習対象から除外
               */
              if (!normalized) {
  
                skippedCount++;
  
                return;
  
              }
  
  
              normalizedQuestions.push(
                normalized
              );
  
  
              /*
               * A～Gなど旧形式から
               * 変更された場合はDBも更新
               */
              if (
                JSON.stringify(
                  normalized
                ) !==
                JSON.stringify(
                  question
                )
              ) {
  
                questionsToUpdate.push(
                  normalized
                );
  
                convertedCount++;
  
              }
  
            } catch (error) {
  
              console.warn(
                "問題データをスキップしました",
                question,
                error
              );
  
              skippedCount++;
  
            }
  
          }
        );
  
  
        /*
         * 正規化された問題をIndexedDBへ保存
         */
        if (
          questionsToUpdate.length
        ) {
  
          await QuestionDB.putMany(
            questionsToUpdate
          );
  
        }
  
  
        questions =
          normalizedQuestions;
  
  
        console.log(
          `問題を${questions.length}問読み込みました`
        );
  
  
        if (convertedCount) {
  
          console.log(
            `旧形式の問題を${convertedCount}問正規化しました`
          );
  
        }
  
  
        if (skippedCount) {
  
          console.warn(
            `不正な問題${skippedCount}問を演習対象から除外しました`
          );
  
        }
  
  
      } catch (error) {
  
        console.error(
          "問題データの読み込みに失敗しました",
          error
        );
  
        throw error;
  
      }
  
    }

  /* =========================================================
     今日の問題
     ========================================================= */

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
                data-subject="${safeAttribute(subject.id)}"
              >

                <span
                  class="subject-card-name"
                >
                  ${escapeHTML(subject.name)}
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
                data-category="${safeAttribute(
                  encodeURIComponent(category)
                )}"
              >

                <span
                  class="category-card-name"
                >
                  ${escapeHTML(category)}
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


  /* =========================================================
     分野
     ========================================================= */

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
          ${escapeHTML(subject.name)}
        </p>


        <h2>
          ${escapeHTML(category)}
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


  /* =========================================================
     弱点
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
                data-subject="${safeAttribute(
                  item.subject
                )}"
                data-category="${safeAttribute(
                  encodeURIComponent(
                    item.category
                  )
                )}"
              >

                <span>

                  <strong>
                    ${escapeHTML(item.category)}
                  </strong>

                  <small>
                    ${escapeHTML(item.subjectName)}
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


  /* =========================================================
     HOME
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


  /* =========================================================
     QUIZ
     ========================================================= */

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


    /*
     * 問題文はtextContentを使用。
     *
     * HTMLとして解釈されないため
     * XSS対策になる。
     */

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


  /* =========================================================
     解説
     ========================================================= */

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


    /*
     * 問題文はtextContent
     */

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


    /*
     * 解説本文もtextContent
     */

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


      /*
       * innerHTMLを使用するが、
       * 問題データはすべてescapeHTML()を通す。
       */

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
                      ${escapeHTML(choice)}
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
                    ${escapeHTMLWithBreaks(
                      explanation
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
            (item) => `

              <div
                class="related-knowledge-item"
              >

                <h4>
                  ${escapeHTML(
                    item.title || ""
                  )}
                </h4>

                <p>
                  ${escapeHTMLWithBreaks(
                    item.body || ""
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


  /* =========================================================
     FAVORITES
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
                  data-id="${safeAttribute(
                    question.id
                  )}"
                >

                  <span
                    class="fav-subject"
                  >
                    ${escapeHTML(
                      getSubjectName(
                        question.subject
                      )
                    )}
                    ／
                    ${escapeHTML(
                      question.category ||
                      "その他"
                    )}
                  </span>


                  ${escapeHTML(
                    question.question
                  )}

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


  /* =========================================================
     自作問題フォーム
     ========================================================= */

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


  /* =========================================================
     問題入力
     ========================================================= */

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


    /* =====================================================
       入力チェック
       ===================================================== */

    if (!subject) {

      alert(
        "科目を選択してください。"
      );

      return;

    }


    const subjectExists =
      APP_CONFIG.subjects.some(
        (item) =>
          item.id === subject
      );


    if (!subjectExists) {

      alert(
        "存在しない科目が指定されています。"
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
        difficulty
      ) ||
      difficulty < 1 ||
      difficulty > 5
    ) {

      alert(
        "難易度は1～5で指定してください。"
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


    /* =====================================================
       関連知識
       ===================================================== */

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


    /* =====================================================
       編集
       ===================================================== */

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


      const updatedQuestion =
        createNormalizedQuestion(
          {

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

            custom: true,

            sourceType:
              oldQuestion.sourceType ||
              "manual",

            updatedAt:
              new Date().toISOString()

          },
          {
            custom: true,

            sourceType:
              oldQuestion.sourceType ||
              "manual"
          }
        );


      try {

        /*
         * IndexedDBへ保存
         */

        await QuestionDB.put(
          updatedQuestion
        );


        /*
         * アプリ内も更新
         */

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


    /* =====================================================
       新規作成
       ===================================================== */

    const newQuestion =
      createNormalizedQuestion(
        {

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

        },
        {
          custom: true,

          sourceType:
            "manual"
        }
      );


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


  /* =========================================================
     自作問題削除
     ========================================================= */

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
            「${escapeHTML(keyword)}」に一致する問題はありません。
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
                    ${escapeHTML(
                      getSubjectName(
                        question.subject
                      )
                    )}
                  </span>


                  <span>
                    ${escapeHTML(
                      question.category ||
                      "その他"
                    )}
                  </span>


                  <span>
                    難易度${escapeHTML(
                      question.difficulty ||
                      2
                    )}
                  </span>

                </div>


                <h3
                  class="custom-question-title"
                >
                  ${escapeHTML(
                    question.question
                  )}
                </h3>


                <div
                  class="custom-question-actions"
                >

                  <button
                    type="button"
                    class="btn small-btn edit-custom-question"
                    data-id="${safeAttribute(
                      question.id
                    )}"
                  >
                    編集
                  </button>


                  <button
                    type="button"
                    class="btn small-btn danger delete-custom-question"
                    data-id="${safeAttribute(
                      question.id
                    )}"
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


  /* =========================================================
     AI問題JSONインポート
     ========================================================= */

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
         * JSONを正規化
         *
         * A～Gが来ても
         * 正式IDへ変換する
         */
        const normalized =
          importedQuestions.map(
            (
              question,
              index
            ) =>
              normalizeImportedQuestion(
                question,
                index
              )
          );
  
  
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
         * IndexedDBへ保存
         */
        await QuestionDB.putMany(
          normalized
        );
  
  
        /*
         * DBから再読み込み
         */
        await loadQuestions();
  
  
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

  /* =========================================================
     復習
     ========================================================= */

  function startReview() {

    let ids = [];

    try {

      ids =
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

    } catch (error) {

      console.error(
        "今日の問題の選択に失敗しました",
        error
      );


      alert(
        "今日の問題を作成できませんでした。\n\n" +
        error.message
      );

      return;

     }

    /*
     * 復習問題を開始
     */
    if (!ids.length) {

      alert(
        "復習できる問題がありません。"
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


  /* =========================================================
     お気に入り演習


  /* =========================================================
     お気に入り演習
     ========================================================= */

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


  /* =========================================================
     イベント
     ========================================================= */

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
         * 再度選択できるようにする。
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


  /* =========================================================
     Start
     ========================================================= */

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


  /* =========================================================
     Public API
     ========================================================= */

  return {

    start

  };

})();


/* =========================================================
   DOM Ready
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    App.start();

  }
);
