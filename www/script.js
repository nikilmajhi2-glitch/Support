// ---------------------------
// Rupeedesk - script.js (Full)
// ---------------------------

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAvuTedi4hNLDTHwNt3tElmZZmwmxBC_zo",
  authDomain: "rupeedesk7.firebaseapp.com",
  projectId: "rupeedesk7",
  storageBucket: "rupeedesk7.firebasestorage.app",
  messagingSenderId: "1013963357851",
  appId: "1:1013963357851:android:eea4e2e566c2244aed503e"
};

// --- Firebase Imports (v10 modular) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc,
  increment, serverTimestamp, collection, getDocs, query,
  where, orderBy, limit, addDoc, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global state
let currentUser = null;
let userData = null;
let userUnsubscribe = null;

// DOM shortcuts
const pages = document.querySelectorAll('.page-content');
const navItems = document.querySelectorAll('.nav-item');
const coinBalanceEl = document.getElementById('coin-balance');
const referralCodeEl = document.getElementById('referral-code');
const themeCheckbox = document.getElementById('theme-checkbox');

// --------------------
// Helper UI functions
// --------------------
function showModal(title, bodyHtml, actionsHtml = '<button class="modal-button-primary" onclick="closeModal()">OK</button>') {
  const modal = document.getElementById('modal');
  modal.querySelector('#modal-title').innerHTML = title;
  modal.querySelector('#modal-body').innerHTML = bodyHtml;
  const actions = modal.querySelector('.modal-actions');
  if (actions) actions.innerHTML = actionsHtml;
  modal.style.display = 'flex';
}
window.closeModal = function() {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
  // clear actions to avoid duplicate event handlers lingering
  const actions = modal.querySelector('.modal-actions');
  if (actions) actions.innerHTML = '';
};

function handleError(e) {
  console.error(e);
  const message = (e && e.message) ? e.message : String(e);
  showModal('Error', `<p>${escapeHtml(message)}</p>`);
}

// basic HTML escape for safety
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

// --------------------
// Utility functions
// --------------------
function getDeviceId() {
  let id = localStorage.getItem('deviceGuid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceGuid', id);
  }
  return id;
}

function formatINR(n) {
  return `₹${(n||0).toFixed(2)}`;
}

// --------------------
// Navigation (safe)
// --------------------
function showPage(id) {
  pages.forEach(p => p.classList.add('hidden'));
  const pg = document.getElementById(id);
  if (pg) pg.classList.remove('hidden');
}
navItems.forEach(nav => {
  nav.addEventListener('click', (e) => {
    e.preventDefault();
    const pageId = nav.dataset.page;
    if (!pageId) return;
    showPage(pageId);
    navItems.forEach(n => n.classList.remove('active'));
    nav.classList.add('active');
    if (pageId === 'referral-page') loadReferralStats();
  });
});
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tgt = btn.dataset.page;
    if (!tgt) return;
    showPage(tgt);
  });
});

// closing announcement banner
document.getElementById('close-announcement-btn').addEventListener('click', () => {
  document.getElementById('announcement-banner').classList.add('hidden');
});

// --------------------
// Theme
// --------------------
try {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.classList.toggle('dark', savedTheme === 'dark');
  if (themeCheckbox) themeCheckbox.checked = (savedTheme === 'dark');
  if (themeCheckbox) themeCheckbox.addEventListener('change', () => {
    const newTheme = themeCheckbox.checked ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    document.body.classList.toggle('dark', newTheme === 'dark');
  });
} catch (e) {
  console.warn('Theme init failed', e);
}

