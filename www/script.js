// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAvuTedi4hNLDTHwNt3tElmZZmwmxBC_zo",
  authDomain: "rupeedesk7.firebaseapp.com",
  projectId: "rupeedesk7",
  storageBucket: "rupeedesk7.firebasestorage.app",
  messagingSenderId: "1013963357851",
  appId: "1:1013963357851:android:eea4e2e566c2244aed503e"
};

// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, increment,
  serverTimestamp, collection, getDocs, query, where, orderBy, limit, writeBatch, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- App Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;

// --- Helper Functions ---
function getDeviceId() {
  let deviceId = localStorage.getItem('deviceGuid');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceGuid', deviceId);
  }
  return deviceId;
}

function showModal(title, body) {
  const modal = document.getElementById('modal');
  modal.querySelector('#modal-title').innerHTML = title;
  modal.querySelector('#modal-body').innerHTML = body;
  modal.style.display = 'flex';
}

window.closeModal = function () {
  document.getElementById('modal').style.display = 'none';
}

function handleError(error) {
  console.error("Error:", error);
  showModal("Error", `<p>${error.message}</p>`);
}

// --- UI + User ---
function updateUI() {
  if (!userData) return;
  document.getElementById('coin-balance').textContent = `₹${(userData.balance || 0).toFixed(2)}`;
  document.getElementById('referral-code').textContent = userData.referralCode;
  document.getElementById('sms-count').textContent = (userData.smsTask?.count) || 0;
}

async function setupUser(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const customId = `RUPE${Math.floor(1000 + Math.random() * 9000)}`;
    const newUserData = {
      uid: user.uid, customId, email: user.email, balance: 10.00,
      referralCode, deviceGuid: getDeviceId(), status: "active",
      smsTask: { count: 0 }, createdAt: serverTimestamp()
    };
    await setDoc(userRef, newUserData);
    showModal("Welcome!", "<p>You received ₹10.00 signup bonus!</p>");
  }
}

function listenToUserData(uid) {
  const userRef = doc(db, "users", uid);
  onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      userData = docSnap.data();
      updateUI();
    }
  });
}

// --- AUTO SMS TASK FUNCTION ---
document.getElementById('assign-sms-btn').addEventListener('click', async () => {
  if (!currentUser || !userData) return;

  const dailyCount = userData.smsTask?.count || 0;
  if (dailyCount >= 100) {
    return showModal("Limit Reached", "<p>You reached your daily 100 SMS limit.</p>");
  }

  const BATCH_SIZE = 10;
  const progressWrap = document.getElementById('sms-progress-wrapper');
  const progressBar = document.getElementById('sms-progress-bar');
  const progressText = document.getElementById('sms-progress-text');

  const showProgress = (done, total) => {
    progressWrap.classList.remove('hidden');
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${done} / ${total}`;
  };

  try {
    // Fetch unassigned SMS tasks
    const invRef = collection(db, "smsInventory");
    const q = query(invRef, where("assigned", "==", false), limit(BATCH_SIZE));
    const snap = await getDocs(q);

    if (snap.empty) {
      return showModal("No Tasks", "<p>No SMS tasks available right now.</p>");
    }

    const tasks = [];
    const batchAssign = writeBatch(db);
    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      tasks.push({ id: docSnap.id, to: d.number, body: d.message });
      batchAssign.update(doc(invRef, docSnap.id), {
        assigned: true,
        assignedTo: currentUser.uid,
        assignedAt: serverTimestamp()
      });
    });
    await batchAssign.commit();

    // ✅ Call the native SMS plugin
    const plugin = window.Capacitor?.Plugins?.SMSSender;
    if (!plugin) {
      return showModal("Error", "<p>Native SMS plugin not available. Please use Android app.</p>");
    }

    showProgress(0, tasks.length);
    const response = await plugin.sendMessages({ messages: JSON.stringify(tasks) });
    const results = response?.results || response; // some plugin builds return .results

    if (!Array.isArray(results)) {
      throw new Error("Invalid plugin response");
    }

    const updateBatch = writeBatch(db);
    let successCount = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const taskRef = doc(invRef, r.id);
      if (r.success) {
        updateBatch.update(taskRef, { status: "sent", sentAt: serverTimestamp() });
        updateBatch.update(doc(db, "users", currentUser.uid), {
          balance: increment(0.20),
          "smsTask.count": increment(1)
        });
        successCount++;
      } else {
        updateBatch.update(taskRef, { status: "failed", error: r.error || "unknown" });
      }
      showProgress(i + 1, results.length);
    }

    await updateBatch.commit();
    showModal("Round Complete", `<p>${successCount} SMS sent successfully!</p>`);
    progressWrap.classList.add('hidden');

  } catch (err) {
    console.error("Auto SMS error:", err);
    handleError(err);
  }
});

// --- AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await setupUser(user);
    listenToUserData(user.uid);
  } else {
    window.location.href = "login.html";
  }
});