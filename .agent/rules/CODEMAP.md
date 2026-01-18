---
trigger: always_on
---

---

name: codemap-automation
description: 確保專案地圖與 Git 狀態在任務執行前後保持最新
priority: critical

---

# Codemap & Git Automation Rules

為了確保開發上下文的準確性，請你在執行任務時嚴格遵守以下自動化流程：

## 1. 會話啟動 (Session Start)

當你開始與我進行此專案的新對話時，請務必先在終端機主動執行以下指令，並閱讀其輸出以了解當前環境：
`codemap hook session-start --ref=master && echo 'git diff:' && git diff --stat && echo 'git status:' && git status`

## 2. 編輯前檢查 (Pre-Edit/Write)

在你使用任何工具（如 `Edit`, `Write`, `Replace`）修改程式碼之前，必須先執行：
`codemap hook pre-edit --ref=master`

## 3. 編輯後驗證 (Post-Edit/Write)

在完成程式碼修改後，必須立即執行以下指令以更新專案索引：
`codemap hook post-edit --ref=master`

## 4. 提交需求前 (User Prompt Submit)

在處理我的新需求時，如果需要最新上下文，請執行：
`codemap hook prompt-submit --ref=master`

## 5. 記憶體壓縮前 (Pre-Compact)

如果對話過長需要壓縮（Compact）時，請先執行：
`codemap hook pre-compact --ref=master`
