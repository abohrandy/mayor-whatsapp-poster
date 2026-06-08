let io;

function initSocket(server) {
    const { Server } = require('socket.io');
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('Dashboard connected:', socket.id);

        socket.on('disconnect', () => {
            console.log('Dashboard disconnected:', socket.id);
        });
    });

    return io;
}

function getIo() {
    return io;
}

function emitStatus(status) {
    if (io) {
        io.emit('whatsapp_status', status);
    }
}

function emitLog(log) {
    if (io) {
        io.emit('post_log', log);
    }
}

function emitStats(stats) {
    if (io) {
        io.emit('stats_update', stats);
    }
}

module.exports = {
    initSocket,
    getIo,
    emitStatus,
    emitLog,
    emitStats
};
