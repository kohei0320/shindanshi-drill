const Quiz = (() => {
  let questionsById = {};
  let session = null;
  let onUpdate = () => {};

  function init(questions, handlers) {
    questionsById = {};
    questions.forEach((question) => {
      questionsById[question.id] = question;
    });
    onUpdate = handlers.onUpdate;
  }

  function start(type, questionIds, saved) {
    session = saved || {
      type,
      questionIds,
      currentIndex: 0,
      answers: [],
      completed: false,
    };
    onUpdate(session);
    return session;
  }

  function currentQuestion() {
    if (!session) return null;
    const id = session.questionIds[session.currentIndex];
    return questionsById[id] || null;
  }

  function submit(choiceIndex) {
    const question = currentQuestion();
    if (!question || session.completed) return null;
    const isCorrect = choiceIndex === question.answer;
    const result = {
      questionId: question.id,
      choiceIndex,
      isCorrect,
    };
    session.answers.push(result);
    onUpdate(session);
    return { question, result };
  }

  function goNext() {
    if (!session) return session;
    if (session.currentIndex < session.questionIds.length - 1) {
      session.currentIndex += 1;
    } else {
      session.completed = true;
    }
    onUpdate(session);
    return session;
  }

  function getSession() {
    return session;
  }

  function resultSummary() {
    if (!session) return { correct: 0, total: 0, accuracy: 0 };
    const total = session.answers.length;
    const correct = session.answers.filter((item) => item.isCorrect).length;
    return {
      correct,
      total,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
    };
  }

  return { init, start, currentQuestion, submit, goNext, getSession, resultSummary };
})();
