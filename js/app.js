/**
 * Pass the Story – Main Application
 *
 * Architecture: Single-Page Application (SPA) with hash-based routing.
 * Backend: Firebase (Firestore + Authentication).
 *
 * Pages / views:
 *  #auth        – Login / Register
 *  #lobby       – Game lobby (my active & past games)
 *  #create      – Create a new game
 *  #waiting/:id – Waiting room before game starts
 *  #game/:id    – Active game (storytelling)
 *  #story/:id   – Finished story + comments
 */

/* =========================================================
   CONSTANTS
   ========================================================= */
const MIN_CHARS = 200;
const PREVIEW_CHARS = 50;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/* =========================================================
   FIREBASE INITIALIZATION
   (firebase.initializeApp() is called in the DOMContentLoaded
    handler below; db and auth are assigned there too.)
   ========================================================= */
let db   = null;
let auth = null;

/* =========================================================
   STATE
   ========================================================= */
let currentUser  = null;
let activeUnsubs = [];   // Firestore listeners to clean up on navigation

/* =========================================================
   UTILITY HELPERS
   ========================================================= */

/** Generate a random 6-character uppercase join code */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Return the initial of a display name (for avatar) */
function initial(name) {
  return (name || '?').trim()[0].toUpperCase();
}

/** Format a Firestore timestamp or JS Date */
function formatDate(ts) {
  const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(ts) {
  const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Show a toast notification */
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/** Show / hide the full-screen loading overlay */
function setLoading(visible, text = 'Loading…') {
  const overlay = document.getElementById('loading-overlay');
  const textEl  = overlay.querySelector('.loading-text');
  textEl.textContent = text;
  overlay.classList.toggle('hidden', !visible);
}

/** Clean up all active Firestore real-time listeners */
function clearListeners() {
  activeUnsubs.forEach(fn => fn());
  activeUnsubs = [];
}

/** Trigger a simple confetti animation */
function launchConfetti() {
  const colors = ['#7c6af7', '#f2a65a', '#4caf7d', '#e05a5a', '#a390ff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: ${Math.random() * -10}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${6 + Math.random() * 10}px;
      height: ${6 + Math.random() * 10}px;
      border-radius: ${Math.random() > .5 ? '50%' : '2px'};
      animation-delay: ${Math.random() * 1.5}s;
      animation-duration: ${2 + Math.random() * 1.5}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

/* =========================================================
   ROUTING
   ========================================================= */
function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const h = window.location.hash.slice(1) || 'auth';
  const parts = h.split('/');
  return { route: parts[0] || 'auth', id: parts[1] || null };
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');
}

/* =========================================================
   AUTH PAGE
   ========================================================= */
function initAuthPage() {
  showPage('auth');
  updateNavbar();

  // Tab switching (use onclick to avoid duplicate listeners on re-render)
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`form-${target}`).classList.remove('hidden');
    };
  });

  // Login
  document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    if (!email || !pass) { errEl.textContent = 'Please fill in all fields.'; return; }
    setLoading(true, 'Signing in…');
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged will redirect
    } catch (e) {
      setLoading(false);
      errEl.textContent = friendlyAuthError(e.code);
    }
  };

  // Register
  document.getElementById('btn-register').onclick = async () => {
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-password').value;
    const pass2 = document.getElementById('reg-password2').value;
    const errEl = document.getElementById('reg-error');
    errEl.textContent = '';
    if (!name || !email || !pass || !pass2) { errEl.textContent = 'Please fill in all fields.'; return; }
    if (pass !== pass2) { errEl.textContent = 'Passwords do not match.'; return; }
    if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    setLoading(true, 'Creating account…');
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      await db.collection('users').doc(cred.user.uid).set({
        displayName: name,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // onAuthStateChanged will redirect
    } catch (e) {
      setLoading(false);
      errEl.textContent = friendlyAuthError(e.code);
    }
  };

  // Enter key on password fields (use onclick replacement to avoid stacking)
  document.getElementById('login-password').onkeydown = e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  };
  document.getElementById('reg-password2').onkeydown = e => {
    if (e.key === 'Enter') document.getElementById('btn-register').click();
  };
}

