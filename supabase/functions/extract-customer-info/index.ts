import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { images } = await req.json()
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use Lovable AI to extract customer name from images
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'AI service not configured', customerName: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract the customer name from these pest control service screenshots. IMPORTANT: The customer name is typically located at the TOP of the screenshot. Look for a name that appears to be a customer name, client name, or homeowner name - usually at the very top of the image. If you find a name, respond with ONLY the full name (first and last name). If you cannot find a clear customer name, respond with "NOT_FOUND".'
              },
              ...images.map((imageBase64: string) => ({
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }))
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI gateway error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to analyze images', customerName: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const data = await response.json()
    const aiResponse = data?.choices?.[0]?.message?.content || 'NOT_FOUND'

    // Normalize and clean the response to extract just a likely name
    const raw = (aiResponse || '').trim();
    const cleaned = raw
      .replace(/^["'\s]+|["'\s]+$/g, '') // trim quotes/spaces
      .replace(/^(customer\s*name\s*[:\-]?)/i, '') // remove leading label
      .replace(/^(name\s*[:\-]?)/i, '')
      .split(/\n|\r/)[0] // first line only
      .trim();

    // Heuristic: pick first 2-3 capitalized words as a name if present
    const nameMatch = cleaned.match(/([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/);
    const customerName = cleaned && cleaned !== 'NOT_FOUND' ? (nameMatch ? nameMatch[1] : cleaned) : null;

    console.log('Extracted customer name:', customerName)

    return new Response(
      JSON.stringify({ customerName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in extract-customer-info:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage, customerName: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
