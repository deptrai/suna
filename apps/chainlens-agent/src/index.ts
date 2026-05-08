import app from './app';

const PORT = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting Chainlens Agent on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

console.log(`🚀 Server is running at http://localhost:${server.port}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.stop();
  process.exit(0);
});