function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':    'An account with this email already exists.',
    'auth/invalid-email':           'Invalid email address.',
    'auth/weak-password':           'Password is too weak.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/too-many-requests':       'Too many attempts. Please try again later.',
    'auth/network-request-failed':  'Network error. Check your connection.',
  };
  return map[code] || 'Authentication error. Please try again.';
}

/* =========================================================
   NAVBAR
   ========================================================= */
function updateNavbar() {
  const nav = document.getElementById('navbar');
  if (!currentUser) { nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');
  document.getElementById('nav-avatar-text').textContent  = initial(currentUser.displayName);
  document.getElementById('nav-username').textContent = currentUser.displayName || currentUser.email;
}

/* =========================================================
   LOBBY PAGE
   ========================================================= */
function initLobbyPage() {
  showPage('lobby');
  updateNavbar();
  clearListeners();

  // Tab switching (My Games / Join)
  document.querySelectorAll('#page-lobby .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-lobby .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#page-lobby .tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-panel-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Create game button
  document.getElementById('btn-create-game').onclick = () => navigate('create');

  // Join modal
  document.getElementById('btn-join-game').onclick   = () => showJoinModal();
  document.getElementById('btn-join-modal-close').onclick = hideJoinModal;
  document.getElementById('btn-submit-join').onclick = handleJoin;
  document.getElementById('join-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleJoin();
  });

  // Load games
  loadMyGames();
}

function showJoinModal() {
  document.getElementById('join-modal').classList.remove('hidden');
  document.getElementById('join-code-input').value = '';
  document.getElementById('join-error').textContent = '';
  document.getElementById('join-code-input').focus();
}
function hideJoinModal() {
  document.getElementById('join-modal').classList.add('hidden');
}

async function handleJoin() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const errEl = document.getElementById('join-error');
  errEl.textContent = '';
  if (code.length !== 6) { errEl.textContent = 'Enter a 6-character game code.'; return; }

  document.getElementById('btn-submit-join').disabled = true;
  try {
    const snap = await db.collection('games').where('code', '==', code).limit(1).get();
    if (snap.empty) { errEl.textContent = 'Game not found. Check the code and try again.'; return; }
    const gameDoc = snap.docs[0];
    const game    = gameDoc.data();
    const gameId  = gameDoc.id;

    if (game.status === 'finished') { errEl.textContent = 'This game has already ended.'; return; }
    if (game.status === 'active')   { errEl.textContent = 'This game is already in progress.'; return; }

    const alreadyIn = game.players.some(p => p.userId === currentUser.uid);
    if (alreadyIn) {
      hideJoinModal();
      navigate(`waiting/${gameId}`);
      return;
    }

    if (game.players.length >= game.maxPlayers) {
      errEl.textContent = `This game is full (${game.maxPlayers} players max).`;
      return;
    }

    // Add player
    await db.collection('games').doc(gameId).update({
      players: firebase.firestore.FieldValue.arrayUnion({
        userId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email,
        joinedAt: Date.now()
      })
    });

    hideJoinModal();
    toast('Joined game!', 'success');
    navigate(`waiting/${gameId}`);
  } catch (e) {
    errEl.textContent = 'Error joining game: ' + e.message;
  } finally {
    document.getElementById('btn-submit-join').disabled = false;
  }
}

