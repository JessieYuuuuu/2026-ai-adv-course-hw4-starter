# AI 審查報告

- 審查日期：2026-10-27
- 審查範圍：訂單、付款、運費、購物車與相關測試
- 執行角色：`security-reviewer`、`code-reviewer`、`test-runner`
- 限制：本輪只進行審查與測試，未修改應用程式碼或測試

## 摘要

原始審查共確認 7 組問題：3 組高風險、1 組中高風險、3 組中風險。兩位 reviewer 的重疊發現已合併。本輪已修正老師題目對應的 5 個缺陷：4 個程式缺陷，以及 1 個被跳過的關鍵測試。修正後 Unit/API 測試為 57 項全數通過，Integration 測試為 10 項全數通過，沒有跳過測試。

| 優先度 | 問題 | 主要影響 | 狀態 |
|---|---|---|---|
| 高 | 訂單詳情缺少訂單歸屬檢查 | 跨會員讀取收件資料與訂單內容 | 已修正並補測試 |
| 高 | 購物車更新接受小數數量 | 操縱結帳金額、庫存與數量 | 已修正並補測試 |
| 高 | 付款成功回應未強制要求簽章 | 未簽章回應可能把訂單標成已付款 | 已修正並補測試 |
| 中高 | 未付款訂單可長期占用庫存 | 惡意建立 pending 訂單可造成庫存阻斷 | 待需求決策 |
| 中 | 偏遠地區附加費信任客戶端旗標 | 使用者可自行關閉附加費 | 待需求決策 |
| 中 | ECPay 付款頁缺少登入與訂單歸屬檢查 | 訂單資料外洩與未授權啟動付款流程 | 待需求決策 |
| 中 | 1,500 元免運邊界錯誤且測試被跳過 | 邊界訂單多收運費，測試仍可能顯示成功 | 程式與測試皆已修正 |

## 詳細發現

### 1. 高：訂單詳情存在 IDOR／個資外洩（已修正）

- 位置：`src/routes/orderRoutes.js:350-360`
- 相關程式：`src/services/orderService.js:21-27`
- 測試缺口：`tests/orders.test.js:110-140`

`GET /api/orders/:id` 雖然經過 `authMiddleware`，但查詢時直接使用 `findOrderById(req.params.id)`，沒有把 `req.user.userId` 納入條件。任一已登入會員只要取得其他會員的訂單 UUID，就能讀取收件姓名、Email、地址、金額與品項。

建議改用既有的 `findOrderForUser(id, userId)`，管理員查詢則走獨立且受權限保護的端點；新增「會員 B 查詢會員 A 訂單時回傳 404 或 403」的測試。

修正結果：訂單詳情已改用 `findOrderForUser()`，跨會員查詢固定回傳 404，並新增回歸測試。

### 2. 高：購物車更新接受小數數量，可操縱結帳金額（已修正）

- 位置：`src/routes/cartRoutes.js:292-315`
- 影響結帳：`src/routes/orderRoutes.js:177-195`
- 資料表限制：`src/database.js:43-49`
- 測試缺口：`tests/cart.test.js:46-56,100-111`

新增購物車項目時使用 `parsePositiveInteger()`，但 PATCH 更新數量只使用 `Number(quantity)` 與 `Number.isNaN()`。像 `0.5` 或 `1.5` 這類正小數會通過檢查；SQLite 的型別親和性與 `CHECK(quantity > 0)` 也不會阻擋正小數。訂單小計又直接使用該數量計算，因此可用小數數量購買商品並改變庫存扣除量。`0` 或負數則可能撞上資料庫限制後變成 500，而不是預期的 400。

建議 PATCH 與 POST 共用 `parsePositiveInteger()`；補上 0、負數、小數、空白、垃圾字串、陣列與非有限數值等測試。

修正結果：PATCH 已與 POST 共用 `parsePositiveInteger()`；新增 0、負數、小數、垃圾字串、陣列與 `null` 的回歸測試，皆回傳 400。

### 3. 高：付款成功回應缺少 `CheckMacValue` 時仍會被接受（已修正）

- 位置：`src/services/paymentService.js:10-27`
- 規格：`docs/ARCHITECTURE.md:439-445`
- 測試缺口：`tests/integration/order-checkout.integration.test.js:421-453`

程式只有在 `tradeInfo.CheckMacValue` 存在時才驗證簽章。當 `TradeStatus === '1'`、交易編號與金額都相符，但完全沒有 `CheckMacValue` 時，`isTradePaid()` 仍會回傳 `true`，可能將訂單標記為已付款。

建議所有已付款結果都必須包含非空簽章，且簽章驗證必須成功；同時核對協定要求的商店識別資訊。新增「缺少簽章但其他欄位正確」的整合測試。

修正結果：已付款結果現在必須提供 `CheckMacValue` 並通過驗證；整合測試新增缺少簽章的偽造回應，確認訂單維持 pending 並回傳 `ECPAY_QUERY_ERROR`。

### 4. 中高：未付款訂單可長期占用庫存（待需求決策）

- 位置：`src/services/orderService.js:80-108`
- 訂單狀態：`src/database.js:53-69`
- 相關驗收測試：`tests/acceptance/cancel-order.test.js`