// --------------------
// User setup & listeners
// --------------------
async function setupUserIfMissing(user) {
  if (!user) return;
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      const referralCode = Math.random().toString(36).substring(2,8).toUpperCase();
      const customId = `RUPE${Math.floor(1000 + Math.random()*9000)}`;
      const newUser = {
        uid: user.uid,
        customId,
        email: user.email || null,
        balance: 10.00,
        referralCode,
        deviceGuid: getDeviceId(),
        status: 'active',
        bankAccount: null,
        whatsAppNumber: null,
        dailyCheckin: { lastClaimed: null },
        dailySpin: { lastSpin: null },
        smsTask: { count: 0 },
        createdAt: serverTimestamp(),
        referrerId: null
      };
      // referral flow: if session has code, credit referrals collection
      const enteredReferralCode = sessionStorage.getItem('referralCode');
      if (enteredReferralCode) {
        const q = query(collection(db,'users'), where('referralCode','==',enteredReferralCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const refDoc = snap.docs[0];
          newUser.referrerId = refDoc.id;
          // create referral record
          await addDoc(collection(db,'referrals'), {
            referrerId: refDoc.id,
            refereeId: user.uid,
            rewarded: false,
            totalCommissionEarned: 0,
            createdAt: serverTimestamp()
          });
        }
        sessionStorage.removeItem('referralCode');
      }
      await setDoc(userRef, newUser);
      showModal('Welcome!', `<p>You've received a welcome bonus of ${formatINR(10)}</p>`);
    } else {
      if (userSnap.data().status === 'banned') {
        document.body.innerHTML = '<h1>Your account has been suspended.</h1>';
      }
    }
  } catch (e) {
    handleError(e);
  }
}

function detachUserListener() {
  if (userUnsubscribe) {
    userUnsubscribe();
    userUnsubscribe = null;
  }
}

function attachUserListener(uid) {
  detachUserListener();
  const userRef = doc(db, 'users', uid);
  userUnsubscribe = onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      userData = snap.data();
      updateUI();
    }
  }, (err) => {
    handleError(err);
  });
}

function updateUI() {
  if (!userData) return;
  try {
    coinBalanceEl.textContent = formatINR(userData.balance || 0);
    referralCodeEl.textContent = userData.referralCode || '---';
    document.getElementById('sms-count').textContent = userData.smsTask?.count || 0;
    const waBtn = document.getElementById('whatsapp-bind-btn');
    if (waBtn) waBtn.textContent = userData.whatsAppNumber ? 'Bound' : 'Bind Now';
    if (waBtn) waBtn.disabled = !!userData.whatsAppNumber;
    const profileCustom = document.getElementById('profile-custom-id');
    if (profileCustom) profileCustom.textContent = userData.customId || '...';
    const profileStatus = document.getElementById('profile-status');
    if (profileStatus) {
      profileStatus.textContent = userData.status || 'active';
      profileStatus.className = `status-${userData.status || 'active'}`;
    }
    const userIdDisplay = document.getElementById('user-id-display');
    if (userIdDisplay) userIdDisplay.textContent = (userData.uid || currentUser?.uid || '').substring(0,15) + '...';
    const deviceIdDisplay = document.getElementById('device-id-display');
    if (deviceIdDisplay) deviceIdDisplay.textContent = (userData.deviceGuid || getDeviceId()).substring(0,15) + '...';
  } catch (e) {
    console.warn('updateUI failed', e);
  }
}

