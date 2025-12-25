import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { scriptId, userId } = await req.json();

    if (!scriptId || !userId) {
      throw new Error('scriptId and userId are required');
    }

    // Crear cliente de Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // 1. Obtener el guion
    const { data: script, error: scriptError } = await supabaseClient
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (scriptError) throw scriptError;

    // 2. Obtener las escenas y líneas del guion
    const { data: scenes, error: scenesError } = await supabaseClient
      .from('scenes')
      .select('*')
      .eq('script_id', scriptId)
      .order('order_index', { ascending: true });

    if (scenesError) throw scenesError;

    // 3. Obtener todas las líneas de todas las escenas
    let allLines: any[] = [];
    if (scenes && scenes.length > 0) {
      const sceneIds = scenes.map((s: any) => s.id);
      const { data: lines, error: linesError } = await supabaseClient
        .from('lines')
        .select('*')
        .in('scene_id', sceneIds)
        .order('order_index', { ascending: true });

      if (linesError) throw linesError;
      allLines = lines || [];
    }

    // 4. Obtener el personaje del usuario
    const { data: userCharacter } = await supabaseClient
      .from('characters')
      .select('*')
      .eq('script_id', scriptId)
      .eq('is_user_character', true)
      .maybeSingle();

    // 5. Construir el texto del guion
    let scriptText = `Título: ${script.title}\n\n`;
    
    if (allLines && allLines.length > 0) {
      allLines.forEach((line: any) => {
        const characterName = line.character_name || 'DESCONOCIDO';
        const lineContent = line.content || '';
        scriptText += `${characterName}: ${lineContent}\n`;
      });
    }

    // 6. Construir el prompt para OpenAI
    const userCharacterName = userCharacter?.name || 'el personaje principal';
    
    const systemPrompt = `Eres un experto en análisis actoral para preparación de escenas.

Tu tarea es analizar el guion proporcionado y generar un análisis profesional para el actor que interpreta a "${userCharacterName}".

IMPORTANTE:
- Usa lenguaje actoral práctico, no académico ni literario
- No inventes datos que no estén en el guion
- Propón hipótesis interpretativas, no verdades absolutas
- Sé específico y concreto en cada punto
- Escribe en español
- NO menciones métodos reales ni nombres de autores
- El tono debe ser profesional, cercano, motivador y práctico

Los 10 puntos del análisis actoral son:

1. DESEO DEL PERSONAJE: Describe qué quiere el personaje en esta escena concreta, formulado como una acción clara y activa. Debe ser algo inmediato y específico.

2. NECESIDAD PROFUNDA: Explica la necesidad emocional que se esconde detrás del deseo. Debe conectar con una carencia, miedo o herida interna del personaje.

3. CONFLICTO: Identifica qué impide que el personaje consiga lo que quiere. Puede incluir conflicto externo, interno o ambos.

4. RELACIÓN CON EL OTRO: Describe la relación emocional y de poder entre el personaje y su interlocutor en la escena.

5. ESTADO EMOCIONAL INICIAL: Define desde qué estado emocional entra el personaje en la escena, teniendo en cuenta lo que ocurre justo antes.

6. EVOLUCIÓN DURANTE LA ESCENA: Explica cómo cambia el personaje a lo largo de la escena y si existe algún punto de giro relevante.

7. ACCIONES: Enumera las acciones principales que el personaje utiliza para intentar conseguir su objetivo. Usa verbos activos y concretos.

8. SUBTEXTO: Describe qué piensa o siente realmente el personaje mientras habla y qué cosas no se dicen explícitamente.

9. CIRCUNSTANCIAS: Resume el contexto que rodea la escena: lugar, situación, consecuencias y lo que está en juego.

10. TEMA PERSONAL: Conecta la escena con posibles temas humanos universales para ayudar al actor a encontrar verdad personal en la interpretación.

Genera el análisis en formato JSON con estos campos exactos.`;

    const userPrompt = `Analiza el siguiente guion desde la perspectiva del personaje "${userCharacterName}":\n\n${scriptText}`;

    // 7. Llamar a OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'script_analysis',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                step_1_character_desire: {
                  type: 'string',
                  description: 'Deseo del personaje en la escena',
                },
                step_2_deep_need: {
                  type: 'string',
                  description: 'Necesidad profunda detrás del deseo',
                },
                step_3_conflict: {
                  type: 'string',
                  description: 'Conflicto que impide conseguir el objetivo',
                },
                step_4_relationship: {
                  type: 'string',
                  description: 'Relación con el otro personaje',
                },
                step_5_initial_state: {
                  type: 'string',
                  description: 'Estado emocional inicial',
                },
                step_6_evolution: {
                  type: 'string',
                  description: 'Evolución durante la escena',
                },
                step_7_actions: {
                  type: 'string',
                  description: 'Acciones principales del personaje',
                },
                step_8_subtext: {
                  type: 'string',
                  description: 'Subtexto de la escena',
                },
                step_9_circumstances: {
                  type: 'string',
                  description: 'Circunstancias que rodean la escena',
                },
                step_10_personal_theme: {
                  type: 'string',
                  description: 'Tema personal para conectar con el actor',
                },
              },
              required: [
                'step_1_character_desire',
                'step_2_deep_need',
                'step_3_conflict',
                'step_4_relationship',
                'step_5_initial_state',
                'step_6_evolution',
                'step_7_actions',
                'step_8_subtext',
                'step_9_circumstances',
                'step_10_personal_theme',
              ],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errorData}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisContent = openaiData.choices[0].message.content;
    const analysis = JSON.parse(analysisContent);

    // 8. Retornar el análisis
    return new Response(
      JSON.stringify({
        success: true,
        analysis,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
