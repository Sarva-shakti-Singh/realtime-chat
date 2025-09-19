// client.js
const socket = io();

// DOM
const loginBox = document.getElementById('loginBox');
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('username');
const loginMsg = document.getElementById('loginMsg');

const chatBox = document.getElementById('chatBox');
const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const searchEl = document.getElementById('search');
const recipientSel = document.getElementById('recipient');
const usersList = document.getElementById('usersList');
const onlineCount = document.getElementById('onlineCount');

let currentUser = null;
let messageHistory = [];

// Join
joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) { loginMsg.innerText = 'Enter username'; return; }
  currentUser = name;
  // Ask server for history in ack callback
  socket.emit('join', name, (history) => {
    // history is array of messages
    messageHistory = history || [];
    renderHistory();
  });
  loginBox.style.display = 'none';
  chatBox.style.display = 'block';
});

// Send message
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  const to = recipientSel.value || 'all';
  const msg = { from: currentUser, to, text };
  socket.emit('chat message', { from: msg.from, to: msg.to, text: msg.text });
  msgInput.value = '';
}

// Receive message
socket.on('chat message', (msg) => {
  appendMessage(msg);
});

// User list updates
socket.on('user list', (list) => {
  // populate select and users panel
  recipientSel.innerHTML = '<option value="all">🌍 Everyone</option>';
  usersList.innerHTML = '';
  list.forEach(u => {
    if (u !== currentUser) {
      const opt = document.createElement('option'); opt.value = u; opt.textContent = u;
      recipientSel.appendChild(opt);
    }
    const div = document.createElement('div'); div.textContent = u;
    usersList.appendChild(div);
  });
  onlineCount.innerText = 'Online: ' + list.length;
});

// Typing indicator (optional)
// socket.on('typing', payload => { /* show typing UI */ });

// Search filter
searchEl.addEventListener('input', () => {
  const term = searchEl.value.trim().toLowerCase();
  const items = messagesEl.querySelectorAll('li');
  items.forEach(li => {
    li.style.display = li.textContent.toLowerCase().includes(term) ? 'block' : 'none';
  });
});

// render initial history
function renderHistory() {
  messagesEl.innerHTML = '';
  (messageHistory || []).forEach(m => appendMessage(m));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage(m) {
  // normalize keys: server uses {from, to, text, time}
  const li = document.createElement('li');
  if (m.from === 'System') {
    li.className = 'system';
    li.textContent = m.text + ' (' + (new Date(m.time).toLocaleTimeString()) + ')';
  } else if (m.from === currentUser) {
    li.className = 'me';
    li.textContent = `Me → ${m.to === 'all' ? 'Everyone' : m.to}: ${m.text} (${new Date(m.time).toLocaleTimeString()})`;
  } else {
    // if private but not to me and not from me, ignore (shouldn't happen)
    const toLabel = m.to === 'all' ? 'Everyone' : (m.to === currentUser ? 'Me' : m.to);
    li.className = 'other';
    li.textContent = `${m.from} → ${toLabel}: ${m.text} (${new Date(m.time).toLocaleTimeString()})`;
  }
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