// --------------------
// Announcements
// --------------------
async function fetchLatestAnnouncement() {
  try {
    const q = query(collection(db,'announcements'), orderBy('createdAt','desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const a = snap.docs[0].data();
      document.getElementById('announcement-title').textContent = a.title || '';
      document.getElementById('announcement-body').textContent = a.content || '';
      document.getElementById('announcement-banner').classList.remove('hidden');
    }
  } catch (e) { console.warn('No announcements', e); }
}

// --------------------
// Referral stats (Mine -> Referral page)
// --------------------
async function loadReferralStats() {
  if (!currentUser) return;
  const totalReferralsEl = document.getElementById('total-referrals');
  const totalEarningsEl = document.getElementById('total-referral-earnings');
  const referralListEl = document.getElementById('referral-list');
  totalReferralsEl.textContent = '...';
  totalEarningsEl.textContent = '...';
  referralListEl.innerHTML = '<li>Loading...</li>';
  try {
    const q = query(collection(db,'referrals'), where('referrerId','==', currentUser.uid));
    const snap = await getDocs(q);
    const refs = snap.docs.map(d => d.data());
    totalReferralsEl.textContent = refs.length;
    let total = 0;
    refs.forEach(r => total += r.totalCommissionEarned || 0);
    totalEarningsEl.textContent = formatINR(total);
    if (refs.length === 0) {
      referralListEl.innerHTML = '<li>You haven\'t referred anyone yet.</li>';
      return;
    }
    const refereeIds = refs.map(r => r.refereeId).filter(Boolean);
    if (refereeIds.length === 0) return;
    // Firestore "in" supports max 10; chunk:
    const userMap = new Map();
    for (let i = 0; i < refereeIds.length; i += 10) {
      const chunk = refereeIds.slice(i, i + 10);
      const uq = query(collection(db,'users'), where('uid','in', chunk));
      const usnap = await getDocs(uq);
      usnap.forEach(d => userMap.set(d.data().uid, d.data()));
    }
    referralListEl.innerHTML = '';
    refs.forEach(r => {
      const u = userMap.get(r.refereeId);
      const li = document.createElement('li');
      li.className = 'referral-list-item';
      li.innerHTML = `<p>${u ? escapeHtml(u.customId) : escapeHtml(r.refereeId)}</p><span>Earned: ${formatINR(r.totalCommissionEarned || 0)}</span>`;
      referralListEl.appendChild(li);
    });
  } catch (e) {
    handleError(e);
    referralListEl.innerHTML = '<li>Could not load referrals.</li>';
  }
}

// --------------------
// Daily checkin
// --------------------
async function dailyCheckin() {
  if (!userData || !currentUser) return;
  const today = new Date().toDateString();
  const last = userData.dailyCheckin?.lastClaimed ? new Date(userData.dailyCheckin.lastClaimed.seconds * 1000).toDateString() : null;
  if (today === last) return showModal('Already Claimed', '<p>You have already claimed your check-in bonus today.</p>');
  try {
    await updateDoc(doc(db,'users', currentUser.uid), { balance: increment(1.00), 'dailyCheckin.lastClaimed': serverTimestamp() });
    showModal('Success', `<p>You've earned ${formatINR(1)} from your daily check-in!</p>`);
  } catch (e) { handleError(e); }
}
document.querySelectorAll('.daily-checkin-slide').forEach(s => s.addEventListener('click', dailyCheckin));

// --------------------
// Daily spin (wheel)
// --------------------
document.getElementById('daily-spin-btn').addEventListener('click', () => {
  if (!userData || !currentUser) return;
  const today = new Date().toDateString();
  const last = userData.dailySpin?.lastSpin ? new Date(userData.dailySpin.lastSpin.seconds * 1000).toDateString() : null;
  if (today === last) return showModal('Already Spin', '<p>You have already used your daily spin. Come back tomorrow!</p>');
  const segments = [
    { value: 5, label: '₹5' },
    { value: 0, label: 'Try Again' },
    { value: 10, label: '₹10' },
    { value: 0, label: 'Try Again' },
    { value: 200, label: '₹200' },
    { value: 0, label: 'Try Again' },
    { value: 2, label: '₹2' },
    { value: 0, label: 'Try Again' }
  ];
  let svg = `<svg id="wheel" width="250" height="250" viewBox="0 0 100 100">`;
  const angle = 360 / segments.length;
  const colors = ['#f87171','#fbbf24','#34d399','#60a5fa','#c084fc','#f472b6','#a3e635','#fde047'];
  segments.forEach((seg,i) => {
    const [x,y] = [50 + 50 * Math.cos(Math.PI/180*(angle*i)), 50 + 50 * Math.sin(Math.PI/180*(angle*i))];
    svg += `<path d="M50 50 L${x} ${y} A50 50 0 0 1 ${50 + 50 * Math.cos(Math.PI/180*(angle*(i+1)))} ${50 + 50 * Math.sin(Math.PI/180*(angle*(i+1)))} Z" fill="${colors[i%colors.length]}"></path>`;
    const textAngle = angle*i + angle/2;
    const [tx,ty] = [50 + 35 * Math.cos(Math.PI/180*textAngle), 50 + 35 * Math.sin(Math.PI/180*textAngle)];
    svg += `<text x="${tx}" y="${ty}" transform="rotate(${textAngle+90} ${tx} ${ty})" fill="white" text-anchor="middle" font-size="6">${seg.label}</text>`;
  });
  svg += `</svg>`;
  const body = `<div id="spin-container"><div id="spin-marker"></div>${svg}</div>`;
  const actions = `<button class="modal-button-primary" id="spin-it-btn">Spin Now!</button>`;
  showModal('Daily Spin', body, actions);
  document.getElementById('spin-it-btn').addEventListener('click', async () => {
    document.getElementById('spin-it-btn').disabled = true;
    const p = Math.random();
    let resultIndex;
    if (p < 0.6) resultIndex = Math.random() < 0.5 ? 1 : 3;
    else if (p < 0.95) resultIndex = 0;
    else if (p < 0.99) resultIndex = 2;
    else resultIndex = 4;
    const reward = segments[resultIndex].value;
    const totalRotations = 5 * 360;
    const targetAngle = -((angle * resultIndex) + (angle / 2) - (angle * 0.25) + (Math.random() * angle * 0.5));
    const finalRotation = totalRotations + targetAngle;
    const wheel = document.getElementById('wheel');
    wheel.style.transition = 'transform 5s cubic-bezier(0.25,0.1,0.25,1)';
    wheel.style.transform = `rotate(${finalRotation}deg)`;
    setTimeout(async () => {
      try {
        await updateDoc(doc(db,'users', currentUser.uid), { balance: increment(reward), 'dailySpin.lastSpin': serverTimestamp() });
        showModal('Congratulations!', `<p>You won ${formatINR(reward)}!</p>`);
      } catch (e) { handleError(e); }
    }, 5500);
  }, { once: true });
});

// --------------------
// WhatsApp binding
// --------------------
document.getElementById('whatsapp-bind-btn').addEventListener('click', () => {
  if (!currentUser) return handleError('User not logged in');
  const body = `<p>Please enter your 10-digit WhatsApp number.</p><input type="tel" id="whatsapp-input" placeholder="e.g., 9876543210" maxlength="10" />`;
  const actions = `<button class="modal-button-secondary" onclick="closeModal()">Cancel</button><button class="modal-button-primary" id="submit-whatsapp">Submit</button>`;
  showModal('Bind WhatsApp Number', body, actions);
  document.getElementById('submit-whatsapp').addEventListener('click', async () => {
    const number = document.getElementById('whatsapp-input').value.trim();
    if (!/^\d{10}$/.test(number)) return alert('Please enter a valid 10-digit number.');
    try {
      await updateDoc(doc(db,'users',currentUser.uid), { whatsAppNumber: number });
      showModal('Success', '<p>Your WhatsApp number has been bound successfully!</p>');
    } catch (e) { handleError(e); }
  }, { once: true });
});

// --------------------
// Bank account bind / view
// --------------------
document.getElementById('bank-account-btn').addEventListener('click', async () => {
  if (!currentUser) return handleError('User not loaded');
  if (userData?.bankAccount) {
    const { holderName, accountNumber, ifscCode } = userData.bankAccount;
    const body = `<div class="account-details-view"><p><strong>Holder Name:</strong> ${escapeHtml(holderName)}</p><p><strong>Account Number:</strong> ****${String(accountNumber).slice(-4)}</p><p><strong>IFSC:</strong> ${escapeHtml(ifscCode)}</p></div>`;
    showModal('Bank Account Details', body);
    return;
  }
  const body = `<p>Please enter your bank details.</p>
    <input id="holder-name-input" placeholder="Account Holder Name" /><input id="account-number-input" placeholder="Bank Account Number" /><input id="ifsc-code-input" placeholder="IFSC Code" />`;
  const actions = `<button class="modal-button-secondary" onclick="closeModal()">Cancel</button><button class="modal-button-primary" id="submit-bank-details">Submit</button>`;
  showModal('Bind Bank Account', body, actions);
  document.getElementById('submit-bank-details').addEventListener('click', async () => {
    const holderName = document.getElementById('holder-name-input').value.trim();
    const accountNumber = document.getElementById('account-number-input').value.trim();
    const ifsc = document.getElementById('ifsc-code-input').value.trim().toUpperCase();
    if (!holderName || !accountNumber || !ifsc) return alert('Please fill all fields.');
    try {
      await updateDoc(doc(db,'users',currentUser.uid), { bankAccount: { holderName, accountNumber, ifscCode: ifsc } });
      showModal('Success', '<p>Your bank account has been linked successfully!</p>');
    } catch (e) { handleError(e); }
  }, { once: true });
});

// --------------------
// Withdraw request (transaction-safe)
// --------------------
document.getElementById('withdraw-btn').addEventListener('click', () => {
  if (!currentUser || !userData) return handleError('User not ready');
  if (!userData.bankAccount) return showModal('No Bank Account', '<p>Please add your bank account before making a withdrawal.</p>');
  const MIN = 50;
  if ((userData.balance || 0) < MIN) return showModal('Insufficient Balance', `<p>You need at least ${formatINR(MIN)} to withdraw.</p>`);
  const body = `<p>Balance: <strong>${formatINR(userData.balance||0)}</strong></p><input id="withdraw-amount-input" type="number" placeholder="Enter amount (min ${MIN})" />`;
  const actions = `<button class="modal-button-secondary" onclick="closeModal()">Cancel</button><button class="modal-button-primary" id="submit-withdrawal">Request</button>`;
  showModal('Request Withdrawal', body, actions);
  document.getElementById('submit-withdrawal').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('withdraw-amount-input').value);
    if (isNaN(amount) || amount < MIN || amount > (userData.balance || 0)) return alert('Please enter a valid amount.');
    try {
      await runTransaction(db, async (tx) => {
        const uref = doc(db,'users', currentUser.uid);
        const udoc = await tx.get(uref);
        if (!udoc.exists()) throw 'User not found';
        const newBalance = (udoc.data().balance || 0) - amount;
        if (newBalance < 0) throw 'Insufficient funds';
        tx.update(uref, { balance: newBalance });
        const wref = doc(collection(db,'withdrawals'));
        tx.set(wref, {
          userId: currentUser.uid,
          customId: userData.customId || null,
          amount,
          status: 'pending',
          bankDetails: userData.bankAccount || null,
          requestedAt: serverTimestamp()
        });
      });
      showModal('Success', `<p>Your withdrawal request for ${formatINR(amount)} has been submitted.</p>`);
    } catch (e) { handleError(e); }
  }, { once: true });
});

