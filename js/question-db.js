// js/question-db.js
// 診断士Drill - IndexedDB Question Database
// app.js compatible version

const QuestionDB = (() => {
  const DB_NAME = "shindanshi-drill-db";
  const DB_VERSION = 1;
  const STORE_NAME = "questions";

  let dbPromise = null;

  // ------------------------------------------------------------
  // Subject ID normalization
  // ------------------------------------------------------------

  const SUBJECT_ID_ALIASES = {
    A: "economics",
    B: "finance",
    C: "management",
    D: "operations",
    E: "legal",
    F: "info",
    G: "sme",

    a: "economics",
    b: "finance",
    c: "management",
    d: "operations",
    e: "legal",
    f: "info",
    g: "sme"
  };

  function normalizeSubjectId(subject) {
    if (subject == null) return "";

    const value = String(subject).trim();

    return SUBJECT_ID_ALIASES[value] || value;
  }

  // ------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------

  function toText(value, fallback = "") {
    if (value == null) return fallback;
    return String(value);
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (value == null || value === "") {
      return [];
    }

    return [value];
  }

  function createId() {
    return (
      "q_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  // ------------------------------------------------------------
  // Question normalization
  // ------------------------------------------------------------

  function normalizeQuestion(question) {
    if (!question || typeof question !== "object") {
      return null;
    }

    const now = new Date().toISOString();

    const choices = toArray(
      question.choices ??
      question.options ??
      question.answers
    )
      .map(value => toText(value))
      .slice(0, 4);

    while (choices.length < 4) {
      choices.push("");
    }

    let answer = question.answer;

    // answer が文字列の場合にも対応
    if (typeof answer === "string") {
      const trimmed = answer.trim();

      // A / B / C / D
      if (/^[A-Da-d]$/.test(trimmed)) {
        answer = trimmed.toUpperCase().charCodeAt(0) - 65;
      } else if (/^\d+$/.test(trimmed)) {
        answer = Number(trimmed);
      }
    }

    answer = toNumber(answer, 0);

    // 0～3に収める
    if (answer < 0 || answer > 3) {
      answer = 0;
    }

    const choiceExplanations = toArray(
      question.choiceExplanations ??
      question.explanations ??
      question.choice_explanations
    )
      .map(value => toText(value))
      .slice(0, 4);

    while (choiceExplanations.length < 4) {
      choiceExplanations.push("");
    }

    let relatedKnowledge = question.relatedKnowledge;

    if (!Array.isArray(relatedKnowledge)) {
      relatedKnowledge = [];
    }

    relatedKnowledge = relatedKnowledge
      .filter(item => item != null)
      .map(item => {
        if (typeof item === "string") {
          return {
            title: "",
            body: item
          };
        }

        if (typeof item === "object") {
          return {
            title: toText(
              item.title ??
              item.name ??
              item.heading
            ),
            body: toText(
              item.body ??
              item.description ??
              item.text ??
              item.content
            )
          };
        }

        return {
          title: "",
          body: toText(item)
        };
      });

    const difficulty = toNumber(
      question.difficulty,
      2
    );

    return {
      // 基本情報
      id: toText(question.id, createId()),

      year: toText(
        question.year ??
        question.examYear ??
        ""
      ),

      subject: normalizeSubjectId(
        question.subject ??
        question.subjectId ??
        ""
      ),

      category: toText(
        question.category ??
        question.categoryName ??
        ""
      ),

      difficulty: Math.max(
        1,
        Math.min(5, difficulty)
      ),

      // 問題本体
      question: toText(
        question.question ??
        question.text ??
        question.questionText ??
        ""
      ),

      choices,

      answer,

      explanation: toText(
        question.explanation ??
        question.answerExplanation ??
        ""
      ),

      choiceExplanations,

      keyPoint: toText(
        question.keyPoint ??
        question.keypoint ??
        ""
      ),

      // 関連知識
      relatedKnowledge,

      mistakePoint: toText(
        question.mistakePoint ??
        question.mistake_point ??
        ""
      ),

      // 管理情報
      custom: Boolean(question.custom),

      sourceType: toText(
        question.sourceType ??
        (question.custom ? "custom" : "builtin")
      ),

      createdAt: toText(
        question.createdAt,
        now
      ),

      updatedAt: now,

      importedAt: question.importedAt
        ? toText(question.importedAt)
        : undefined
    };
  }

  // ------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------

  function validateQuestion(question) {
    if (!question || typeof question !== "object") {
      return false;
    }

    if (!question.id) {
      return false;
    }

    if (!Array.isArray(question.choices)) {
      return false;
    }

    if (question.choices.length !== 4) {
      return false;
    }

    if (
      typeof question.answer !== "number" ||
      question.answer < 0 ||
      question.answer > 3
    ) {
      return false;
    }

    return true;
  }

  // ------------------------------------------------------------
  // IndexedDB open
  // ------------------------------------------------------------

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(
          new Error(
            "IndexedDB is not supported in this browser."
          )
        );
        return;
      }

      const request = indexedDB.open(
        DB_NAME,
        DB_VERSION
      );

      request.onupgradeneeded = event => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id"
          });
        }
      };

      request.onsuccess = event => {
        const db = event.target.result;

        db.onversionchange = () => {
          db.close();
        };

        resolve(db);
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error("Failed to open IndexedDB.")
        );
      };

      request.onblocked = () => {
        console.warn(
          "IndexedDB open is blocked."
        );
      };
    });

    return dbPromise;
  }

  // ------------------------------------------------------------
  // Get all
  // ------------------------------------------------------------

  async function getAll() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request = store.getAll();

      request.onsuccess = () => {
        const records = Array.isArray(
          request.result
        )
          ? request.result
          : [];

        resolve(
          records
            .map(normalizeQuestion)
            .filter(Boolean)
        );
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error("Failed to get questions.")
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Get one
  // ------------------------------------------------------------

  async function get(id) {
    if (!id) return null;

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request = store.get(id);

      request.onsuccess = () => {
        resolve(
          normalizeQuestion(request.result)
        );
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error("Failed to get question.")
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Put one
  // ------------------------------------------------------------

  async function put(question) {
    const normalized =
      normalizeQuestion(question);

    if (!validateQuestion(normalized)) {
      throw new Error(
        "Invalid question data."
      );
    }

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request =
        store.put(normalized);

      request.onsuccess = () => {
        resolve(normalized);
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error("Failed to save question.")
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Put many
  // ------------------------------------------------------------

  async function putMany(questions) {
    if (!Array.isArray(questions)) {
      throw new Error(
        "Questions must be an array."
      );
    }

    const normalizedQuestions =
      questions
        .map(normalizeQuestion)
        .filter(validateQuestion);

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      for (const question of normalizedQuestions) {
        store.put(question);
      }

      transaction.oncomplete = () => {
        resolve(normalizedQuestions);
      };

      transaction.onerror = () => {
        reject(
          transaction.error ||
          new Error(
            "Failed to save questions."
          )
        );
      };

      transaction.onabort = () => {
        reject(
          transaction.error ||
          new Error(
            "Question transaction was aborted."
          )
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Remove
  // ------------------------------------------------------------

  async function remove(id) {
    if (!id) return false;

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error(
            "Failed to remove question."
          )
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Exists
  // ------------------------------------------------------------

  async function exists(id) {
    if (!id) return false;

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request = store.getKey(id);

      request.onsuccess = () => {
        resolve(
          request.result !== undefined
        );
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error(
            "Failed to check question."
          )
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Clear all
  // ------------------------------------------------------------

  async function clear() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store =
        transaction.objectStore(STORE_NAME);

      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(
          request.error ||
          new Error(
            "Failed to clear questions."
          )
        );
      };
    });
  }

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------

  return {
    openDB,
    getAll,
    get,
    put,
    putMany,
    remove,
    exists,
    clear,

    // app.js が使用する重要なAPI
    normalizeQuestion,
    validateQuestion,

    normalizeSubjectId
  };
})();
