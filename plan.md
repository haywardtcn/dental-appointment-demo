# 晴光牙科 · 預約系統 Plan

> 呢份係 plan，唔係 code。前台 UI / UX 跟 `design.md`（另一個 session 負責）。
> 更新：2026-11-25 · 架構：**React + Strapi v5 only**（唔用 Spring Boot）· Demo only

---

## 0. 範圍

| Feature | 一句講晒 |
|---|---|
| 基本預約 | 2 phase form：Phase 1 揀服務、醫生、時間，即刻 lock 10 分鐘；Phase 2 填資料，confirm |
| Email 通知 | 唔真駁 SMTP，用自己寫嘅 `log` email provider 落 console log，同時寫入 `notification-log` |
| Wait list | **前台唔顯示，只有 admin 加入**；有位甩出嚟就自動 offer 畀排頭嗰個。病人唔可以自己改期，想改早就由 admin 加入 waitlist |
| 自動抽可用時間 | Admin 喺 Strapi 設定**自訂 rules**（開放時間、休息、假期、session 長度、每日上限），系統自動切出 x 分鐘一個嘅 session 畀病人 book，再扣走已有預約同 admin 封時段；公眾假期自動 import，減少人手。**唔做外部 calendar sync**（Google / Outlook 都唔駁），後台日曆用 strapi-calendar 睇 |
| 多醫生 | 計位單位係醫生。暫時 1 位，admin 可以喺 Strapi 新增 |

唔做（demo 範圍外）：Google / 外部 calendar sync、網上付款、病人帳戶登入、多分店、真 SMTP、SMS。

---

## 1. 架構

```
┌──────────────┐  REST (JSON)   ┌───────────────────────────────────────────┐
│ React (Vite) │ ─────────────▶ │ Strapi v5 (TypeScript)                    │
│ 病人前台      │                │                                           │
└──────────────┘                │ Content API（public read）：服務、醫生、文案 │
                                │ Custom API  /api/booking/*：slot、hold、   │
                                │             confirm、waitlist、manage      │
                                │ Cron tasks：清過期 hold、waitlist、寄通知、  │
                                │             24h reminder                  │
                                │ Admin panel：設定 + 預約 CRUD（現成）        │
                                │ strapi-calendar plugin：後台日曆           │
                                │ Local plugin `booking-admin`：緊急休診      │
                                │             （自己寫，好細）                 │
                                └───────┬───────────────────────────────────┘
                                        │
                                 ┌──────▼──────┐
                                 │ PostgreSQL  │
                                 └─────────────┘
```

**原則：**
- Strapi 一個 process 包晒：內容、設定、預約數據、business logic、cron、admin。
- 預約 logic 全部放喺 **custom service**（`src/api/booking/services/*`），controller 同 admin 操作都經呢個 service，唔好散落喺 lifecycle 度。
- React 讀內容用 Strapi Content API；同時間或者預約有關嘅嘢**只用** `/api/booking/*`。前端**唔自己計** slot。
- **預約相關嘅 content type 唔開 public permission**（見 §12 安全），唔係 `/api/reservations` 會直接 leak 晒病人資料。

---

## 2. Tech stack

| 層 | 選擇 | 備註 |
|---|---|---|
| CMS / Backend | Strapi v5，TypeScript | |
| DB | PostgreSQL 16 | 要用 `tstzrange` + `btree_gist` exclusion constraint 防 double booking，**唔可以用 SQLite** |
| DB migration | Strapi `database/migrations/*.js`（knex） | 開 extension、建 lock table、constraint |
| 時間 | Luxon（`Asia/Hong_Kong`） | |
| Cron | Strapi `config/cron-tasks.ts`（`server.cron.enabled: true`） | |
| Email | `@strapi/plugin-email` + 自己寫嘅 local provider `email-provider-log`；optional nodemailer 指去 Mailpit | |
| Rate limit | Koa middleware（例如 `koa2-ratelimit`，或者自己寫一個簡單嘅 in-memory 版） | |
| Test | Jest + supertest，對住 docker 起嘅測試 Postgres | 併發 test 一定要用真 Postgres |
| Frontend | React 18 + TypeScript + Vite、TanStack Query、React Hook Form + Zod、react-i18next、GSAP + Lenis、`iconoir-react` | 跟 `design.md` |
| Admin 日曆 | **`@offset-dev/strapi-calendar@1.0.0`**（pin 死版本） | 見 §11A.1；用佢嘅 extension API 加少量 code |
| Admin 自訂頁 | React + **Strapi 原生 UI**：`@strapi/design-system`、`@strapi/icons`、`@strapi/strapi/admin`（`Layouts`、`Page`、`useFetchClient`、`useNotification`） | 只做緊急休診（§11A）；唔加任何其他 UI library 或者自訂 CSS |
| Dev env | docker-compose：postgres、strapi、web、mailpit（optional） | |

---

## 3. Strapi content types

### 3.1 設定同內容（admin 喺 Content Manager 改）

| Type | 類型 | Fields | 用途 |
|---|---|---|---|
| `clinic-setting` | Single | `sessionMinutes`(30，預設 session 長度 x), `holdMinutes`(10), `minLeadTimeMin`(120), `bookingHorizonDays`(60), `waitlistOfferMinutes`(30), `waitlistMaxOffers`(3), `cancelCutoffHours`(24), `maxSameServiceBookings`(1), `maxActiveBookingsPerContact`(3), `adminEmail` | 全局規則（timezone 固定 `Asia/Hong_Kong`，寫死喺 code） |
| `schedule-rule` | Collection | 見 §3.4 | **自訂排期規則**：開放時間、休息、假期、session 長度、每日上限，全部用呢一個 type 設定 |
| `public-holiday` | Collection | `date`, `name_zh`, `name_en`, `year` | 香港公眾假期日子（自動 import，§3.4），俾 rule 引用 |
| `service` | Collection | `slug`, `name_zh`, `name_en`, `durationMin`, `bufferMin`, `bookable`, `doctors`(relation) | 時長 + buffer 決定要佔幾多個連續 session |
| `doctor` | Collection | `slug`, `name_*`, `bio_*`, `photo`, `active`, `color`, `sortOrder` | **計位單位** |
| 內容類 | Single / Collection | hero、診所環境、FAQ、地址交通、chat 預設答案 | 純內容，React 直接讀 |

- 設定類 type **關 draft & publish**（`draftAndPublish: false`），改完即刻生效，費事 admin 改完唔記得撳 publish。內容類可以保留 draft & publish。
- 抽 slot 時直接用 document service 讀設定，加一層 in-memory cache；設定類 type 有 lifecycle `afterCreate/Update/Delete` 就清 cache。

### 3.2 預約數據（全部 `draftAndPublish: false`）

