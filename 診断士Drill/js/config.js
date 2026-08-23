const APP_CONFIG = {
  name: "診断士Drill",
  storageKey: "shindanshi-drill-v1",
  dailyCount: 20,
  subjects: [
    { id: "economics", name: "経済学・経済政策" },
    { id: "finance", name: "財務・会計" },
    { id: "management", name: "企業経営理論" },
    { id: "operations", name: "運営管理" },
    { id: "legal", name: "経営法務" },
    { id: "info", name: "経営情報システム" },
    { id: "sme", name: "中小企業経営・中小企業政策" },
  ],
};

function getSubjectName(subjectId) {
  const found = APP_CONFIG.subjects.find((item) => item.id === subjectId);
  return found ? found.name : subjectId;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
