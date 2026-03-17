/**
 * Firebase Configuration
 *
 * HOW TO SET UP:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or use an existing one)
 * 3. Click the "</>" Web icon to add a web app
 * 4. Register the app and copy the config object below
 * 5. In Firebase console:
 *    - Enable Authentication → Email/Password
 *    - Enable Firestore Database (start in test mode, then apply rules below)
 * 6. Deploy Firestore Security Rules (see README.md)
 *
 * For GitHub Pages deployment, replace the values below with your own
 * Firebase project credentials.
 */

// eslint-disable-next-line no-unused-vars
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
