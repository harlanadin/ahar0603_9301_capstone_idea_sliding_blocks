const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname)));

const room = { mac: null, ipad: null };
const otherRole = (r) => (r === 'mac' ? 'ipad' : 'mac');

io.on('connection', (socket) => {
  socket.on('join', () => {
    const role = !room.mac ? 'mac' : !room.ipad ? 'ipad' : null;
    if (!role) {
      socket.emit('room-full');
      return;
    }
    room[role] = socket.id;
    socket.data.role = role;
    socket.emit('role-assigned', { role, shouldInitiate: role === 'mac' });
    const other = room[otherRole(role)];
    if (other) io.to(other).emit('peer-joined');
  });

  socket.on('signal', ({ data }) => {
    const other = room[otherRole(socket.data.role)];
    if (other) io.to(other).emit('signal', { data });
  });

  ['block-move', 'board-sync', 'board-reset'].forEach((evt) => {
    socket.on(evt, (payload) => {
      const other = room[otherRole(socket.data.role)];
      if (other) io.to(other).emit('remote-' + evt, payload);
    });
  });

  socket.on('disconnect', () => {
    if (socket.data.role) {
      const other = room[otherRole(socket.data.role)];
      room[socket.data.role] = null;
      if (other) io.to(other).emit('peer-left');
    }
  });
});

server.listen(3000, () => console.log('Server running at http://localhost:3000'));
