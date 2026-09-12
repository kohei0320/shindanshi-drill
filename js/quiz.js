const Quiz = (() => {
  let questionsById = {};
  let session = null;
  let onUpdate = () => {};

  function init(questions, handlers = {}) {
    questionsById = {};

    questions.forEach((question) => {
      questionsById[question.id] = question;
    });

    onUpdate =
      typeof handlers.onUpdate === "function"
        ? handlers.onUpdate
        : () => {};
  }

  function start(type, questionIds, saved = null) {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      session = null;
      return null;
    }

    if (saved) {
      const safeAnswers = Array.isArray(saved.answers)
        ? saved.answers
        : [];

      const safeQuestionIds = Array.isArray(saved.questionIds)
        ? saved.questionIds
        : questionIds;

      /*
       * 回答済み数が問題数以上なら、
       * セッションは完了済みとして扱う。
       */
      const completed =
        saved.completed === true ||
        safeAnswers.length >= safeQuestionIds.length;

      session = {
        type: saved.type || type,
        questionIds: safeQuestionIds,
        currentIndex: completed
          ? Math.max(0, safeQuestionIds.length - 1)
          : Math.min(
              Number(saved.currentIndex) || 0,
              Math.max(0, safeQuestionIds.length - 1)
            ),
        answers: safeAnswers,
        completed,
      };
    } else {
      session = {
        type,
        questionIds,
        currentIndex: 0,
        answers: [],
        completed: false,
      };
    }

    onUpdate(session);
    return session;
  }

  function currentQuestion() {
    if (!session || session.completed) {
      return null;
    }

    const id =
      session.questionIds[session.currentIndex];

    return questionsById[id] || null;
  }

  function submit(choiceIndex) {
    const question = currentQuestion();

    if (!question || session.completed) {
      return null;
    }

    /*
     * 二重回答防止
     */
    if (
      session.answers.length > session.currentIndex
    ) {
      return null;
    }

    const isCorrect =
      choiceIndex === question.answer;

    const result = {
      questionId: question.id,
      choiceIndex,
      isCorrect,
    };

    session.answers.push(result);

    onUpdate(session);

    return {
      question,
      result,
    };
  }

  function goNext() {
    if (!session) {
      return null;
    }

    /*
     * 最後の問題まで回答済みなら完了。
     */
    if (
      session.currentIndex >=
      session.questionIds.length - 1
    ) {
      session.completed = true;
    } else {
      session.currentIndex += 1;
    }

    onUpdate(session);

    return session;
  }

  function getSession() {
    return session;
  }

  function resultSummary() {
    if (!session) {
      return {
        correct: 0,
        total: 0,
        accuracy: 0,
      };
    }

    const total = session.answers.length;

    const correct =
      session.answers.filter(
        (item) => item.isCorrect
      ).length;

    return {
      correct,
      total,
      accuracy: total
        ? Math.round((correct / total) * 100)
        : 0,
    };
  }

  return {
    init,
    start,
    currentQuestion,
    submit,
    goNext,
    getSession,
    resultSummary,
  };
})();