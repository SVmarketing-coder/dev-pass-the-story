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

## 🚀 Live Demo

> Deployed at: `https://<your-github-username>.github.io/dev-pass-the-story/`

---

## ⚙️ Setup & Deployment

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** and follow the setup wizard
3. Once created, click the **`</>`** (Web) icon to add a web app
4. Register the app (you don't need Firebase Hosting — we use GitHub Pages)
5. Copy the `firebaseConfig` values shown

### 2. Enable Firebase Services

In the Firebase Console:

- **Authentication** → Sign-in method → Enable **Email/Password**
- **Firestore Database** → Create database → Start in **test mode** (then apply security rules below)

### 3. Apply Firestore Security Rules

In **Firestore → Rules**, paste the contents of `firestore.rules` from this repository and click **Publish**.

### 4. Add Firebase Indexes

In Firestore, create a **composite index** for the games query:

| Collection | Field | Order |
|---|---|---|
| `games` | `playerIds` (Array) | — |
| `games` | `createdAt` | Descending |

> Firestore will also prompt you with a direct link to create indexes when you first run the app.

### 5. Configure the App

**Option A – Local development:**

Edit `js/config.js` and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

**Option B – GitHub Pages deployment (recommended):**

Add the following [GitHub Repository Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

| Secret Name | Value |
|---|---|
| `FIREBASE_API_KEY` | Your Firebase API key |
| `FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Your project ID |
| `FIREBASE_STORAGE_BUCKET` | `<project-id>.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | Your sender ID |
| `FIREBASE_APP_ID` | Your app ID |

### 6. Enable GitHub Pages

1. Go to your repo → **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` will build and deploy automatically

---

## 🏗️ Project Structure

```
├── index.html              # Single-page application entry point
├── css/
│   └── style.css           # All styles (dark theme, responsive)
├── js/
│   ├── config.js           # Firebase configuration (edit this!)
│   └── app.js              # Full application logic
├── firestore.rules         # Firestore security rules
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages auto-deploy workflow
└── README.md
```

## 🔒 Security

- All routes require authentication
- Firestore rules enforce that only game participants can read/write story data
- HTML output is sanitised to prevent XSS
- Comments are limited to 1,000 characters

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Backend / Auth | Firebase Authentication |
| Database | Cloud Firestore (real-time) |
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
