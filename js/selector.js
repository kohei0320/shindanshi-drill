const Selector = (() => {

  // =========================
  // 共通：シャッフル
  // =========================

  function shuffle(list) {

    const copy = list.slice();

    for (let i = copy.length - 1; i > 0; i -= 1) {

      const j =
        Math.floor(
          Math.random() * (i + 1)
        );

      const tmp = copy[i];

      copy[i] = copy[j];

      copy[j] = tmp;

    }

    return copy;
  }


  // =========================
  // フィルター
  // =========================

  function matchesFilters(
    question,
    filters
  ) {

    if (!filters) return true;


    if (
      filters.subject &&
      question.subject !== filters.subject
    ) {
      return false;
    }


    if (
      filters.category &&
      question.category !== filters.category
    ) {
      return false;
    }


    if (
      filters.year &&
      question.year !== filters.year
    ) {
      return false;
    }


    if (
      filters.difficulty &&
      question.difficulty !== filters.difficulty
    ) {
      return false;
    }


    return true;
  }


  // =========================
  // 今日の20問
  // =========================

  function selectQuestionIds(
    questions,
    history,
    options
  ) {

    const filters =
      options.filters || {};

    const count =
      options.count ||
      APP_CONFIG.dailyCount;

    const excludeIds =
      new Set(
        options.excludeIds || []
      );

    const filtered =
      questions.filter(
        (question) =>
          matchesFilters(
            question,
            filters
          ) &&
          !excludeIds.has(
            question.id
          )
      );


    const strategy =
      options.strategy ||
      "balanced-random";


    // 今日の20問
    if (
      strategy ===
      "optimized-daily"
    ) {

      return optimizedDaily(
        filtered,
        history,
        count
      );

    }


    // 未回答優先
    if (
      strategy ===
      "unanswered-first"
    ) {

      return unansweredFirst(
        filtered,
        history,
        count
      );

    }


    // 弱点優先
    if (
      strategy ===
      "weakest-first"
    ) {

      return weakestFirst(
        filtered,
        history,
        count
      );

    }


    // 通常ランダム
    return balancedRandom(
      filtered,
      count
    );

  }


  // =========================
  // 最適化された今日の20問
  // =========================

  function optimizedDaily(
    questions,
    history,
    count
  ) {

    const unanswered = [];

    const weak = [];

    const wrong = [];

    const normal = [];


    // -------------------------
    // 分野ごとの成績を計算
    // -------------------------

    const categoryStats = {};


    questions.forEach(
      (question) => {

        const record =
          history[question.id];


        if (!record) {
          return;
        }


        const total =
          (record.correct || 0) +
          (record.wrong || 0);


        if (!total) {
          return;
        }


        const category =
          question.category ||
          "その他";


        const key =
          `${question.subject}::${category}`;


        if (!categoryStats[key]) {

          categoryStats[key] = {
            total: 0,
            correct: 0,
            wrong: 0,
          };

        }


        categoryStats[key].total +=
          total;

        categoryStats[key].correct +=
          record.correct || 0;

        categoryStats[key].wrong +=
          record.wrong || 0;

      }
    );


    // -------------------------
    // 問題を分類
    // -------------------------

    questions.forEach(
      (question) => {

        const record =
          history[question.id];


        // ① 未回答
        if (!record) {

          unanswered.push(
            question
          );

          return;
        }


        const total =
          (record.correct || 0) +
          (record.wrong || 0);

        const wrongCount =
          record.wrong || 0;

        const correctCount =
          record.correct || 0;


        const category =
          question.category ||
          "その他";


        const key =
          `${question.subject}::${category}`;


        const categoryRecord =
          categoryStats[key];


        const categoryAccuracy =
          categoryRecord &&
          categoryRecord.total
            ? (
                categoryRecord.correct /
                categoryRecord.total
              ) * 100
            : 100;


        // -------------------------
        // 弱点判定
        // -------------------------

        const isWeakCategory =
          categoryRecord &&
          categoryRecord.total >= 2 &&
          categoryAccuracy < 70;


        if (
          isWeakCategory &&
          wrongCount > 0
        ) {

          weak.push({
            question,
            score:
              calculateWeakScore(
                wrongCount,
                total,
                categoryAccuracy
              ),
          });

          return;
        }


        // -------------------------
        // 間違い問題
        // -------------------------

        if (wrongCount > 0) {

          wrong.push({
            question,
            score:
              calculateWrongScore(
                wrongCount,
                total
              ),
          });

          return;
        }


        // -------------------------
        // 正解済み
        // -------------------------

        normal.push({
          question,
          total: correctCount,
        });

      }
    );


    // -------------------------
    // 未回答
    // -------------------------

    const shuffledUnanswered =
      shuffle(unanswered);


    // -------------------------
    // 弱点問題
    // -------------------------

    weak.sort(
      (a, b) =>
        b.score - a.score
    );


    // -------------------------
    // 間違い問題
    // -------------------------

    wrong.sort(
      (a, b) =>
        b.score - a.score
    );


    // -------------------------
    // 正解済み
    // -------------------------

    normal.sort(
      (a, b) =>
        a.total - b.total
    );


    /*
     * =========================
     * 20問の構成
     * =========================
     *
     * 未回答       40%
     * 弱点分野     30%
     * 間違い問題   20%
     * その他       10%
     *
     * 例：
     *
     * 未回答       8問
     * 弱点分野     6問
     * 間違い問題   4問
     * その他       2問
     *
     */


    const unansweredCount =
      Math.round(
        count * 0.4
      );

    const weakCount =
      Math.round(
        count * 0.3
      );

    const wrongCount =
      Math.round(
        count * 0.2
      );


    const normalCount =
      count -
      unansweredCount -
      weakCount -
      wrongCount;


    const selected = [];


    // -------------------------
    // ① 未回答
    // -------------------------

    selected.push(
      ...shuffledUnanswered
        .slice(
          0,
          unansweredCount
        )
    );


    // -------------------------
    // ② 弱点分野
    // -------------------------

    selected.push(
      ...weak
        .slice(
          0,
          weakCount
        )
        .map(
          (item) =>
            item.question
        )
    );


    // -------------------------
    // ③ 間違い問題
    // -------------------------

    selected.push(
      ...wrong
        .slice(
          0,
          wrongCount
        )
        .map(
          (item) =>
            item.question
        )
    );


    // -------------------------
    // ④ 正解済み
    // -------------------------

    selected.push(
      ...normal
        .slice(
          0,
          normalCount
        )
        .map(
          (item) =>
            item.question
        )
    );


    // =========================
    // 20問に足りない場合
    // =========================

    const selectedIds =
      new Set(
        selected.map(
          (question) =>
            question.id
        )
      );


    const remaining =
      shuffle(
        questions.filter(
          (question) =>
            !selectedIds.has(
              question.id
            )
        )
      );


    selected.push(
      ...remaining.slice(
        0,
        count - selected.length
      )
    );


    // =========================
    // 最終シャッフル
    // =========================

    return shuffle(
      selected.slice(
        0,
        count
      )
    ).map(
      (question) =>
        question.id
    );

  }


  // =========================
  // 弱点スコア
  // =========================

  function calculateWeakScore(
    wrong,
    total,
    categoryAccuracy
  ) {

    return (
      wrong * 10
      +
      (100 - categoryAccuracy) * 2
      +
      (10 / Math.max(total, 1))
    );

  }


  // =========================
  // 間違いスコア
  // =========================

  function calculateWrongScore(
    wrong,
    total
  ) {

    return (
      wrong * 10
      +
      (10 / Math.max(total, 1))
    );

  }


  // =========================
  // 未回答優先
  // =========================

  function unansweredFirst(
    questions,
    history,
    count
  ) {

    const unanswered = [];

    const wrongAnswered = [];

    const correctAnswered = [];


    questions.forEach(
      (question) => {

        const record =
          history[question.id];


        if (!record) {

          unanswered.push(
            question
          );

          return;
        }


        const total =
          (record.correct || 0) +
          (record.wrong || 0);


        if (
          (record.wrong || 0) > 0
        ) {

          wrongAnswered.push({
            question,
            wrong:
              record.wrong || 0,
            total,
          });

          return;
        }


        correctAnswered.push({
          question,
          total,
        });

      }
    );


    const result = [

      ...shuffle(
        unanswered
      ),

      ...wrongAnswered
        .sort(
          (a, b) => {

            if (
              b.wrong !== a.wrong
            ) {
              return (
                b.wrong -
                a.wrong
              );
            }

            return (
              a.total -
              b.total
            );

          }
        )
        .map(
          (item) =>
            item.question
        ),

      ...correctAnswered
        .sort(
          (a, b) =>
            a.total - b.total
        )
        .map(
          (item) =>
            item.question
        ),

    ];


    return result
      .slice(0, count)
      .map(
        (question) =>
          question.id
      );

  }


  // =========================
  // 弱点優先
  // =========================

  function weakestFirst(
    questions,
    history,
    count
  ) {

    const scored =
      questions.map(
        (question) => {

          const record =
            history[question.id];


          if (!record) {

            return {
              question,
              score: 1000,
            };

          }


          const total =
            (record.correct || 0) +
            (record.wrong || 0);


          const accuracy =
            total
              ? (
                  (record.correct || 0) /
                  total
                ) * 100
              : 100;


          return {

            question,

            score:
              (100 - accuracy) * 10
              +
              (record.wrong || 0) * 20,

          };

        }
      );


    scored.sort(
      (a, b) =>
        b.score - a.score
    );


    return scored
      .slice(0, count)
      .map(
        (item) =>
          item.question.id
      );

  }


  // =========================
  // 科目均等ランダム
  // =========================

  function balancedRandom(
    questions,
    count
  ) {

    const bySubject = {};


    APP_CONFIG.subjects.forEach(
      (subject) => {

        bySubject[subject.id] =
          [];

      }
    );


    questions.forEach(
      (question) => {

        if (
          !bySubject[
            question.subject
          ]
        ) {

          bySubject[
            question.subject
          ] = [];

        }


        bySubject[
          question.subject
        ].push(question);

      }
    );


    Object.keys(
      bySubject
    ).forEach(
      (subjectId) => {

        bySubject[
          subjectId
        ] = shuffle(
          bySubject[
            subjectId
          ]
        );

      }
    );


    const picked = [];

    const pickedIds =
      new Set();


    let round = 0;


    while (
      picked.length <
        Math.min(
          count,
          questions.length
        )
    ) {

      let added = false;


      APP_CONFIG.subjects.forEach(
        (subject) => {

          if (
            picked.length >= count
          ) {
            return;
          }


          const pool =
            bySubject[
              subject.id
            ] || [];


          const candidate =
            pool[round];


          if (
            candidate &&
            !pickedIds.has(
              candidate.id
            )
          ) {

            picked.push(
              candidate
            );

            pickedIds.add(
              candidate.id
            );

            added = true;

          }

        }
      );


      if (!added) {
        break;
      }


      round += 1;

    }


    return picked.map(
      (question) =>
        question.id
    );

  }


  // =========================
  // 復習
  // =========================

  function selectReviewIds(
    questions,
    history
  ) {

    return questions

      .filter(
        (question) =>
          history[question.id] &&
          history[question.id].wrong > 0
      )

      .sort(
        (a, b) => {

          const aw =
            history[a.id].wrong || 0;

          const bw =
            history[b.id].wrong || 0;

          return bw - aw;

        }
      )

      .map(
        (question) =>
          question.id
      );

  }


  // =========================
  // お気に入り
  // =========================

  function selectFavoriteIds(
    questions,
    favorites
  ) {

    const byId = {};


    questions.forEach(
      (question) => {

        byId[question.id] =
          question;

      }
    );


    return (
      favorites || []
    ).filter(
      (id) =>
        byId[id]
    );

  }


  return {

    selectQuestionIds,

    selectReviewIds,

    selectFavoriteIds,

  };

})();