| Type | Fields |
|---|---|
| `reservation` | `reference`(unique，例如 `QG-2612-0042`), `doctor`, `service`, `startAt`, `endAt`, `blockedUntil`(= endAt + buffer), `kind`(APPOINTMENT / BLOCK), `status`(HELD / CONFIRMED / ARRIVED / COMPLETED / NO_SHOW / EXPIRED / RELEASED / CANCELLED), `source`(PUBLIC / WAITLIST / ADMIN), `expiresAt`, `holdTokenHash`🔒, `manageTokenHash`🔒, `idempotencyKey`🔒, `patientName`, `phone`, `email`, `phoneNormalized`🔒, `emailNormalized`🔒, `patientNameNormalized`🔒, `locale`, `patientNote`, `internalNote`, `cancelReason`, `conflict`, `conflictReason`, `calendarTitle`, `calendarColor`（後兩個係畀日曆 plugin 用嘅 denormalized field，由 middleware 自動填，見 §11A.1） |
| `waitlist-entry` | `service`, `doctor?`, `dateFrom`, `dateTo`, `preferredTime`(MORNING / AFTERNOON / ANY), `name`, `phone`, `email`, `locale`, `status`(ACTIVE / OFFERED / BOOKED / OFFER_EXPIRED / EXPIRED / CANCELLED), `replacesReservation?`（§7.1a）, `addedBy`(admin user), `queuedAt`（排隊次序，排返隊尾時更新）, `offerCount`, `skippedPeriods`(JSON，offer 過而冇接嘅時段), `offerReservation`, `offerTokenHash`🔒, `manageTokenHash`🔒, `phoneNormalized`🔒, `emailNormalized`🔒 |
| `notification-log` | `type`, `to`, `locale`, `subject`, `body`, `status`(PENDING / SENT / FAILED), `attempts`, `nextAttemptAt`, `sentAt`, `reservation?`, `waitlistEntry?` |
| `audit-log` | `actorType`(PATIENT / ADMIN / SYSTEM), `actorId`, `action`, `target`, `before`(JSON), `after`(JSON) |

🔒 = `private: true`（API response 唔出），喺 Content Manager 設定成隱藏。Token 只存 hash，原文只喺 email 連結出現一次。

### 3.3 多醫生
- 所有預約數據、lock、API 都帶 `doctor`，唔好 hard-code 單一醫生。
- Admin 喺 Content Manager 新增 `doctor`，揀返佢做得嘅 `service.doctors`，佢就即刻有得預約：全診所通用嘅 rule（`doctors` 留空）會自動套用落佢身上，**唔使再逐位醫生設定時間**。
- Rule 嘅 `doctors` 留空即係全診所；揀咗就只套用嗰幾位醫生。醫生個人長期安排（例如逢星期三休息）用 rule；臨時一次過嘅（開會）用 admin 封時段（`reservation.kind=BLOCK`）。
- 醫生**唔可以刪除**（有預約嘅話用 document middleware 擋住），只可以 `active=false`：停止新預約，佢已有嘅未來預約標 conflict。

### 3.4 自訂排期規則（`schedule-rule`）

目標：admin 設定一次，系統自動將每日切成 **x 分鐘一個 session** 畀病人 book，**唔使人手逐日開時段**。

**Fields**

| Field | 說明 |
|---|---|
| `name` | 例如「平日開放時間」「公眾假期休息」「冬季時間」 |
| `active` | 開或關呢條 rule，唔使刪 |
| `effect` | `OPEN`（加開放時間）/ `CLOSE`（休息、假期）/ `SESSION_LENGTH`（改 session 長度）/ `DAILY_LIMIT`（每日最多幾多個預約） |
| `repeat` | `WEEKLY`（揀星期幾）/ `DATE_RANGE`（某段日子，一日都得）/ `MONTHLY_NTH_WEEKDAY`（例如每月第一個星期六）/ `PUBLIC_HOLIDAY`（公眾假期當日）/ `BEFORE_PUBLIC_HOLIDAY`（假期前一日） |
| `daysOfWeek` | `WEEKLY` / `MONTHLY_NTH_WEEKDAY` 用，例如 `[1,2,3,4,5]` |
| `nthWeek` | `MONTHLY_NTH_WEEKDAY` 用：1–4 或者 -1（最後一個） |
| `dateFrom` / `dateTo` | Rule 生效日期範圍；`DATE_RANGE` 就係嗰段日子。留空即係長期有效 |
| `timeRanges` | Repeatable component（`start`, `end`）。`OPEN` 就係開放時段；`CLOSE` 留空即係**成日休息**，填咗就只休嗰幾段（例如午飯、半日假） |
| `sessionMinutes` | `SESSION_LENGTH` 用，例如 20 / 30 / 45 |
| `maxBookings` | `DAILY_LIMIT` 用 |
| `doctors` | Relation，留空 = 全診所 |
| `services` | Relation，留空 = 所有服務（例如「植牙只喺星期二、四做」就係 `OPEN` + `services=[植牙]`） |
| `priority` | 數字，越大越優先；只喺同類 rule 有衝突時用 |
| `reasonZh` / `reasonEn` | 休息原因，前台日曆會顯示（例如「聖誕節」「診所裝修」） |

**計法（每位醫生、每日、每項服務）**
1. 搵出當日適用嘅 rule：`active`、喺 `dateFrom–dateTo` 之內、`repeat` 啱當日、`doctors` / `services` 包括佢。
2. **開放時段** = 所有 `OPEN` rule 嘅 `timeRanges` 合併（union）。
3. **減走** 所有 `CLOSE` rule：冇 `timeRanges` 就成日休息，有就減走嗰幾段。**`CLOSE` 永遠贏 `OPEN`**，咁 admin 加假期就一定唔會漏開。
4. **Session 長度 x** = `priority` 最高嘅 `SESSION_LENGTH` rule；冇就用 `clinic-setting.sessionMinutes`。
5. 由每段開放時段嘅開始時間起，每 x 分鐘切一個 session（例如 09:30、10:00、10:30…）。尾段唔夠 x 分鐘就唔要。
6. 服務要佔 `ceil((durationMin + bufferMin) / x)` 個**連續** session（例如 x=30、植牙諮詢 60 分 + 10 分 buffer = 3 個 session）。
7. `DAILY_LIMIT`：當日 CONFIRMED 數目到咗 `maxBookings` 就當日 FULL。

**Seed（開箱即用，admin 唔使由零開始）**

| Rule | effect | repeat | 內容 |
|---|---|---|---|
| 平日開放時間 | OPEN | WEEKLY 一至五 | 09:30–13:00、14:00–18:30 |
| 星期六開放時間 | OPEN | WEEKLY 六 | 09:30–13:00 |
| 公眾假期休息 | CLOSE | PUBLIC_HOLIDAY | 成日 |
| 假期前一日早收 | CLOSE | BEFORE_PUBLIC_HOLIDAY | 16:00–18:30（預設 `active=false`，示範用） |
| 每月第一個星期六休息 | CLOSE | MONTHLY_NTH_WEEKDAY 六、第 1 個 | 成日（預設 `active=false`，示範用） |
| 預設 session | SESSION_LENGTH | WEEKLY 全週 | 30 分鐘 |

