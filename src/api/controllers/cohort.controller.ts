import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getCohortSummary } from '../../repositories/scoreRepository.js';
import { getFilteredBorrowersByCohort } from '../../repositories/loanRepository.js';

export const cohortQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200, 'Limit cannot exceed 200').default(50),
    sortBy: z.enum(['od_days', 'outstanding_principal', 'ability_score', 'intent_score']).default('od_days'),
    sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
    state: z.string().optional(),
    product: z.string().optional(),
    od_bucket: z.string().optional(),
    minOutstanding: z.coerce.number().min(0).optional(),
    maxOutstanding: z.coerce.number().min(0).optional()
  }),
  params: z.object({
    key: z.string().min(1, 'Cohort key is required')
  })
};

export async function getCohortSummaryHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getCohortSummary();
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
}

export async function getCohortBorrowersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cohortKey = String(req.params.key);
    const queryParams = req.query as any;

    const result = await getFilteredBorrowersByCohort({
      cohort: cohortKey,
      page: queryParams.page,
      limit: queryParams.limit,
      sortBy: queryParams.sortBy,
      sortOrder: queryParams.sortOrder,
      state: queryParams.state,
      product: queryParams.product,
      od_bucket: queryParams.od_bucket,
      minOutstanding: queryParams.minOutstanding,
      maxOutstanding: queryParams.maxOutstanding
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
