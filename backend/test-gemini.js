require('dotenv').config();

async function test() {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
      process.env.GEMINI_API_KEY,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Return ONLY valid JSON:
{
  "suggestions": [
    "Test suggestion 1",
    "Test suggestion 2",
    "Test suggestion 3"
  ],
  "focus_areas": [
    "Testing",
    "Development"
  ],
  "productivity_tip": "Keep your work log concise"
}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  console.log('STATUS:', response.status);

  const body = await response.text();

  console.log('RAW GEMINI RESPONSE:');
  console.log(body);
}

test().catch(console.error);