**減少人手**
- **公眾假期自動 import**：cron 每年 11 月 1 日同每次開機（如果下年未有）讀 1823 iCal，寫入 `public-holiday`，冇需要人手輸入。`booking-admin` 有個「立即 import」按鈕做後備。
- 因為有 `PUBLIC_HOLIDAY` rule，假期一 import 就自動休息，唔使逐日加。
- 新醫生自動套用全診所 rule。
- 改完 rule 即刻生效（`draftAndPublish: false` + 清 cache）。

**防 admin 設錯**
- Document middleware 驗證：`OPEN` 一定要有 `timeRanges`；`start < end`；`SESSION_LENGTH` 要 5–240 分鐘，而且係 5 嘅倍數；`repeat` 同需要嘅 field 要夾（例如 `WEEKLY` 一定要有 `daysOfWeek`）。唔啱就 throw `ApplicationError`，Content Manager 直接顯示錯誤。
- Rule 儲存之後，middleware 檢查未來已確認預約有冇變成喺休息時間或者 session 唔夾：有就標 `conflict`，唔會自動取消（§8）。
- **排期預覽**（`booking-admin` 第二個 tab，Strapi 原生 `Table`）：揀醫生同未來 14 日，列出每日嘅開放時段、session 數、已 book 數，同埋「點解休息」（顯示邊條 rule）。Admin 改完 rule 可以即刻睇結果，唔使去前台試。

---

## 4. 自動抽可用時間（Slot generation）

### 4.1 Input
- 設定：`schedule-rule`、`public-holiday`、`clinic-setting`、`service.durationMin + bufferMin`
- 已佔用：`booking_slot_lock` 入面 `active = true` 嘅行（見 §5.2）

### 4.2 演算法（逐位醫生、逐日）

```
for each date in [today, today + bookingHorizonDays]:
    1. rules = 當日適用嘅 schedule-rule（§3.4 步驟 1）
    2. open  = union(OPEN rules.timeRanges) − CLOSE rules   （CLOSE 永遠贏）
       open 係空 → status = HOLIDAY（有 reasonZh/En）或者 CLOSED
    3. x = SESSION_LENGTH rule 或者 clinic-setting.sessionMinutes
    4. sessions = 由每段 open 開始，每 x 分鐘切一格
    5. 剔走同 active locks（confirmed、到診、admin block、未過期 hold）重疊嘅 session
    6. 服務要 n = ceil((durationMin + bufferMin) / x) 個連續 session；
       可 book 嘅 start = 後面 n 個 session 都仲喺度嘅 session
    7. 剔走 start < now + minLeadTimeMin
    8. DAILY_LIMIT 到咗 → status = FULL
```

- 寫成 pure function（input：rules、假期、已佔用時段、now；output：sessions），方便 unit test，唔掂 DB。
- Lock 仍然鎖實際時間 `[start, start + n·x)`，所以 rule 中途改 x 都唔會出現 double booking。
- 所有時間存 UTC，計算用 Luxon `Asia/Hong_Kong`，API 回 ISO-8601 帶 offset。
- 回傳嘅 session 只係**建議**，真正保證唔撞嘅係 §5 嘅 DB constraint。

### 4.3 API
`GET /api/booking/availability?service=scaling&from=2026-12-01&to=2026-12-07&doctor=dr-chan`
```json
{
  "timezone": "Asia/Hong_Kong",
  "days": [
    { "date": "2026-12-01", "status": "OPEN", "sessionMinutes": 30,
      "slots": [{ "start": "10:00", "end": "11:00", "doctors": ["dr-chan"] }] },
    { "date": "2026-12-02", "status": "FULL",    "slots": [] },
    { "date": "2026-12-25", "status": "HOLIDAY", "label": "聖誕節", "slots": [] }
  ]
}
```
- `status`：`OPEN / FULL / HOLIDAY / CLOSED`。FULL 就顯示「此日已滿，請致電診所查詢」加致電按鈕（`design.md` 嘅 call pill）。前台唔提 waitlist。
- 唔填 `doctor` 即係「任何醫生」，回 union。Hold 嗰陣按**當日預約最少**嘅醫生先試（數目一樣就按 `sortOrder`），撞咗就試下一位，全部撞先回 409。

---

## 5. 2-phase 預約 + 10 分鐘 lock

### 5.1 Flow

```
Phase 1（揀服務、醫生、日期、時間）
   └─ POST /api/booking/holds  { service, doctor | "any", startAt, previousHoldId? }
        ├─ 201 { holdId, holdToken, startAt, endAt, expiresAt, serverNow }
        └─ 409 SLOT_TAKEN → 前端 refetch availability

Phase 2（姓名、電話、email、備註、私隱同意），畫面有倒數
   ├─ POST /api/booking/holds/:id/confirm   Header: X-Hold-Token, Idempotency-Key
   │     ├─ 201 { reference, manageToken }
   │     └─ 410 HOLD_EXPIRED → 返 Phase 1
   └─ 撳返回或者改時間 → DELETE /api/booking/holds/:id（帶 token）即刻釋放
```

### 5.2 防撞（核心）

Strapi 管理嘅 table 唔好自己加 column 或者 constraint：Strapi 開機會做 schema sync，可能同我哋打交，而且 Strapi 冇 `tstzrange` 呢種 type。所以另外開一張 **Strapi 唔管嘅 table**，用 migration 建：

```sql
-- database/migrations/2026.12.01T00.00.00.booking-lock.js（knex.raw）
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE booking_slot_lock (
  reservation_document_id  text PRIMARY KEY,
  doctor_document_id       text NOT NULL,
  period                   tstzrange NOT NULL,       -- [startAt, blockedUntil)
  kind                     text NOT NULL,            -- HOLD | BOOKED | BLOCK
  expires_at               timestamptz,              -- 只 HOLD 用
  active                   boolean NOT NULL DEFAULT true,
  EXCLUDE USING gist (doctor_document_id WITH =, period WITH &&) WHERE (active)
);
```

- `reservation`（Strapi content type）放資料；`booking_slot_lock` 只負責防撞。兩樣喺**同一個 `strapi.db.transaction`** 入面一齊寫。
- 建 hold 嘅 transaction：
  1. `UPDATE booking_slot_lock SET active=false WHERE doctor=? AND period && ? AND kind='HOLD' AND expires_at < now()`，同步將對應 reservation 改 EXPIRED（constraint 入面用唔到 `now()`，所以喺度清）
  2. `INSERT` lock，撞到就係 Postgres error `23P01`，轉成 409
  3. 用 document service 建 `reservation(status=HELD)`
- Confirm：`UPDATE booking_slot_lock SET kind='BOOKED', expires_at=NULL WHERE reservation_document_id=? AND kind='HOLD' AND active AND expires_at > now()`，affected rows = 0 就回 410；之後 reservation 改 CONFIRMED。
- 狀態轉 EXPIRED / RELEASED / CANCELLED 時設 `active=false`；ARRIVED / COMPLETED / NO_SHOW 仍然 `active`。
- Cron 每 30 秒清一次過期 hold（§9），然後觸發 waitlist matching。
- 時間判斷全部用 DB `now()`，唔用 Node 或者 client 嘅時間。
- ✅ **已確認**：Strapi v5 document service 喺 `strapi.db.transaction(async ({ trx }) => …)` 入面同 raw knex（`trx.raw`）共用同一個 transaction，所以 lock table 同 reservation 可以一齊 commit 或者一齊 rollback。

