import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_DETAILS: Record<string, { name: string; price: string; period: string; daysBeforeExpiry: number }> = {
  starter: { name: 'Plan Starter', price: '$49.000 COP', period: 'mes', daysBeforeExpiry: 3 },
  professional: { name: 'Plan Professional', price: '$149.000 COP', period: 'mes', daysBeforeExpiry: 3 },
  enterprise: { name: 'Plan Enterprise', price: '$399.000 COP', period: 'mes', daysBeforeExpiry: 5 },
  esoterico_pro: { name: 'Plan Esotérico Pro', price: '$30.000 COP', period: 'semana', daysBeforeExpiry: 1 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const results: { sent: string[]; errors: string[] } = { sent: [], errors: [] };

    // Get all active subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        plan,
        status,
        current_period_end,
        trial_end
      `)
      .in('status', ['active', 'trialing']);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    for (const subscription of subscriptions || []) {
      const planDetails = PLAN_DETAILS[subscription.plan];
      if (!planDetails) continue;

      // Determine expiry date
      const expiryDate = subscription.status === 'trialing' 
        ? subscription.trial_end 
        : subscription.current_period_end;

      if (!expiryDate) continue;

      const expiry = new Date(expiryDate);
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Check if we should send reminder
      if (daysUntilExpiry > 0 && daysUntilExpiry <= planDetails.daysBeforeExpiry) {
        // Get user email from auth
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(subscription.user_id);
        
        if (userError || !user?.email) {
          console.error(`Error getting user ${subscription.user_id}:`, userError);
          results.errors.push(subscription.user_id);
          continue;
        }

        // Get profile for personalization
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', subscription.user_id)
          .single();

        const userName = profile?.full_name || 'Usuario';
        const isTrialEnding = subscription.status === 'trialing';
        const renewalUrl = `https://heyheysite.lovable.app/dashboard?renew=true`;

        // Send email using Resend API directly
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (!RESEND_API_KEY) {
          console.error('RESEND_API_KEY not configured');
          results.errors.push(user.email);
          continue;
        }

        try {
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'InboxWA <noreply@inboxwa.com>',
              to: [user.email],
              subject: isTrialEnding 
                ? `Tu prueba gratis termina en ${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}`
                : `Tu suscripción vence en ${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #22c55e; margin: 0;">InboxWA</h1>
                  </div>
                  
                  <h2 style="color: #1a1a1a;">Hola ${userName},</h2>
                  
                  <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                    ${isTrialEnding 
                      ? `Tu período de prueba gratuita del <strong>${planDetails.name}</strong> termina en <strong>${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}</strong>.`
                      : `Tu suscripción del <strong>${planDetails.name}</strong> vence en <strong>${daysUntilExpiry} día${daysUntilExpiry > 1 ? 's' : ''}</strong>.`
                    }
                  </p>
                  
                  <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                    Para continuar disfrutando de todos los beneficios de InboxWA, renueva tu suscripción ahora:
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${renewalUrl}" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                      Renovar Ahora - ${planDetails.price}/${planDetails.period}
                    </a>
                  </div>
                  
                  <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <p style="margin: 0; color: #666; font-size: 14px;">
                      <strong>Tu plan:</strong> ${planDetails.name}<br>
                      <strong>Precio:</strong> ${planDetails.price}/${planDetails.period}<br>
                      <strong>${isTrialEnding ? 'Prueba termina' : 'Vence'}:</strong> ${expiry.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  
                  <p style="color: #888; font-size: 14px; margin-top: 30px;">
                    Si tienes alguna pregunta, responde a este correo o contáctanos por WhatsApp.
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  
                  <p style="color: #aaa; font-size: 12px; text-align: center;">
                    © ${new Date().getFullYear()} InboxWA. Todos los derechos reservados.
                  </p>
                </div>
              `,
            }),
          });

          if (!emailResponse.ok) {
            const errorData = await emailResponse.json();
            throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
          }
          
          console.log(`Reminder sent to ${user.email} for subscription ${subscription.id}`);
          results.sent.push(user.email);
        } catch (emailError) {
          console.error(`Error sending email to ${user.email}:`, emailError);
          results.errors.push(user.email);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: results.sent.length,
        errors: results.errors.length,
        details: results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-renewal-reminder:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
