const Stats = (() => {

  function summarize(questions, state) {

    const history = state.history || {};

    let total = 0;
    let correct = 0;

    let todayAnswered = 0;
    let todayTotal = 0;

    const today = todayKey();

    const bySubject = {};
    const byCategory = {};


    // =========================
    // 科目の初期化
    // =========================

    APP_CONFIG.subjects.forEach((subject) => {

      bySubject[subject.id] = {
        subject: subject.id,
        subjectName: subject.name,
        total: 0,
        correct: 0,
        wrong: 0,
      };

    });


    // =========================
    // 問題データから集計
    // =========================

    questions.forEach((question) => {

      const record =
        history[question.id];

      if (!record) {
        return;
      }


      const questionTotal =
        (record.correct || 0) +
        (record.wrong || 0);

      const questionCorrect =
        record.correct || 0;

      const questionWrong =
        record.wrong || 0;


      // 全体

      total += questionTotal;
      correct += questionCorrect;


      // 科目

      if (!bySubject[question.subject]) {

        const subject =
          APP_CONFIG.subjects.find(
            (item) =>
              item.id === question.subject
          );

        bySubject[question.subject] = {
          subject: question.subject,
          subjectName:
            subject
              ? subject.name
              : question.subject,
          total: 0,
          correct: 0,
          wrong: 0,
        };

      }


      bySubject[question.subject].total +=
        questionTotal;

      bySubject[question.subject].correct +=
        questionCorrect;

      bySubject[question.subject].wrong +=
        questionWrong;


      // =========================
      // 分野
      // =========================

      const category =
        question.category || "その他";

      const key =
        `${question.subject}::${category}`;


      if (!byCategory[key]) {

        const subject =
          APP_CONFIG.subjects.find(
            (item) =>
              item.id === question.subject
          );

        byCategory[key] = {
          key,
          subject: question.subject,
          subjectName:
            subject
              ? subject.name
              : question.subject,
          category,
          total: 0,
          correct: 0,
          wrong: 0,
        };

      }


      byCategory[key].total +=
        questionTotal;

      byCategory[key].correct +=
        questionCorrect;

      byCategory[key].wrong +=
        questionWrong;


      // =========================
      // 今日の学習
      // =========================

      if (
        record.lastAt &&
        record.lastAt.slice(0, 10) === today
      ) {

        todayAnswered +=
          questionTotal;

        todayTotal +=
          questionTotal;

      }

    });


    const accuracy =
      total
        ? Math.round(
            (correct / total) * 100
          )
        : 0;


    return {

      total,

      correct,

      accuracy,

      todayAnswered,

      todayTotal,

      bySubject,

      byCategory,

    };

  }


  return {
    summarize,
  };

})();