### 5.3 Admin 喺 Content Manager 直接改預約
Admin 可以喺 Strapi 直接改 reservation 嘅時間、醫生、狀態，呢條路會繞過 `/api/booking`。處理方法：
- 用 **document service middleware**（`strapi.documents.use(...)`，喺 `register()` 入面註冊）攔住 `reservation` 嘅 create / update / delete：時間、醫生、狀態有變，就喺同一個 transaction 更新 `booking_slot_lock`，撞到就 throw `ApplicationError("呢個時段已被預約")`，admin 會喺畫面見到錯誤。
- 狀態改成 CANCELLED 就自動寫 `notification-log`（取消通知）同埋 audit。
- `reservation` 禁止 delete，只可以取消（middleware 擋住），保留記錄。
- 敏感 field（token hash、idempotencyKey）喺 Content Manager 隱藏；`status`、`kind` 嘅改動經 middleware 驗證合法轉換（例如 EXPIRED 唔可以變返 CONFIRMED）。

### 5.4 Hold 規則
- 10 分鐘（`holdMinutes`），**唔可以延長**。
- 同一個 browser 同一時間只得一個 hold：帶 `previousHoldId`，server 先 release 舊嗰個。
- 倒數用 `expiresAt − serverNow` 計 offset，唔信 client 時鐘。
- 剩 2 分鐘出提示；到 0 就鎖住 submit，提示重新揀時間；已填嘅資料保留喺 form state。
- `pagehide` 時用 `navigator.sendBeacon` release（best effort，cron 兜底）。

### 5.5 防濫用
- 每 IP 每分鐘最多 5 次 hold；每 IP 同時最多 1 個 active hold。
- Confirm 前**唔做** phone OTP（已決定）。可以加 Cloudflare Turnstile 防 bot（demo 用 feature flag 關住）。

### 5.6 防止同一個 user 重覆 booking

冇病人帳戶，所以用**電話 + email** 認人。Phase 1 未知係邊個，所以喺 **Phase 2 confirm 嗰陣**檢查。

**Normalize（存喺 `*Normalized` field）**
- 電話：去空格同符號；8 位數字當香港號碼，前面補 `+852`；有 `+` 嘅照存。香港號碼 validate：8 位，開頭 2、3、4、5、6、7、8、9。
- Email：trim + lowercase。
- 姓名：trim、壓縮空格、lowercase（只用嚟分辨同一電話底下嘅唔同家人）。

**規則（數字放入 `clinic-setting`，可以改）**

| # | 規則 | 預設 | 點解 |
|---|---|---|---|
| R1 | 同一人（電話**或** email 相同，加埋同一姓名）同一服務，只可以有 **1 個**未來有效預約 | 1 | 最常見嘅重覆：撳兩次、開兩個 tab、唔記得自己 book 咗 |
| R2 | 同一電話或者 email 嘅未來有效預約總數上限 | 3 | 容許家長用同一個電話幫屋企人 book，但唔畀無限 book |
| R3 | 同一人唔可以有時間重疊嘅預約（就算唔同醫生） | — | 一個人唔可以同時喺兩個地方 |
| R4 | 同一電話同時只可以有 1 個 waitlist offer | — | §7 |

「未來有效」＝ status 係 `CONFIRMED`，而且 `startAt > now()`。

**併發**：兩個 tab 同時 confirm 都要擋到。Count 唔可以用 unique index 做（條件有 `now()`），所以喺 confirm transaction 開頭攞 advisory lock：
```sql
SELECT pg_advisory_xact_lock(hashtext('phone:' || ?));
SELECT pg_advisory_xact_lock(hashtext('email:' || ?));   -- 兩個 key 排好次序先鎖，防 deadlock
-- 然後 count R1–R3，過咗先 confirm
```

**撞規則時點回應（私隱優先）**
- 回 `409 DUPLICATE_BOOKING`，**唔顯示已有預約嘅內容**：任何人都可以打人哋個電話落去試，顯示詳情就會 leak。
- 前台文案：「此電話或電郵已有一個相同服務的預約，詳情已寄到登記電郵。如需更改時間，請致電診所。」
- 同時寫一個 `EXISTING_BOOKING_REMINDER` 通知（log），寄去**已登記**嘅 email，附 manage 連結。同一 email 每小時最多寄 1 次，防人濫用嚟 spam。
- Hold 唔會自動釋放：用戶可以返 Phase 1 揀第二個服務，或者等 10 分鐘自然過期。

**其他位置都要行同一套規則**
- Admin 改期（Content Manager 改時間）：唔計自己嗰個預約。
- Waitlist offer confirm：唔計 `replacesReservation` 嗰個（§7.1a）；冇填 `replacesReservation` 而又已經有同一服務嘅預約，admin 新增 entry 時就出 warning，提示填返。
- Admin 喺 Content Manager 手動 book：document middleware 照檢查 R3（時間重疊）；R1 / R2 只出 warning 唔擋（前台電話 book 常見家人共用電話），喺 `internalNote` 自動加「⚠ 同一電話已有 N 個預約」。

---

## 6. Email 通知（log only）

- 自己寫一個 local email provider（`providers/email-provider-log`）：`send()` 做 `strapi.log.info`（個人資料 mask 咗），然後將完整內容寫入 `notification-log`。
- `config/plugins.ts` 用 env 揀：`EMAIL_PROVIDER=log`（預設）或者 `nodemailer`（指去 Mailpit，demo 時有 inbox UI 睇）。
- **Outbox 做法**：業務 transaction 入面只 insert `notification-log(status=PENDING)`；cron 每 30 秒讀 PENDING 再 call `strapi.plugin('email').service('email').send()`。咁 rollback 咗嘅預約唔會寄錯 email，失敗都可以 retry（最多 5 次，exponential backoff，之後標 FAILED）。
- Template：zh-HK、en 各一份，跟預約時嘅 `locale`。

| Type | 觸發 |
|---|---|
| `BOOKING_CONFIRMED` | confirm 成功；附 reference、日期星期時間（香港時間）、醫生、地址、管理預約連結 |
| `BOOKING_CANCELLED` | 病人或者 admin 取消 |
| `BOOKING_RESCHEDULED` | Admin 改期，或者經 waitlist 改期 |
| `REMINDER_24H` | 預約前一日（cron 掃） |
| `WAITLIST_JOINED` | 加入輪候 |
| `WAITLIST_OFFER` | 有位；附 offer 連結同到期時間 |
| `EXISTING_BOOKING_REMINDER` | 撞 §5.6 重覆預約規則；寄去已登記 email，附 manage 連結（每小時最多 1 次） |
| `ADMIN_ALERT` | 寄去 `adminEmail`：改規則影響已有預約、waitlist offer 夠次數冇人接 |

---

## 7. Wait list

