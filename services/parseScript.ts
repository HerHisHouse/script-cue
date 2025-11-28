export async function parseScript(text: string) {
  try {
    const response = await fetch(
      "https://yucsroyorgebeuvcsmib.supabase.co/functions/v1/parse-pdf",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      console.error("Error HTTP:", response.status, await response.text());
      throw new Error(`Error HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Error al procesar guion:", err);
    return null;
  }
}