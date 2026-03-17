/**
 * Pass the Story – Local Storage Backend
 *
 * Provides a Firebase-compatible API backed by localStorage.
 * Real-time listeners work across browser tabs via the 'storage' event
 * and within the same tab via a custom 'pts-storage-change' event.
 *
 * No external services or configuration required.
 * The app runs entirely in the browser and is hosted on GitHub Pages.
 */

(function (window) {
  'use strict';

  /* =========================================================
     LOW-LEVEL STORE HELPERS
     ========================================================= */

  function getStore(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (e) { return null; }
  }

  function setStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    // Notify listeners in THIS tab (storage event only fires in OTHER tabs)
    window.dispatchEvent(new CustomEvent('pts-storage-change', { detail: { key } }));
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* =========================================================
     FIELD VALUE SENTINELS  (mirrors firebase.firestore.FieldValue)
     ========================================================= */

  function FieldValue(type, value) {
    this._type  = type;
    this._value = value;
  }
  FieldValue.serverTimestamp = function () { return new FieldValue('timestamp', null); };
  FieldValue.arrayUnion      = function () { return new FieldValue('arrayUnion', Array.from(arguments)); };
  FieldValue.increment       = function (n) { return new FieldValue('increment', n); };

  function applyFieldValues(existing, updates) {
    const result = Object.assign({}, existing);
    Object.keys(updates).forEach(function (k) {
      const v = updates[k];
      if (v instanceof FieldValue) {
        if (v._type === 'timestamp') {
          result[k] = Date.now();
        } else if (v._type === 'arrayUnion') {
          const arr = Array.isArray(result[k]) ? result[k].slice() : [];
          v._value.forEach(function (item) {
            if (typeof item !== 'object') {
              if (!arr.includes(item)) arr.push(item);
            } else {
              arr.push(item); // objects are always appended (no deep dedup)
            }
          });
          result[k] = arr;
        } else if (v._type === 'increment') {
          result[k] = (typeof result[k] === 'number' ? result[k] : 0) + v._value;
        }
      } else {
        result[k] = v;
      }
    });
    return result;
  }

  /* =========================================================
     SNAPSHOT HELPERS
     ========================================================= */

  function makeDocSnap(id, data) {
    return {
      id:     id,
      exists: data !== null && data !== undefined,
      data:   function () { return data ? Object.assign({}, data) : undefined; }
    };
  }

  function makeQuerySnap(docs) {
    const snaps = docs.map(function (d) { return makeDocSnap(d.id, d.data); });
    return {
      empty:   snaps.length === 0,
      size:    snaps.length,
      docs:    snaps,
      forEach: function (cb) { snaps.forEach(cb); }
    };
  }

  /* =========================================================
     COLLECTION STORAGE  (each collection is one localStorage key)
     ========================================================= */

  function colKey(path) { return 'pts_col_' + path; }

  function getCol(path) { return getStore(colKey(path)) || {}; }

  function setCol(path, col) { setStore(colKey(path), col); }

  /* =========================================================
     DOCUMENT REFERENCE
     ========================================================= */

  function DocumentRef(colPath, docId) {
    this._colPath = colPath;
    this._docId   = docId;
  }

  DocumentRef.prototype.collection = function (subName) {
    return new CollectionRef(this._colPath + '/' + this._docId + '/' + subName);
  };

  DocumentRef.prototype.get = function () {
    const col = getCol(this._colPath);
    return Promise.resolve(makeDocSnap(this._docId, col[this._docId] || null));
  };

  DocumentRef.prototype.set = function (data) {
    const col = getCol(this._colPath);
    col[this._docId] = applyFieldValues({}, data);
    setCol(this._colPath, col);
    return Promise.resolve();
  };

  DocumentRef.prototype.update = function (updates) {
    const col     = getCol(this._colPath);
    const existing = col[this._docId] || {};
    col[this._docId] = applyFieldValues(existing, updates);
    setCol(this._colPath, col);
    return Promise.resolve();
  };

  DocumentRef.prototype.onSnapshot = function (cb) {
    const self = this;
    function fire() {
      const col = getCol(self._colPath);
      cb(makeDocSnap(self._docId, col[self._docId] || null));
    }
    fire();
    const key = colKey(this._colPath);
    function handler(e) {
      const eventKey = (e.type === 'pts-storage-change') ? e.detail.key : e.key;
      if (eventKey === key || eventKey === null) fire();
    }
    window.addEventListener('storage',            handler);
    window.addEventListener('pts-storage-change', handler);
    return function () {
      window.removeEventListener('storage',            handler);
      window.removeEventListener('pts-storage-change', handler);
    };
  };

  /* =========================================================
     QUERY  (chainable where / orderBy / limit)
     ========================================================= */

  function Query(colPath, conditions, order, lim) {
    this._colPath    = colPath;
    this._conditions = conditions || [];
    this._order      = order      || null;
    this._lim        = lim        != null ? lim : null;
  }

  Query.prototype.where = function (field, op, value) {
    return new Query(
      this._colPath,
      this._conditions.concat([{ field: field, op: op, value: value }]),
      this._order,
      this._lim
    );
  };

  Query.prototype.orderBy = function (field, dir) {
    return new Query(this._colPath, this._conditions, { field: field, dir: dir || 'asc' }, this._lim);
  };

  Query.prototype.limit = function (n) {
    return new Query(this._colPath, this._conditions, this._order, n);
  };

  Query.prototype._run = function () {
    const col  = getCol(this._colPath);
    let docs = Object.keys(col).map(function (id) { return { id: id, data: col[id] }; });

    this._conditions.forEach(function (c) {
      docs = docs.filter(function (d) {
        const v = d.data[c.field];
        if (c.op === '==')             return v === c.value;
        if (c.op === 'array-contains') return Array.isArray(v) && v.includes(c.value);
        return true;
      });
    });

    if (this._order) {
      const ord = this._order;
      docs.sort(function (a, b) {
        const av = a.data[ord.field], bv = b.data[ord.field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return ord.dir === 'desc' ? -cmp : cmp;
      });
    }

    if (this._lim != null) docs = docs.slice(0, this._lim);
    return docs;
  };

  Query.prototype.get = function () {
    return Promise.resolve(makeQuerySnap(this._run()));
  };

  Query.prototype.onSnapshot = function (cb) {
    const self = this;
    function fire() { cb(makeQuerySnap(self._run())); }
    fire();
    const key = colKey(this._colPath);
    function handler(e) {
      const eventKey = (e.type === 'pts-storage-change') ? e.detail.key : e.key;
      if (eventKey === key || eventKey === null) fire();
    }
    window.addEventListener('storage',            handler);
    window.addEventListener('pts-storage-change', handler);
    return function () {
      window.removeEventListener('storage',            handler);
      window.removeEventListener('pts-storage-change', handler);
    };
  };

  /* =========================================================
     COLLECTION REFERENCE  (extends Query, adds doc() and add())
     ========================================================= */

  function CollectionRef(path) {
    Query.call(this, path, [], null, null);
  }
  CollectionRef.prototype = Object.create(Query.prototype);
  CollectionRef.prototype.constructor = CollectionRef;

  CollectionRef.prototype.doc = function (id) {
    return new DocumentRef(this._colPath, id || uuid());
  };

  CollectionRef.prototype.add = function (data) {
    const id  = uuid();
    const col = getCol(this._colPath);
    col[id]   = applyFieldValues({}, data);
    setCol(this._colPath, col);
    return Promise.resolve(new DocumentRef(this._colPath, id));
  };

  /* =========================================================
     FIRESTORE DB  (mirrors firebase.firestore())
     ========================================================= */

  const db = {
    collection: function (name) { return new CollectionRef(name); }
  };

  /* =========================================================
     AUTH
     ========================================================= */

  const USERS_KEY   = 'pts_auth_users';
  const SESSION_KEY = 'pts_auth_session';

  function getUsers()      { return getStore(USERS_KEY) || {}; }
  function saveUsers(u)    { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function getSession()    { return getStore(SESSION_KEY); }

  const _authListeners = [];
  function notifyAuth(user) {
    _authListeners.forEach(function (cb) { cb(user); });
  }

  const auth = {
    currentUser: null,

    signInWithEmailAndPassword: function (email, pass) {
      const users = getUsers();
      const found = Object.values(users).find(function (u) { return u.email === email; });
      if (!found) {
        const e = new Error('No account found with this email.');
        e.code = 'auth/user-not-found';
        return Promise.reject(e);
      }
      if (found.password !== pass) {
        const e = new Error('Incorrect password.');
        e.code = 'auth/wrong-password';
        return Promise.reject(e);
      }
      const sessionUser = { uid: found.uid, email: found.email, displayName: found.displayName || '' };
      auth.currentUser = sessionUser;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
      setTimeout(function () { notifyAuth(sessionUser); }, 0);
      return Promise.resolve({ user: sessionUser });
    },

    createUserWithEmailAndPassword: function (email, pass) {
      const users = getUsers();
      if (Object.values(users).some(function (u) { return u.email === email; })) {
        const e = new Error('An account with this email already exists.');
        e.code = 'auth/email-already-in-use';
        return Promise.reject(e);
      }
      if (pass.length < 6) {
        const e = new Error('Password must be at least 6 characters.');
        e.code = 'auth/weak-password';
        return Promise.reject(e);
      }
      const uid = uuid();
      users[uid] = { uid: uid, email: email, password: pass, displayName: '' };
      saveUsers(users);
      const sessionUser = { uid: uid, email: email, displayName: '' };
      auth.currentUser = sessionUser;
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
      // Don't notify yet — wait for updateProfile so displayName is ready
      const credUser = {
        uid:         uid,
        email:       email,
        displayName: '',
        updateProfile: function (profile) {
          const displayName = profile.displayName || '';
          const us = getUsers();
          if (us[uid]) { us[uid].displayName = displayName; saveUsers(us); }
          const s = Object.assign({}, getSession() || {}, { displayName: displayName });
          auth.currentUser = s;
          localStorage.setItem(SESSION_KEY, JSON.stringify(s));
          setTimeout(function () { notifyAuth(s); }, 0);
          return Promise.resolve();
        }
      };
      return Promise.resolve({ user: credUser });
    },

    signOut: function () {
      auth.currentUser = null;
      localStorage.removeItem(SESSION_KEY);
      notifyAuth(null);
      return Promise.resolve();
    },

    onAuthStateChanged: function (cb) {
      _authListeners.push(cb);
      const session = getSession();
      auth.currentUser = session || null;
      // Fire asynchronously to match Firebase behaviour
      setTimeout(function () { cb(auth.currentUser); }, 0);
      return function () {
        const i = _authListeners.indexOf(cb);
        if (i >= 0) _authListeners.splice(i, 1);
      };
    }
  };

  /* =========================================================
     EXPOSE GLOBALS  (matches the API surface used by app.js)
     ========================================================= */

  window.db   = db;
  window.auth = auth;

  // Shim for firebase.firestore.FieldValue.* calls in app.js
  window.firebase = {
    firestore: {
      FieldValue: {
        serverTimestamp: function ()    { return FieldValue.serverTimestamp(); },
        arrayUnion:      function ()    { return FieldValue.arrayUnion.apply(FieldValue, arguments); },
        increment:       function (n)   { return FieldValue.increment(n); }
      }
    }
  };

})(window);
