/*
 * 診断士Drill - QuestionDB
 * JSONスキーマをここで統一し、IndexedDBへの入出力を一元化します。
 *
 * 正規化後の基本形:
 * {
 *   schemaVersion: 1,
 *   id: string,
 *   year: number|null,
 *   subject: string,
 *   category: string,
 *   difficulty: 1|2|3,
 *   question: string,
 *   choices: [string,string,string,string],
 *   answer: 0|1|2|3,
 *   explanation: string,
 *   choiceExplanations: [string,string,string,string],
 *   keyPoint: string,
 *   relatedKnowledge: [{title:string, body:string}],
 *   mistakePoint: string,
 *   custom: boolean,
 *   sourceType: "official"|"ai"|"manual"|"unknown",
 *   createdAt: string|null,
 *   updatedAt: string|null,
 *   importedAt: string|null
 * }
 */

const QuestionDB = (() => {
  const DB_NAME = "shindanshi-drill-db";
  const DB_VERSION = 2;
  const STORE_NAME = "questions";
  const SCHEMA_VERSION = 1;

  const SOURCE_TYPES = new Set([
    "official",
    "ai",
    "manual",
    "unknown"
  ]);

  function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function asNullableString(value) {
    return typeof value === "string" ? value : null;
  }

  function asDifficulty(value) {
    const n = Number(value);
    return [1, 2, 3].includes(n) ? n : 2;
  }

  function asIndex(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
  }

  function asFourStrings(value) {
    const source = Array.isArray(value) ? value : [];
    return [0, 1, 2, 3].map(i => asString(source[i]));
  }

  function normalizeRelatedKnowledge(value) {
    if (!Array.isArray(value)) return [];

    return value
      .map(item => {
        if (typeof item === "string") {
          return { title: "", body: item };
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        return {
          title: asString(item.title),
          body: asString(item.body)
        };
      })
      .filter(item => item && item.body);
  }

  function normalizeQuestion(input, options = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("問題データはJSONオブジェクトである必要があります。");
    }

    const id = asString(input.id).trim();
    const question = asString(input.question).trim();
    const choices = asFourStrings(input.choices);
    const subject = asString(input.subject).trim();
    const category = asString(input.category).trim();

    if (!id) throw new Error("idがありません。");
    if (!subject) throw new Error(`subjectがありません: ${id}`);
    if (!question) throw new Error(`questionがありません: ${id}`);
    if (choices.some(choice => !choice.trim())) {
      throw new Error(`choicesは4つすべて必要です: ${id}`);
    }

    const rawYear = Number(input.year);
    const year = Number.isInteger(rawYear) && rawYear >= 1900 && rawYear <= 2100
      ? rawYear
      : null;

    const sourceType = SOURCE_TYPES.has(input.sourceType)
      ? input.sourceType
      : (input.custom ? "ai" : "unknown");

    return {
      schemaVersion: SCHEMA_VERSION,
      id,
      year,
      subject,
      category,
      difficulty: asDifficulty(input.difficulty),
      question,
      choices,
      answer: asIndex(input.answer),
      explanation: asString(input.explanation),
      choiceExplanations: asFourStrings(input.choiceExplanations),
      keyPoint: asString(input.keyPoint),
      relatedKnowledge: normalizeRelatedKnowledge(input.relatedKnowledge),
      mistakePoint: asString(input.mistakePoint),
      custom: Boolean(input.custom),
      sourceType,
      createdAt: asNullableString(input.createdAt),
      updatedAt: asNullableString(input.updatedAt),
      importedAt: asNullableString(input.importedAt)
    };
  }

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        } else {
          store = event.target.transaction.objectStore(STORE_NAME);
        }

        if (!store.indexNames.contains("subject")) {
          store.createIndex("subject", "subject", { unique: false });
        }
        if (!store.indexNames.contains("category")) {
          store.createIndex("category", "category", { unique: false });
        }
        if (!store.indexNames.contains("custom")) {
          store.createIndex("custom", "custom", { unique: false });
        }
        if (!store.indexNames.contains("sourceType")) {
          store.createIndex("sourceType", "sourceType", { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
        };

        resolve(db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function getAll() {
    const db = await open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = [];

        for (const item of request.result || []) {
          try {
            result.push(normalizeQuestion(item));
          } catch (error) {
            console.warn("不正な問題データをスキップしました:", error, item);
          }
        }

        resolve(result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function put(question) {
    const normalized = normalizeQuestion(question);
    const db = await open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(normalized);

      request.onsuccess = () => resolve(normalized);
      request.onerror = () => reject(request.error);
    });
  }

  async function putMany(questions) {
    if (!Array.isArray(questions) || !questions.length) {
      throw new Error("取り込む問題がありません。");
    }

    const normalized = questions.map((question, index) => {
      try {
        return normalizeQuestion(question);
      } catch (error) {
        throw new Error(`問題${index + 1}: ${error.message}`);
      }
    });

    const db = await open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      normalized.forEach(question => store.put(question));

      transaction.oncomplete = () => resolve(normalized.length);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(
        transaction.error || new Error("IndexedDBへの保存が中断されました。")
      );
    });
  }

  async function remove(id) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function clear() {
    const db = await open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  return {
    open,
    getAll,
    put,
    putMany,
    remove,
    clear,
    normalizeQuestion,
    SCHEMA_VERSION
  };
})();
