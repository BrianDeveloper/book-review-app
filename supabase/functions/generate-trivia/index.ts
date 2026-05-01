import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function fetchFromGemini(prompt: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada")

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  })
  
  if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  return data.candidates[0].content.parts[0].text;
}

async function fetchFromGroq(prompt: string) {
  const apiKey = Deno.env.get("GROQ_API_KEY")
  if (!apiKey) throw new Error("GROQ_API_KEY no configurada")

  const url = "https://api.groq.com/openai/v1/chat/completions"

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
  })

  if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

serve(async (req) => {
  // Manejo de Preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log("🔍 Request URL:", req.url)

  try {
    if (req.method !== 'POST') {
      throw new Error("Método no permitido. Solo se permite POST.")
    }

    const { topic, difficulty } = await req.json()
    
    // Verificar que los parámetros existan
    if (!topic || !difficulty) {
      throw new Error("Faltan parámetros: topic y difficulty son requeridos")
    }

    const prompt = `Actúa como experto en trivia literaria. Genera una pregunta sobre "${topic}" con dificultad "${difficulty}".
    Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin explicaciones, sin bloques de código.
    Estructura exacta: {"question": "texto", "options": ["a", "b", "c", "d"], "correct_index": 0, "reward": 10}`

    console.log("📡 Iniciando generación de trivia:", { topic, difficulty })

    let rawContent = "";
    try {
      console.log("🚀 Intentando con el motor principal (Gemini)...");
      rawContent = await fetchFromGemini(prompt);
      console.log("✅ Gemini devolvió respuesta exitosamente.");
    } catch (geminiError) {
      console.warn("⚠️ Falló Gemini, activando Plan B (Groq)... Error:", geminiError.message);
      try {
          rawContent = await fetchFromGroq(prompt);
          console.log("✅ Groq devolvió respuesta exitosamente (Fallback).");
      } catch (groqError) {
          console.error("❌ Ambos motores fallaron. Error Groq:", groqError.message);
          throw new Error("No se pudo generar la trivia con ninguno de los motores de IA.");
      }
    }

    // Limpiar y validar el JSON
    rawContent = rawContent.trim()
    
    // Extractor Regex de seguridad
    let jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      rawContent = jsonMatch[0]
    }
    
    // Validar formato
    try {
      JSON.parse(rawContent)
      console.log("✅ JSON válido confirmado")
    } catch (parseError) {
      console.error("❌ JSON inválido:", parseError.message)
      console.error("❌ Content que falló:", rawContent)
      throw new Error(`La IA no devolvió JSON válido: ${parseError.message}`)
    }
    
    // Retornamos Frontend
    return new Response(rawContent, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    console.error("💥 Error en Edge Function:", err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
