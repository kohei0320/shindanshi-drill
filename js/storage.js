const Storage = (() => {
  function emptyState() {
    return {
      history: {},
      daily: null,
      favorites: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(APP_CONFIG.storageKey);

      if (!raw) {
        return emptyState();
      }

      const parsed = JSON.parse(raw);

      return {
        history: parsed.history || {},
        daily: parsed.daily || null,
        favorites: Array.isArray(parsed.favorites)
          ? parsed.favorites
          : [],
      };
    } catch (error) {
      console.warn(
        "学習履歴の読み込みに失敗したため、初期状態で開始します。",
        error
      );

      return emptyState();
    }
  }

  function save(state) {
    localStorage.setItem(
      APP_CONFIG.storageKey,
      JSON.stringify(state)
    );
  }

  function isFavorite(state, questionId) {
    return (
      (state.favorites || []).indexOf(questionId) >= 0
    );
  }

  function toggleFavorite(state, questionId) {
    if (!state.favorites) {
      state.favorites = [];
    }

    const index =
      state.favorites.indexOf(questionId);

    if (index >= 0) {
      state.favorites.splice(index, 1);
      return false;
    }

    state.favorites.unshift(questionId);
    return true;
  }

  function recordAnswer(
    state,
    questionId,
    isCorrect
  ) {
    const current =
      state.history[questionId] || {
        correct: 0,
        wrong: 0,
        lastAt: null,
        lastCorrect: null,
      };

    if (isCorrect) {
      current.correct += 1;
    } else {
      current.wrong += 1;
    }

    current.lastAt =
      new Date().toISOString();

    current.lastCorrect = isCorrect;

    state.history[questionId] = current;
  }

  function createDailyState(questionIds) {
    return {
      date: todayKey(),
      questionIds: questionIds || [],
      currentIndex: 0,
      answers: [],
      completed: false,
      result: null,
    };
  }

  function appendDailyQuestions(
    state,
    questionIds
  ) {
    if (!state.daily) {
      state.daily =
        createDailyState(questionIds);

      return;
    }

    state.daily.questionIds = [
      ...(state.daily.questionIds || []),
      ...(questionIds || []),
    ];

    state.daily.completed = false;
  }

  function saveDailyResult(state) {
    if (!state.daily) return;

    const answers =
      state.daily.answers || [];

    const total =
      answers.length;

    const correct =
      answers.filter(
        (item) => item.isCorrect
      ).length;

    state.daily.result = {
      correct,
      total,
      accuracy: total
        ? Math.round(
            (correct / total) * 100
          )
        : 0,
      completedAt:
        new Date().toISOString(),
    };
  }

  return {
    load,
    save,
    emptyState,
    isFavorite,
    toggleFavorite,
    recordAnswer,
    createDailyState,
    appendDailyQuestions,
    saveDailyResult,
  };
})();