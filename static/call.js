"use strict";

const baseURL = "/";

let localVideo = document.querySelector("#localVideo");
let remoteVideo = document.querySelector("#remoteVideo");

let otherUser;
let remoteRTCMessage;

let iceCandidatesFromCaller = [];
let peerConnection;
let remoteStream;
let localStream;

let callInProgress = false;

//event from html
function call() {
  let userToCall = document.getElementById("callName").value;
  otherUser = userToCall;

  beReady().then((bool) => {
    processCall(userToCall);
  });
}

//event from html
function answer() {
  //do the event firing

  beReady().then((bool) => {
    processAccept();
  });

  document.getElementById("answer").style.display = "none";
}

let pcConfig = {
  iceServers: [
    { url: "stun:stun.jap.bloggernepal.com:5349" },
    {
      url: "turn:turn.jap.bloggernepal.com:5349",
      username: "guest",
      credential: "somepassword",
    },
    { url: "stun:stun.l.google.com:19302" },
  ],
};

// Set up audio and video regardless of what devices are present.
let sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};

let socket;
let callSocket;
const connectSocket = () => {
  callSocket = new WebSocket("ws://" + window.location.host + "/ws/videocall/");

  callSocket.onopen = (event) => {
    callSocket.send(
      JSON.stringify({
        type: "login",
        data: {
          name: myName,
        },
      })
    );
  };

  callSocket.onmessage = (e) => {
    let response = JSON.parse(e.data);
    let type = response.type;

    if (type == "connection") {
      console.log(response.data.message);
    }

    if (type == "call_received") {
      onNewCall(response.data);
    }

    if (type == "call_answered") {
      onCallAnswered(response.data);
    }

    if (type == "ICEcandidate") {
      onICECandidate(response.data);
    }
  };

  const onNewCall = (data) => {
    otherUser = data.caller;
    remoteRTCMessage = data.rtcMessage;

    document.getElementById("callerName").innerHTML = otherUser;
    document.getElementById("call").style.display = "none";
    document.getElementById("answer").style.display = "block";
  };

  const onCallAnswered = (data) => {
    remoteRTCMessage = data.rtcMessage;
    peerConnection.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage)
    );
    document.getElementById("calling").style.display = "none";
    console.log("Call Started. They Answered");
    callProgress();
  };

  const onICECandidate = (data) => {
    console.log("GOT ICE candidate");
    let message = data.rtcMessage;
    let candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate,
    });

    if (peerConnection) {
      console.log("ICE candidate added");
      peerConnection.addIceCandidate(candidate);
    } else {
      console.log("ICE candidate pushed");
      iceCandidatesFromCaller.push(candidate);
    }
  };
};

const sendCall = (data) => {
  console.log("Send call");
  callSocket.send(
    JSON.stringify({
      type: "call",
      data,
    })
  );
  document.getElementById("call").style.display = "none";
  // document.getElementById("profileImageCA").src = baseURL + otherUserProfile.image;
  document.getElementById("otherUserNameCA").innerHTML = otherUser;
  document.getElementById("calling").style.display = "block";
};

const answerCall = (data) => {
  callSocket.send(
    JSON.stringify({
      type: "answer_call",
      data,
    })
  );
  callProgress();
};

const sendICEcandidate = (data) => {
  console.log("Send ICE candidate");
  callSocket.send(
    JSON.stringify({
      type: "ICEcandidate",
      data,
    })
  );
};

const beReady = () => {
  return navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: true,
    })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;

      return createConnectionAndAddStream();
    })
    .catch((e) => {
      alert("getUserMedia() error: " + e.name);
    });
};

const createConnectionAndAddStream = () => {
  createPeerConnection();
  peerConnection.addStream(localStream);
  return true;
};

const processCall = (userName) => {
  peerConnection.createOffer(
    (sessionDescription) => {
      peerConnection.setLocalDescription(sessionDescription);
      sendCall({
        name: userName,
        rtcMessage: sessionDescription,
      });
    },
    (error) => {
      console.log("Error");
    }
  );
};

const processAccept = () => {
  peerConnection.setRemoteDescription(
    new RTCSessionDescription(remoteRTCMessage)
  );
  peerConnection.createAnswer(
    (sessionDescription) => {
      peerConnection.setLocalDescription(sessionDescription);

      if (iceCandidatesFromCaller.length > 0) {
        for (let i = 0; i < iceCandidatesFromCaller.length; i++) {
          //
          let candidate = iceCandidatesFromCaller[i];
          console.log("ICE candidate Added From queue");
          try {
            peerConnection
              .addIceCandidate(candidate)
              .then((done) => {
                console.log(done);
              })
              .catch((error) => {
                console.log(error);
              });
          } catch (error) {
            console.log(error);
          }
        }
        iceCandidatesFromCaller = [];
        console.log("ICE candidate queue cleared");
      } else {
        console.log("NO Ice candidate in queue");
      }
      answerCall({
        caller: otherUser,
        rtcMessage: sessionDescription,
      });
    },
    (error) => {
      console.log("Error");
    }
  );
};

const createPeerConnection = () => {
  try {
    peerConnection = new RTCPeerConnection(pcConfig);
    peerConnection.onicecandidate = handleIceCandidate;
    peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.onremovestream = handleRemoteStreamRemoved;
    console.log("Created RTCPeerConnnection");
    return;
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    return;
  }
};

const handleIceCandidate = (event) => {
  if (event.candidate) {
    sendICEcandidate({
      user: otherUser,
      rtcMessage: {
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
      },
    });
  } else {
    console.log("End of candidates.");
  }
};

function handleRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log("Remote stream removed. Event: ", event);
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
}

window.onbeforeunload = function () {
  if (callInProgress) {
    stop();
  }
};

const stop = () => {
  localStream.getTracks().forEach((track) => track.stop());
  callInProgress = false;
  peerConnection.close();
  peerConnection = null;
  document.getElementById("call").style.display = "block";
  document.getElementById("answer").style.display = "none";
  document.getElementById("inCall").style.display = "none";
  document.getElementById("calling").style.display = "none";
  document.getElementById("endVideoButton").style.display = "none";
  otherUser = null;
};

const callProgress = () => {
  document.getElementById("videos").style.display = "block";
  document.getElementById("otherUserNameC").innerHTML = otherUser;
  document.getElementById("inCall").style.display = "block";

  callInProgress = true;
};