function loadMyGames() {
  const container = document.getElementById('my-games-grid');
  container.innerHTML = '<p class="text-muted text-center mt-2">Loading…</p>';

  const unsub = db.collection('games')
    .where('playerIds', 'array-contains', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(snap => {
      if (snap.empty) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="icon">📖</div>
            <p>You haven't played any games yet.</p>
            <button class="btn btn-primary" onclick="navigate('create')">Create a Game</button>
          </div>`;
        return;
      }
      container.innerHTML = '';
      snap.forEach(doc => {
        const g = doc.data();
        container.appendChild(buildGameCard(doc.id, g));
      });
    }, err => {
      container.innerHTML = `<p class="form-error">Error loading games: ${err.message}</p>`;
    });
  activeUnsubs.push(unsub);
}

function buildGameCard(id, g) {
  const el = document.createElement('div');
  el.className = 'game-card';

  const statusBadge = {
    waiting:  '<span class="badge badge-primary">Waiting</span>',
    active:   '<span class="badge badge-accent">Active</span>',
    finished: '<span class="badge badge-success">Finished</span>',
  }[g.status] || '';

  const contributions = (g.contributions || []).length;
  const turns = contributions;
  const date  = formatDate(g.createdAt);

  el.innerHTML = `
    <div class="game-card-title">
      <span>Game #${id.slice(-5).toUpperCase()}</span>
      ${statusBadge}
    </div>
    <div class="game-card-meta">
      <span>👥 ${g.players.length}/${g.maxPlayers} players</span>
      <span>✍️ ${turns} turns</span>
      <span>📅 ${date}</span>
    </div>`;

  el.onclick = () => {
    if (g.status === 'waiting')  navigate(`waiting/${id}`);
    else if (g.status === 'active')   navigate(`game/${id}`);
    else if (g.status === 'finished') navigate(`story/${id}`);
  };
  return el;
}

/* =========================================================
   CREATE GAME PAGE
   ========================================================= */
function initCreatePage() {
  showPage('create');
  updateNavbar();
  clearListeners();

  let selectedMax = 2;

  // Back button
  document.getElementById('btn-create-back').onclick = () => navigate('lobby');

  // Player count buttons
  const row = document.getElementById('player-count-row');
  row.innerHTML = '';
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const btn = document.createElement('button');
    btn.className = 'player-count-btn' + (n === 2 ? ' selected' : '');
    btn.textContent = n;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMax = n;
    });
    row.appendChild(btn);
  }

  // Create button
  document.getElementById('btn-create-submit').onclick = async () => {
    const errEl = document.getElementById('create-error');
    errEl.textContent = '';
    setLoading(true, 'Creating game…');
    try {
      const code = generateCode();
      const gameRef = await db.collection('games').add({
        code,
        createdBy: currentUser.uid,
        maxPlayers: selectedMax,
        status: 'waiting',
        currentTurnIndex: 0,
        players: [{
          userId: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email,
          joinedAt: Date.now()
        }],
        playerIds: [currentUser.uid],
        contributions: [],
        gameOverVotes: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        finishedAt: null
      });
      setLoading(false);
      toast('Game created!', 'success');
      navigate(`waiting/${gameRef.id}`);
    } catch (e) {
      setLoading(false);
      errEl.textContent = 'Error: ' + e.message;
    }
  };
}

/* =========================================================
   WAITING ROOM PAGE
   ========================================================= */
function initWaitingPage(gameId) {
  showPage('waiting');
  updateNavbar();
  clearListeners();

  document.getElementById('btn-waiting-back').onclick = () => navigate('lobby');
  document.getElementById('btn-copy-code').onclick    = () => copyCode();
  document.getElementById('btn-start-game').onclick   = () => startGame(gameId);

  const unsub = db.collection('games').doc(gameId)
    .onSnapshot(snap => {
      if (!snap.exists) { navigate('lobby'); return; }
      const g = snap.data();

      // Redirect if game already started
      if (g.status === 'active') { navigate(`game/${gameId}`); return; }

      // Ensure player is in game
      const playerIn = g.players.some(p => p.userId === currentUser.uid);
      if (!playerIn) { navigate('lobby'); return; }

      renderWaitingRoom(gameId, g);
    });
  activeUnsubs.push(unsub);
}

function renderWaitingRoom(gameId, g) {
  document.getElementById('waiting-code').textContent = g.code;

  // Player slots
  const slotsEl = document.getElementById('waiting-slots');
  slotsEl.innerHTML = '';
  for (let i = 0; i < g.maxPlayers; i++) {
    const slot = document.createElement('div');
    if (i < g.players.length) {
      slot.className = 'slot filled';
      slot.title = g.players[i].displayName;
      slot.textContent = '✓';
    } else {
      slot.className = 'slot';
      slot.title = 'Waiting for player…';
      slot.textContent = (i + 1);
    }
    slotsEl.appendChild(slot);
  }

  // Players list
  const listEl = document.getElementById('waiting-players');
  listEl.innerHTML = '';
  g.players.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'player-item';
    const isHost = p.userId === g.createdBy;
    const isMe   = p.userId === currentUser.uid;
    item.innerHTML = `
      <div class="avatar">${initial(p.displayName)}</div>
      <span class="name">${escHtml(p.displayName)}</span>
      ${isMe   ? '<span class="you-badge">You</span>'  : ''}
      ${isHost ? '<span class="host-badge">Host</span>' : ''}
    `;
    listEl.appendChild(item);
  });

  // Start button visibility
  const isHost = g.createdBy === currentUser.uid;
  const canStart = g.players.length >= MIN_PLAYERS;
  const startBtn = document.getElementById('btn-start-game');
  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !canStart;
    startBtn.textContent = canStart
      ? `Start Game (${g.players.length} players)`
      : `Need at least ${MIN_PLAYERS} players to start`;
  } else {
    startBtn.classList.add('hidden');
    // Show waiting message
    const hostName = g.players.find(p => p.userId === g.createdBy)?.displayName || 'host';
    document.getElementById('waiting-hint').textContent =
      `Waiting for ${escHtml(hostName)} to start the game…`;
  }

  if (isHost) {
    document.getElementById('waiting-hint').textContent =
      canStart ? 'Ready to start! Click the button when everyone has joined.'
               : `Waiting for more players… (${g.players.length}/${g.maxPlayers})`;
  }
}

async function startGame(gameId) {
  setLoading(true, 'Starting game…');
  try {
    const snap = await db.collection('games').doc(gameId).get();
    const g = snap.data();

    if (g.players.length < MIN_PLAYERS) {
      setLoading(false);
      toast('Need at least 2 players to start!', 'error');
      return;
    }

    // Fisher-Yates shuffle for unbiased player order randomization
    const shuffled = [...g.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    await db.collection('games').doc(gameId).update({
      status: 'active',
      currentTurnIndex: 0,
      players: shuffled,
      playerIds: shuffled.map(p => p.userId)
    });
    setLoading(false);
  } catch (e) {
    setLoading(false);
    toast('Error starting game: ' + e.message, 'error');
  }
}

function copyCode() {
  const code = document.getElementById('waiting-code').textContent;
  navigator.clipboard.writeText(code).then(() => toast('Join code copied!', 'success'));
}

/* =========================================================
   GAME PAGE
   ========================================================= */
function initGamePage(gameId) {
  showPage('game');
  updateNavbar();
  clearListeners();

  const textarea = document.getElementById('story-input');
  const counter  = document.getElementById('char-counter');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / ${MIN_CHARS} min`;
    counter.className   = 'char-counter' + (len >= MIN_CHARS ? ' ok' : ' not-ok');
  });

  document.getElementById('btn-submit-turn').onclick    = () => submitTurn(gameId);
  document.getElementById('btn-game-over-vote').onclick = () => voteGameOver(gameId);

  const unsub = db.collection('games').doc(gameId)
    .onSnapshot(snap => {
      if (!snap.exists) { navigate('lobby'); return; }
      const g = snap.data();

      // Make sure player is in game
      const playerIn = g.players.some(p => p.userId === currentUser.uid);
      if (!playerIn) { navigate('lobby'); return; }

      if (g.status === 'finished') {
        launchConfetti();
        setTimeout(() => navigate(`story/${gameId}`), 1200);
        return;
      }

      renderGamePage(gameId, g);
    });
  activeUnsubs.push(unsub);
}

function renderGamePage(gameId, g) {
  const currentPlayerIndex = g.currentTurnIndex % g.players.length;
  const currentPlayer      = g.players[currentPlayerIndex];
  const isMyTurn           = currentPlayer.userId === currentUser.uid;
  const contributions      = g.contributions || [];
  const lastContribution   = contributions.length > 0 ? contributions[contributions.length - 1] : null;
  const hasVotedGameOver   = (g.gameOverVotes || []).includes(currentUser.uid);

  // --- Story preview (last 50 chars) ---
  const previewBox = document.getElementById('story-preview-text');
  if (lastContribution) {
    const text = lastContribution.text;
    const snippet = text.slice(-PREVIEW_CHARS);
    const ellipsis = text.length > PREVIEW_CHARS ? '…' : '';
    previewBox.textContent = ellipsis + snippet;
    previewBox.classList.remove('story-first-turn');
  } else {
    previewBox.textContent = 'You are starting the story! Write the opening passage.';
    previewBox.classList.add('story-first-turn');
  }

  // --- Write area vs waiting ---
  const writeBox   = document.getElementById('write-box');
  const waitingBox = document.getElementById('waiting-turn-box');

  if (isMyTurn) {
    writeBox.classList.remove('hidden');
    waitingBox.classList.add('hidden');
  } else {
    writeBox.classList.add('hidden');
    waitingBox.classList.remove('hidden');
    document.getElementById('waiting-turn-name').textContent = currentPlayer.displayName;
  }

  // --- Game over button state ---
  const govBtn = document.getElementById('btn-game-over-vote');
  govBtn.textContent = hasVotedGameOver ? '✅ Game Over voted' : '🏁 Vote Game Over';
  govBtn.disabled    = hasVotedGameOver || !isMyTurn;

  // Only show game-over option after at least one full round
  const minTurns = g.players.length;
  document.getElementById('game-over-section').classList.toggle(
    'hidden', contributions.length < minTurns
  );

  // --- Game over progress ---
  const totalVotes   = (g.gameOverVotes || []).length;
  const totalPlayers = g.players.length;
  document.getElementById('votes-count').textContent =
    `${totalVotes} / ${totalPlayers} players voted to end`;
  const pct = totalPlayers > 0 ? (totalVotes / totalPlayers * 100) : 0;
  document.getElementById('votes-bar-fill').style.width = `${pct}%`;

  // --- Turn order sidebar ---
  const turnList = document.getElementById('turn-order-list');
  turnList.innerHTML = '';
  g.players.forEach((p, i) => {
    const isCurrent = i === currentPlayerIndex;
    const hasVoted  = (g.gameOverVotes || []).includes(p.userId);
    const item = document.createElement('div');
    item.className = 'turn-order-item' + (isCurrent ? ' current-turn' : '');
    item.innerHTML = `
      <div class="turn-avatar">${initial(p.displayName)}</div>
      <span>${escHtml(p.displayName)}${p.userId === currentUser.uid ? ' (you)' : ''}</span>
      ${hasVoted ? '<span class="voted-icon" title="Voted Game Over">🏁</span>' : ''}
      ${isCurrent ? '<span class="badge badge-accent" style="margin-left:auto;font-size:.65rem;">Turn</span>' : ''}
    `;
    turnList.appendChild(item);
  });

  // --- Turn count ---
  document.getElementById('turn-count').textContent =
    `Turn ${contributions.length + 1}`;
}

async function submitTurn(gameId) {
  const textarea = document.getElementById('story-input');
  const text = textarea.value.trim();
  const errEl = document.getElementById('game-error');
  errEl.textContent = '';

  if (text.length < MIN_CHARS) {
    errEl.textContent = `Please write at least ${MIN_CHARS} characters (currently ${text.length}).`;
    return;
  }

  const submitBtn = document.getElementById('btn-submit-turn');
  submitBtn.disabled = true;
  setLoading(true, 'Submitting…');

  try {
    const snap = await db.collection('games').doc(gameId).get();
    const g    = snap.data();

    // Verify it's still this user's turn (race condition check)
    const currentPlayerIndex = g.currentTurnIndex % g.players.length;
    if (g.players[currentPlayerIndex].userId !== currentUser.uid) {
      setLoading(false);
      submitBtn.disabled = false;
      errEl.textContent = 'It is no longer your turn.';
      return;
    }

    const contribution = {
      userId:      currentUser.uid,
      displayName: currentUser.displayName || currentUser.email,
      text,
      timestamp:   Date.now()
    };

    await db.collection('games').doc(gameId).update({
      contributions:   firebase.firestore.FieldValue.arrayUnion(contribution),
      currentTurnIndex: firebase.firestore.FieldValue.increment(1)
    });

    textarea.value = '';
    document.getElementById('char-counter').textContent = `0 / ${MIN_CHARS} min`;
    document.getElementById('char-counter').className = 'char-counter not-ok';

    setLoading(false);
    submitBtn.disabled = false;
    toast('Turn submitted!', 'success');
  } catch (e) {
    setLoading(false);
    submitBtn.disabled = false;
    errEl.textContent = 'Error: ' + e.message;
  }
}

async function voteGameOver(gameId) {
  const confirmMsg = 'Vote to end the game? The game ends when ALL players have voted.';
  if (!confirm(confirmMsg)) return;

  setLoading(true, 'Voting…');
  try {
    const snap = await db.collection('games').doc(gameId).get();
    const g    = snap.data();

    const newVotes = [...new Set([...(g.gameOverVotes || []), currentUser.uid])];
    const updates  = {
      gameOverVotes: newVotes
    };

    // If all players have voted, mark game as finished
    if (newVotes.length >= g.players.length) {
      updates.status     = 'finished';
      updates.finishedAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection('games').doc(gameId).update(updates);
    setLoading(false);
    toast('Your game-over vote was recorded!', 'info');
  } catch (e) {
    setLoading(false);
    toast('Error voting: ' + e.message, 'error');
  }
}

/* =========================================================
   STORY / FINISHED PAGE
   ========================================================= */
function initStoryPage(gameId) {
  showPage('story');
  updateNavbar();
  clearListeners();

  document.getElementById('btn-story-back').onclick = () => navigate('lobby');
  document.getElementById('btn-add-comment').onclick = () => addComment(gameId);
  document.getElementById('comment-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) addComment(gameId);
  });

  // Load game once (story doesn't change after finishing)
  db.collection('games').doc(gameId).get().then(snap => {
    if (!snap.exists) { navigate('lobby'); return; }
    const g = snap.data();
    if (!g.players.some(p => p.userId === currentUser.uid)) {
      navigate('lobby'); return;
    }
    renderStoryPage(gameId, g);
  });

  // Real-time comments
  const unsub = db.collection('games').doc(gameId)
    .collection('comments')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => renderComments(snap));
  activeUnsubs.push(unsub);
}

