---
name: work-issue
description: 依專案既定流程處理指定的 GitHub Issue，完成分支、實作、測試、文件、PR 與審查，並停在待人工合併狀態。僅在使用者明確呼叫此 Skill 並提供 Issue 編號時使用。
---

# Work Issue

以 `$work-issue <編號>` 呼叫。將 Skill 名稱後的唯一參數視為 GitHub Issue 編號；參數若不是單一正整數，先請使用者更正，不得猜測 Issue。

## 完成條件

只有同時符合下列條件才算完成：

- Issue 原先為開啟狀態、由目前登入 GitHub CLI 的使用者建立，且帶有 `ready`。
- 功能與必要的 Unit 或 Integration Test 已完成。
- `test:unit`、`test:integration`、該 Issue 的驗收測試及最新 GitHub Actions 均通過。
- 文件與 `openapi.json` 已同步更新。
- PR 已開啟，描述足以讓人工審查者理解實作與設計決定，且包含 `Closes #<編號>`。
- Reviewer 沒有尚未處理的「高」嚴重度問題。
- Issue 最終只有正確的工作流程狀態 `in-review`，等待人工合併。

## 流程

### 1. 驗證環境與遠端狀態

1. 讀取工作區與專案的 `AGENTS.md`，遵循所有適用規則。
2. 確認目前儲存庫、`origin` 與 `gh auth status`；用 GitHub CLI 取得目前登入者，不能只依 Git 設定猜測帳號。
3. 在任何 Git 遠端、分支、提交、Issue、PR、拉取或推送判斷前，先對正確 remote 執行 `git fetch --prune`。
4. 核對目前分支、工作目錄、本機與遠端 refs，以及 ahead／behind。若 fetch 失敗，停止所有後續 GitHub 寫入與分支操作，明確回報無法確認最新狀態。
5. 工作目錄若有既存變更，不得丟棄、覆寫、暫存或夾帶提交；無法安全隔離時停止並請使用者處理。

### 2. 驗證並接手 Issue

1. 用 `gh issue view <編號>` 讀取標題、作者、狀態、標籤、本文及驗收條件。
2. 必須確認 Issue：
   - 狀態為 OPEN；
   - 作者就是目前登入 GitHub CLI 的使用者；
   - 帶有 `ready`。
3. 任一條件不符時不得修改 Issue、建立分支或實作，直接說明不符合之處。
4. 通過驗證後，移除 `ready` 並加入 `in-progress`。若標籤更新失敗，停止流程。

### 3. 從最新 main 建立工作分支

1. 以最新 `origin/main` 為基準，不得從過期的本機 main 或其他功能分支延伸。
2. 分支命名為 `issue-<編號>-<名稱>`；名稱取自 Issue 標題，使用簡短、可辨識的英文小寫 kebab-case。
3. 若同名分支已存在，先檢查它是否確實屬於這個 Issue，再決定安全續作；不得覆寫他人的分支，也不得 force push 或改寫歷史。

### 4. 實作與測試

1. 以 Issue 本文與驗收條件為範圍，先閱讀現有架構、測試與相關文件，再實作最小而完整的變更。
2. 至少新增或更新一項能防止回歸的 Unit Test 或 Integration Test。不得修改既有驗收測試來讓功能過關。
3. 若缺少依賴，依 lockfile 使用專案既定安裝方式；不得順便升級依賴、執行自動修復或擴張成無關重構。
4. 更新所有受影響的繁體中文文件與 API 說明。若專案由原始碼註解產生 `openapi.json`，先改原始定義，再執行專案既定產生指令，不得只手改產物。
5. 派 `test-runner` 執行：
   - `npm run test:unit`
   - `npm run test:integration`
   - Issue 指定的驗收測試

   Issue A／優惠碼的驗收指令為 `npm run test:acceptance -- coupon`；其他 Issue 必須從 Issue 本文或專案測試設定確認正確指令，不得猜測。
6. `test-runner` 只回報失敗項目、位置與可能原因，不修改程式碼。若測試因代理隔離環境無法監聽 loopback 等純環境限制而失敗，由主代理在允許的專案環境重跑相同指令；不得把環境錯誤冒充測試通過，也不得把產品失敗誤判成環境問題。
7. 任一真實測試失敗都必須修正並重新跑完三類測試，不能只重跑失敗的那一項。

### 5. Commit、Push 與建立 PR

1. 提交前檢查 diff，只納入本 Issue、測試、文件、OpenAPI 與本流程必要的檔案；不得提交密鑰、暫存檔、`node_modules` 或其他使用者變更。
2. 使用能描述結果的 commit 訊息。再次 `git fetch --prune` 並核對 refs、ahead／behind 與工作目錄後，才推送功能分支。
3. 建立以 `main` 為 base 的 PR。PR 描述不得只有一句摘要，至少包含：
   - 目的與範圍；
   - 主要程式變更及重要檔案；
   - 資料模型、API 或相容性影響；
   - 關鍵設計決定與取捨；
   - 新增或更新的測試，以及每個測試指令的實際結果；
   - 更新的文件與 OpenAPI 內容；
   - `Closes #<編號>`。
4. 不得宣稱未執行或未完成的測試、審查與 CI 結果。

### 6. Reviewer 與修正迴圈

1. PR 建立後，派 `code-reviewer` 檢查業務邏輯、規格邊界、回歸風險及測試覆蓋；涉及權限、身分驗證、金流、輸入或敏感資料時，同時派 `security-reviewer`。
2. Reviewer 僅唯讀檢查 PR diff，不直接修改程式碼；每項問題應附嚴重度、檔案與行號、觸發情境、影響及建議修法。
3. 只要存在「高」嚴重度問題，就必須修正、補充必要測試，重新跑 Unit、Integration 與驗收測試，commit、push，並再次審查，直到沒有未處理的高嚴重度問題。
4. 中低嚴重度問題需在結果中列明；可修正與本 Issue 直接相關且低風險的項目，但不得藉機擴張範圍。
5. 等待最新 commit 的 GitHub Actions 完成。真實 CI 失敗必須修正；外部或暫時性故障應保留證據並明確回報，不得假裝成功。

### 7. 轉為待人工合併並停止

只有在完成條件全部成立後，才移除 `in-progress` 並加入 `in-review`。最後重新確認：

- PR 仍為 OPEN；
- PR 指向正確的 Issue 並含 `Closes #<編號>`；
- 最新測試與 CI 通過；
- 沒有未處理的高嚴重度問題；
- Issue 標籤為 `in-review`。

回報 PR 連結、變更摘要、測試結果、Reviewer 結論與待人工決定事項，然後停止。

## 邊界與失敗處理

- **絕不合併或核准 PR。** 不得執行 merge、auto-merge、squash、rebase merge，也不得手動關閉 Issue；`Closes #<編號>` 只會在人類合併後生效。
- 不得刪除遠端或本機分支，不得 force push，不得改寫既有提交歷史。
- 驗證 Issue 失敗時不得改動任何工作流程標籤。
- 已進入 `in-progress` 後若遇到可修復問題，保留 `in-progress` 並繼續處理；不得提前標成 `in-review`。
- 若缺少權限、驗收條件矛盾、需要產品決策，或外部狀態使工作確實必須由人介入，將 `in-progress` 改為 `needs-human`，清楚留下阻塞原因與安全恢復點後停止。不得僅因工作困難或測試失敗就使用 `needs-human`。
- 不得修改 Issue 驗收標準、降低測試門檻，或以跳過測試完成流程。
- 不得處理 Issue 以外的順手修復；發現額外問題時只記錄並建議另開 Issue。
