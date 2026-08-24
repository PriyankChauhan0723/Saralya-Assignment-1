import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getLoanByNo } from '../../repositories/loanRepository.js';
import { simulateBorrowerScore } from '../../domain/scoring/scoreEngine.js';
import { AppError } from '../middlewares/errorHandler.js';

export const simulationBodySchema = {
  body: z.object({
    loanId: z.string().min(1, 'loanId is required'),
    overrides: z.record(z.any()).default({})
  })
};

export async function simulateScoreHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { loanId, overrides } = req.body;

    const baseLoan = await getLoanByNo(loanId);
    if (!baseLoan) {
      throw new AppError(`Borrower with loan ID "${loanId}" not found for simulation.`, 404, 'BORROWER_NOT_FOUND');
    }

    const normalizedOverrides: Record<string, any> = {};
    for (const key of Object.keys(overrides)) {
      const lower = key.toLowerCase();
      if (lower === 'last_coll_amount' || lower === 'lastcollamount' || lower === 'payment') {
        normalizedOverrides['last_coll_amount'] = Number(overrides[key]);
      } else if (lower === 'od_days' || lower === 'oddays' || lower === 'dpd') {
        normalizedOverrides['od_days'] = Number(overrides[key]);
      } else if (lower === 'foir') {
        normalizedOverrides['foir'] = Number(overrides[key]);
      } else if (lower === 'total_income' || lower === 'income') {
        normalizedOverrides['total_income'] = Number(overrides[key]);
      } else if (lower === 'outstanding_principal' || lower === 'outstanding') {
        normalizedOverrides['outstanding_principal'] = Number(overrides[key]);
      } else if (lower === 'prin_collected') {
        normalizedOverrides['prin_collected'] = Number(overrides[key]);
      } else if (lower === 'status') {
        normalizedOverrides['status'] = String(overrides[key]);
      } else {
        normalizedOverrides[lower] = overrides[key];
      }
    }

    const simulationResult = simulateBorrowerScore(baseLoan, normalizedOverrides);

    res.status(200).json({
      success: true,
      data: simulationResult
    });
  } catch (err) {
    next(err);
  }
}
