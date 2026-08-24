import { Router } from 'express';
import { apiKeyAuth } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validator.js';
import {
  importPortfolioHandler,
  getImportStatusHandler,
  uploadMiddleware
} from '../controllers/import.controller.js';
import {
  getCohortSummaryHandler,
  getCohortBorrowersHandler,
  cohortQuerySchema
} from '../controllers/cohort.controller.js';
import {
  getBorrowerScoreHandler,
  borrowerParamSchema
} from '../controllers/borrower.controller.js';
import {
  simulateScoreHandler,
  simulationBodySchema
} from '../controllers/simulation.controller.js';

export const apiRouter = Router();

// Health Check Endpoint (Public)
apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'HEALTHY', timestamp: new Date().toISOString() });
});

// Apply API Key Authentication across /v1 endpoints
apiRouter.use(apiKeyAuth);

// 1. Ingestion Endpoints
apiRouter.post(
  '/v1/portfolio/import',
  uploadMiddleware.single('file'),
  importPortfolioHandler
);

apiRouter.get(
  '/v1/portfolio/import/:id',
  getImportStatusHandler
);

// 2. Cohort Endpoints (3x3 Grid & Paginated Borrower Listing)
apiRouter.get(
  '/v1/cohorts/summary',
  getCohortSummaryHandler
);

apiRouter.get(
  '/v1/cohorts/:key/borrowers',
  validateRequest(cohortQuerySchema),
  getCohortBorrowersHandler
);

// 3. Borrower Scorecard & Explainability
apiRouter.get(
  '/v1/borrowers/:loanId/score',
  validateRequest(borrowerParamSchema),
  getBorrowerScoreHandler
);

// 4. Score Simulation ("What-If" Calculator)
apiRouter.post(
  '/v1/score/simulate',
  validateRequest(simulationBodySchema),
  simulateScoreHandler
);
