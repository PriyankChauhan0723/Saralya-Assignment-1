import { app } from './api/app.js';
import { env } from './config/env.js';
import { runMigrations } from './database/migrate.js';
import { pool } from './config/database.js';

async function startServer() {
  try {
    // Run database migrations on startup
    await runMigrations();

    const server = app.listen(env.PORT, () => {
      console.log(`=======================================================`);
      console.log(` SaralCollect Cohort Scoring Service Running `);
      console.log(` Port: ${env.PORT} | Env: ${env.NODE_ENV}`);
      console.log(` PostgreSQL: ${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`);
      console.log(`=======================================================`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await pool.end();
        console.log('Database pool drained. Process terminated.');
        process.exit(0);
      });

      // Force shutdown after 10s if hanging
      setTimeout(() => {
        console.error('Forced shutdown due to timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
