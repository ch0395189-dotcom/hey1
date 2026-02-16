import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find pending messages that are due
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*, whatsapp_accounts(id, phone_number_id, access_token, connection_type, external_service_url, external_api_key)')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .limit(10)

    if (fetchError) {
      console.error('Error fetching scheduled messages:', fetchError)
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending messages' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`📬 Processing ${pendingMessages.length} scheduled message(s)`)

    for (const scheduled of pendingMessages) {
      // Mark as processing
      await supabase
        .from('scheduled_messages')
        .update({ status: 'processing' })
        .eq('id', scheduled.id)

      const account = (scheduled as any).whatsapp_accounts
      if (!account) {
        await supabase
          .from('scheduled_messages')
          .update({ status: 'failed', results: [{ error: 'Account not found' }], completed_at: new Date().toISOString() })
          .eq('id', scheduled.id)
        continue
      }

      const isExternal = account.connection_type === 'external_qr' || account.connection_type === 'z-api'
      const results: Array<{ phone: string; name: string; success: boolean; error?: string }> = []

      // Get bot node content if specified
      let messageContent = scheduled.message
      if (scheduled.bot_node_id && !messageContent) {
        const { data: node } = await supabase
          .from('chatbot_flow_nodes')
          .select('content, title')
          .eq('id', scheduled.bot_node_id)
          .single()
        if (node) {
          messageContent = node.content
        }
      }

      for (let i = 0; i < scheduled.recipient_phones.length; i++) {
        const phone = scheduled.recipient_phones[i].replace(/[\s+\-()]/g, '')
        const name = scheduled.recipient_names?.[i] || phone

        try {
          if (isExternal) {
            // External API
            const apiBaseUrl = account.external_service_url
            const apiToken = account.external_api_key
            if (!apiBaseUrl || !apiToken) throw new Error('API config missing')

            const requestBody: Record<string, unknown> = {
              number: phone,
              externalKey: `scheduled_${Date.now()}`,
              body: messageContent || '',
            }

            if (scheduled.media_url) {
              requestBody.mediaUrl = scheduled.media_url
              if (scheduled.media_type) requestBody.mediaType = scheduled.media_type
            }

            const resp = await fetch(apiBaseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
              body: JSON.stringify(requestBody),
            })

            if (!resp.ok) {
              const errText = await resp.text()
              throw new Error(`API error ${resp.status}: ${errText}`)
            }
          } else {
            // Meta API
            const recipientPhone = phone
            const whatsappUrl = `https://graph.facebook.com/v21.0/${account.phone_number_id}/messages`

            let payload: Record<string, unknown> = {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
            }

            if (scheduled.media_url && scheduled.media_type) {
              payload.type = scheduled.media_type
              const mediaObj: Record<string, unknown> = { link: scheduled.media_url }
              if (messageContent) mediaObj.caption = messageContent
              payload[scheduled.media_type] = mediaObj
            } else {
              payload.type = 'text'
              payload.text = { preview_url: false, body: messageContent || '' }
            }

            const resp = await fetch(whatsappUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })

            const data = await resp.json()
            if (data.error) throw new Error(data.error.message || 'WhatsApp API error')
          }

          // Save outbound message to conversation
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('whatsapp_account_id', scheduled.account_id)
            .eq('customer_phone', phone)
            .single()

          if (conv) {
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              content: messageContent || null,
              message_type: scheduled.media_type || 'text',
              direction: 'outbound',
              status: 'sent',
              media_url: scheduled.media_url || null,
            })
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
          }

          results.push({ phone, name, success: true })
        } catch (err: any) {
          console.error(`❌ Failed to send to ${phone}:`, err.message)
          results.push({ phone, name, success: false, error: err.message })
        }

        // Rate limiting delay
        if (i < scheduled.recipient_phones.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      const allSuccess = results.every(r => r.success)
      await supabase
        .from('scheduled_messages')
        .update({
          status: allSuccess ? 'completed' : 'failed',
          results,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scheduled.id)

      console.log(`✅ Scheduled message ${scheduled.id}: ${results.filter(r => r.success).length}/${results.length} sent`)
    }

    return new Response(JSON.stringify({ processed: pendingMessages.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
