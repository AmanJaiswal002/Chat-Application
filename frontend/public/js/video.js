// WebRTC Video Calling Module
// Brokered via the global Socket.io instance

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentPeerSocketId = null;

// STUN servers configuration for peer discovery
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
const startCallBtn = document.getElementById('start-video-btn');
const callModal = document.getElementById('video-call-modal');
const incomingCallCard = document.getElementById('incoming-call-card');
const callerNameSpan = document.getElementById('caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const hangupBtn = document.getElementById('hangup-btn');

// State tracking
let isMicMuted = false;
let isVideoDisabled = false;

// 1. Initializing Media Stream
async function getMediaStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: true
    });
    localStream = stream;
    localVideo.srcObject = stream;
    return stream;
  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert("Could not access camera or microphone. Please check permissions!");
    throw err;
  }
}

// 2. Initializing RTCPeerConnection
function createPeerConnection(targetSocketId) {
  peerConnection = new RTCPeerConnection(rtcConfig);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  // Add local stream tracks to PeerConnection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Handle remote stream tracks addition
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  // Handle ICE Candidates discovery
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        candidate: event.candidate,
        targetSocketId: targetSocketId
      });
    }
  };

  // Monitor connection state
  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      endCall();
    }
  };
}

// 3. Initiate Video Call (Caller side)
async function startCall() {
  try {
    startCallBtn.disabled = true;
    startCallBtn.innerHTML = "Calling...";
    
    await getMediaStream();
    
    // Display local call UI modal immediately
    callModal.style.display = 'flex';

    // Create peer connection (target is null initially because signaling will broadcast)
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Add tracks
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentPeerSocketId) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
          targetSocketId: currentPeerSocketId
        });
      }
    };

    // Monitor track additions
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    };

    // Create SDP Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Broadcast call offer to the global chat room
    socket.emit("video-call-offer", {
      offer: offer,
      callerUsername: currentUser.username
    });
    
  } catch (err) {
    console.error("Failed to start video call:", err);
    resetCallUI();
  }
}

// 4. Handle incoming call offer (Answerer side)
socket.on("video-call-offer", async (data) => {
  // If already in a call, ignore incoming calls (lines busy)
  if (localStream || peerConnection) {
    return;
  }

  currentPeerSocketId = data.callerSocketId;
  callerNameSpan.textContent = `@${data.callerUsername}`;
  incomingCallCard.style.display = 'flex';

  // Store the accepted signaling data
  acceptCallBtn.onclick = async () => {
    incomingCallCard.style.display = 'none';
    callModal.style.display = 'flex';

    try {
      await getMediaStream();
      createPeerConnection(currentPeerSocketId);

      // Set Remote Description (offer)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

      // Create SDP Answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Send Answer back to Caller
      socket.emit("video-call-answer", {
        answer: answer,
        callerSocketId: currentPeerSocketId,
        answererUsername: currentUser.username
      });

    } catch (err) {
      console.error("Error accepting video call:", err);
      endCall();
    }
  };

  declineCallBtn.onclick = () => {
    incomingCallCard.style.display = 'none';
    socket.emit("end-call", { targetSocketId: currentPeerSocketId });
    currentPeerSocketId = null;
  };
});

// 5. Handle answer received (Caller side)
socket.on("video-call-answer", async (data) => {
  currentPeerSocketId = data.answererSocketId;
  try {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  } catch (err) {
    console.error("Error setting remote description on caller side:", err);
  }
});

// 6. Handle received ICE candidate (Both sides)
socket.on("ice-candidate", async (data) => {
  try {
    if (peerConnection && data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error("Error adding received ICE candidate:", err);
  }
});

// 7. Handle call hang up/termination (Both sides)
socket.on("end-call", () => {
  endCall(false); // End call without sending signaling event again
});

function endCall(sendSignal = true) {
  if (sendSignal && currentPeerSocketId) {
    socket.emit("end-call", { targetSocketId: currentPeerSocketId });
  }

  // Stop all camera and microphone tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }

  // Close peer connection
  if (peerConnection) {
    peerConnection.close();
  }

  localStream = null;
  remoteStream = null;
  peerConnection = null;
  currentPeerSocketId = null;

  resetCallUI();
}

function resetCallUI() {
  callModal.style.display = 'none';
  incomingCallCard.style.display = 'none';
  startCallBtn.disabled = false;
  startCallBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
    Call
  `;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Reset mute button styles
  isMicMuted = false;
  toggleMicBtn.className = "control-btn active";
  toggleMicBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;

  // Reset video button styles
  isVideoDisabled = false;
  toggleVideoBtn.className = "control-btn active";
  toggleVideoBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
}

// Media toggles
toggleMicBtn.addEventListener('click', () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMicMuted = !isMicMuted;
      audioTrack.enabled = !isMicMuted;
      
      toggleMicBtn.className = `control-btn ${isMicMuted ? 'hangup' : 'active'}`;
      toggleMicBtn.innerHTML = isMicMuted ? `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
      ` : `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
      `;
    }
  }
});

toggleVideoBtn.addEventListener('click', () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      isVideoDisabled = !isVideoDisabled;
      videoTrack.enabled = !isVideoDisabled;

      toggleVideoBtn.className = `control-btn ${isVideoDisabled ? 'hangup' : 'active'}`;
      toggleVideoBtn.innerHTML = isVideoDisabled ? `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"></path><path d="M21 12l-7-5v10l7-5z"></path></svg>
      ` : `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
      `;
    }
  }
});

// Click handlers
startCallBtn.addEventListener('click', startCall);
hangupBtn.addEventListener('click', () => endCall(true));
