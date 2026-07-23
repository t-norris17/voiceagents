// GET /api/questions -> { questions:[{n,key,category,q,ideal}] }
// Serves the curated eval set to the Q&A page: powers "Load the 25" and the
// inline ideal-answer ("answer key") column. Static data, no secrets.
import { QUESTIONS } from "../lib/questions.js";

export default function handler(req, res) {
  return res.status(200).json({ questions: QUESTIONS });
}