建立仍為 `pending` 的訂單時就會扣除商品庫存，但目前正式流程沒有取消、逾時釋放或付款失敗後回補庫存的機制。註冊會員可以大量建立訂單後不付款，使其他使用者無法購買。

建議建立有期限的庫存保留機制，並在取消、付款失敗或逾時時以交易原子回補；或將正式扣庫存延後至付款確認。需加入大量 pending 訂單與逾時回補測試。此項也與 starter 尚待完成的取消訂單 Issue 有關。

### 5. 中：偏遠地區附加費信任客戶端旗標（待需求決策）

- 位置：`src/routes/orderRoutes.js:113-149,177-195`
- 測試缺口：`tests/orders.test.js:26-56`

伺服器雖會重算運費，卻直接接受客戶端傳入的 `isRemoteArea`。使用者可提交偏遠地址，同時傳入 `false` 來略過 200 元偏遠附加費。這表示關鍵計價條件仍由客戶端控制。

建議由伺服器依郵遞區號或地址資料判定偏遠地區，或建立後台覆核機制；加入「地址與旗標不一致」的測試。

### 6. 中：ECPay 付款頁缺少登入與訂單歸屬檢查（待需求決策）

- 位置：`src/routes/pageRoutes.js:60-71`
- 現有測試：`tests/integration/order-checkout.integration.test.js:316-340`

`GET /ecpay/payment/:orderId` 直接使用 `findOrderById()`，沒有登入或訂單擁有者檢查。知道訂單 ID 的人可取得含交易編號、金額、品項與有效簽章的付款表單，並替任意 pending 訂單啟動付款流程。現有整合測試也明確以無認證請求期待 200。

建議要求登入後以使用者身分查詢訂單，或改用短效、一次性的付款 token；補上未登入與跨會員存取應被拒絕的測試。

### 7. 中：1,500 元免運邊界錯誤，精準測試被跳過（已修正）

- 位置：`src/utils/shipping.js:39-41`
- 被跳過的測試：`tests/shipping.test.js:29-34`
- 規格：`docs/ARCHITECTURE.md:420`、`docs/CHANGELOG.md:73-74`

規格是「滿 1,500 元免運」，實作卻使用 `subtotal > 1500`。小計恰好 1,500 元時仍會收取基本運費；唯一精準驗證此邊界的測試被 `it.skip`，因此一般測試執行可能無法揭露問題。

建議比較條件改為 `>=`，並恢復該測試。

修正結果：免運判斷已改為 `>=`，原本的 `it.skip` 已恢復成一般測試，並在完整 Unit/API 測試中通過。

## 測試執行結果

先以 `npm ci` 依 `package-lock.json` 安裝 333 個套件；安裝沒有改動 `package-lock.json`。`npm ci` 同時回報 14 個相依套件弱點（6 個 moderate、6 個 high、2 個 critical），本輪沒有執行會變更依賴版本的 `npm audit fix`，也尚未逐項判定這些弱點是否能由本專案的執行路徑觸發。

| 指令 | 結束碼 | 結果 |
|---|---:|---|
| `npm run test:unit` | 0 | 7 個測試檔全數通過；57 項通過、0 項跳過 |
| `npm run test:integration` | 0 | 1 個測試檔通過；10 項全數通過 |

Unit/API 測試檔：

- `tests/orders.test.js`：10 項通過。
- `tests/cart.test.js`：10 項通過。
- `tests/adminProducts.test.js`：8 項通過。
- `tests/auth.test.js`：8 項通過。
- `tests/adminOrders.test.js`：4 項通過。
- `tests/shipping.test.js`：13 項通過。
- `tests/products.test.js`：4 項通過。

Integration 測試檔：

- `tests/integration/order-checkout.integration.test.js`：10 項通過。

第一次由唯讀 test-runner 執行時，Supertest 嘗試使用 `127.0.0.1` 臨時本機埠而遭沙箱以 `connect EACCES` 阻擋；該結果屬執行環境限制，不是功能測試失敗。主代理隨後在允許本機 loopback、仍不修改程式碼或測試的環境重新執行，得到上表的有效結果。

原先跳過的 `tests/shipping.test.js:29-34`「商品小計 1,500 元時免基本運費」已恢復並通過。目前沒有跳過測試。第 4～6 項仍屬待需求決策的架構風險，現有測試全綠不代表這些風險已被處理。

## Starter 預期尚未完成的驗收範圍

`README.md:44-61` 明確說明 `tests/acceptance/` 的三組測試在 `main` 分支預期失敗，完成對應 Issue 後才會通過；`vitest.config.js:7` 也將驗收測試排除於 unit test。這些屬於待實作的作業範圍，不應誤判成既有功能的回歸：

- `tests/acceptance/coupon.test.js`：優惠碼、折扣快照與折扣後免運門檻。
- `tests/acceptance/cancel-order.test.js`：取消 pending 訂單、庫存回補、冪等與跨會員保護。
- `tests/acceptance/order-filter.test.js`：會員訂單的狀態篩選與分頁。

因此，即使未來 `test:unit` 與 `test:integration` 全數通過，也不能代表以上三個 Issue 已完成。
