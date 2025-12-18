import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');

    if (!adminPassword) {
      throw new Error('Admin password not configured');
    }

    const isValid = password === adminPassword;

    if (isValid) {
      // Create Supabase client with service role to bypass RLS
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Generate secure session token
      const sessionToken = crypto.randomUUID();
      
      // Set expiration to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Store session in database
      const { error: insertError } = await supabase
        .from('admin_sessions')
        .insert({
          session_token: sessionToken,
          expires_at: expiresAt.toISOString(),
          is_valid: true
        });

      if (insertError) {
        console.error('Error storing session:', insertError);
        throw new Error('Failed to create session');
      }

      // Clean up expired sessions (housekeeping)
      await supabase
        .from('admin_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());

      return new Response(
        JSON.stringify({ 
          valid: true,
          sessionToken: sessionToken
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        valid: false,
        sessionToken: null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error verifying password:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
