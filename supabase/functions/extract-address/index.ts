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
    const { images } = await req.json();
    
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

    console.log(`Processing ${images.length} image(s) for address extraction`);

    // Prepare image content for the AI
    const imageContent = images.map((imageData: string) => ({
      type: "image_url",
      image_url: {
        url: imageData // Base64 data URL
      }
    }));

    // Call Lovable AI with Vision to extract address
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
            content: 'You are an expert at extracting addresses from any text or images. Extract the property address from the provided screenshots. Look for any combination of: street number, street name, city, state, and ZIP code. Be flexible - even partial addresses are useful. If you find any address information, return it in the most complete format possible (e.g., "123 Main St, City, ST 12345"). If multiple addresses appear, choose the one that seems to be the service/property address. Return ONLY the address, nothing else. If absolutely no address information is found, return "Address not found".'
          },
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: "Extract the complete property address from these screenshots:"
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
    const extractedAddress = data.choices?.[0]?.message?.content?.trim() || 'Address not found';
    
    console.log('Extracted address:', extractedAddress);

    // Geocode the address to get coordinates
    let coordinates = null;
    if (extractedAddress && extractedAddress !== 'Address not found') {
      try {
        // Try multiple geocoding strategies for better results
        let geocodeData = null;
        
        // Strategy 1: Try exact address first
        let geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(extractedAddress)}&limit=1`;
        let geocodeResponse = await fetch(geocodeUrl, {
          headers: { 'User-Agent': 'PestProReports/1.0' }
        });
        
        if (geocodeResponse.ok) {
          geocodeData = await geocodeResponse.json();
        }
        
        // Strategy 2: If no results, try with "USA" appended
        if (!geocodeData || geocodeData.length === 0) {
          const addressWithUSA = extractedAddress.toLowerCase().includes('usa') || 
                                 extractedAddress.toLowerCase().includes('united states')
                                 ? extractedAddress 
                                 : `${extractedAddress}, USA`;
          geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressWithUSA)}&limit=1`;
          geocodeResponse = await fetch(geocodeUrl, {
            headers: { 'User-Agent': 'PestProReports/1.0' }
          });
          
          if (geocodeResponse.ok) {
            geocodeData = await geocodeResponse.json();
          }
        }
        
        // Strategy 3: If still no results, try structured search (if we can parse the address)
        if (!geocodeData || geocodeData.length === 0) {
          // Try to extract components and search more broadly
          const parts = extractedAddress.split(',').map((p: string) => p.trim());
          if (parts.length >= 2) {
            // Try searching just city and state
            const cityState = parts.slice(-2).join(', ');
            geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityState)}&limit=1`;
            geocodeResponse = await fetch(geocodeUrl, {
              headers: { 'User-Agent': 'PestProReports/1.0' }
            });
            
            if (geocodeResponse.ok) {
              const broadData = await geocodeResponse.json();
              if (broadData && broadData.length > 0) {
                console.log('Using broader city/state match for approximate location');
                geocodeData = broadData;
              }
            }
          }
        }
        
        if (geocodeData && geocodeData.length > 0) {
          coordinates = {
            lat: parseFloat(geocodeData[0].lat),
            lng: parseFloat(geocodeData[0].lon)
          };
          console.log('Geocoded coordinates:', coordinates);
        } else {
          console.log('No geocoding results found for address:', extractedAddress);
        }
      } catch (geocodeError) {
        console.error('Geocoding error:', geocodeError);
        // Continue without coordinates
      }
    }

    return new Response(
      JSON.stringify({ 
        address: extractedAddress,
        coordinates 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in extract-address function:', error);
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
