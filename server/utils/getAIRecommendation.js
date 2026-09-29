export async function getAIRecommendation(req, res, userPrompt, products) {
  const API_KEY = process.env.GROQ_API_KEY;

  try {
    const geminiPrompt = `
You are a product filter assistant.

Here is a list of available products in JSON format:
${JSON.stringify(products, null, 2)}

User request: "${userPrompt}"

Your task:
- Understand the user's intent (the request may be in any language like Hindi, Bengali, English, etc.)
- Filter and return only the matching products from the list above
- Return ONLY a raw JSON array — no explanation, no code, no markdown, no extra text
- If no products match, return an empty array: []

Example of correct response format:
[
  { "id": "...", "name": "...", ... }
]
`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: geminiPrompt }]
      }),
    });

    const data = await response.json();

    if (data.error) {
      res.status(429).json({ success: false, message: data.error.message });
      return null;
    }

    const aiResponseText = data?.choices?.[0]?.message?.content?.trim() || "";
    console.log("AI RESPONSE TEXT", aiResponseText);

    const cleanedText = aiResponseText.replace(/```json|```/g, "").trim();

    if (!cleanedText) {
      res.status(500).json({ success: false, message: "AI response is empty or invalid." });
      return null;
    }

    let parsedProducts;
    try {
      parsedProducts = JSON.parse(cleanedText);

      // Agar AI ne { products: [...] } format diya ho
      if (!Array.isArray(parsedProducts) && parsedProducts.products) {
        parsedProducts = parsedProducts.products;
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to parse AI response" });
      return null;
    }

    return { success: true, products: parsedProducts };

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error." });
    return null;
  }
}