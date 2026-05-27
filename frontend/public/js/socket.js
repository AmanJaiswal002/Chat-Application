const socket = io();

const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// Scroll to bottom on load
chatWindow.scrollTop = chatWindow.scrollHeight;

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('chat message', {
            text: text,
            senderId: currentUser.id
        });
        chatInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

socket.on('chat message', (msg) => {
    const messageDiv = document.createElement('div');
    const isSent = msg.sender && msg.sender._id.toString() === currentUser.id.toString();
    
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.id = `msg-${msg._id}`;
    
    // Formatting time
    const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.innerHTML = `
        <div class="sender">@${msg.sender ? msg.sender.username : 'Deleted User'}</div>
        <div class="text">${msg.text}</div>
        <div class="msg-footer">
            <div class="time">${time}</div>
            ${isSent ? `
                <form action="/messages/${msg._id}?_method=DELETE" method="POST" class="delete-form">
                    <button type="submit" class="delete-msg-btn">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </form>
            ` : ''}
        </div>
    `;
    
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});

// Listen for message deletion in real-time
socket.on('message deleted', (msgId) => {
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (msgEl) {
        // Smooth fade and shrink animation
        msgEl.style.transition = "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
        msgEl.style.opacity = "0";
        msgEl.style.transform = "scale(0.8) translateY(-10px)";
        msgEl.style.maxHeight = "0";
        msgEl.style.padding = "0";
        msgEl.style.margin = "0";
        setTimeout(() => {
            msgEl.remove();
        }, 350);
    }
});

// Listen for chat clear-all in real-time
socket.on('all messages cleared', () => {
    // Instantly empty the chat window container
    chatWindow.innerHTML = "";
});
