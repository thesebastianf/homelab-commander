import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { composeAiGenerateBody, composeAiValidateBody } from '../validation/schemas.js';
import { generateComposeWithAi, validateComposeWithAi, testAiConnection } from '../services/ai.js';

const router = Router();

router.post('/test', asyncHandler(async (_req, res) => {
  const result = await testAiConnection();
  res.json(result);
}));

router.post('/compose/generate', validateBody(composeAiGenerateBody), asyncHandler(async (req, res) => {
  const result = await generateComposeWithAi(req.body.prompt, {
    composeContent: req.body.composeContent,
    envContent: req.body.envContent,
  });
  res.json(result);
}));

router.post('/compose/validate', validateBody(composeAiValidateBody), asyncHandler(async (req, res) => {
  const result = await validateComposeWithAi(req.body.prompt || '', {
    composeContent: req.body.composeContent,
    envContent: req.body.envContent,
  });
  res.json(result);
}));

export default router;