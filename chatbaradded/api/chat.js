export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // The "waiter" now goes to the OpenRouter kitchen
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // This will look for your OpenRouter key in Vercel's secure vault
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` 
      },
      body: JSON.stringify({
        model: "thedrummer/skyfall-36b-v2", // Skyfall 36b V2 model ID
        messages: req.body.messages, 
        temperature: 0.8
      })
    });

    const data = await response.json();
    
    // The waiter brings the response back to your website
    return res.status(200).json(data);
    
  } catch (error) {
    console.error("Error communicating with OpenRouter:", error);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}
