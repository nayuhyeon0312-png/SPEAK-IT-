const http = require('http');

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.8-flash';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url !== '/api/speaking-feedback' || req.method !== 'POST') {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: '페이지를 찾을 수 없어요.' }));
  }

  if (!GEMINI_API_KEY) {
    res.writeHead(503);
    return res.end(JSON.stringify({ error: 'Gemini API 키가 설정되지 않았어요.' }));
  }

  try {
    let body = '';

    for await (const chunk of req) {
      body += chunk;
      if (body.length > 30000) {
        res.writeHead(413);
        return res.end(JSON.stringify({ error: '답변이 너무 길어요.' }));
      }
    }

    const input = JSON.parse(body);
    const question = String(input.question || '').trim();
    const answer = String(input.answer || '').trim();

    if (!question || !answer) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: '질문과 답변을 입력해 주세요.' }));
    }

    const prompt = `
You are a friendly native English conversation coach
helping a Korean learner speak natural everyday English.

Question: ${question}
Student's answer: ${answer}

Analyze the answer from a native English speaker's perspective.

Return ONLY a JSON object with these exact fields:
{
  "understanding": "원어민이 의미를 이해할 수 있는지 한국어로 설명",
  "naturalness": "일상 대화에서 얼마나 자연스러운지 한국어로 설명",
  "better_expression": "같은 의미의 더 자연스럽고 자주 쓰이는 영어 표현. 더 좋은 표현이 없다면 원래 문장",
  "expression_translation": "추천 표현의 자연스러운 한국어 뜻",
  "why": "왜 더 자연스러운지 쉬운 한국어로 설명",
  "tip": "실제 대화에 도움이 되는 짧은 조언"
}

Rules:
- Never give scores or grades.
- Do not correct merely to make casual English formal.
- Preserve the student's intended meaning and tone.
- Accept natural informal expressions.
- Do not call an expression unnatural just because another expression is possible.
- Clearly say when the original is already natural.
- Explain possible misunderstandings if the meaning is unclear.
- Use friendly, simple Korean except for English examples.
`;

    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(GEMINI_MODEL) +
      ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'AI 요청에 실패했어요.');
    }

    const resultText = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '').join('');

    if (!resultText) {
      throw new Error('AI 피드백이 비어 있어요.');
    }

    const feedback = JSON.parse(resultText);

    res.writeHead(200);
    res.end(JSON.stringify({ feedback }));

  } catch (error) {
    console.error(error);
    res.writeHead(502);
    res.end(JSON.stringify({
      error: error.message || '피드백을 가져오지 못했어요.'
    }));
  }
});

server.listen(PORT, () => {
  console.log(`SPEAK IT server running on port ${PORT}`);
});
