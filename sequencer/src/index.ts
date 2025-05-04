// REPLACE the content of src/index.ts with this:
import net from 'net';

const port = 4000;

const server = net.createServer((socket) => {
  console.log('>>> Client connected to minimal server');
  socket.write('Hello from minimal enclave server!\r\n');

  // Simple echo for testing
  socket.on('data', (data) => {
     console.log('Received:', data.toString());
     socket.write(`Echo: ${data.toString()}`);
  });

  socket.on('end', () => {
    console.log('>>> Client disconnected from minimal server');
  });

  socket.on('error', (err) => {
    console.error('>>> Minimal server socket error:', err);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`>>> Minimal server listening on port ${port}`);
});

server.on('error', (err) => {
  console.error('>>> Minimal server server error:', err);
});

console.log('>>> Minimal server starting...');