import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, address } = await req.json();
    
    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing ${images.length} image(s) for pest control findings`);

    // Prepare image content for the AI
    const imageContent = images.map((imageData: string) => ({
      type: "image_url",
      image_url: {
        url: imageData
      }
    }));

    // Call Lovable AI to analyze findings
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
            role: 'system',
            content: `You are a professional pest control inspector analyzing service visit screenshots. 
            
Based on the images provided, generate a VERY BRIEF pest control service report with these sections:

1. FINDINGS: List 3-5 specific observations. Each finding must be 10-15 words MAXIMUM. Be concise and direct.

2. RECOMMENDATIONS: List 3-5 actionable items. Each recommendation must be 10-15 words MAXIMUM. 

3. AREAS TREATED: List 3-5 specific areas. Each area must be 10-15 words MAXIMUM.

4. SAFETY NOTES: List 2-3 safety items. Each note must be 10-15 words MAXIMUM.

CRITICAL: Every bullet point must be extremely brief - 10-15 words maximum. No long explanations.

Format your response as JSON with this structure:
{
  "findings": ["brief finding 1", "brief finding 2", ...],
  "recommendations": ["brief rec 1", "brief rec 2", ...],
  "areasTreated": ["brief area 1", "brief area 2", ...],
  "safetyNotes": ["brief note 1", "brief note 2", ...]
}

Be specific and professional. Keep every item under 15 words.`
          },
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `Analyze these pest control service screenshots for property at: ${address || 'unknown address'}`
              },
              ...imageContent
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const analysisText = data.choices?.[0]?.message?.content?.trim() || '{}';
    
    console.log('Raw AI response:', analysisText);

    // Parse the JSON response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       analysisText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to default structure
      analysis = {
        findings: ['Unable to analyze images automatically. Please review manually.'],
        recommendations: ['Conduct thorough inspection of property'],
        areasTreated: ['To be determined during service'],
        safetyNotes: ['Follow standard safety protocols']
      };
    }

    console.log('Parsed analysis:', analysis);

    return new Response(
      JSON.stringify(analysis),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in analyze-findings function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