function renderStoryPage(gameId, g) {
  const contributions = g.contributions || [];

  document.getElementById('story-game-id').textContent = `Game #${gameId.slice(-5).toUpperCase()}`;
  document.getElementById('story-date').textContent    = formatDate(g.finishedAt || g.createdAt);
  document.getElementById('story-players').textContent =
    g.players.map(p => p.displayName).join(', ');
  document.getElementById('story-turns').textContent   = `${contributions.length} turns`;

  const storyBody = document.getElementById('story-contributions');
  storyBody.innerHTML = '';
  contributions.forEach((c, i) => {
    const block = document.createElement('div');
    block.className = 'contribution-block';
    block.innerHTML = `
      <div class="contribution-header">
        <div class="contrib-avatar">${initial(c.displayName)}</div>
        <strong>${escHtml(c.displayName)}</strong>
        <span>· Turn ${i + 1}</span>
        <span>· ${formatTime(c.timestamp)}</span>
      </div>
      <div class="contribution-text">${escHtml(c.text).replace(/\n/g, '<br>')}</div>
    `;
    storyBody.appendChild(block);
  });
}

function renderComments(snap) {
  const list = document.getElementById('comment-list');
  list.innerHTML = '';
  if (snap.empty) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
    return;
  }
  snap.forEach(doc => {
    const c = doc.data();
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `
      <div class="comment-header">
        <span class="comment-author">${escHtml(c.displayName)}</span>
        <span class="comment-time">${formatDate(c.createdAt)} ${formatTime(c.createdAt)}</span>
      </div>
      <div class="comment-text">${escHtml(c.text).replace(/\n/g, '<br>')}</div>
    `;
    list.appendChild(item);
  });
}

