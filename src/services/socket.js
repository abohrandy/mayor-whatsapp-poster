const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-whatsapp-saas-2026';

let io;

function initSocket(server) {
    const { Server } = require('socket.io');
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            console.warn('[Socket.io] Connection rejected: No token provided');
            return next(new Error('Authentication error: Token required'));
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            next();
        } catch (err) {
            console.warn('[Socket.io] Connection rejected: Invalid or expired token');
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`Dashboard connected for user ${userId}:`, socket.id);
        socket.join(`user_${userId}`);

        // If the connected user is the super admin, also join admin_room
        // so they receive all users' events in real-time
        try {
            const db = await require('../models/database').getDb();
            const user = await db.get('SELECT email FROM users WHERE id = ?', [userId]);
            const adminEmail = process.env.ADMIN_EMAIL;
            if (adminEmail && user && user.email === adminEmail) {
                socket.join('admin_room');
                console.log(`[Socket.io] Super admin (user ${userId}) joined admin_room`);
            }
        } catch (err) {
            console.error('[Socket.io] Error checking admin status on connect:', err);
        }

        socket.on('disconnect', () => {
            console.log(`Dashboard disconnected for user ${userId}:`, socket.id);
        });
    });

    return io;
}

function getIo() {
    return io;
}

async function emitStatus(status) {
    if (io) {
        try {
            const db = await require('../models/database').getDb();
            const adminEmail = process.env.ADMIN_EMAIL;
            const sockets = Array.from(io.sockets.sockets.values());

            for (const socket of sockets) {
                const userId = socket.userId;
                if (!userId) continue;

                // Check if this socket belongs to the super admin
                const user = await db.get('SELECT email FROM users WHERE id = ?', [userId]);
                const isAdmin = adminEmail && user && user.email === adminEmail;

                if (isAdmin) {
                    // Admin sees all sessions unfiltered
                    socket.emit('whatsapp_status', { sessions: status.sessions || [] });
                } else {
                    // Regular users only see their own sessions
                    const mappings = await db.all('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?', [userId]);
                    const allowedSessionIds = mappings.map(m => m.session_id);
                    const filteredSessions = (status.sessions || []).filter(s => allowedSessionIds.includes(s.id));
                    socket.emit('whatsapp_status', { sessions: filteredSessions });
                }
            }
        } catch (error) {
            console.error('[Socket.io] Error emitting whatsapp status:', error);
        }
    }
}

function emitLog(userId, log) {
    if (io) {
        if (userId) {
            // Emit to the specific user's room
            io.to(`user_${userId}`).emit('post_log', log);
        }
        // Always also emit to admin_room so the super admin sees all logs
        io.to('admin_room').emit('post_log', log);
    }
}

function emitStats(userId, stats) {
    if (io) {
        if (userId) {
            // Emit to the specific user's room
            io.to(`user_${userId}`).emit('stats_update', stats);
        }
        // Always also emit to admin_room so the super admin's dashboard refreshes
        io.to('admin_room').emit('stats_update', stats);
    }
}

module.exports = {
    initSocket,
    getIo,
    emitStatus,
    emitLog,
    emitStats
};
