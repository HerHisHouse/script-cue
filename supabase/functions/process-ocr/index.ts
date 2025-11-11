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
    const { imageUrls } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'imageUrls array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Import Tesseract.js for OCR processing
    const Tesseract = await import('npm:tesseract.js@5');

    // Process each image
    let fullText = '';
    
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      
      console.log(`Processing image ${i + 1}/${imageUrls.length}: ${imageUrl}`);
      
      try {
        // Perform OCR on the image
        const result = await Tesseract.recognize(
          imageUrl,
          'spa', // Spanish language
          {
            logger: (m) => console.log(m),
          }
        );
        
        fullText += result.data.text + '\n\n';
        console.log(`Extracted text from image ${i + 1}`);
      } catch (imageError) {
        console.error(`Error processing image ${i + 1}:`, imageError);
        // Continue with other images even if one fails
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

    console.log('OCR processing complete');

    return new Response(
      JSON.stringify({ 
        text: fullText.trim(),
        pageCount: imageUrls.length 
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
