/*
 * question-db.js
 *
 * 自作問題・AI問題をIndexedDBで管理する。
 *
 * 役割：
 * - IndexedDBの初期化
 * - 問題の取得
 * - 問題の保存
 * - 複数問題の保存
 * - 問題の削除
 *
 * App側では以下を利用する。
 *
 * QuestionDB.getAll()
 * QuestionDB.get(id)
 * QuestionDB.put(question)
 * QuestionDB.putMany(questions)
 * QuestionDB.remove(id)
 */

const QuestionDB = (() => {

  "use strict";


  /* =========================
     設定
     ========================= */

  const DB_NAME =
    "shindanshi-drill-db";

  const DB_VERSION =
    1;

  const STORE_NAME =
    "questions";


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
          (event) => {

            const db =
              event.target.result;


            /*
             * questionsストアを
             * 初回作成
             */

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

            resolve(
              Array.isArray(
                request.result
              )
                ? request.result
                : []
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
          () => {

            db.close();

          };


        transaction.onerror =
          () => {

            db.close();

          };

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
              request.result || null
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
          () => {

            db.close();

          };


        transaction.onerror =
          () => {

            db.close();

          };

      }
    );

  }


  /* =========================
     1問保存
     ========================= */

  async function put(
    question
  ) {

    validateQuestion(
      question
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


        const request =
          store.put(
            question
          );


        request.onerror =
          () => {

            reject(
              request.error ||
              new Error(
                "問題の保存に失敗しました。"
              )
            );

          };


        transaction.oncomplete =
          () => {

            db.close();

            resolve(
              question
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

      }
    );

  }


  /* =========================
     複数問題保存
     ========================= */

  async function putMany(
    questions
  ) {

    if (
      !Array.isArray(
        questions
      )
    ) {

      throw new Error(
        "questionsは配列である必要があります。"
      );

    }


    if (
      questions.length === 0
    ) {

      return [];

    }


    questions.forEach(
      (question) => {

        validateQuestion(
          question
        );

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


        questions.forEach(
          (question) => {

            store.put(
              question
            );

          }
        );


        transaction.oncomplete =
          () => {

            db.close();

            resolve(
              questions
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

  async function remove(
    id
  ) {

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


        store.delete(
          id
        );


        transaction.oncomplete =
          () => {

            db.close();

            resolve(
              true
            );

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
     問題データの基本チェック
     ========================= */

  function validateQuestion(
    question
  ) {

    if (
      !question ||
      typeof question !==
        "object"
    ) {

      throw new Error(
        "問題データが不正です。"
      );

    }


    if (
      !question.id ||
      typeof question.id !==
        "string"
    ) {

      throw new Error(
        "問題IDがありません。"
      );

    }

  }


  /* =========================
     DB存在確認
     ========================= */

  async function exists(
    id
  ) {

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

    exists

  };

})();