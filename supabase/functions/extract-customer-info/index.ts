import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase.functions.invoke('lovable-ai', {
      body: {
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract the customer name from these images. Look for any text that appears to be a customer name, client name, or homeowner name. If you find a name, respond with ONLY the name. If you cannot find a clear customer name, respond with "NOT_FOUND".'
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
      }
    })

    if (error) {
      console.error('AI extraction error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to analyze images', customerName: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const aiResponse = data?.choices?.[0]?.message?.content || 'NOT_FOUND'
    const customerName = aiResponse === 'NOT_FOUND' ? null : aiResponse.trim()

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