### 7.1 加入：**只有 admin 可以加**
- 前台**完全唔顯示** waitlist，冇「加入輪候」按鈕，亦冇 public API。
- 病人致電診所，由 admin / Front Desk 喺 Content Manager 新增 `waitlist-entry`（A6）。Document middleware 會 normalize 電話同 email，再檢查：
  - 同一電話或 email、同一服務、日期重疊嘅 ACTIVE entry 唔畀重複加。
  - `dateFrom` 唔可以係過去，`dateTo` 唔可以超過 `bookingHorizonDays`。
- 新增成功就寄 `WAITLIST_JOINED`（log），入面有退出連結。
- `dateTo` 過咗就由 cron 標 EXPIRED。
- 病人退出：email 入面嘅連結 `DELETE /api/booking/waitlist/:id?token=`；或者致電，由 admin 喺 Content Manager 改 CANCELLED。

### 7.1a 用 waitlist 做「改期」
病人**唔可以自己改期**。想改去早啲嘅時間，就致電診所，由 admin 加入 waitlist，並填 `replacesReservation`（指向佢現有嘅預約）：
- Match 只會 offer **早過**現有預約嘅時段。
- 病人 confirm offer 時，同一個 transaction 入面：新預約改 CONFIRMED，舊預約改 CANCELLED（`cancelReason = 經輪候改期`），寄 `BOOKING_RESCHEDULED`。
- 唔 confirm 就乜都唔變，保留原本預約。
- §5.6 嘅重覆預約檢查會唔計 `replacesReservation` 嗰個。
- 其他時間嘅改期由 admin 喺 Content Manager 直接改預約時間（A3）。

### 7.2 Matching
Strapi 冇內建 after-commit event，所以咁做：
- 有位甩出嚟嘅操作（取消、改期、hold 過期或者 release、admin 刪 block、admin 加開放時間），transaction **commit 之後** call `waitlistService.match({ doctor, from, to })`（fire-and-forget）。
- 另外 cron 每 1 分鐘做一次全面 match 兜底。
- 處理步驟：
  1. 搵 ACTIVE 而且條件啱嘅 entry（時長放得落、日期範圍、時段偏好），按 `queuedAt` 先到先得；`skippedPeriods` 入面嘅時段唔再 offer 畀同一個人。
  2. 用 §5.2 同一個 hold service 幫佢建 `reservation(status=HELD, source=WAITLIST)`，`expiresAt = now + waitlistOfferMinutes`。撞到即係有人搶先，跳過。
  3. Entry 改 OFFERED，寫 `WAITLIST_OFFER` 通知；連結 `/waitlist/offer/:token` 直接去 Phase 2。
  4. 過期冇 confirm：**排返隊尾**，即係 entry 改返 ACTIVE、`queuedAt = now()`、`offerCount + 1`，再將嗰個時段加入 `skippedPeriods`，然後 match 下一位。
  5. `offerCount` 去到 `waitlistMaxOffers`（`clinic-setting`，預設 3）就標 OFFER_EXPIRED，唔再排，寄 `ADMIN_ALERT` 畀 admin 跟進。
- 一個人同一時間只得一個 active offer；預約時間少過 3 小時就唔 offer，直接開返畀 public。
- Match 要 idempotent，就算同一個空位處理兩次，constraint 都保證只得一個 offer。

---

## 8. 規則改動影響已有預約（conflict）

唔做外部 calendar sync，所以 conflict 只會嚟自 admin 自己改設定：
- Admin 新增、修改或者停用 `schedule-rule`、停用醫生，而影響到已確認預約（落咗休息時間）：**唔自動取消**，document middleware 標 `conflict=true` 同 `conflictReason`（例如「12/25 已設為假期」），寄 `ADMIN_ALERT`。
- Admin 喺 Content Manager 用 filter `conflict=true` 搵出嚟，自己決定改期、取消並通知，定係保留。
- 加封時段（BLOCK）撞到已有預約：lock constraint 會直接擋住，admin 要先處理嗰個預約。

---

## 9. Cron tasks（`config/cron-tasks.ts`）

| Job | 頻率 | 做乜 |
|---|---|---|
| `expireHolds` | 每 30 秒 | 過期 HOLD 設成 inactive，reservation 改 EXPIRED，waitlist offer 排返隊尾（或者夠次數就 OFFER_EXPIRED），然後 match |
| `dispatchOutbox` | 每 30 秒 | 寄 PENDING email |
| `waitlistMatch` | 每 1 分鐘 | 全面 match 兜底 |
| `reminder24h` | 每 15 分鐘 | 搵 23–24 小時後嘅 CONFIRMED，未寄過就寫 reminder |
| `expireWaitlist` | 每日 00:05 | `dateTo` 過咗嘅 entry 改 EXPIRED |
| `importHolidays` | 每年 11 月 1 日 + 開機時檢查 | 1823 iCal → `public-holiday`（§3.4）；已存在嘅日子唔會重複 |

- Strapi cron 喺**每個 instance 都會行**。Demo 只起 1 個 instance；如果要 scale，job 開頭用 `pg_try_advisory_lock` 搶鎖，搶唔到就跳過。
- 每個 job 都要 idempotent，重行唔會出事。

---

## 10. API 一覽

### 10.1 Public（`/api/booking/*`，`auth: false`，有 rate limit）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/booking/availability` | §4.3 |
| POST | `/api/booking/holds` | Phase 1 lock |
| DELETE | `/api/booking/holds/:id` | 釋放（要 token） |
| POST | `/api/booking/holds/:id/confirm` | Phase 2 |
| GET | `/api/booking/manage?token=` | 病人睇自己預約 |
| POST | `/api/booking/manage/cancel` | 病人自己取消（要 manageToken）。預約前少過 `cancelCutoffHours`（24 小時）就回 `CANCEL_CUTOFF`，前台顯示「請致電診所」 |
| DELETE | `/api/booking/waitlist/:id?token=` | 退出輪候（email 連結）。**冇 public 加入 API** |
| GET | `/api/booking/waitlist/offer/:token` | 睇 offer |
| POST | `/api/booking/waitlist/offer/:token/confirm` | 接受 offer（有 `replacesReservation` 就同時取消舊預約） |

病人**冇自助改期 API**。
| GET | `/api/booking/clinic-status` | 「而家開緊 / 休息」（`design.md` 嘅 open-now dot 用同一套規則計） |

內容（服務、醫生、文案）用 Strapi 標準 Content API，public role 只開 `find` / `findOne`。

Error 格式統一：`{ "error": { "code": "SLOT_TAKEN", "message": "...", "details": {} } }`，前端按 `code` 出 i18n 文案。

### 10.2 Admin（`booking-admin` plugin，`type: 'admin'` routes，要 admin 登入 + 自訂 permission）
`POST /booking-admin/emergency-close/preview` · `POST /emergency-close` · `POST /holidays/import` · document actions 用嘅 `POST /reservations/:documentId/cancel | status | resend` · `POST /waitlist/:documentId/offer` · `POST /notifications/:documentId/retry`

---

