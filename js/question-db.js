```javascript
/*
 * question-db.js
 *
 * 自作問題・AI問題をIndexedDBで管理する。
 *
 * 公開API：
 * QuestionDB.getAll()
 * QuestionDB.get(id)
 * QuestionDB.put(question)
 * QuestionDB.putMany(questions)
 * QuestionDB.remove(id)
 * QuestionDB.exists(id)
 * QuestionDB.normalizeQuestion(question)
 */

const QuestionDB = (() => {

  "use strict";

  /* =========================
     設定
     ========================= */

  const DB_NAME = "shindanshi-drill-db";
  const DB_VERSION = 1;
  const STORE_NAME = "questions";


  /* =========================
     関連知識の正規化
     ========================= */

  function normalizeRelatedKnowledge(value) {

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {

        if (typeof item === "string") {
          return {
            title: "",
            body: item.trim()
          };
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        return {
          title: String(item.title ?? "").trim(),
          body: String(item.body ?? "").trim()
        };

      })
      .filter(item => item && (item.title || item.body));
  }


  /* =========================
     問題データ正規化
     ========================= */

  function normalizeQuestion(source) {

    const question = source || {};
    const now = new Date().toISOString();

    const id = String(
      question.id ||
      `custom-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
    );

    const normalized = {

      id,

      year:
        Number.isInteger(Number(question.year))
          ? Number(question.year)
          : new Date().getFullYear(),

      subject:
        String(question.subject ?? "").trim(),

      category:
        String(question.category || "その他").trim(),

      difficulty:
        Number.isInteger(Number(question.difficulty))
          ? Math.min(
              3,
              Math.max(
                1,
                Number(question.difficulty)
              )
            )
          : 2,

      question:
        String(question.question ?? "").trim(),

      choices:
        Array.isArray(question.choices)
          ? [0, 1, 2, 3].map(index =>
              String(
                question.choices[index] ?? ""
              ).trim()
            )
          : ["", "", "", ""],

      answer:
        Number.isInteger(Number(question.answer))
          ? Math.min(
              3,
              Math.max(
                0,
                Number(question.answer)
              )
            )
          : 0,

      explanation:
        String(question.explanation ?? "").trim(),

      choiceExplanations:
        Array.isArray(question.choiceExplanations)
          ? [0, 1, 2, 3].map(index =>
              String(
                question.choiceExplanations[index] ?? ""
              ).trim()
            )
          : ["", "", "", ""],

      keyPoint:
        String(question.keyPoint ?? "").trim(),

      relatedKnowledge:
        normalizeRelatedKnowledge(
          question.relatedKnowledge
        ),

      mistakePoint:
        String(question.mistakePoint ?? "").trim(),

      custom:
        question.custom === true,

      sourceType:
        String(
          question.sourceType || "manual"
        ),

      createdAt:
        question.createdAt || now,

      updatedAt:
        question.updatedAt || now

    };


    if (question.importedAt) {
      normalized.importedAt =
        question.importedAt;
    }


    return normalized;
  }


  /* =========================
     問題チェック
     ========================= */

  function validateQuestion(question) {

    if (
      !question ||
      typeof question !== "object"
    ) {
      throw new Error(
        "問題データが不正です。"
      );
    }

    if (
      !question.id ||
      typeof question.id !== "string"
    ) {
      throw new Error(
        "問題IDがありません。"
      );
    }

    if (
      !question.subject
    ) {
      throw new Error(
        "科目がありません。"
      );
    }

    if (
      !question.question
    ) {
      throw new Error(
        "問題文がありません。"
      );
    }

    if (
      !Array.isArray(question.choices) ||
      question.choices.length !== 4
    ) {
      throw new Error(
        "選択肢は4つ必要です。"
      );
    }

    if (
      !Number.isInteger(question.answer) ||
      question.answer < 0 ||
      question.answer > 3
    ) {
      throw new Error(
        "正解番号が不正です。"
      );
    }

  }


  /* =========================
     DBを開く
     ========================= */

  function openDB() {

    return new Promise(
      (resolve, reject) => {

        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION
          );


        request.onupgradeneeded =
          event => {

            const db =
              event.target.result;

            if (
              !db.objectStoreNames.contains(
                STORE_NAME
              )
            ) {

              db.createObjectStore(
                STORE_NAME,
                {
                  keyPath: "id"
                }
              );

            }

          };


        request.onsuccess =
          () => {

            resolve(
              request.result
            );

          };


        request.onerror =
          () => {

            reject(
              request.error ||
              new Error(
                "IndexedDBを開けませんでした。"
              )
            );

          };


        request.onblocked =
          () => {

            reject(
              new Error(
                "IndexedDBの更新がブロックされています。"
              )
            );

          };

      }
    );

  }


  /* =========================
     全問題取得
     ========================= */

  async function getAll() {

    const db =
      await openDB();

    return new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            STORE_NAME,
            "readonly"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.getAll();


        request.onsuccess =
          () => {

            const result =
              Array.isArray(request.result)
                ? request.result
                : [];

            resolve(
              result.map(normalizeQuestion)
            );

          };


        request.onerror =
          () => {

            reject(
              request.error ||
              new Error(
                "問題データの取得に失敗しました。"
              )
            );

          };


        transaction.oncomplete =
          () => db.close();

        transaction.onerror =
          () => db.close();

      }
    );

  }


  /* =========================
     ID指定取得
     ========================= */

  async function get(id) {

    if (!id) {
      return null;
    }

    const db =
      await openDB();

    return new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            STORE_NAME,
            "readonly"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.get(id);


        request.onsuccess =
          () => {

            resolve(
              request.result
                ? normalizeQuestion(
                    request.result
                  )
                : null
            );

          };


        request.onerror =
          () => {

            reject(
              request.error ||
              new Error(
                "問題データの取得に失敗しました。"
              )
            );

          };


        transaction.oncomplete =
          () => db.close();

        transaction.onerror =
          () => db.close();

      }
    );

  }


  /* =========================
     1問保存
     ========================= */

  async function put(question) {

    const normalized =
      normalizeQuestion(question);

    validateQuestion(
      normalized
    );


    const db =
      await openDB();

    return new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );


        store.put(
          normalized
        );


        transaction.oncomplete =
          () => {

            db.close();

            resolve(
              normalized
            );

          };


        transaction.onerror =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題の保存に失敗しました。"
              )
            );

          };


        transaction.onabort =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題の保存が中断されました。"
              )
            );

          };

      }
    );

  }


  /* =========================
     複数問題保存
     ========================= */

  async function putMany(questions) {

    if (!Array.isArray(questions)) {

      throw new Error(
        "questionsは配列である必要があります。"
      );

    }


    if (!questions.length) {
      return [];
    }


    const normalized =
      questions.map(
        question => {

          const item =
            normalizeQuestion(
              question
            );

          validateQuestion(
            item
          );

          return item;

        }
      );


    const db =
      await openDB();


    return new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );


        normalized.forEach(
          question => {

            store.put(
              question
            );

          }
        );


        transaction.oncomplete =
          () => {

            db.close();

            resolve(
              normalized
            );

          };


        transaction.onerror =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題データの一括保存に失敗しました。"
              )
            );

          };


        transaction.onabort =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題データの一括保存が中断されました。"
              )
            );

          };

      }
    );

  }


  /* =========================
     問題削除
     ========================= */

  async function remove(id) {

    if (!id) {

      throw new Error(
        "削除する問題IDがありません。"
      );

    }


    const db =
      await openDB();


    return new Promise(
      (resolve, reject) => {

        const transaction =
          db.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );


        store.delete(id);


        transaction.oncomplete =
          () => {

            db.close();

            resolve(true);

          };


        transaction.onerror =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題の削除に失敗しました。"
              )
            );

          };


        transaction.onabort =
          () => {

            db.close();

            reject(
              transaction.error ||
              new Error(
                "問題の削除が中断されました。"
              )
            );

          };

      }
    );

  }


  /* =========================
     存在確認
     ========================= */

  async function exists(id) {

    const question =
      await get(id);

    return !!question;

  }


  /* =========================
     公開API
     ========================= */

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
```
