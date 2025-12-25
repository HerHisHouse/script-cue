import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { imageBase64Array } = await req.json();

    if (!imageBase64Array || !Array.isArray(imageBase64Array) || imageBase64Array.length === 0) {
      return new Response(
        JSON.stringify({ error: 'imageBase64Array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    console.log(`Processing ${imageBase64Array.length} images with OpenAI Vision...`);

    // Process each image with OpenAI Vision
    let fullText = '';
    
    for (let i = 0; i < imageBase64Array.length; i++) {
      const base64Image = imageBase64Array[i];
      
      console.log(`Processing image ${i + 1}/${imageBase64Array.length}`);
      
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extrae TODO el texto de esta imagen de un guión teatral o cinematográfico. Mantén el formato original, incluyendo nombres de personajes, diálogos, acotaciones y cualquier otro texto. Devuelve SOLO el texto extraído, sin comentarios adicionales.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`OpenAI API error for image ${i + 1}:`, errorData);
          throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const extractedText = data.choices[0]?.message?.content || '';
        
        if (extractedText.trim()) {
          fullText += extractedText + '\n\n';
          console.log(`Extracted ${extractedText.length} characters from image ${i + 1}`);
        }
      } catch (imageError) {
        console.error(`Error processing image ${i + 1}:`, imageError);
        throw imageError; // Don't continue if OCR fails
      }
    }

    if (!fullText.trim()) {
      return new Response(
        JSON.stringify({ error: 'No se pudo extraer texto de las imágenes' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`OCR processing complete. Total text length: ${fullText.length} characters`);

    return new Response(
      JSON.stringify({ 
        text: fullText.trim(),
        pageCount: imageBase64Array.length 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in process-ocr:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error procesando OCR' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