// Shortcut: History button on home page
const historyBtn = document.querySelector('#withdrawal-history-btn');
if (historyBtn) {
  historyBtn.addEventListener('click', async () => {
    if (!currentUser) return handleError('User not loaded');
    try {
      const q = query(collection(db,'withdrawals'), where('userId','==', currentUser.uid), orderBy('requestedAt','desc'));
      const snap = await getDocs(q);
      let body = '<div class="history-list">';
      if (snap.empty) body += '<p class="text-center">You have no withdrawal history.</p>';
      else {
        snap.forEach(d => {
          const data = d.data();
          const date = data.requestedAt ? new Date(data.requestedAt.seconds * 1000).toLocaleString('en-IN') : 'N/A';
          body += `<div class="history-item"><div class="history-info"><strong>${formatINR(data.amount||0)}</strong><span class="history-date">${date}</span></div><span class="history-status status-${data.status}">${escapeHtml(data.status)}</span></div>`;
        });
      }
      body += '</div>';
      showModal('Withdrawal History', body);
    } catch (e) { handleError(e); }
  });
}

// --------------------
// Assign SMS tasks (round-based + progress + commission)
// --------------------
document.getElementById('assign-sms-btn').addEventListener('click', async () => {
  if (!currentUser || !userData) return handleError('User not ready');
  let currentSmsCount = userData.smsTask?.count || 0;
  if (currentSmsCount >= 100) return showModal('Limit Reached', '<p>You have completed the maximum number of SMS tasks for today.</p>');
  const BATCH_SIZE = 10; // per round
  try {
    // fetch up to BATCH_SIZE unassigned tasks
    const q = query(collection(db,'smsInventory'), where('assigned','==', false), limit(BATCH_SIZE));
    const snap = await getDocs(q);
    if (snap.empty) return showModal('No Tasks', '<p>Sorry, there are no SMS tasks available right now.</p>');
    const docs = snap.docs;
    const total = docs.length;
    // UI progress elements
    const progressWrap = document.getElementById('sms-progress-wrapper');
    const progressBar = document.getElementById('sms-progress-bar');
    const progressText = document.getElementById('sms-progress-text');
    if (progressWrap) progressWrap.classList.remove('hidden');
    let completed = 0;
    // process tasks one by one to allow user interaction
    for (let i = 0; i < docs.length; i++) {
      const sdoc = docs[i];
      const sdata = sdoc.data();
      // mark assigned to prevent parallel pick
      await updateDoc(doc(db,'smsInventory', sdoc.id), { assigned: true });
      // open modal with sms link
      const smsLink = `sms:${sdata.number}?body=${encodeURIComponent(sdata.message)}`;
      const body = `<p class="text-lg font-bold">Task ${i+1} of ${total}</p><p>${escapeHtml(sdata.message)}</p><br><a href="${smsLink}" class="modal-button-primary" target="_blank">Open SMS App</a>`;
      const actions = `<button class="modal-button-secondary" onclick="closeModal()">Cancel</button><button class="modal-button-primary" id="claim-and-next">I Sent It</button>`;
      showModal('SMS Task', body, actions);
      // wait for user to click "I Sent It"
      await new Promise((resolve) => {
        const btn = document.getElementById('claim-and-next');
        if (!btn) return resolve();
        btn.onclick = async () => {
          try {
            // reward user and handle referral commission in a batch
            const batch = writeBatch(db);
            const userRef = doc(db,'users', currentUser.uid);
            const taskReward = 0.20; // your earlier code had 0.17 or 0.20; using 0.20 per recent index.html
            batch.update(userRef, { balance: increment(taskReward), 'smsTask.count': increment(1) });
            // referral commission
            if (userData.referrerId) {
              const commissionRate = 0.10;
              const commissionAmount = Number((taskReward * commissionRate).toFixed(2));
              const referrerRef = doc(db,'users', userData.referrerId);
              batch.update(referrerRef, { balance: increment(commissionAmount) });
              // update referrals record totalCommissionEarned (if exists)
              const rQuery = query(collection(db,'referrals'), where('refereeId','==', currentUser.uid), where('referrerId','==', userData.referrerId));
              const rSnapPromise = getDocs(rQuery);
              // cannot await here inside batch, but we'll update after:
              const invRef = doc(db,'smsInventory', sdoc.id);
              batch.delete(invRef);
              await batch.commit();
              // update referral doc separately (if exists)
              const rSnap = await rSnapPromise;
              if (!rSnap.empty) {
                const rDocRef = rSnap.docs[0].ref;
                await updateDoc(rDocRef, { totalCommissionEarned: increment(commissionAmount) });
              }
            } else {
              // no referrer: simply delete inventory
              const invRef = doc(db,'smsInventory', sdoc.id);
              const batch2 = writeBatch(db);
              batch2.delete(invRef);
              await batch2.commit();
            }
            completed++;
            if (progressBar) progressBar.style.width = `${Math.round((completed/total)*100)}%`;
            if (progressText) progressText.textContent = `${completed} / ${total}`;
            closeModal();
            resolve();
          } catch (e) {
            console.error('Claim error', e);
            handleError(e);
            resolve();
          }
        };
      });
      // ensure UI updates reflect new userData via onSnapshot listener
    }
    showModal('Batch Complete', `<p>You completed ${completed} messages and earned ${formatINR(completed * 0.20)}.</p>`);
    setTimeout(() => {
      if (progressWrap) progressWrap.classList.add('hidden');
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = `0 / 0`;
    }, 1500);
  } catch (e) { handleError(e); }
});

