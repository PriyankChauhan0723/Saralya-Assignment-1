import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { env } from '../config/env.js';

export const app = express();

// Security and Logging Middlewares
app.use(helmet());
app.use(cors());
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Bounded JSON and form payload parsers to prevent memory exhaustion DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Mount API routes
app.use(apiRouter);

// Catch-all 404 Handler for Unrecognized Endpoints
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint "${req.method} ${req.originalUrl}" does not exist.`
    }
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);
