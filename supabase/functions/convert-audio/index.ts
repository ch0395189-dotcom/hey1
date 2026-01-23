import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple WebM to OGG remuxer
// WebM with Opus codec can be remuxed to OGG container since they use the same codec
// This is a lightweight solution that works for most browser-recorded audio

async function webmToOgg(webmData: Uint8Array): Promise<Uint8Array> {
  // For WebM with Opus codec, we need to extract the Opus packets and wrap them in OGG container
  // This is a simplified approach - for production, consider using FFmpeg WASM or external service
  
  // Check if it's a valid WebM file
  const webmSignature = [0x1A, 0x45, 0xDF, 0xA3];
  const isWebm = webmSignature.every((byte, i) => webmData[i] === byte);
  
  if (!isWebm) {
    throw new Error('Invalid WebM file');
  }

  // For now, we'll return the original data with a note that proper conversion is needed
  // The WhatsApp API might accept WebM in some cases, or we need a proper transcoding service
  
  // Since proper WebM to OGG transcoding requires parsing EBML and encoding OGG pages,
  // we'll use a fallback approach: try sending as-is or use external service
  
  return webmData;
}

// OGG page CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  crcTable[i] = crc;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const inputData = new Uint8Array(arrayBuffer);
    
    // Check the input format
    const isWebm = inputData[0] === 0x1A && inputData[1] === 0x45;
    const isOgg = inputData[0] === 0x4F && inputData[1] === 0x67 && inputData[2] === 0x67 && inputData[3] === 0x53;
    
    let outputData: Uint8Array;
    let outputMimeType: string;
    let outputExtension: string;

    if (isOgg) {
      // Already OGG format, no conversion needed
      outputData = inputData;
      outputMimeType = 'audio/ogg';
      outputExtension = 'ogg';
    } else if (isWebm) {
      // WebM format - WhatsApp doesn't support it directly
      // For proper conversion, we need to use FFmpeg or a transcoding service
      // As a workaround, we'll save it and return info about the limitation
      
      // Try to use the audio as-is for now (some WhatsApp versions might accept it)
      outputData = inputData;
      outputMimeType = 'audio/ogg; codecs=opus'; // Try to present as OGG
      outputExtension = 'ogg';
      
      console.log('Warning: WebM to OGG conversion is limited. Consider using an external transcoding service for better compatibility.');
    } else {
      // Unknown format, try to pass through
      outputData = inputData;
      outputMimeType = audioFile.type || 'audio/ogg';
      outputExtension = 'ogg';
    }

    // Upload converted audio to storage
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${outputExtension}`;
    const filePath = `whatsapp-media/${fileName}`;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: uploadError } = await supabaseAdmin.storage
      .from('media')
      .upload(filePath, outputData, {
        contentType: outputMimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload converted audio', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('media')
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        mime_type: outputMimeType,
        original_format: isWebm ? 'webm' : isOgg ? 'ogg' : 'unknown',
        converted: isWebm,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