## 11. Frontend（React 前台）

- 跟 `design.md`：Booking section 用 `--ink` 底，primary button 反轉成 `--field`；input 56px、label 喺上面、error 喺下面。
- Phase 1：服務 → 醫生（得一位 active 醫生就跳過；多過一位就有「任何醫生」選項）→ 日曆（OPEN / FULL / HOLIDAY，HOLIDAY 顯示 rule 嘅 `reasonZh/En`）→ session chips，顯示開始同完結時間（例如「10:00–11:00」）。揀時間即刻 call hold，成功先入 Phase 2。
- Phase 2：頂部 sticky 顯示「已為你保留 10:30 · 剩餘 09:42」；`aria-live="polite"` 每分鐘讀一次，唔好每秒讀。
- 409 就出 toast，自動 refetch 嗰日嘅 slot，保留已揀嘅服務同日期。
- 成功就出 confirmation（+16px slide in），顯示 reference no.。
- Service row「Book this」同 chat「前往預約」用 `?service=implant` pre-fill。
- 時間一律用 `Intl.DateTimeFormat({ timeZone: 'Asia/Hong_Kong' })` 顯示。
- Confirm button loading 時 disable，加 `Idempotency-Key`（每個 hold 一個 uuid）。
- 新增頁面：`/manage?token=`（睇預約、取消；改期就顯示「請致電診所」）、`/waitlist/offer/:token`（接受 offer；有 `replacesReservation` 就寫明「接受後原本 12 月 15 日嘅預約會自動取消」）。
- 前台唔出現任何 waitlist 入口。

---

## 11A. Admin

### 分工：盡量用現成，自己寫嘅 code 越少越好
| 地方 | 用途 | 自訂 code |
|---|---|---|
| **Content Manager**（Strapi 現成） | 設定類（醫生、服務、開放時間、假期、規則）、預約列表 / 詳情 / **手動新增**、輪候名單、notification log、audit log、衝突（filter `conflict=true`） | 唔使寫；只設定 list view 欄位同 filter |
| **strapi-calendar plugin** | 後台日曆（月 / 週 / 工作週 / 日） | 一個 extension + 兩個 denormalized field（§11A.1） |
| **Document actions**（v5 Content Manager `addDocumentAction`） | 預約詳情頁嘅按鈕：取消並通知、標記到診 / 完成 / no-show、重發確認；輪候「手動 offer」；通知「重試」 | 細 admin extension |
| **`booking-admin` plugin**（一頁，兩個 tab） | 緊急休診；排期預覽（§3.4）加「立即 import 公眾假期」按鈕 | 自己寫，好細 |

手動預約（前台電話 book）直接用 Content Manager「新增 reservation」：document middleware 會檢查撞位（§5.3）同重覆預約（§5.6），撞到就出錯誤，所以唔使另外寫 slot picker 頁。

### 11A.1 後台日曆：`@offset-dev/strapi-calendar`

睇過 v1.0.0 source，佢做到同做唔到嘅嘢：

| 項目 | 實際行為 | 我哋點處理 |
|---|---|---|
| 版本 | v1.0.0，peer `@strapi/strapi ^5`；npm 最後 publish 係 2024-11（約 2 年冇更新） | **Pin 死 `1.0.0`**；M0 就裝埋，確認同我哋用嘅 Strapi 5.x 版本行得 |
| 設定 | 喺 admin Settings 頁揀：`collection`、`startField`、`endField`、`titleField`、`colorField`、`defaultView`、`startHour` / `endHour`、`createButton` 等 | 揀 `api::reservation.reservation`、`startAt`、`endAt`、`calendarTitle`、`calendarColor`；`startHour` / `endHour` 設成診所最早同最遲時間 |
| 一次只得**一個 collection** | 假期唔會出現喺日曆 | 只顯示 reservation（包括 `kind=BLOCK` 封時段）。假期喺 Content Manager 睇 |
| **冇 filter** | 預設 handler 會出晒所有 entry，包括 CANCELLED、EXPIRED | 用 plugin 嘅 `registerExtension(...)` 註冊自己嘅 start handler，只 query `status` 係 HELD / CONFIRMED / ARRIVED / COMPLETED / NO_SHOW 同 BLOCK，`populate` doctor 同 service |
| 顏色、標題只讀 entry 自己嘅 field | 唔識讀 relation（例如 doctor.color） | Document middleware 每次寫 reservation 就自動填 `calendarColor`（= 醫生顏色）同 `calendarTitle`（例如 `陳醫生 · 洗牙 · 陳先生 · 已確認`）。狀態一定寫落標題，唔淨靠顏色 |
| 冇 resource 分欄（FullCalendar 免費版） | 唔可以每位醫生一欄 | 用顏色分醫生；而家得 1 位醫生冇影響。多醫生時日曆會疊埋一齊，到時再考慮自己寫 |
| 撳 event | 會開 Content Manager 嗰個 reservation 嘅編輯頁 | 啱用：document actions 就喺嗰頁 |
| `createButton` | 撳咗會開 Content Manager 新增頁 | 保留，等同手動 book |
| 時區 | 用 browser 時區（moment） | Admin 電腦設香港時區；README 寫明 |
| 冇自動 refresh | HELD 過期唔會即時消失 | 手動 refresh；HELD 喺標題寫「保留中至 10:40」 |

**Extension 做得到乜（睇過 v1.0.0 source）**

`registerExtension(id, name, startFields, endFields, startHandler, endHandler)` 係 **server 端**嘅 API，負責日曆攞乜數據：
- ✅ 自訂事件來源同過濾：start handler 自己 query，只出有效狀態，仲可以 `populate` doctor 同 service。
- ✅ 自訂事件內容：handler 回傳嘅 object 可以即場計 `calendarTitle`、`calendarColor`，唔一定要靠存落 DB 嘅值。不過 Settings 頁揀 title / color field 嘅時候，要揀返 content type 有嘅 field，所以兩個 field 都要保留。
- ✅ 合併其他數據：handler 可以將假期都砌入結果。但 plugin 會將每個 event 嘅連結固定指去 Settings 揀咗嘅 collection，撳落去會開錯頁，所以 **demo 唔砌**。
- ❌ **前端 custom rendering 做唔到**：plugin admin 端嘅 `<FullCalendar>` props 係寫死嘅，冇開放 `eventContent`、`eventClick`、`dayCellContent`、`dateClick`、popover 呢類 hook，亦冇 render extension point。唔改 plugin 原始碼（或者 patch-package）就改唔到格仔、事件卡片、彈出視窗嘅樣。
- 撳 event 嘅行為固定係開 Content Manager 編輯頁（plugin 回傳嘅 `url`）。

**決定**：plugin 做到咩就用咩，demo 唔追加功能，亦唔改 plugin 原始碼。
- 用 server extension 做過濾，加埋計 title / color。如果 extension 唔順手，就用預設 handler 加 middleware 填嘅 `calendarTitle` / `calendarColor`；已取消、已過期嘅預約改灰色，標題寫明狀態。
- 事件卡片、格仔、彈出視窗全部用 plugin 預設樣式。

