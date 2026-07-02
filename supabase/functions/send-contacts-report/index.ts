import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform, x-supabase-client-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Contact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  platform?: string | null;
  last_message_at?: string | null;
  tags?: string | null;
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(contacts: Contact[]): string {
  const header = ['Nombre', 'Teléfono', 'Email', 'Plataforma', 'Último mensaje', 'Etiquetas'];
  const rows = contacts.map((c) =>
    [c.name, c.phone, c.email, c.platform, c.last_message_at, c.tags].map(csvEscape).join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

function buildHtml(contacts: Contact[], reason: string) {
  const rows = contacts.slice(0, 200).map((c) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.name ?? '').toString().replace(/</g, '&lt;')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.phone ?? '').toString().replace(/</g, '&lt;')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.email ?? '').toString().replace(/</g, '&lt;')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.platform ?? '').toString().replace(/</g, '&lt;')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.last_message_at ?? '').toString().replace(/</g, '&lt;')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(c.tags ?? '').toString().replace(/</g, '&lt;')}</td>
    </tr>`).join('');
  const extra = contacts.length > 200 ? `<p style="color:#666;font-size:13px;">Mostrando 200 de ${contacts.length}. El CSV adjunto incluye todos.</p>` : '';
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#1a1a1a;">
    <h1 style="color:#22c55e;margin:0 0 8px;">heyhey</h1>
    <h2 style="margin:0 0 8px;">Reporte de contactos</h2>
    <p style="color:#4a4a4a;">${reason}</p>
    <p style="color:#4a4a4a;">Total: <strong>${contacts.length}</strong> contacto(s).</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px;">
      <thead>
        <tr style="background:#f0fdf4;">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Nombre</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Teléfono</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Email</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Plataforma</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Último mensaje</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #22c55e;">Etiquetas</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${extra}
    <p style="color:#888;font-size:12px;margin-top:24px;">Se adjunta el archivo CSV completo.</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { email, contacts, reason } = await req.json();
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, error: 'Email inválido' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'No hay contactos' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY no configurado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csv = buildCsv(contacts as Contact[]);
    const csvBase64 = btoa(unescape(encodeURIComponent(csv)));
    const stamp = new Date().toISOString().slice(0, 10);
    const reasonText = typeof reason === 'string' && reason.length > 0
      ? reason
      : 'Este es el reporte de los contactos que se van a eliminar de tu bandeja de entrada.';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'heyhey <noreply@inboxwa.com>',
        to: [email],
        subject: `Reporte de contactos (${contacts.length}) — heyhey`,
        html: buildHtml(contacts as Contact[], reasonText),
        attachments: [
          {
            filename: `contactos-${stamp}.csv`,
            content: csvBase64,
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ ok: false, error: t.slice(0, 500) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, count: contacts.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});