# Playing Kee Club

1. Choose a game and enter an optional nickname.
2. **好友** creates a private room. Send its invite link or six-character code to your friends. The game starts when all seats are filled.
3. For Jungle, **AI** starts a game against an AI opponent.
4. For Aeroplane, choose **好友連線** or **同機對戰**, then two to four total players. Each seat after the host can be a human or AI. Online human seats remain open for friends to join; same-device human seats each have an optional nickname. AI seats require the server AI configuration.
5. Aeroplane's **三次六規則** section sets the third-six penalty. Mixed rooms retain their names and AI seats on rematch; only human players need to agree to an online rematch.

Aeroplane uses the traditional board on every screen size. On mobile/tablet, opponent seats share one compact row above the board.

Both games have sound effects for moves, captures, and results. Aeroplane's dice, steps, jumps, returns, and finishes follow the board animation. Use the speaker button in the header to toggle **音效**; your choice is saved in this browser. Sounds work offline, begin after your first interaction, and stay silent while the tab is hidden. Reopening a saved game does not replay its old sounds.

New **human-only same-device games** run entirely in the browser using the shared rules engine, with no room API calls or WebSocket. They save to browser storage after each action and reopen at `/local/<id>` or through **返回上一局**. Once the app is loaded, play continues without a network connection. The production PWA also caches the app shell for offline reopening after the first successful online load. These saves belong to this browser and origin, cannot be shared as online rooms, and are lost when browser storage is cleared. If persistence is blocked or full, the current page can still play in memory, but a reload may lose progress.

Online games, same-device games with AI, and previously created server rooms remain server-authoritative for turns, moves, dice, captures, and wins. Seat credentials are random, stored in the browser, and hashed on disk. Reloading or reconnecting restores your seat. Keep the same browser and origin; switching from localhost to a LAN URL uses a different browser storage origin. All friends must agree to a rematch after the game ends; the room settings carry over.

In Aeroplane, resignation withdraws only that player: unfinished planes return to the airport, the player is skipped and marked as resigned, and everyone else continues. Earned rankings remain intact. Once only one active player remains, they receive the final place and the match ends. Finished and withdrawn players cannot resign again. Rematches clear withdrawals; all human seats still consent to an online rematch.

## Install and play offline

The production build is an installable PWA. Serve it over **HTTPS**, or use `localhost` for development checks. A plain HTTP LAN address does not support service workers or the PWA installation flow. The Vite development server deliberately does not register a worker; use `bun run build` and `bun run start` to test installation and offline loading.

- In supporting browsers, **安裝棋聚** opens the browser's installation prompt. The browser's own install menu also works.
- On iPhone/iPad, the button explains **Share → Add to Home Screen**. Keep **Open as Web App** enabled if shown. Installed windows hide the install control.
- Open the app online once and wait for **已可離線玩同機真人對戰** before going offline. Both Jungle and Aeroplane support all-human same-device games offline, including reopening a saved `/local/...` game. From the installed app's lobby, **返回上一局** resumes the last game saved in that browser storage.
- Friend rooms and every game with AI need a connection. The offline notice explains this, and the lobby disables creating/joining these games while offline. Installation does not copy saves between devices or guarantee shared storage across browser/installed-app contexts; clearing site data removes local saves.
- New versions show **更新並重新載入** in the lobby. Updates never force an active game to reload, even when another tab accepts an update. Return to the lobby and choose when to reload.

`vite-plugin-pwa` generates the manifest and precaches only the app shell and bundled assets. Navigation fallback is restricted to the lobby and game routes. API responses, credentials, and WebSocket traffic are never put in the service worker cache. External Google Fonts are optional; offline rendering uses installed fallback fonts. The production static server sends `Cache-Control: no-cache` so browsers revalidate the worker, manifest, and HTML after deployment.

Icons live in `public/icons/`, with the editable SVG wordmark alongside the PNG exports. The separate maskable entry has an opaque background and keeps the mark within the central safe area; the Apple touch icon is `public/apple-touch-icon.png`.

Run the browser regression check with:

```sh
bun run test:pwa
```

It uses installed Google Chrome by default; set `PWA_BROWSER_PATH` to another Chromium executable if needed. The check builds two isolated production versions, checks Chromium installability and production headers, plays/reloads both games offline, verifies that API requests stay uncached, and tests updates across an active game and a lobby tab. It also exercises install prompt outcomes and iOS guidance with simulated browser events; native OS installation and real iOS behaviour still need a device check. Builds, results, screenshots, failure details, and a Playwright trace are retained under `.data/pwa-check-<timestamp>/`. It uses a fresh browser profile and makes no AI requests.

## Rules used

The in-app **玩法指南** is the authoritative description of this implementation. Local traditions differ.

- **Jungle:** 7×9 board, eight ranked animals each, rat/elephant exception, rat swimming, enemy traps, den victory, capture/immobility victory. Before creating a room, choose whether rats may capture each other across a riverbank and whether lions/tigers may jump over their own rat. Both default to **off**, preserving the existing river rules. Enemy rats always block jumps; water rats cannot capture land elephants. Settings are shared with guests and AI, saved with the room, and retained on rematch. A piece weakened inside an enemy trap cannot capture an unweakened enemy; a non-capturing exit restores its strength. Three repeated positions or 100 consecutive non-capturing half-moves still draw.
  - **7-3:** After seven of a player's own moves, forbid a fourth arrival by the same animal at a cell it entered at least three times in that player's last seven moves. Any trap entry by that player within the window exempts the restriction. A currently chased animal is also exempt: an opponent could capture it using the current movement/capture settings, without recursively applying anti-chase restrictions.
  - **17-5:** After seventeen of a player's own moves with only one animal, if its activity covers at most five cells (including the starting cell and landings), prohibit that animal from entering any of those cells on its next move. Any trap entry within that window exempts this rule; being chased does not. Moving another animal or leaving the area is allowed if otherwise legal.
  - Both restrictions use rolling windows, are enforced by the server, and count toward immobility defeat. The room shows temporarily forbidden moves. Legacy saved rooms keep the default river settings and begin collecting restriction history on their next move; old text logs are not used to infer missing history.
- **Aeroplane:** two to four players, four planes each, 52 shared cells. Six launches onto a separate takeoff pad; movement begins on the next roll. Six grants another roll. The third consecutive six ends the turn and, by default, returns every unfinished plane to its airport. The alternative automatically returns the unfinished plane closest to the goal; ties use the lowest plane number. Completed planes are immune in both modes. Same-colour landing jumps four. Direct dice landing at relative progress 18 flies to 30 then jumps to 34; jumping into 18 flies to 30 without the final jump. Every dice or bonus landing captures all enemy planes there; a shortcut also captures the opposite colour's planes at home-lane progress 53. Friendly stacks move individually. After progress 50, enter the home lane, leaving two shared cells unreachable for each colour. Overshoots bounce at 56; an exact finish parks the plane inverted in its airport. Finished players receive rankings and are skipped while the remaining players continue.

Rule references: [Jungle rules](https://jungle-arena.com/rules), [Aeroplane Chess overview](https://learning.hku.hk/ccch9051/group-53/items/show/18). The explicit house rules above settle variant differences.