### Auth / 角色
- 用 Strapi admin 帳戶同 RBAC。建兩個 role：
  - **Clinic Admin**：全部權限。
  - **Front Desk**：預約同輪候可以讀寫；設定類只讀；冇緊急休診頁。
- `booking-admin` 註冊自訂 permission action（例如 `plugin::booking-admin.emergency-close`），route 加 `admin::hasPermissions` policy。
- ⚠️ 要確認 Strapi v5 Community Edition 嘅自訂 admin role 同 field-level permission 有冇限制。

### 畫面清單（交畀 UI session）

**Admin 全部用 Strapi 原生 UI 同元件，令後台風格統一**（`design.md` 只管病人前台）：
- 自訂頁同 document actions 只用 `@strapi/design-system` 元件（`Table`、`Field`、`DatePicker`、`TimePicker`、`SingleSelect`、`Toggle`、`Button`、`Dialog`、`Modal`、`Badge`、`Alert`、`Tabs`、`Status`）同 `@strapi/icons`。
- 版面用 admin 內建嘅 `Layouts.Header` / `Layouts.Content` / `Page`；toast 用 `useNotification`；call API 用 `useFetchClient`（自動帶 admin token）。
- 唔加 Tailwind、唔加其他 UI library、唔寫自訂 color 或者 font；顏色只用 design system theme token，dark mode 就自動跟 Strapi。
- 文案用 admin i18n（`translations/zh-Hant.json`、`en.json`）。
- 所以 **UI session 唔使為 admin 出視覺設計**，只需要畀 ★ 部分嘅 wireframe / 流程（欄位、步驟、確認文案），實作時直接砌 Strapi 元件。

| # | 畫面 | 由邊個提供 | 內容 / 操作 |
|---|---|---|---|
| A1 | 登入 | Strapi 現成 | — |
| A2 | 日曆 | strapi-calendar | 月 / 週 / 日；顏色 = 醫生，標題有狀態；撳 event 去 A3 |
| A3 | 預約詳情 | Content Manager + ★ document actions | 取消（填原因 + 「通知病人」toggle）、標記到診 / 完成 / no-show、重發確認 email；改期 = 直接改時間（middleware 驗證） |
| A4 | 手動預約 / 封時段 | Content Manager 新增 | `kind=APPOINTMENT` 或者 `BLOCK`；撞位或者重覆會出錯 |
| A5 | 預約列表 | Content Manager | 欄：時間、病人、服務、醫生、狀態、來源；filter：日期、醫生、狀態、`conflict` |
| A6 | 輪候名單 | Content Manager + ★ action | **新增 entry 嘅唯一入口**（病人致電）：服務、醫生、日期範圍、時段偏好、病人資料、`replacesReservation`（想改早就揀返佢現有預約）；手動 offer、移除 |
| A7 | 通知 log | Content Manager + ★ action | 睇內容、重試 FAILED |
| A8 ★ | 緊急休診（Clinic Admin） | `booking-admin` tab 1 | 3 步：① 時間範圍、醫生、原因（八號風球 / 黑雨 / 其他）② **預覽受影響**嘅預約、hold、offer ③ 二次確認 → 批量取消、通知、封時段 |
| A9 ★ | 排期預覽 | `booking-admin` tab 2 | 揀醫生同未來 14 日：每日開放時段、session 數、已 book 數、休息原因（連去對應 rule）；「立即 import 公眾假期」 |
| A10 | 排期規則 | Content Manager（`schedule-rule`） | 新增 / 修改 / 開關 rule；middleware 驗證，設錯即時出錯誤 |

Demo 唔做：今日總覽 dashboard、每位醫生分欄日曆、日曆 custom rendering。

Admin UI 注意事項：
- 狀態用 `Badge` / `Status`，一定有文字，唔淨靠顏色。
- 破壞性操作用 `Dialog` 確認，寫明影響幾多個預約、會唔會通知病人。
- 時間格式：`2026-12-01（二）10:30`，香港時間。
- 主要喺 desktop 用；A2 同 A3 要喺 iPad 用得。

---

## 12. 注意事項 Checklist

### 併發 / 正確性
- [ ] 防 double booking 靠 `booking_slot_lock` 嘅 **exclusion constraint**，唔靠 `if (available)`。
- [ ] Hold 過期一律用 DB `now()` 判斷。
- [ ] Hold / confirm 嘅 lock table 同 reservation 寫入要喺同一個 `strapi.db.transaction`（已確認共用，§5.2）。
- [ ] Content Manager 直接改預約都經 document middleware 更新 lock（§5.3）。
- [ ] Confirm、cancel、reschedule 全部 idempotent。
- [ ] 經 waitlist 改期係原子操作：新預約 confirm 同舊預約取消喺同一個 transaction 入面做。
- [ ] Public 冇 waitlist 加入 API，亦冇自助改期 API。
- [ ] Cron 只行 1 個 instance，或者用 advisory lock。
- [ ] Waitlist match 喺 commit **之後**先行。
- [ ] 重覆預約檢查（§5.6）用 advisory lock，兩個 tab 同時 confirm 都只會有一個成功。
- [ ] 前台 confirm、waitlist offer confirm、Content Manager 手動 book / 改期全部行同一個重覆預約 service。
- [ ] `DUPLICATE_BOOKING` 唔可以洩露已有預約嘅內容。

### Strapi 特有
- [ ] 預約、輪候、log、設定類 type 全部 `draftAndPublish: false`。v5 開咗 draft & publish 會有兩行（draft 同 published），lock 同 count 都會錯。
- [ ] **Users & Permissions 嘅 Public role 唔可以開** `reservation`、`waitlist-entry`、`notification-log`、`audit-log` 任何權限；用 bootstrap script 每次開機檢查，有開就 warn。
- [ ] 敏感 field 設 `private: true`。
- [ ] `booking_slot_lock` 唔係 content type，Strapi schema sync 唔會掂佢；migration 要放喺 `database/migrations`，部署時會自動行。
- [ ] 唔好用 SQLite（Strapi 預設），一開始就用 Postgres。
- [ ] Strapi `datetime` field 一律存 UTC ISO。
- [ ] Content Manager list view 唔好預設顯示電話、email 全文（減少螢幕外洩）。
- [ ] Strapi 升級前睇 migration guide；document middleware、`addDocumentAction` 都係 v5 API。
- [ ] `@offset-dev/strapi-calendar` pin 死 `1.0.0`；升 Strapi 之前要先試日曆仲行唔行。
- [ ] `calendarTitle` / `calendarColor` 只可以由 middleware 寫，Content Manager 設成唯讀。

