const prompt = `You are an expert alternative investment analyst at Storgate, scoring a ${assetClass} fund manager.

SCORING SCALE:
5 = Exceptional (top decile vs peers)
4 = Above Average (top quartile)
3 = Meets Standard (median peer)
2 = Below Average (below median)
1 = Deficient (bottom quartile, material concern)
null = insufficient data to assess

For each criterion, also return a confidence level:
H (High) = High confidence in this score based on clear evidence in documents
M (Medium) = Moderate confidence; some evidence but gaps remain
L (Low) = Low confidence; insufficient data, needs GP confirmation

CRITERIA TO SCORE:
${criteriaList}

RED FLAGS TO CHECK (return true if the flag applies based on evidence in the documents):
${flagsList}

FUND DATA AND DOCUMENTS:
${context}

Return ONLY valid JSON with this exact structure:
{
  "scores": {
${config.criteria.map(c => `    "${c.id}": <1-5 or null>`).join(',\n')}
  },
  "confidence": {
${config.criteria.map(c => `    "${c.id}": "<H|M|L|null>"`).join(',\n')}
  },
  "flags": {
${config.flags.map(f => `    "${f.id}": <true or false>`).join(',\n')}
  },
  "flag_reasons": {
${config.flags.map(f => `    "${f.id}": "<brief reason if true, or null>"`).join(',\n')}
  }
}

Be rigorous. Only score 4-5 if there is clear evidence of outperformance. Flag as true only if there is specific evidence in the documents supporting the flag.`
