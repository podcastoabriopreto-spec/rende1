// ============================================================
//  CONFIGURAÇÃO DO RENDE
//  A "anon key" do Supabase é pública por design: quem protege
//  os dados é o RLS (já configurado em supabase/schema.sql).
//  NUNCA coloque aqui a chave "service_role".
// ============================================================
window.RENDE_CONFIG = {
  // Cole aqui os dados de: Supabase > Project Settings > API
  SUPABASE_URL: '',        // ex.: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',   // ex.: 'eyJhbGciOi...'

  // Chave PÚBLICA do push (gerada com: npx web-push generate-vapid-keys)
  VAPID_PUBLIC_KEY: '',

  // Valores pré-definidos por litro (em R$). Edite à vontade.
  PRECOS_PREDEFINIDOS: {
    gasolina: [5.79, 5.89, 5.99],
    etanol:   [3.49, 3.59, 3.69],
  },

  // Atalhos de "Quanto abastecer" (em R$)
  VALORES_RAPIDOS: [50, 100, 150],
};