// --------------------
// Logout
// --------------------
document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth).then(() => {
    showModal('Logged Out', '<p>You have been signed out.</p>');
  }).catch(handleError);
});

// --------------------
// Auth state handling
// --------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      await setupUserIfMissing(user);
      attachUserListener(user.uid);
      fetchLatestAnnouncement();
    } catch (e) { handleError(e); }
  } else {
    // in production you might redirect to login:
    // window.location.href = 'login.html';
    currentUser = null;
    userData = null;
    detachUserListener();
    // keep UI usable for development (or show login prompt)
    console.log('No user logged in (auth).');
  }
});

// --------------------
// Swiper init & misc DOM on load
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  try {
    new Swiper('.mySwiper', {
      loop: true,
      autoplay: { delay: 3500, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      effect: 'creative',
      creativeEffect: {
        prev: { shadow: true, translate: [0,0,-400] },
        next: { translate: ['100%',0,0] }
      }
    });
  } catch (e) { console.warn('Swiper init failed', e); }
  // copy referral
  const copyBtn = document.getElementById('copy-referral-btn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    if (userData && userData.referralCode) {
      navigator.clipboard.writeText(userData.referralCode).then(() => showModal('Copied!', '<p>Referral code copied to clipboard.</p>')).catch(e => handleError(e));
    } else showModal('No Code', '<p>Your referral code is not ready yet.</p>');
  });
});

// --------------------
// Safety: detect missing DOM parts gracefully
// --------------------
window.addEventListener('error', (ev) => {
  console.error('Window error:', ev);
});

// --------------------
// End of file
// --------------------