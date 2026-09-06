/* =========================================================
   question-db.js
   診断士Drill - 問題データ管理

   IndexedDBを正本として、自作問題・AIインポート問題を保存する。
   旧版localStorageのデータもApp側から移行できるよう、
   normalizeQuestion() を公開する。
   ========================================================= */

const QuestionDB = (() => {
  "use strict";

  const DB_NAME = "shindanshi-drill-db";
  const DB_VERSION = 2;
  const STORE_NAME = "questions";

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("このブラウザではIndexedDBが利用できません。"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("IndexedDBを開けませんでした。")
      );
      request.onblocked = () => reject(
        new Error("IndexedDBの更新がブロックされています。別タブの診断士Drillを閉じて再読み込みしてください。")
      );
    });
  }

  function normalizeQuestion(input) {
    if (!input || typeof input !== "object") {
      throw new Error("問題データが不正です。");
    }

    const question = { ...input };

    if (!question.id || typeof question.id !== "string") {
      throw new Error("問題IDがありません。");
    }

    question.id = question.id.trim();
    if (!question.id) throw new Error("問題IDがありません。");

    question.year = question.year == null || question.year === ""
      ? new Date().getFullYear()
      : Number(question.year) || new Date().getFullYear();

    question.subject = String(question.subject ?? "").trim();
    question.category = String(question.category ?? "その他").trim() || "その他";
    question.difficulty = Math.min(3, Math.max(1, Number(question.difficulty) || 2));
    question.question = String(question.question ?? "").trim();

    if (!question.subject) throw new Error(`問題「${question.id}」の科目がありません。`);
    if (!question.question) throw new Error(`問題「${question.id}」の問題文がありません。`);

    if (!Array.isArray(question.choices)) {
      question.choices = ["", "", "", ""];
    }
    question.choices = Array.from({ length: 4 }, (_, i) =>
      String(question.choices[i] ?? "").trim()
    );

    if (question.choices.some(choice => !choice)) {
      throw new Error(`問題「${question.id}」の選択肢が4つ揃っていません。`);
    }

    question.answer = Number.isInteger(Number(question.answer))
      ? Number(question.answer)
      : 0;
    if (question.answer < 0 || question.answer > 3) {
      throw new Error(`問題「${question.id}」の正解番号が不正です。`);
    }

    question.explanation = String(question.explanation ?? "").trim();

    if (!Array.isArray(question.choiceExplanations)) {
      question.choiceExplanations = ["", "", "", ""];
    }
    question.choiceExplanations = Array.from({ length: 4 }, (_, i) =>
      String(question.choiceExplanations[i] ?? "").trim()
    );

    question.keyPoint = String(question.keyPoint ?? "").trim();
    question.mistakePoint = String(question.mistakePoint ?? "").trim();

    if (!Array.isArray(question.relatedKnowledge)) {
      question.relatedKnowledge = [];
    }
    question.relatedKnowledge = question.relatedKnowledge
      .map(item => {
        if (typeof item === "string") return { title: "", body: item.trim() };
        return {
          title: String(item?.title ?? "").trim(),
          body: String(item?.body ?? "").trim()
        };
      })
      .filter(item => item.title || item.body);

    question.custom = question.custom === true;
    question.sourceType = String(question.sourceType ?? (question.custom ? "manual" : "official"));
    question.createdAt = question.createdAt || new Date().toISOString();
    question.updatedAt = question.updatedAt || question.createdAt;
    question.importedAt = question.importedAt || null;

    return question;
  }

  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = () => {
        const result = Array.isArray(request.result) ? request.result : [];
        resolve(result);
      };
      request.onerror = () => reject(
        request.error || new Error("問題データの取得に失敗しました。")
      );
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    });
  }

  async function get(id) {
    if (!id) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(
        request.error || new Error("問題データの取得に失敗しました。")
      );
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    });
  }

  async function put(question) {
    const normalized = normalizeQuestion(question);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(normalized);
      transaction.oncomplete = () => {
        db.close();
        resolve(normalized);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("問題の保存に失敗しました。"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("問題の保存が中断されました。"));
      };
    });
  }

  async function putMany(questions) {
    if (!Array.isArray(questions)) {
      throw new Error("questionsは配列である必要があります。");
    }
    if (!questions.length) return [];

    const normalized = questions.map(normalizeQuestion);
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      normalized.forEach(question => store.put(question));

      transaction.oncomplete = () => {
        db.close();
        resolve(normalized);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("問題データの一括保存に失敗しました。"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("問題データの一括保存が中断されました。"));
      };
    });
  }

  async function remove(id) {
    if (!id) throw new Error("削除する問題IDがありません。");
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("問題の削除に失敗しました。"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("問題の削除が中断されました。"));
      };
    });
  }

  async function exists(id) {
    return !!(await get(id));
  }

  return {
    getAll,
    get,
    put,
    putMany,
    remove,
    exists,
    normalizeQuestion
  };
})();
