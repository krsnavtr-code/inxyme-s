import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../model/User.js";

// Production-grade configuration constants
const HEARTBEAT_INTERVAL = 20000; // 20 seconds - optimized for mobile
const CONNECTION_TIMEOUT = 45000; // 45 seconds - allows for cellular network delays
const PING_TIMEOUT = 25000; // 25 seconds
const PING_INTERVAL = 10000; // 10 seconds

export const initializeSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "https://www.inxyme.com",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket"], // Force WebSocket only - no polling overhead
    pingTimeout: PING_TIMEOUT,
    pingInterval: PING_INTERVAL,
    reconnection: true,
    reconnectionDelay: 500, // Fast reconnection for mobile
    reconnectionAttempts: 10, // More attempts for unstable networks
    maxHttpBufferSize: 1e6, // 1MB for WebRTC signaling data
  });

  // Track screen share state per session
  const screenShareState = new Map(); // sessionId -> { userId, fullname }

  // Authentication middleware with user data attachment
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token || socket.handshake.headers.authorization;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const tokenString = token.startsWith("Bearer ") ? token.slice(7) : token;
      const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
      const user = await User.findById(
        decoded.id || decoded._id || decoded.userId,
      );

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      // Attach user data directly to socket for atomic access
      socket.user = user;
      socket.userId = user._id.toString();
      socket.role = user.role || "student";
      socket.joinedAt = Date.now();

      console.log(
        `[AUTH] User ${socket.userId} authenticated as ${socket.role}`,
      );
      next();
    } catch (error) {
      console.error(
        "[AUTH ERROR] Socket authentication failed:",
        error.message,
      );
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(
      `[CONNECT] User ${socket.userId} (${socket.role}) connected with socket ${socket.id}`,
    );

    // --- NEW: Screen Share Approval Matrix ---
    socket.on("request-screen-share", ({ sessionId, userId, fullname }) => {
      console.log(`[APPROVAL] Student ${fullname} requested screen share.`);
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      // Find the Teacher and send request to them
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && (s.currentRole === "teacher" || s.role === "teacher")) {
          s.emit("screen-share-requested", { studentId: userId, fullname });
        }
      });
    });

    socket.on("approve-screen-share", ({ sessionId, studentId }) => {
      console.log(`[APPROVED] Teacher approved screen share for ${studentId}`);
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      // Find specific student and send approval signal
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === studentId) {
          s.emit("screen-share-approved");
        }
      });
    });
    // ------------------------------------------

    // Handle screen share started notification
    socket.on("screen-share-started", ({ sessionId }) => {
      console.log(
        `[SCREEN SHARE] User ${socket.userId} started screen sharing in session ${sessionId}`,
      );
      // Track screen share state
      screenShareState.set(sessionId, {
        userId: socket.userId,
        fullname: socket.user.fullname,
        role: socket.currentRole || socket.role,
      });
    });

    // Handle screen share offer request from new joiners
    socket.on("request-screen-share-offer", ({ sessionId, toUserId }) => {
      console.log(
        `[SCREEN SHARE] ${socket.userId} requesting screen share offer from ${toUserId}`,
      );
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      // Find the screen sharer and notify them to send offer to the requester
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === toUserId) {
          s.emit("screen-share-offer-request", {
            requesterId: socket.userId,
            requesterFullname: socket.user.fullname,
          });
        }
      });
    });

    // Handle reconnection: Disconnect old socket if same user reconnects
    io.sockets.sockets.forEach((existingSocket) => {
      if (
        existingSocket.userId === socket.userId &&
        existingSocket.id !== socket.id
      ) {
        console.log(
          `[RECONNECT] Disconnecting stale socket ${existingSocket.id} for user ${socket.userId}`,
        );
        existingSocket.disconnect(true);
      }
    });

    // Heartbeat monitoring
    let lastHeartbeat = Date.now();
    const heartbeatTimer = setInterval(() => {
      if (Date.now() - lastHeartbeat > CONNECTION_TIMEOUT) {
        console.log(
          `[TIMEOUT] User ${socket.userId} heartbeat timeout, disconnecting`,
        );
        socket.disconnect(true);
      }
    }, HEARTBEAT_INTERVAL);

    socket.on("heartbeat", () => {
      lastHeartbeat = Date.now();
    });

    // ATOMIC ROOM REGISTRATION: Use Socket.IO's built-in room management
    socket.on("join-classroom", ({ sessionId, role }) => {
      console.log(
        `[JOIN] User ${socket.userId} joining session ${sessionId} as ${role}`,
      );

      // Join the room - Socket.IO handles this atomically
      socket.join(sessionId);

      // Store role on socket for atomic access
      socket.currentSession = sessionId;
      socket.currentRole = role || socket.role;

      // Get all sockets in the room (atomic read from Socket.IO adapter)
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      const participants = [];

      if (roomSockets) {
        roomSockets.forEach((socketId) => {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket && targetSocket.userId) {
            participants.push({
              userId: targetSocket.userId,
              role: targetSocket.currentRole || targetSocket.role,
              fullname: targetSocket.user?.fullname || "Unknown",
              joinedAt: targetSocket.joinedAt,
            });
          }
        });
      }

      // Broadcast user-joined to all in room EXCEPT sender
      socket.to(sessionId).emit("user-joined", {
        userId: socket.userId,
        role: socket.currentRole,
        fullname: socket.user.fullname,
        timestamp: Date.now(),
      });

      // If there's an active screen share, notify the sharer to connect to new joiner
      const activeScreenShare = screenShareState.get(sessionId);
      if (activeScreenShare && activeScreenShare.userId !== socket.userId) {
        console.log(
          `[SCREEN SHARE] Notifying screen sharer ${activeScreenShare.userId} about new joiner ${socket.userId}`,
        );
        roomSockets.forEach((socketId) => {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.userId === activeScreenShare.userId) {
            s.emit("new-joiner-for-screen-share", {
              newJoinerId: socket.userId,
              newJoinerFullname: socket.user.fullname,
              newJoinerRole: socket.currentRole,
            });
          }
        });
      }

      // Send participants list to the joining user
      socket.emit("participants-list", {
        participants,
        timestamp: Date.now(),
      });

      // Broadcast updated participants list to all in room
      io.to(sessionId).emit("participants-list", {
        participants,
        timestamp: Date.now(),
      });

      // Notify new joiner about existing screen share
      const existingScreenShare = screenShareState.get(sessionId);
      if (existingScreenShare) {
        console.log(
          `[SCREEN SHARE] Notifying ${socket.userId} about existing screen share by ${existingScreenShare.userId}`,
        );
        socket.emit("screen-share-active", {
          userId: existingScreenShare.userId,
          fullname: existingScreenShare.fullname,
          role: existingScreenShare.role,
        });
      }

      console.log(
        `[JOIN] Session ${sessionId} now has ${participants.length} participants`,
      );
    });

    socket.on("leave-classroom", ({ sessionId }) => {
      console.log(`[LEAVE] User ${socket.userId} leaving session ${sessionId}`);

      socket.leave(sessionId);
      socket.currentSession = null;

      // Notify others in the room
      socket.to(sessionId).emit("user-left", {
        userId: socket.userId,
        fullname: socket.user.fullname,
        timestamp: Date.now(),
      });

      // Broadcast updated participants list to remaining users
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (roomSockets) {
        const participants = [];
        roomSockets.forEach((socketId) => {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket && targetSocket.userId) {
            participants.push({
              userId: targetSocket.userId,
              role: targetSocket.currentRole || targetSocket.role,
              fullname: targetSocket.user?.fullname || "Unknown",
              joinedAt: targetSocket.joinedAt,
            });
          }
        });
        io.to(sessionId).emit("participants-list", {
          participants,
          timestamp: Date.now(),
        });
      }
    });

    // ASYMMETRIC WEBRTC SIGNALING: Teacher initiates, Student receives
    socket.on("webrtc-offer", ({ sessionId, offer, toUserId }) => {
      // Find target socket by iterating through room members
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) {
        console.log(`[WEBRTC] Room ${sessionId} not found`);
        return;
      }

      let targetSocket = null;
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === toUserId) {
          targetSocket = s;
        }
      });

      if (!targetSocket) {
        console.log(
          `[WEBRTC] Target user ${toUserId} not found in room ${sessionId}`,
        );
        return;
      }

      console.log(`[WEBRTC OFFER] From ${socket.userId} to ${toUserId}`);
      targetSocket.emit("webrtc-offer", {
        offer,
        fromUserId: socket.userId,
        fromUserRole: socket.currentRole || socket.role,
        fromFullname: socket.user.fullname,
        timestamp: Date.now(),
      });
    });

    socket.on("webrtc-answer", ({ sessionId, answer, toUserId }) => {
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      let targetSocket = null;
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === toUserId) {
          targetSocket = s;
        }
      });

      if (!targetSocket) {
        console.log(`[WEBRTC] Target user ${toUserId} not found`);
        return;
      }

      console.log(`[WEBRTC ANSWER] From ${socket.userId} to ${toUserId}`);
      targetSocket.emit("webrtc-answer", {
        answer,
        fromUserId: socket.userId,
        timestamp: Date.now(),
      });
    });

    socket.on("webrtc-ice-candidate", ({ sessionId, candidate, toUserId }) => {
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      let targetSocket = null;
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === toUserId) {
          targetSocket = s;
        }
      });

      if (targetSocket) {
        targetSocket.emit("webrtc-ice-candidate", {
          candidate,
          fromUserId: socket.userId,
          timestamp: Date.now(),
        });
      }
    });

    // Screen Share Routing
    socket.on("screen-share-offer", ({ sessionId, offer, toUserId }) => {
      // Track screen share state
      screenShareState.set(sessionId, {
        userId: socket.userId,
        fullname: socket.user.fullname,
        role: socket.currentRole || socket.role,
      });

      if (toUserId) {
        const roomSockets = io.sockets.adapter.rooms.get(sessionId);
        if (!roomSockets) return;

        let targetSocket = null;
        roomSockets.forEach((socketId) => {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.userId === toUserId) {
            targetSocket = s;
          }
        });

        if (targetSocket) {
          console.log(
            `[SCREEN SHARE] Offer from ${socket.userId} to ${toUserId}`,
          );
          targetSocket.emit("screen-share-offer", {
            offer,
            fromUserId: socket.userId,
            fromFullname: socket.user.fullname,
            timestamp: Date.now(),
          });
        }
      } else {
        socket.to(sessionId).emit("screen-share-offer", {
          offer,
          fromUserId: socket.userId,
          fromUserRole: socket.currentRole || socket.role,
          fromFullname: socket.user.fullname,
          timestamp: Date.now(),
        });
      }
    });

    socket.on("screen-share-answer", ({ sessionId, answer, toUserId }) => {
      const roomSockets = io.sockets.adapter.rooms.get(sessionId);
      if (!roomSockets) return;

      let targetSocket = null;
      roomSockets.forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.userId === toUserId) {
          targetSocket = s;
        }
      });

      if (targetSocket) {
        targetSocket.emit("screen-share-answer", {
          answer,
          fromUserId: socket.userId,
          timestamp: Date.now(),
        });
      }
    });

    socket.on(
      "screen-share-ice-candidate",
      ({ sessionId, candidate, toUserId }) => {
        const roomSockets = io.sockets.adapter.rooms.get(sessionId);
        if (!roomSockets) return;

        let targetSocket = null;
        roomSockets.forEach((socketId) => {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.userId === toUserId) {
            targetSocket = s;
          }
        });

        if (targetSocket) {
          targetSocket.emit("screen-share-ice-candidate", {
            candidate,
            fromUserId: socket.userId,
            timestamp: Date.now(),
          });
        }
      },
    );

    socket.on("stop-screen-share", ({ sessionId }) => {
      console.log(`[SCREEN SHARE] Stop from ${socket.userId}`);
      // Clear screen share state
      screenShareState.delete(sessionId);
      socket.to(sessionId).emit("stop-screen-share", {
        fromUserId: socket.userId,
        fromFullname: socket.user.fullname,
        timestamp: Date.now(),
      });
    });

    // Media Controls
    socket.on("toggle-audio", ({ sessionId, isMuted }) => {
      socket.to(sessionId).emit("user-audio-toggled", {
        userId: socket.userId,
        isMuted,
        fullname: socket.user.fullname,
      });
    });

    socket.on("toggle-video", ({ sessionId, isVideoOff }) => {
      socket.to(sessionId).emit("user-video-toggled", {
        userId: socket.userId,
        isVideoOff,
        fullname: socket.user.fullname,
      });
    });

    socket.on("raise-hand", ({ sessionId }) => {
      socket.to(sessionId).emit("hand-raised", {
        userId: socket.userId,
        fullname: socket.user.fullname,
      });
    });

    socket.on("lower-hand", ({ sessionId }) => {
      socket.to(sessionId).emit("hand-lowered", {
        userId: socket.userId,
        fullname: socket.user.fullname,
      });
    });

    // Teacher Controls
    socket.on("approve-speak", ({ sessionId, studentUserId }) => {
      io.to(sessionId).emit("speak-approved", {
        studentUserId,
        approvedBy: socket.userId,
      });
    });

    socket.on("mute-student", ({ sessionId, studentUserId }) => {
      io.to(sessionId).emit("student-muted", {
        studentUserId,
        mutedBy: socket.userId,
      });
    });

    socket.on("mute-all", ({ sessionId }) => {
      io.to(sessionId).emit("all-muted", {
        mutedBy: socket.userId,
      });
    });

    // Chat
    socket.on("send-chat", ({ sessionId, message }) => {
      const messageData = {
        sender: socket.userId,
        senderFullname: socket.user.fullname,
        message,
        timestamp: new Date(),
      };
      io.to(sessionId).emit("chat-message", messageData);
    });

    socket.on("typing-start", ({ sessionId }) => {
      socket.to(sessionId).emit("user-typing", {
        userId: socket.userId,
        fullname: socket.user.fullname,
      });
    });

    socket.on("typing-stop", ({ sessionId }) => {
      socket.to(sessionId).emit("user-stopped-typing", {
        userId: socket.userId,
      });
    });

    // Disconnect handler
    socket.on("disconnect", (reason) => {
      console.log(
        `[DISCONNECT] User ${socket.userId} disconnected. Reason: ${reason}`,
      );

      clearInterval(heartbeatTimer);

      // Notify all rooms the user was in
      if (socket.currentSession) {
        socket.to(socket.currentSession).emit("user-left", {
          userId: socket.userId,
          fullname: socket.user.fullname,
          timestamp: Date.now(),
        });

        // Broadcast updated participants list to remaining users
        const roomSockets = io.sockets.adapter.rooms.get(socket.currentSession);
        if (roomSockets) {
          const participants = [];
          roomSockets.forEach((socketId) => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket && targetSocket.userId) {
              participants.push({
                userId: targetSocket.userId,
                role: targetSocket.currentRole || targetSocket.role,
                fullname: targetSocket.user?.fullname || "Unknown",
                joinedAt: targetSocket.joinedAt,
              });
            }
          });
          io.to(socket.currentSession).emit("participants-list", {
            participants,
            timestamp: Date.now(),
          });
        }
      }
    });
  });

  return io;
};

// Helper functions using Socket.IO's room management
export const getClassroomParticipants = (io, sessionId) => {
  const roomSockets = io.sockets.adapter.rooms.get(sessionId);
  if (!roomSockets) return [];

  const participants = [];
  roomSockets.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.userId) {
      participants.push({
        userId: socket.userId,
        role: socket.currentRole || socket.role,
        fullname: socket.user?.fullname || "Unknown",
        joinedAt: socket.joinedAt,
      });
    }
  });

  return participants;
};

export const isUserInClassroom = (io, sessionId, userId) => {
  const roomSockets = io.sockets.adapter.rooms.get(sessionId);
  if (!roomSockets) return false;

  let found = false;
  roomSockets.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.userId === userId) {
      found = true;
    }
  });

  return found;
};
