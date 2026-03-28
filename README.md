# 📖 Pass the Story

A collaborative, turn-based online storytelling game for **2–10 players**.

## 🎮 How to Play

1. **Create an account** and log in
2. **Create a game** and choose the maximum number of players (2–10)
3. **Share the 6-character join code** with your friends
4. Once everyone has joined, the **host starts the game**
5. **Take turns** contributing to the story:
   - You only see the **last 50 characters** of the previous contribution
   - Each turn requires **at least 200 characters**
6. When you think the story is done, click **Vote Game Over** on your turn
7. Once **all players have voted** to end, the **full story is revealed**
8. Everyone can **comment** on the completed story

> **Tip — multiplayer on one device:** open the game in separate browser tabs,
> one tab per player. Each tab shares the same localStorage, so turns update
> in real time across all tabs.

## 🚀 Live Demo

> Deployed at: `https://<your-github-username>.github.io/dev-pass-the-story/`

No sign-up or configuration is needed — just open the link and play!

---

## ⚙️ Deployment

The app is a static site hosted on **GitHub Pages**. It needs no backend, no
database, and no API keys. Everything runs in the browser.

### Enable GitHub Pages

1. Fork or push this repository to your GitHub account
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` will deploy
   the site automatically

That's it. The live URL will be:

```
https://<your-github-username>.github.io/<repository-name>/
```

### Run locally

Serve the repository root with any static file server, for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no `npm install`, no environment variables.

---

## 🏗️ Project Structure

```
├── index.html              # Single-page application entry point
├── css/
│   └── style.css           # All styles (dark theme, responsive)
├── js/
│   ├── storage.js          # localStorage backend (auth + database)
│   ├── config.js           # App configuration (no credentials needed)
│   └── app.js              # Full application logic
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages auto-deploy workflow
└── README.md
```

## 🔒 Security

- All routes require a local account (email + password stored in `localStorage`)
- Only game participants can view a finished story
- HTML output is sanitised to prevent XSS
- Comments are limited to 1,000 characters

> **Note:** Because data is stored in `localStorage`, it is local to the
> browser and device. Clearing browser storage will remove accounts and game
> history. For a production multi-device experience a persistent backend would
> be needed.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Auth & Database | Browser `localStorage` (no external services) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

## 📜 Game Rules (implemented)

- ✅ User registration & login
- ✅ Create game sessions (2–10 players) with shareable join code
- ✅ Waiting room before game starts
- ✅ Only the **last 50 characters** of the previous turn shown to the next player
- ✅ Minimum **200 characters** enforced per turn
- ✅ **Game Over voting** — game ends only when all players vote
- ✅ Full story revealed when game ends
- ✅ Comments on finished stories
- ✅ Stories only accessible to players who participated
