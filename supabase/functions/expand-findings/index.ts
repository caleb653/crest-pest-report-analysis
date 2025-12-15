import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = type === 'findings' 
      ? `You are a professional pest control technician writing service reports. Take the brief notes provided and expand them into clear, professional findings and actions taken. Format as bullet points where each bullet starts with a bold section header followed by the details. Example format:
• **Area Inspected:** Details here
• **Activity Found:** Details here
• **Action Taken:** Details here
Return 2-4 bullet points. Do not add any pleasantries or sign-offs. Return ONLY the bullet point text.`
      : `You are a professional pest control technician writing service reports. Take the brief notes and expand them into what the customer should expect after service. Format as bullet points where each bullet starts with a bold section header followed by the details. Example format:
• **Initial Period:** Details here
• **Treatment Effect:** Details here
• **Timeline:** Details here
Return 2-4 bullet points. Focus on realistic expectations about pest activity and treatment effectiveness. Return ONLY the bullet point text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text || "General pest control service performed" }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const expandedText = data.choices?.[0]?.message?.content || text;

    return new Response(JSON.stringify({ expandedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in expand-findings:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
