# 牌咖｜台灣麻將

以網頁為主的台灣十六張麻將。手機可透過瀏覽器的「加入主畫面」當作應用程式使用。未填 Firebase 設定時，網站提供本機示範模式，與三位電腦玩家對局，房間、記帳及暱稱保存在此瀏覽器。

## 功能

- 144 張牌，含 8 張花牌；輪到玩家時自動摸牌、摸到花牌自動補牌，手牌自動排序。
- 每位玩家打出的牌分別放在自己座位前方，便於看出誰打了哪張牌。
- 四人線上房間、吃碰槓胡（只吃上家）、底台選擇 30/10、50/20、100/20、選擇 1–4 將。
- 沒有合法喊牌時自動略過；放棄可胡牌後進入過水，解過水前不能胡牌或自摸，打出一張原本不能胡的牌後解除。
- 常見台數計算、每局結算、每月記帳、月榜與總榜。
- Google 帳號登入，暱稱存於 Firestore，再次登入沿用。
- Firebase Functions 在伺服器端執行摸打、結算與記帳；牌牆和其他玩家手牌不開放直接讀取。

## 啟用線上模式

1. 建立 Firebase 專案，開啟 **Authentication → Google**、Cloud Firestore 和 Cloud Functions。Functions 需要 Firebase Blaze 方案。
2. 在 `dist/firebase-config.js` 填入 Firebase Web App 的 `apiKey`、`authDomain`、`projectId`、`appId`。
3. 在 Firebase Authentication 的授權網域加入網站網域。若在本機測試，也要加入 `localhost`。
4. 安裝 Node.js 22 與 Firebase CLI，執行：

   ```sh
   cd web
   cd functions && npm install && cd ..
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,functions
   ```

5. 修改共用規則引擎時，先改 `shared/engine.js`，再執行 `python scripts/sync-engine.py`，讓網頁與 Functions 使用同一版。

網站只提供前端。Cloud Functions 和 Firestore 規則須部署到你自己的 Firebase 專案；未部署時仍可使用本機示範模式。Firebase Web App 設定不是私密金鑰，Firebase 專案管理權限和服務帳號金鑰不要放入此目錄。

## 本機預覽

在 `web/dist` 執行 `python -m http.server 8000`，開啟 `http://localhost:8000`。不要直接雙擊 HTML 檔案，因為 ES modules 與 service worker 需要 HTTP。

## GitHub Pages

專案的 `.github/workflows/pages.yml` 會在 `main` 分支更新時發佈 `dist/`。在儲存庫的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。公開網址通常是 `https://<帳號>.github.io/<儲存庫>/`。

未填入 Firebase 設定時，Pages 提供可直接試玩的本機示範模式；Google 登入、多人同步和雲端記帳需另外建立並部署 Firebase 專案。

## 桌規範圍

目前涵蓋一般五組面子加一對眼、吃碰槓、自摸或放槍、花牌補牌、過水，以及畫面列出的常見台數。過水採「放棄可胡牌後不可胡或自摸，打出原本不能胡的牌解過水」的桌規。台灣麻將桌規有地方差異；目前未加入搶槓、槓上開花、海底、特殊聽牌及所有大牌型。若要作為正式金錢結算依據，應先與牌友確認桌規，再補齊差異與驗收測試。

參考：[台灣麻將基本流程](https://maji.com.tw/rules)、[一將與圈的定義](https://www.mjonline.com.tw/content/mj/rules_04.html)、[Firebase Google 登入](https://firebase.google.com/docs/auth/web/google-signin)、[Firebase Functions](https://firebase.google.com/docs/functions/callable)。