### 時間 / 規則
- [ ] Zone 固定 `Asia/Hong_Kong`。香港冇夏令時間，但都唔好 hard-code `+08:00`。
- [ ] Rule 計法：OPEN 合併，CLOSE 永遠贏；SESSION_LENGTH 揀 priority 最高嗰條；半日休息用 interval 減。
- [ ] Session 由每段開放時間開始切，尾段唔夠 x 分鐘唔要；服務要連續 n 個 session。
- [ ] Rule 改完即刻生效（清 cache），並檢查已確認預約有冇變成 conflict。
- [ ] 服務唔可以跨午飯空隙。
- [ ] Lead time、horizon、cancel cutoff 全部由 `clinic-setting` 控制。
- [ ] Buffer 計入佔用時間，但唔顯示畀病人。
- [ ] 八號風球 / 黑雨：緊急休診（A8）。
- [ ] 每年 import 1823 公眾假期。
- [ ] 改規則唔會自動取消預約，只標 conflict。

### 安全 / 私隱（PDPO）
- [ ] 表單要有收集個人資料聲明（PICS）同同意 checkbox。
- [ ] Log 入面 mask 電話、email；病人備註唔入 log。
- [ ] Token 只存 hash，連結有到期日。
- [ ] Rate limit 加 optional captcha。
- [ ] CORS（`config/middlewares.ts`）只開前台 domain。
- [ ] Service account key 唔入 repo。

### 通知
- [ ] Outbox 有 retry，失敗會標 FAILED，喺 A7 可以重試。
- [ ] Email 語言跟預約時嘅 locale；時間寫明日期、星期、「香港時間」。

### UX
- [ ] 倒數用 server time offset。
- [ ] 過期或者撞位都唔好清走已填資料。
- [ ] FULL 嘅日子一定有「致電診所」出路，唔好死胡同。
- [ ] 觸控面積 ≥ 44px；中英文完整，唔混用（`design.md` §9）。

### 測試
- [ ] Session generation unit test（pure function）：每種 `repeat`（WEEKLY、DATE_RANGE、每月第 n 個星期幾、最後一個星期幾、PUBLIC_HOLIDAY、BEFORE_PUBLIC_HOLIDAY）、CLOSE 贏 OPEN、半日休息、午飯、x = 20 / 30 / 45、服務佔多個 session、尾段唔夠長、DAILY_LIMIT、`doctors` / `services` 限定、lead time、跨月、多醫生。
- [ ] Rule 驗證：設錯 field 組合會被擋。
- [ ] 併發 test：50 個 request 同時搶同一個 slot，只可以 1 個 201。
- [ ] Content Manager 改預約撞位會被擋。
- [ ] Hold 過期 → offer → offer 過期 → 排返隊尾 → 下一位，成條 chain；同一時段唔會再 offer 畀同一人；第 3 次過期就停並通知 admin。
- [ ] 「任何醫生」：兩位醫生當日預約數唔同，hold 會落去少嗰位；數目一樣就跟 `sortOrder`。
- [ ] 病人取消：24 小時前成功；24 小時內回 `CANCEL_CUTOFF`。
- [ ] Admin 加或者刪封時段對 availability 嘅影響；改設定撞到已有預約會標 conflict。
- [ ] Public role 冇權限讀 reservation（回 403）。
- [ ] 重覆預約：同一電話同一服務第二次 confirm 回 409；家人（同電話、唔同姓名）可以 book；超過 R2 上限回 409；同時兩個 confirm 只有一個成功；電話格式 `9123 4567`、`+852 91234567` 當同一個人。
- [ ] 日曆只顯示有效狀態，標題同顏色跟醫生、狀態更新。
- [ ] Playwright：2-phase happy path 同過期 path（用 env 將 hold 時間設做 10 秒）。

---

## 13. Decisions / Open questions

已決定：
- 計位單位：**醫生**，支援多位，由 admin 新增。
- **唔做外部 calendar sync**（Google 都唔駁）。可用時間只按 Strapi 設定同 admin 封時段計；後台日曆用 strapi-calendar。
- 架構：**React + Strapi only**，唔用 Spring Boot。
- Admin：Strapi Content Manager + **`@offset-dev/strapi-calendar`** 做日曆 + 細 `booking-admin` plugin（緊急休診）。
- Admin UI：**全部用 Strapi 原生 UI 同元件**，唔用 `design.md`。
- 日曆：strapi-calendar 做到咩就用咩（demo），唔改 plugin 原始碼，亦唔自己寫日曆頁。
- Transaction：document service 同 raw knex 共用（已確認）。
- Booking：Strapi content types 加少量自訂 code（custom API、document middleware、cron），唔用第三方 reservation plugin。
- **自訂排期 rules**（`schedule-rule`）：OPEN / CLOSE / SESSION_LENGTH / DAILY_LIMIT，自動切 x 分鐘 session 畀病人 book；公眾假期自動 import（§3.4）。
- 防重覆預約：電話 / email 認人，規則 R1–R4（§5.6）。
- **病人唔可以自己改期**；改期由 admin 做，或者 admin 將病人加入 waitlist 並填 `replacesReservation`（§7.1a）。
- **Waitlist 前台唔顯示**，只有 admin 可以喺 Content Manager 加入。

- 「任何醫生」：**當日預約最少嘅醫生優先**，數目一樣就按 `sortOrder`。
- Waitlist offer 過期：**排返隊尾**，同一個時段唔會再 offer 畀同一個人；offer 3 次都冇接就停，通知 admin。
- Confirm 前**唔需要** phone OTP。
- 病人**可以經 email 連結自己取消**，預約前 24 小時內唔畀，要致電診所。
- 重覆預約上限：**同一服務 1 個、總數 3 個**（R1 / R2）。

未決定：冇。

---

## 14. Milestones

| # | 內容 | 完成標準 |
|---|---|---|
| M0 | docker-compose（postgres、strapi、web）；Strapi TS project；全部 content types；seed（1 位醫生、服務、§3.4 預設 rules、2026–27 公眾假期）；public role 權限 | `docker compose up` 起到；`/api/reservations` public 回 403 |
| M1 | `schedule-rule` 驗證 middleware；session generation pure function；`GET /availability`；公眾假期自動 import；排期預覽 tab | Unit test 全過；喺 Content Manager 加一條 CLOSE rule，前台同排期預覽即刻見到休息 |
| M2 | Lock table migration、hold / release / confirm、`expireHolds` cron、rate limit | 50 搶 1 只得 1 成功 |
| M3 | Document middleware（Content Manager 改預約） | Admin 改到撞位時見到錯誤 |
| M4 | React 2-phase form、倒數、409 / 410、confirmation、manage 頁 | Playwright happy path 同過期 path 過 |
| M5 | Log email provider、outbox cron、全部 template、24h reminder | `notification-log` 每種 type 都有 |
| M6 | Waitlist：admin 喺 Content Manager 加入（middleware 驗證）、match、offer、過期輪下一位、`replacesReservation` 改期 | Chain test 過；經 waitlist 改期後舊預約自動取消；public 搵唔到任何 waitlist 加入入口 |
| M7 | Admin：RBAC roles；strapi-calendar 設定 + extension + `calendarTitle/Color`；document actions；`booking-admin`（緊急休診） | Front Desk 喺 Content Manager book 到，前台即刻見唔到嗰個位，日曆即刻有；新增第二位醫生後前台同日曆自動出現 |
| M8 | Polish：a11y、i18n、README | |