async function addComment(gameId) {
  const input = document.getElementById('comment-input');
  const text  = input.value.trim();
  const errEl = document.getElementById('comment-error');
  errEl.textContent = '';

  if (!text) { errEl.textContent = 'Please write a comment.'; return; }
  if (text.length > 1000) { errEl.textContent = 'Comment must be under 1000 characters.'; return; }

  const btn = document.getElementById('btn-add-comment');
  btn.disabled = true;
  try {
    await db.collection('games').doc(gameId).collection('comments').add({
      userId:      currentUser.uid,
      displayName: currentUser.displayName || currentUser.email,
      text,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
    toast('Comment added!', 'success');
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

/* =========================================================
   SECURITY – HTML escape
   ========================================================= */
function escHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str || '').replace(/[&<>"']/g, m => map[m]);
}

/* =========================================================
   ROUTER
   ========================================================= */
async function router() {
  const { route, id } = getRoute();

  if (!currentUser) {
    initAuthPage();
    return;
  }

  switch (route) {
    case 'auth':
    case '':
      navigate('lobby');
      break;
    case 'lobby':
      initLobbyPage();
      break;
    case 'create':
      initCreatePage();
      break;
    case 'waiting':
      if (!id) { navigate('lobby'); break; }
      initWaitingPage(id);
      break;
    case 'game':
      if (!id) { navigate('lobby'); break; }
      initGamePage(id);
      break;
    case 'story':
      if (!id) { navigate('lobby'); break; }
      initStoryPage(id);
      break;
    default:
      navigate('lobby');
  }
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Firebase
  if (!window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    document.getElementById('loading-overlay').innerHTML = `
      <div style="text-align:center;padding:2rem;max-width:500px">
        <div style="font-size:3rem;margin-bottom:1rem">⚙️</div>
        <h2 style="margin-bottom:1rem;color:#e8e9f0">Firebase Setup Required</h2>
        <p style="color:#8a8da8;margin-bottom:1.5rem;line-height:1.7">
          To run this app, you need to configure Firebase.<br>
          Edit <code style="background:#252840;padding:.2em .5em;border-radius:4px">js/config.js</code>
          with your Firebase project credentials.<br><br>
          See <strong>README.md</strong> for step-by-step instructions.
        </p>
        <a href="https://console.firebase.google.com/" target="_blank"
           style="display:inline-block;background:#7c6af7;color:#fff;padding:.65rem 1.5rem;
                  border-radius:8px;font-weight:600;text-decoration:none">
          Open Firebase Console
        </a>
      </div>`;
    return;
  }

  firebase.initializeApp(window.FIREBASE_CONFIG);

  // Initialize Firestore and Auth after app is initialized
  db   = firebase.firestore();
  auth = firebase.auth();

  // Sign-out button
  document.getElementById('btn-signout').addEventListener('click', async () => {
    await auth.signOut();
    navigate('auth');
  });

  // Navbar logo → lobby
  document.getElementById('nav-logo').addEventListener('click', () => {
    if (currentUser) navigate('lobby');
  });

  // Auth state listener
  auth.onAuthStateChanged(user => {
    currentUser = user;
    setLoading(false);
    router();
  });

  // Hash change routing
  window.addEventListener('hashchange', router);
});
