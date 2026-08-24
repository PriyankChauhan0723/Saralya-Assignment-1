import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getScoreByLoanNo } from '../../repositories/scoreRepository.js';
import { AppError } from '../middlewares/errorHandler.js';

export const borrowerParamSchema = {
  params: z.object({
    loanId: z.string().min(1, 'loanId is required')
  })
};

export async function getBorrowerScoreHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const loanId = String(req.params.loanId);
    const scoreData = await getScoreByLoanNo(loanId);

    if (!scoreData) {
      throw new AppError(`Borrower with loan ID "${loanId}" not found.`, 404, 'BORROWER_NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: {
        loanNo: scoreData.loanNo,
        memberName: scoreData.memberName,
        modelVersion: scoreData.modelVersion,
        summary: {
          abilityScore: scoreData.abilityScore,
          abilityBand: scoreData.abilityBand,
          intentScore: scoreData.intentScore,
          intentBand: scoreData.intentBand,
          cohort: scoreData.cohort
        },
        agentCallScript: scoreData.agentCallScript,
        factorBreakdown: scoreData.factorBreakdown,
        computedAt: scoreData.computedAt
      }
    });
  } catch (err) {
    next(err);
  }
}
